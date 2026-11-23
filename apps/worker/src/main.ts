import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { db } from "@seo/db";
import {
  QUEUE_NAMES,
  decryptToken,
  evaluatePublishRules,
  type GenerateJobData,
  type MediaJobData,
  type NotifyJobData,
  type PublishJobData,
  type SeoSyncJobData,
  type PublishRuleInput,
  type ContentType,
} from "@seo/shared";
import { env } from "./config";
import {
  generateAd,
  generateBlog,
  generateCaption,
  generateShortScript,
  type BrandContext,
} from "./claude";
import { generateImage, renderShortVideo } from "./media";
import {
  publishFacebook,
  publishInstagram,
  publishPictureAdExport,
  publishTikTok,
  publishYouTubeShort,
} from "./publishers";

const connection = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });

const publishQueue = new Queue<PublishJobData>(QUEUE_NAMES.PUBLISH, {
  connection,
});
const mediaQueue = new Queue<MediaJobData>(QUEUE_NAMES.MEDIA, { connection });
const notifyQueue = new Queue<NotifyJobData>(QUEUE_NAMES.NOTIFY, {
  connection,
});

function ctaLabel(
  ctaDefaults: unknown,
  cta: string
): string {
  const defaults = (ctaDefaults ?? {}) as Record<string, string>;
  return (
    defaults[cta] ??
    defaults.primary ??
    defaults.order ??
    defaults.call ??
    "Contact us"
  );
}

async function applyRuleDecision(postId: string) {
  const post = await db.post.findUnique({
    where: { id: postId },
    include: {
      client: { include: { publishRule: true } },
    },
  });
  if (!post) return;
  if (!post.client.publishRule) {
    await db.post.update({
      where: { id: postId },
      data: {
        status: "PENDING_APPROVAL",
        ruleDecision: {
          action: "REQUIRE_APPROVAL",
          reasons: ["No publish rules configured"],
        },
      },
    });
    await notifyQueue.add("notify", {
      type: "PENDING_APPROVAL",
      clientId: post.clientId,
      postId,
      message: `Post pending approval (no rules)`,
    });
    return;
  }

  const publishedCount = await db.post.count({
    where: { clientId: post.clientId, status: "PUBLISHED" },
  });

  const rule = post.client.publishRule;
  const ruleInput: PublishRuleInput = {
    autoPublishEnabled: rule.autoPublishEnabled,
    allowlistedTypes: rule.allowlistedTypes as ContentType[],
    bannedWords: [
      ...rule.bannedWords,
      ...(post.client
        ? (
            await db.brandKit.findUnique({ where: { clientId: post.clientId } })
          )?.bannedWords ?? []
        : []),
    ],
    postingWindows: (rule.postingWindows as PublishRuleInput["postingWindows"]) ?? [],
    quietHours: (rule.quietHours as PublishRuleInput["quietHours"]) ?? null,
    minConfidence: rule.minConfidence,
    forceApprovalTypes: rule.forceApprovalTypes as ContentType[],
    requireApprovalFirstN: rule.requireApprovalFirstN,
  };

  const decision = evaluatePublishRules(ruleInput, {
    contentType: post.contentType as ContentType,
    body: post.body,
    title: post.title,
    confidence: post.confidence,
    clientPublishedCount: publishedCount,
  });

  if (decision.action === "AUTO_PUBLISH") {
    const scheduledAt = post.scheduledAt ?? new Date();
    await db.post.update({
      where: { id: postId },
      data: {
        status: "SCHEDULED",
        scheduledAt,
        ruleDecision: decision,
      },
    });
    const delay = Math.max(0, scheduledAt.getTime() - Date.now());
    await publishQueue.add("publish-post", { postId }, { delay, attempts: 5 });
  } else {
    await db.post.update({
      where: { id: postId },
      data: { status: "PENDING_APPROVAL", ruleDecision: decision },
    });
    await notifyQueue.add("notify", {
      type: "PENDING_APPROVAL",
      clientId: post.clientId,
      postId,
      message: `Approval needed: ${decision.reasons.join("; ")}`,
    });
  }
}

