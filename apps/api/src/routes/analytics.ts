import { Router } from "express";
import { db } from "@seo/db";
import { decryptToken } from "@seo/shared";
import { env } from "../config";

export const analyticsRouter = Router();

type Engagement = {
  impressions?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  views?: number;
  fetchedAt: string;
  source: string;
  unavailableReason?: string;
};

const TTL_MS = 15 * 60 * 1000;

function decryptAccess(enc: string | null | undefined): string {
  if (!enc) return "";
  try {
    return decryptToken(enc, env.tokenEncryptionKey);
  } catch {
    return "";
  }
}

function engagementFromJson(value: unknown): Engagement | null {
  if (!value || typeof value !== "object") return null;
  return value as Engagement;
}

async function fetchMetaEngagement(
  externalPostId: string,
  accessToken: string,
  platform: string
): Promise<Engagement> {
  const fetchedAt = new Date().toISOString();
  try {
    if (platform === "INSTAGRAM") {
      const url = new URL(
        `https://graph.facebook.com/v21.0/${externalPostId}/insights`
      );
      url.searchParams.set("metric", "impressions,reach,likes,comments,saved");
      url.searchParams.set("access_token", accessToken);
      const res = await fetch(url);
      const json = (await res.json()) as {
        data?: Array<{ name: string; values?: Array<{ value: number }> }>;
        error?: { message: string };
      };
      if (!res.ok) {
        return {
          fetchedAt,
          source: "instagram",
          unavailableReason: json.error?.message ?? `HTTP ${res.status}`,
        };
      }
      const map = Object.fromEntries(
        (json.data ?? []).map((d) => [d.name, d.values?.[0]?.value ?? 0])
      );
      return {
        impressions: map.impressions ?? map.reach,
        likes: map.likes,
        comments: map.comments,
        fetchedAt,
        source: "instagram",
      };
    }

    const url = new URL(`https://graph.facebook.com/v21.0/${externalPostId}`);
    url.searchParams.set(
      "fields",
      "reactions.summary(true),comments.summary(true),shares"
    );
    url.searchParams.set("access_token", accessToken);
    const res = await fetch(url);
    const json = (await res.json()) as {
      reactions?: { summary?: { total_count?: number } };
      comments?: { summary?: { total_count?: number } };
      shares?: { count?: number };
      error?: { message: string };
    };
    if (!res.ok) {
      return {
        fetchedAt,
        source: "facebook",
        unavailableReason: json.error?.message ?? `HTTP ${res.status}`,
      };
    }
    return {
      likes: json.reactions?.summary?.total_count ?? 0,
      comments: json.comments?.summary?.total_count ?? 0,
      shares: json.shares?.count ?? 0,
      fetchedAt,
      source: "facebook",
    };
  } catch (err) {
    return {
      fetchedAt,
      source: platform === "INSTAGRAM" ? "instagram" : "facebook",
      unavailableReason: err instanceof Error ? err.message : "fetch failed",
    };
  }
}

async function fetchYouTubeEngagement(
  videoId: string,
  accessToken: string
): Promise<Engagement> {
  const fetchedAt = new Date().toISOString();
  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "statistics");
    url.searchParams.set("id", videoId);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = (await res.json()) as {
      items?: Array<{
        statistics?: {
          viewCount?: string;
          likeCount?: string;
          commentCount?: string;
        };
      }>;
      error?: { message: string };
    };
    if (!res.ok || !json.items?.[0]) {
      return {
        fetchedAt,
        source: "youtube",
        unavailableReason:
          json.error?.message ?? (res.ok ? "Video not found" : `HTTP ${res.status}`),
      };
    }
    const s = json.items[0].statistics ?? {};
    return {
      views: Number(s.viewCount ?? 0),
      likes: Number(s.likeCount ?? 0),
      comments: Number(s.commentCount ?? 0),
      fetchedAt,
      source: "youtube",
    };
  } catch (err) {
    return {
      fetchedAt,
      source: "youtube",
      unavailableReason: err instanceof Error ? err.message : "fetch failed",
    };
  }
}

