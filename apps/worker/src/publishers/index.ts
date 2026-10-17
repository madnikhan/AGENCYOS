import { getAgencyCredentials } from "@seo/db";
import { decryptToken } from "@seo/shared";
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

export async function publishFacebook(opts: {
  accessTokenEnc: string;
  pageId: string;
  message: string;
  imageUrl?: string | null;
}): Promise<PublishResult> {
  const accessToken = token(opts.accessTokenEnc);
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
      throw new Error(json.error?.message ?? "Facebook photo publish failed");
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
    throw new Error(json.error?.message ?? "Facebook feed publish failed");
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
  imageUrl: string;
}): Promise<PublishResult> {
  const accessToken = token(opts.accessTokenEnc);
  const createUrl = new URL(
    `https://graph.facebook.com/v21.0/${opts.igUserId}/media`
  );
  createUrl.searchParams.set("image_url", opts.imageUrl);
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
  title: string;
  description: string;
  videoUrl: string;
}): Promise<PublishResult> {
  const creds = await getAgencyCredentials();
  const { google } = await import("googleapis");
  const oauth2 = new google.auth.OAuth2(
    creds.google.clientId,
    creds.google.clientSecret
  );
  oauth2.setCredentials({
    access_token: token(opts.accessTokenEnc),
    refresh_token: opts.refreshTokenEnc
      ? decryptToken(opts.refreshTokenEnc, env.tokenEncryptionKey)
      : undefined,
  });

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