new Worker<GenerateJobData>(
  QUEUE_NAMES.GENERATE,
  async (job) => {
    const { postId, briefId } = job.data;
    try {
    const post = await db.post.findUnique({
      where: { id: postId },
      include: {
        brief: { include: { attachments: true } },
        client: { include: { brandKit: true } },
      },
    });
    if (!post || !post.brief || !post.client.brandKit) {
      throw new Error("Post/brief/brand kit missing");
    }

    const brandKit = post.client.brandKit;
    const brand: BrandContext = {
      name: post.client.name,
      industry: post.client.industry,
      locality: post.client.locality,
      voiceTone: brandKit.voiceTone,
      tagline: brandKit.tagline,
      bannedWords: brandKit.bannedWords,
      bannedClaims: brandKit.bannedClaims,
      ctaLabel: ctaLabel(brandKit.ctaDefaults, post.brief.cta),
      primaryColor: brandKit.primaryColor,
      secondaryColor: brandKit.secondaryColor,
      logoUrl: brandKit.logoUrl,
    };
    const brief = {
      title: post.brief.title,
      offer: post.brief.offer,
      localityKeywords: post.brief.localityKeywords,
      contentType: post.brief.contentType,
      notes: post.brief.notes,
    };
    const attachments = post.brief.attachments.map((a) => ({
      filename: a.filename,
      mimeType: a.mimeType,
      url: a.url,
    }));

    const platform = post.platform;

    if (platform === "WEBSITE_BLOG") {
      const blog = await generateBlog(brand, brief, attachments);
      await db.post.update({
        where: { id: postId },
        data: {
          title: blog.title,
          slug: blog.slug,
          body: blog.bodyHtml,
          metaTitle: blog.metaTitle,
          metaDescription: blog.metaDescription,
          confidence: blog.confidence,
          contentType: "BLOG",
        },
      });
    } else if (platform === "PICTURE_AD") {
      const ad = await generateAd(brand, brief, attachments);
      await db.post.update({
        where: { id: postId },
        data: {
          title: ad.headline,
          body: ad.primaryText,
          ctaLabel: ad.ctaLabel,
          confidence: ad.confidence,
          contentType: "PICTURE_AD",
        },
      });
      await mediaQueue.add("render-media", {
        postId,
        prompt: ad.imagePrompt,
        type: "IMAGE",
      });
      return;
    } else if (
      platform === "TIKTOK" ||
      platform === "YOUTUBE_SHORTS" ||
      ((platform === "INSTAGRAM" || platform === "FACEBOOK") &&
        (post.brief.contentType === "SHORT_VIDEO" ||
          post.brief.platforms.some(
            (p) => p === "YOUTUBE_SHORTS" || p === "TIKTOK"
          )))
    ) {
      // Reuse sibling Short MP4 when another platform on this brief already rendered
      if (post.briefId) {
        const sibling = await db.post.findFirst({
          where: {
            briefId: post.briefId,
            id: { not: postId },
            contentType: "SHORT_VIDEO",
            assetId: { not: null },
            asset: { type: "VIDEO" },
          },
          include: { asset: true },
        });
        if (sibling?.assetId && sibling.asset?.mimeType === "video/mp4") {
          await db.post.update({
            where: { id: postId },
            data: {
              title: sibling.title,
              body: sibling.body,
              metaTitle: sibling.metaTitle,
              metaDescription: sibling.metaDescription,
              hashtags: sibling.hashtags,
              ctaLabel: sibling.ctaLabel,
              confidence: sibling.confidence,
              contentType: "SHORT_VIDEO",
              assetId: sibling.assetId,
            },
          });
          await applyRuleDecision(postId);
          return;
        }
      }

      const short = await generateShortScript(brand, brief, attachments);
      const tagify = (raw: string) =>
        raw
          .split(/[,/|]+/)
          .map((s) => s.trim().replace(/\s+/g, ""))
          .filter(Boolean);
      const industryTags = tagify(brand.industry ?? "local").slice(0, 4);
      const localityTags = tagify(brand.locality ?? "local").slice(0, 4);
      await db.post.update({
        where: { id: postId },
        data: {
          title: short.hook,
          body: short.caption,
          metaTitle: short.hook,
          metaDescription: short.punchline,
          hashtags: ["Shorts", ...industryTags, ...localityTags].filter(
            Boolean
          ),
          ctaLabel: short.cta,
          confidence: short.confidence,
          contentType: "SHORT_VIDEO",
        },
      });

      let shareAssetWithPostIds: string[] | undefined;
      if (post.briefId) {
        const siblings = await db.post.findMany({
          where: {
            briefId: post.briefId,
            id: { not: postId },
            platform: {
              in: ["YOUTUBE_SHORTS", "TIKTOK", "INSTAGRAM", "FACEBOOK"],
            },
            assetId: null,
          },
          select: { id: true, platform: true },
        });
        const briefPlatforms = post.brief.platforms;
        const wantsVideo = (p: string) =>
          p === "YOUTUBE_SHORTS" ||
          p === "TIKTOK" ||
          ((p === "INSTAGRAM" || p === "FACEBOOK") &&
            (post.brief!.contentType === "SHORT_VIDEO" ||
              briefPlatforms.some(
                (x) => x === "YOUTUBE_SHORTS" || x === "TIKTOK"
              )));
        shareAssetWithPostIds = siblings
          .filter((s) => wantsVideo(s.platform))
          .map((s) => s.id);
      }

      const briefVideo = (post.brief.videoSettings ?? null) as {
        templateId?: string;
        presetId?: string;
        fieldMap?: Record<string, string>;
        modifications?: Record<string, string>;
      } | null;

      const templateId =
        briefVideo?.templateId || brandKit.creatomateTemplateId || undefined;
      const fieldMap =
        briefVideo?.fieldMap ||
        (brandKit.creatomateFieldMap as Record<string, string> | null) ||
        undefined;
      const studioMods = briefVideo?.modifications;

      await mediaQueue.add("render-media", {
        postId,
        prompt: JSON.stringify({
          ...short,
          _brand: {
            logoUrl:
              studioMods?.["Logo.source"] ||
              studioMods?.Logo ||
              brandKit.logoUrl,
            primaryColor:
              studioMods?.["Fill-1"] || brandKit.primaryColor,
            secondaryColor:
              studioMods?.["Fill-2"] || brandKit.secondaryColor,
            headingFont: brandKit.headingFont,
            bodyFont: brandKit.bodyFont,
          },
          _template: {
            templateId,
            presetId: briefVideo?.presetId || brandKit.videoTemplatePreset,
            fieldMap,
          },
          _modifications: studioMods,
        }),
        type: "VIDEO",
        templateId,
        modifications: studioMods,
        shareAssetWithPostIds,
      });
      return;
    } else {
      const caption = await generateCaption(brand, brief, platform, attachments);
      await db.post.update({
        where: { id: postId },
        data: {
          body: caption.caption,
          hashtags: caption.hashtags,
          altText: caption.altText,
          confidence: caption.confidence,
          ctaLabel: brand.ctaLabel,
        },
      });
      // Optional image for IG/FB from offer prompt
      if (platform === "INSTAGRAM" || brief.offer) {
        await mediaQueue.add("render-media", {
          postId,
          prompt: `Professional marketing photo for a ${brand.industry ?? "local"} business: ${brief.offer ?? brief.title} at ${brand.name}`,
          type: "IMAGE",
        });
        return;
      }
    }

    await applyRuleDecision(postId);
    void briefId;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[generate] post=${postId} failed:`, message);
      await db.post.update({
        where: { id: postId },
        data: {
          status: "FAILED",
          errorMessage: message.slice(0, 2000),
        },
      });
      throw err;
    }
  },
  { connection, concurrency: 2 }
);

new Worker<MediaJobData>(
  QUEUE_NAMES.MEDIA,
  async (job) => {
    const { postId, prompt, type, shareAssetWithPostIds, modifications } =
      job.data;
    try {
      const post = await db.post.findUnique({
        where: { id: postId },
        include: { client: { include: { brandKit: true } } },
      });
      if (!post) throw new Error("Post not found for media job");

      let url: string;
      if (type === "VIDEO") {
        let parsed: {
          hook?: string;
          punchline?: string;
          caption?: string;
          script?: string;
          onScreenText?: string[];
          cta?: string;
          visualPrompt?: string;
          _brand?: {
            logoUrl?: string | null;
            primaryColor?: string | null;
            secondaryColor?: string | null;
            headingFont?: string | null;
            bodyFont?: string | null;
          };
          _template?: {
            templateId?: string | null;
            presetId?: string | null;
            fieldMap?: Record<string, string> | null;
          };
          _modifications?: Record<string, string>;
        } = {};
        try {
          parsed = JSON.parse(prompt);
        } catch {
          parsed = {
            hook: prompt,
            punchline: post.metaDescription ?? prompt,
            cta: "Learn more",
          };
        }
        const hook = parsed.hook ?? post.title ?? "Watch this";
        const punchline =
          parsed.punchline ??
          parsed.onScreenText?.[1] ??
          post.metaDescription ??
          post.ctaLabel ??
          "Learn more";

        let videoSourceUrl: string | undefined;
        const visualPrompt = parsed.visualPrompt?.trim();
        if (visualPrompt) {
          try {
            videoSourceUrl = await generateImage(visualPrompt, {
              imageSize: "portrait_16_9",
              preferRemoteUrl: true,
            });
            if (
              videoSourceUrl.endsWith(".svg") ||
              videoSourceUrl.includes("placeholder")
            ) {
              videoSourceUrl = undefined;
            }
          } catch (err) {
            console.warn(
              "[media] fal still for Short failed, using template default video:",
              err instanceof Error ? err.message : err
            );
          }
        }

        const kit = post.client.brandKit;
        const extraMods =
          modifications || parsed._modifications || undefined;
        url = await renderShortVideo({
          hook,
          punchline,
          cta: parsed.cta ?? post.ctaLabel ?? "Learn more",
          brandName: post.client.name,
          videoSourceUrl,
          brand: parsed._brand ?? {
            logoUrl: kit?.logoUrl,
            primaryColor: kit?.primaryColor,
            secondaryColor: kit?.secondaryColor,
            headingFont: kit?.headingFont,
            bodyFont: kit?.bodyFont,
          },
          template: {
            templateId:
              job.data.templateId ||
              parsed._template?.templateId ||
              kit?.creatomateTemplateId,
            presetId: parsed._template?.presetId || kit?.videoTemplatePreset,
            fieldMap:
              parsed._template?.fieldMap ||
              ((kit?.creatomateFieldMap as Record<string, string> | null) ??
                null),
          },
          extraModifications: extraMods,
        });
      } else {
        url = await generateImage(prompt);
      }

      const asset = await db.asset.create({
        data: {
          clientId: post.clientId,
          type: type === "VIDEO" ? "VIDEO" : "IMAGE",
          url,
          prompt,
          mimeType: url.endsWith(".mp4")
            ? "video/mp4"
            : url.endsWith(".svg")
              ? "image/svg+xml"
              : "image/png",
        },
      });

      await db.post.update({
        where: { id: postId },
        data: { assetId: asset.id },
      });

      if (shareAssetWithPostIds?.length) {
        for (const siblingId of shareAssetWithPostIds) {
          await db.post.update({
            where: { id: siblingId },
            data: {
              assetId: asset.id,
              contentType: "SHORT_VIDEO",
              title: post.title,
              body: post.body,
              metaTitle: post.metaTitle,
              metaDescription: post.metaDescription,
              hashtags: post.hashtags,
              ctaLabel: post.ctaLabel,
              confidence: post.confidence,
            },
          });
          await applyRuleDecision(siblingId);
        }
      }

      await applyRuleDecision(postId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[media] post=${postId} failed:`, message);
      await db.post.update({
        where: { id: postId },
        data: {
          status: "FAILED",
          errorMessage: message.slice(0, 2000),
        },
      });
      throw err;
    }
  },
  { connection, concurrency: 1 }
);