async function fetchTikTokEngagement(
  _publishId: string,
  _accessToken: string
): Promise<Engagement> {
  return {
    fetchedAt: new Date().toISOString(),
    source: "tiktok",
    unavailableReason:
      "TikTok video stats require additional API scopes; metrics unavailable",
  };
}

analyticsRouter.get("/summary", async (req, res) => {
  const refresh = String(req.query.refresh ?? "") === "1";
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [byStatusRaw, byPlatformRaw, byClientRaw, publishedPosts] =
    await Promise.all([
      db.post.groupBy({ by: ["status"], _count: { _all: true } }),
      db.post.groupBy({ by: ["platform"], _count: { _all: true } }),
      db.post.groupBy({
        by: ["clientId"],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      db.post.findMany({
        where: {
          status: "PUBLISHED",
          externalPostId: { not: null },
          platform: {
            in: ["FACEBOOK", "INSTAGRAM", "YOUTUBE_SHORTS", "TIKTOK"],
          },
        },
        include: {
          client: {
            select: {
              id: true,
              name: true,
              channelConnections: true,
            },
          },
        },
        orderBy: { publishedAt: "desc" },
        take: 40,
      }),
    ]);

  const clientIds = byClientRaw.map((r) => r.clientId);
  const clients = await db.client.findMany({
    where: { id: { in: clientIds } },
    select: { id: true, name: true },
  });
  const clientName = Object.fromEntries(clients.map((c) => [c.id, c.name]));

  const published = byStatusRaw.find((s) => s.status === "PUBLISHED")?._count
    ._all ?? 0;
  const failed =
    byStatusRaw.find((s) => s.status === "FAILED")?._count._all ?? 0;

  const engagementRows: Array<{
    postId: string;
    title: string | null;
    platform: string;
    clientName: string;
    externalPostId: string | null;
    externalUrl: string | null;
    engagement: Engagement;
  }> = [];

  for (const post of publishedPosts) {
    const cached = engagementFromJson(post.engagement);
    const fresh =
      cached?.fetchedAt &&
      Date.now() - new Date(cached.fetchedAt).getTime() < TTL_MS;

    let engagement = cached;
    if (refresh || !fresh) {
      const conn = post.client.channelConnections.find(
        (c) => c.platform === post.platform && c.connected
      );
      const token = decryptAccess(conn?.accessTokenEnc);
      if (!post.externalPostId || !token) {
        engagement = {
          fetchedAt: new Date().toISOString(),
          source: post.platform.toLowerCase(),
          unavailableReason: !token
            ? "No connected token"
            : "Missing external post id",
        };
      } else if (
        post.platform === "FACEBOOK" ||
        post.platform === "INSTAGRAM"
      ) {
        engagement = await fetchMetaEngagement(
          post.externalPostId,
          token,
          post.platform
        );
      } else if (post.platform === "YOUTUBE_SHORTS") {
        engagement = await fetchYouTubeEngagement(post.externalPostId, token);
      } else if (post.platform === "TIKTOK") {
        engagement = await fetchTikTokEngagement(post.externalPostId, token);
      }

      if (engagement) {
        await db.post.update({
          where: { id: post.id },
          data: { engagement },
        });
      }
    }

    engagementRows.push({
      postId: post.id,
      title: post.title,
      platform: post.platform,
      clientName: post.client.name,
      externalPostId: post.externalPostId,
      externalUrl: post.externalUrl,
      engagement: engagement ?? {
        fetchedAt: new Date().toISOString(),
        source: "none",
        unavailableReason: "No data",
      },
    });
  }

  res.json({
    windowDays: 30,
    byStatus: Object.fromEntries(
      byStatusRaw.map((r) => [r.status, r._count._all])
    ),
    byPlatform: Object.fromEntries(
      byPlatformRaw.map((r) => [r.platform, r._count._all])
    ),
    byClient: byClientRaw.map((r) => ({
      clientId: r.clientId,
      name: clientName[r.clientId] ?? r.clientId,
      count: r._count._all,
    })),
    publishSuccess: published,
    publishFailed: failed,
    engagement: engagementRows,
  });
});
