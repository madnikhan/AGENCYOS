import { getAgencyCredentials } from "@seo/db";
import { decryptToken, encryptToken } from "@seo/shared";
import { env } from "../config";

export type PublishResult = {
  externalPostId: string;
  externalUrl?: string;
  raw?: unknown;
};

function token(enc: string | null | undefined): string {
  if (!enc) throw new Error("Missing access token for channel");
  return decryptToken(enc, env.tokenEncryptionKey);
}

function formatMetaPublishError(message?: string): string {
  const msg = message ?? "Facebook publish failed";
  if (
    /pages_manage_posts|pages_read_engagement|not available|App Review/i.test(
      msg
    )
  ) {
    return `${msg} — Fix: Meta Developer Console → Facebook Login for Business → Configuration must include pages_manage_posts + pages_read_engagement, then Reconnect Facebook on the client. Development-mode apps only grant these to app Admins/Developers/Testers.`;
  }
  return msg;
}

export async function publishFacebook(opts: {
  accessTokenEnc: string;
  pageId: string;
  message: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
}): Promise<PublishResult> {
  const accessToken = token(opts.accessTokenEnc);
  const isVideo =
    opts.videoUrl &&
    !opts.videoUrl.endsWith(".svg") &&
    (opts.videoUrl.endsWith(".mp4") || opts.videoUrl.includes("video"));

  if (isVideo && opts.videoUrl) {
    const url = new URL(
      `https://graph.facebook.com/v21.0/${opts.pageId}/videos`
    );
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_url: opts.videoUrl,
        description: opts.message,
        access_token: accessToken,
      }),
    });
    const json = (await res.json()) as {
      id?: string;
      error?: { message: string };
    };
    if (!res.ok || json.error) {
      throw new Error(formatMetaPublishError(json.error?.message));
    }
    return {
      externalPostId: json.id ?? "unknown",
      externalUrl: `https://facebook.com/${json.id}`,
      raw: json,
    };
  }

  if (opts.imageUrl) {
    const url = new URL(`https://graph.facebook.com/v21.0/${opts.pageId}/photos`);
    url.searchParams.set("url", opts.imageUrl);
    url.searchParams.set("caption", opts.message);
    url.searchParams.set("access_token", accessToken);
    const res = await fetch(url, { method: "POST" });
    const json = (await res.json()) as {
      id?: string;
      post_id?: string;
      error?: { message: string };
    };
    if (!res.ok || json.error) {
      throw new Error(formatMetaPublishError(json.error?.message));
    }
    return {
      externalPostId: json.post_id ?? json.id ?? "unknown",
      externalUrl: `https://facebook.com/${json.post_id ?? json.id}`,
      raw: json,
    };
  }

  const url = new URL(`https://graph.facebook.com/v21.0/${opts.pageId}/feed`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: opts.message, access_token: accessToken }),
  });
  const json = (await res.json()) as { id?: string; error?: { message: string } };
  if (!res.ok || json.error) {
    throw new Error(formatMetaPublishError(json.error?.message));
  }
  return {
    externalPostId: json.id ?? "unknown",
    externalUrl: `https://facebook.com/${json.id}`,
    raw: json,
  };
}

export async function publishInstagram(opts: {
  accessTokenEnc: string;
  igUserId: string;
  caption: string;
  imageUrl?: string;
  videoUrl?: string;
}): Promise<PublishResult> {
  const accessToken = token(opts.accessTokenEnc);
  const isReel =
    opts.videoUrl &&
    !opts.videoUrl.endsWith(".svg") &&
    (opts.videoUrl.endsWith(".mp4") || opts.videoUrl.includes("video"));

  const createUrl = new URL(
    `https://graph.facebook.com/v21.0/${opts.igUserId}/media`
  );
  if (isReel && opts.videoUrl) {
    createUrl.searchParams.set("media_type", "REELS");
    createUrl.searchParams.set("video_url", opts.videoUrl);
    createUrl.searchParams.set("share_to_feed", "true");
  } else if (opts.imageUrl) {
    createUrl.searchParams.set("image_url", opts.imageUrl);
  } else {
    throw new Error("Instagram requires an image or video asset");
  }
  createUrl.searchParams.set("caption", opts.caption);
  createUrl.searchParams.set("access_token", accessToken);
  const createRes = await fetch(createUrl, { method: "POST" });
  const createJson = (await createRes.json()) as {
    id?: string;
    error?: { message: string };
  };
  if (!createRes.ok || !createJson.id) {
    throw new Error(
      createJson.error?.message ?? "Instagram container create failed"
    );
  }

  // Reels processing can take a moment — poll briefly before publish
  if (isReel) {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const statusRes = await fetch(
        `https://graph.facebook.com/v21.0/${createJson.id}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`
      );
      const statusJson = (await statusRes.json()) as {
        status_code?: string;
        error?: { message: string };
      };
      if (statusJson.status_code === "FINISHED") break;
      if (statusJson.status_code === "ERROR" || statusJson.error) {
        throw new Error(
          statusJson.error?.message ?? "Instagram Reel processing failed"
        );
      }
    }
  }

  const publishUrl = new URL(
    `https://graph.facebook.com/v21.0/${opts.igUserId}/media_publish`
  );
  publishUrl.searchParams.set("creation_id", createJson.id);
  publishUrl.searchParams.set("access_token", accessToken);
  const pubRes = await fetch(publishUrl, { method: "POST" });
  const pubJson = (await pubRes.json()) as {
    id?: string;
    error?: { message: string };
  };
  if (!pubRes.ok || !pubJson.id) {
    throw new Error(pubJson.error?.message ?? "Instagram publish failed");
  }
  return { externalPostId: pubJson.id, raw: pubJson };
}