new Worker<PublishJobData>(
  QUEUE_NAMES.PUBLISH,
  async (job) => {
    const { postId } = job.data;
    const post = await db.post.findUnique({
      where: { id: postId },
      include: {
        asset: true,
        client: true,
      },
    });
    if (!post) throw new Error("Post not found");

    await db.post.update({
      where: { id: postId },
      data: { status: "PUBLISHING" },
    });

    const connectionRow = await db.channelConnection.findUnique({
      where: {
        clientId_platform: {
          clientId: post.clientId,
          platform: post.platform,
        },
      },
    });

    const attemptNumber =
      (await db.publishAttempt.count({ where: { postId } })) + 1;

    try {
      let result;
      const message = [post.body, post.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")]
        .filter(Boolean)
        .join("\n\n");

      switch (post.platform) {
        case "FACEBOOK": {
          if (!connectionRow?.connected || !connectionRow.externalId) {
            throw new Error("Facebook channel not connected");
          }
          const fbIsVideo =
            post.contentType === "SHORT_VIDEO" ||
            post.asset?.mimeType === "video/mp4" ||
            post.asset?.url?.endsWith(".mp4");
          result = await publishFacebook({
            accessTokenEnc: connectionRow.accessTokenEnc!,
            pageId: connectionRow.externalId,
            message,
            imageUrl: fbIsVideo ? null : post.asset?.url,
            videoUrl: fbIsVideo ? post.asset?.url : null,
          });
          break;
        }
        case "INSTAGRAM": {
          if (!connectionRow?.connected || !connectionRow.externalId || !post.asset?.url) {
            throw new Error("Instagram requires connected account and media asset");
          }
          const igIsVideo =
            post.contentType === "SHORT_VIDEO" ||
            post.asset.mimeType === "video/mp4" ||
            post.asset.url.endsWith(".mp4");
          result = await publishInstagram({
            accessTokenEnc: connectionRow.accessTokenEnc!,
            igUserId: connectionRow.externalId,
            caption: message,
            imageUrl: igIsVideo ? undefined : post.asset.url,
            videoUrl: igIsVideo ? post.asset.url : undefined,
          });
          break;
        }
        case "WEBSITE_BLOG": {
          const slug =
            post.slug ||
            (post.title ?? post.id)
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/(^-|-$)/g, "")
              .slice(0, 80);
          const siteKey = (
            await db.client.findUnique({ where: { id: post.clientId } })
          )?.blogSiteKey;
          result = {
            externalPostId: slug,
            externalUrl: siteKey
              ? `${process.env.API_URL ?? "http://localhost:4000"}/public/blog/${siteKey}/${slug}`
              : undefined,
            raw: { mode: "website_embed", slug },
          };
          if (!post.slug) {
            await db.post.update({
              where: { id: postId },
              data: { slug },
            });
          }
          break;
        }
        case "TIKTOK": {
          if (!connectionRow?.connected || !connectionRow.externalId) {
            throw new Error("TikTok channel not connected");
          }
          if (!post.asset?.url) throw new Error("TikTok requires video asset");
          result = await publishTikTok({
            accessTokenEnc: connectionRow.accessTokenEnc!,
            openId: connectionRow.externalId,
            caption: message,
            videoUrl: post.asset.url,
          });
          break;
        }
        case "YOUTUBE_SHORTS": {
          if (!connectionRow?.connected) {
            throw new Error("YouTube channel not connected");
          }
          if (!post.asset?.url) throw new Error("YouTube Shorts requires video asset");
          result = await publishYouTubeShort({
            accessTokenEnc: connectionRow.accessTokenEnc!,
            refreshTokenEnc: connectionRow.refreshTokenEnc,
            connectionClientId: post.clientId,
            title: post.title ?? "Short",
            description: post.body ?? "",
            videoUrl: post.asset.url,
          });
          break;
        }
        case "PICTURE_AD": {
          if (!post.asset?.url) throw new Error("Picture ad requires image asset");
          result = await publishPictureAdExport({
            imageUrl: post.asset.url,
            headline: post.title ?? "",
          });
          break;
        }
        default:
          throw new Error(`Unsupported platform ${post.platform}`);
      }

      await db.publishAttempt.create({
        data: {
          postId,
          attemptNumber,
          success: true,
          response: result.raw as object ?? {},
        },
      });

      await db.post.update({
        where: { id: postId },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          externalPostId: result.externalPostId,
          externalUrl: result.externalUrl,
          errorMessage: null,
        },
      });

      await notifyQueue.add("notify", {
        type: "PUBLISHED",
        clientId: post.clientId,
        postId,
        message: `Published to ${post.platform}: ${result.externalUrl ?? result.externalPostId}`,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await db.publishAttempt.create({
        data: {
          postId,
          attemptNumber,
          success: false,
          errorMessage,
        },
      });
      await db.post.update({
        where: { id: postId },
        data: { status: "FAILED", errorMessage },
      });
      await notifyQueue.add("notify", {
        type: "PUBLISH_FAILED",
        clientId: post.clientId,
        postId,
        message: errorMessage,
      });
      throw err;
    }
  },
  { connection, concurrency: 2 }
);

new Worker<NotifyJobData>(
  QUEUE_NAMES.NOTIFY,
  async (job) => {
    const { message, type, postId } = job.data;
    console.log(`[notify:${type}] post=${postId} ${message}`);
    const { getAgencyCredentials } = await import("@seo/db");
    const creds = await getAgencyCredentials();
    if (creds.slackWebhookUrl) {
      await fetch(creds.slackWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `[${type}] ${message}` }),
      });
    }
  },
  { connection }
);

async function syncClientSeoRanks(clientId: string) {
  const client = await db.client.findUnique({
    where: { id: clientId },
    include: {
      gscConnection: true,
      rankKeywords: { where: { active: true } },
    },
  });
  if (!client) throw new Error("Client not found");

  const gsc = client.gscConnection;
  let accessToken = "";
  if (gsc?.accessTokenEnc) {
    try {
      accessToken = decryptToken(gsc.accessTokenEnc, env.tokenEncryptionKey);
    } catch {
      accessToken = "";
    }
  }

  if (gsc?.connected && gsc.siteUrl && accessToken) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 28);
    const body = {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      dimensions: ["query"],
      rowLimit: 25,
    };
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(gsc.siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );
    if (res.ok) {
      const json = (await res.json()) as {
        rows?: Array<{
          keys?: string[];
          position?: number;
          clicks?: number;
          impressions?: number;
        }>;
      };
      for (const row of json.rows ?? []) {
        const keyword = row.keys?.[0];
        if (!keyword) continue;
        const rankKw = await db.rankKeyword.upsert({
          where: {
            clientId_keyword: { clientId, keyword },
          },
          create: { clientId, keyword, active: true },
          update: { active: true },
        });
        await db.rankSnapshot.create({
          data: {
            rankKeywordId: rankKw.id,
            position: row.position ?? null,
            clicks: row.clicks ?? null,
            impressions: row.impressions ?? null,
            source: "gsc",
          },
        });
      }
      return;
    }
    console.warn(`[seo-sync] GSC query failed: ${res.status}`);
  }

  for (const [i, rk] of client.rankKeywords.entries()) {
    await db.rankSnapshot.create({
      data: {
        rankKeywordId: rk.id,
        position: 10 + i * 2,
        source: "demo",
      },
    });
  }
}