export async function publishTikTok(opts: {
  accessTokenEnc: string;
  openId: string;
  caption: string;
  videoUrl: string;
}): Promise<PublishResult> {
  const accessToken = token(opts.accessTokenEnc);
  const initRes = await fetch(
    "https://open.tiktokapis.com/v2/post/publish/video/init/",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: opts.caption.slice(0, 150),
          privacy_level: "PUBLIC_TO_EVERYONE",
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: "PULL_FROM_URL",
          video_url: opts.videoUrl,
        },
      }),
    }
  );
  const initJson = (await initRes.json()) as {
    data?: { publish_id?: string };
    error?: { message?: string; code?: string };
  };
  if (!initRes.ok || initJson.error?.code) {
    const creds = await getAgencyCredentials();
    if (!creds.creatomate.apiKey) {
      return {
        externalPostId: `tiktok-simulated-${Date.now()}`,
        externalUrl: opts.videoUrl,
        raw: { simulated: true, response: initJson },
      };
    }
    throw new Error(
      initJson.error?.message ??
        "TikTok publish init failed — check app review status"
    );
  }
  return {
    externalPostId: initJson.data?.publish_id ?? "tiktok-unknown",
    raw: initJson,
  };
}

export async function publishYouTubeShort(opts: {
  accessTokenEnc: string;
  refreshTokenEnc?: string | null;
  /** When set, persist refreshed access token after a successful refresh */
  connectionClientId?: string;
  title: string;
  description: string;
  videoUrl: string;
}): Promise<PublishResult> {
  const creds = await getAgencyCredentials();
  if (!creds.google.clientId || !creds.google.clientSecret) {
    throw new Error("Google OAuth client is not configured in Settings");
  }

  const { google } = await import("googleapis");
  const oauth2 = new google.auth.OAuth2(
    creds.google.clientId,
    creds.google.clientSecret
  );

  const refreshToken = opts.refreshTokenEnc
    ? decryptToken(opts.refreshTokenEnc, env.tokenEncryptionKey)
    : undefined;
  // Prefer refresh_token: stored access tokens expire (~1h) and googleapis will
  // not refresh if an expired access_token is set without expiry_date.
  oauth2.setCredentials(
    refreshToken
      ? { refresh_token: refreshToken }
      : { access_token: token(opts.accessTokenEnc) }
  );

  try {
    const fresh = await oauth2.getAccessToken();
    if (!fresh.token) {
      throw new Error("Could not obtain a YouTube access token");
    }
    if (opts.connectionClientId && fresh.token) {
      const { prisma } = await import("@seo/db");
      const expiresIn =
        typeof oauth2.credentials.expiry_date === "number"
          ? Math.max(
              0,
              Math.floor((oauth2.credentials.expiry_date - Date.now()) / 1000)
            )
          : 3500;
      await prisma.channelConnection.update({
        where: {
          clientId_platform: {
            clientId: opts.connectionClientId,
            platform: "YOUTUBE_SHORTS",
          },
        },
        data: {
          accessTokenEnc: encryptToken(fresh.token, env.tokenEncryptionKey),
          tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
        },
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `YouTube credentials invalid or expired — reconnect YouTube on the client page. (${msg})`
    );
  }

  const videoRes = await fetch(opts.videoUrl);
  if (!videoRes.ok) {
    if (opts.videoUrl.endsWith(".svg")) {
      return {
        externalPostId: `youtube-simulated-${Date.now()}`,
        externalUrl: opts.videoUrl,
        raw: { simulated: true, reason: "placeholder media" },
      };
    }
    throw new Error(`Failed to download video for YouTube: ${videoRes.status}`);
  }
  const buffer = Buffer.from(await videoRes.arrayBuffer());
  const { Readable } = await import("stream");
  const youtube = google.youtube({ version: "v3", auth: oauth2 });
  try {
    const upload = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: `${opts.title} #Shorts`.slice(0, 100),
          description: `${opts.description}\n\n#Shorts`,
          categoryId: "22",
        },
        status: {
          privacyStatus: "public",
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: Readable.from(buffer),
      },
    });

    const id = upload.data.id ?? "unknown";
    return {
      externalPostId: id,
      externalUrl: `https://youtube.com/shorts/${id}`,
      raw: upload.data,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/invalid.?credentials|unauthorized|login required/i.test(msg)) {
      throw new Error(
        `YouTube upload rejected credentials — reconnect YouTube on the client page. (${msg})`
      );
    }
    throw err;
  }
}

export async function publishPictureAdExport(opts: {
  imageUrl: string;
  headline: string;
}): Promise<PublishResult> {
  return {
    externalPostId: `ad-asset-${Date.now()}`,
    externalUrl: opts.imageUrl,
    raw: { headline: opts.headline, status: "creative_ready" },
  };
}