const seoSyncQueue = new Queue<SeoSyncJobData>(QUEUE_NAMES.SEO_SYNC, {
  connection,
});

new Worker<SeoSyncJobData>(
  QUEUE_NAMES.SEO_SYNC,
  async (job) => {
    if (job.data.type === "daily_all") {
      const connections = await db.gscConnection.findMany({
        where: { connected: true },
        select: { clientId: true },
      });
      const withRanks = await db.rankKeyword.findMany({
        where: { active: true },
        select: { clientId: true },
        distinct: ["clientId"],
      });
      const ids = new Set([
        ...connections.map((c) => c.clientId),
        ...withRanks.map((r) => r.clientId),
      ]);
      console.log(`[seo-sync] daily_all clients=${ids.size}`);
      for (const clientId of ids) {
        await syncClientSeoRanks(clientId);
      }
      return;
    }

    const clientId = job.data.clientId;
    if (!clientId) throw new Error("clientId required");
    console.log(`[seo-sync] client=${clientId}`);
    await syncClientSeoRanks(clientId);
  },
  { connection, concurrency: 1 }
);

void seoSyncQueue
  .add(
    "seo-sync-daily",
    { type: "daily_all" },
    {
      repeat: { pattern: "0 6 * * *" },
      jobId: "seo-sync-daily",
    }
  )
  .then(() => console.log("[seo-sync] daily job scheduled (06:00 UTC)"))
  .catch((err) => console.warn("[seo-sync] schedule failed", err));

console.log("Worker running — queues:", Object.values(QUEUE_NAMES).join(", "));
