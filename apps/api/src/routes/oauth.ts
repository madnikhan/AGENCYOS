import { Router } from "express";
import { db, Platform, Prisma, getAgencyCredentials } from "@seo/db";
import { encryptToken } from "@seo/shared";
import { env } from "../config";

export const oauthRouter = Router();
export const channelsRouter = Router();

function redirectOAuthError(
  res: { redirect: (url: string) => void },
  clientId: string | undefined,
  code: string
) {
  const base = clientId
    ? `${env.webUrl}/clients/${clientId}`
    : `${env.webUrl}/settings`;
  const sep = base.includes("?") ? "&" : "?";
  res.redirect(`${base}${sep}error=${encodeURIComponent(code)}`);
}

type MetaPageOption = {
  id: string;
  name: string;
  accessToken: string;
  igUserId?: string;
};

channelsRouter.get("/:clientId", async (req, res) => {
  const connections = await db.channelConnection.findMany({
    where: { clientId: req.params.clientId },
  });
  res.json(
    connections.map((c) => ({
      ...c,
      accessTokenEnc: c.accessTokenEnc ? "[encrypted]" : null,
      refreshTokenEnc: c.refreshTokenEnc ? "[encrypted]" : null,
    }))
  );
});

channelsRouter.put("/:clientId/:platform", async (req, res) => {
  const platform = req.params.platform.toUpperCase() as Platform;
  if (!Object.values(Platform).includes(platform)) {
    return res.status(400).json({ error: "Invalid platform" });
  }
  const {
    accessToken,
    refreshToken,
    externalId,
    accountLabel,
    metadata,
    connected,
  } = req.body as {
    accessToken?: string;
    refreshToken?: string;
    externalId?: string;
    accountLabel?: string;
    metadata?: Record<string, unknown>;
    connected?: boolean;
  };

  const connection = await db.channelConnection.upsert({
    where: {
      clientId_platform: {
        clientId: req.params.clientId,
        platform,
      },
    },
    create: {
      clientId: req.params.clientId,
      platform,
      externalId,
      accountLabel,
      accessTokenEnc: accessToken
        ? encryptToken(accessToken, env.tokenEncryptionKey)
        : null,
      refreshTokenEnc: refreshToken
        ? encryptToken(refreshToken, env.tokenEncryptionKey)
        : null,
      metadata: (metadata ?? {}) as Prisma.InputJsonValue,
      connected: connected ?? Boolean(accessToken),
    },
    update: {
      externalId,
      accountLabel,
      accessTokenEnc: accessToken
        ? encryptToken(accessToken, env.tokenEncryptionKey)
        : undefined,
      refreshTokenEnc: refreshToken
        ? encryptToken(refreshToken, env.tokenEncryptionKey)
        : undefined,
      metadata: metadata
        ? (metadata as Prisma.InputJsonValue)
        : undefined,
      connected: connected ?? undefined,
    },
  });

  res.json({
    ...connection,
    accessTokenEnc: connection.accessTokenEnc ? "[encrypted]" : null,
    refreshTokenEnc: connection.refreshTokenEnc ? "[encrypted]" : null,
  });
});

oauthRouter.get("/meta/start", async (req, res) => {
  const clientId = req.query.clientId as string;
  const creds = await getAgencyCredentials();
  if (!clientId) {
    return redirectOAuthError(res, undefined, "missing_client");
  }
  if (!creds.meta.appId || !creds.meta.appSecret) {
    return redirectOAuthError(res, clientId, "meta_not_configured");
  }
  const scopes = [
    "pages_manage_posts",
    "pages_read_engagement",
    "instagram_basic",
    "instagram_content_publish",
    "pages_show_list",
  ].join(",");
  const state = Buffer.from(JSON.stringify({ clientId })).toString("base64url");
  const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  url.searchParams.set("client_id", creds.meta.appId);
  url.searchParams.set("redirect_uri", creds.meta.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", scopes);
  res.redirect(url.toString());
});

oauthRouter.get("/meta/callback", async (req, res) => {
  const { code, state } = req.query as { code?: string; state?: string };
  if (!code || !state) return res.status(400).send("Missing code/state");
  const { clientId } = JSON.parse(
    Buffer.from(state, "base64url").toString("utf8")
  ) as { clientId: string };
  const creds = await getAgencyCredentials();

  const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
  tokenUrl.searchParams.set("client_id", creds.meta.appId);
  tokenUrl.searchParams.set("client_secret", creds.meta.appSecret);
  tokenUrl.searchParams.set("redirect_uri", creds.meta.redirectUri);
  tokenUrl.searchParams.set("code", code);
  const tokenRes = await fetch(tokenUrl);
  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    error?: { message: string };
  };
  if (!tokenJson.access_token) {
    return res.status(400).json(tokenJson);
  }

  const pagesRes = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${tokenJson.access_token}`
  );
  const pagesJson = (await pagesRes.json()) as {
    data?: Array<{
      id: string;
      name: string;
      access_token: string;
      instagram_business_account?: { id: string };
    }>;
  };

  const pages: MetaPageOption[] = (pagesJson.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    accessToken: p.access_token,
    igUserId: p.instagram_business_account?.id,
  }));

  if (!pages.length) {
    return res.status(400).json({ error: "No Facebook Pages found for user" });
  }

  const pending = await db.oAuthPending.create({
    data: {
      clientId,
      provider: "meta",
      payload: { pages } as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  });

  res.redirect(
    `${env.webUrl}/clients/${clientId}/connect/meta?pending=${pending.id}`
  );
});

oauthRouter.get("/meta/pending/:id", async (req, res) => {
  const pending = await db.oAuthPending.findUnique({
    where: { id: req.params.id },
  });
  if (!pending || pending.expiresAt < new Date()) {
    return res.status(404).json({ error: "Pending OAuth session expired" });
  }
  const payload = pending.payload as { pages: MetaPageOption[] };
  res.json({
    id: pending.id,
    clientId: pending.clientId,
    pages: payload.pages.map((p) => ({
      id: p.id,
      name: p.name,
      hasInstagram: Boolean(p.igUserId),
    })),
  });
});

oauthRouter.post("/meta/confirm", async (req, res) => {
  const { pendingId, pageId, connectInstagram } = req.body as {
    pendingId?: string;
    pageId?: string;
    connectInstagram?: boolean;
  };
  if (!pendingId || !pageId) {
    return res.status(400).json({ error: "pendingId and pageId required" });
  }

  const pending = await db.oAuthPending.findUnique({ where: { id: pendingId } });
  if (!pending || pending.expiresAt < new Date()) {
    return res.status(404).json({ error: "Pending OAuth session expired" });
  }

  const payload = pending.payload as { pages: MetaPageOption[] };
  const page = payload.pages.find((p) => p.id === pageId);
  if (!page) {
    return res.status(400).json({ error: "Page not found in pending session" });
  }

  const clientId = pending.clientId;
  await db.channelConnection.upsert({
    where: { clientId_platform: { clientId, platform: "FACEBOOK" } },
    create: {
      clientId,
      platform: "FACEBOOK",
      externalId: page.id,
      accountLabel: page.name,
      accessTokenEnc: encryptToken(page.accessToken, env.tokenEncryptionKey),
      connected: true,
      metadata: { selectedViaPicker: true },
    },
    update: {
      externalId: page.id,
      accountLabel: page.name,
      accessTokenEnc: encryptToken(page.accessToken, env.tokenEncryptionKey),
      connected: true,
    },
  });

  if (connectInstagram !== false && page.igUserId) {
    await db.channelConnection.upsert({
      where: { clientId_platform: { clientId, platform: "INSTAGRAM" } },
      create: {
        clientId,
        platform: "INSTAGRAM",
        externalId: page.igUserId,
        accountLabel: `${page.name} · Instagram`,
        accessTokenEnc: encryptToken(page.accessToken, env.tokenEncryptionKey),
        connected: true,
        metadata: { pageId: page.id },
      },
      update: {
        externalId: page.igUserId,
        accountLabel: `${page.name} · Instagram`,
        accessTokenEnc: encryptToken(page.accessToken, env.tokenEncryptionKey),
        connected: true,
        metadata: { pageId: page.id },
      },
    });
  }

  await db.oAuthPending.delete({ where: { id: pending.id } });
  res.json({ ok: true, clientId, pageName: page.name });
});

oauthRouter.get("/tiktok/start", async (req, res) => {
  const clientId = req.query.clientId as string;
  const creds = await getAgencyCredentials();
  if (!clientId) {
    return redirectOAuthError(res, undefined, "missing_client");
  }
  if (!creds.tiktok.clientKey || !creds.tiktok.clientSecret) {
    return redirectOAuthError(res, clientId, "tiktok_not_configured");
  }
  const state = Buffer.from(JSON.stringify({ clientId })).toString("base64url");
  const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
  url.searchParams.set("client_key", creds.tiktok.clientKey);
  url.searchParams.set("scope", "user.info.basic,video.publish,video.upload");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", creds.tiktok.redirectUri);
  url.searchParams.set("state", state);
  res.redirect(url.toString());
});

oauthRouter.get("/tiktok/callback", async (req, res) => {
  const { code, state } = req.query as { code?: string; state?: string };
  if (!code || !state) return res.status(400).send("Missing code/state");
  const { clientId } = JSON.parse(
    Buffer.from(state, "base64url").toString("utf8")
  ) as { clientId: string };
  const creds = await getAgencyCredentials();

  const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: creds.tiktok.clientKey,
      client_secret: creds.tiktok.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: creds.tiktok.redirectUri,
    }),
  });
  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    open_id?: string;
    expires_in?: number;
    error?: string;
  };
  if (!tokenJson.access_token) {
    return res.status(400).json(tokenJson);
  }

  await db.channelConnection.upsert({
    where: { clientId_platform: { clientId, platform: "TIKTOK" } },
    create: {
      clientId,
      platform: "TIKTOK",
      externalId: tokenJson.open_id,
      accessTokenEnc: encryptToken(tokenJson.access_token, env.tokenEncryptionKey),
      refreshTokenEnc: tokenJson.refresh_token
        ? encryptToken(tokenJson.refresh_token, env.tokenEncryptionKey)
        : null,
      tokenExpiresAt: tokenJson.expires_in
        ? new Date(Date.now() + tokenJson.expires_in * 1000)
        : null,
      connected: true,
    },
    update: {
      externalId: tokenJson.open_id,
      accessTokenEnc: encryptToken(tokenJson.access_token, env.tokenEncryptionKey),
      refreshTokenEnc: tokenJson.refresh_token
        ? encryptToken(tokenJson.refresh_token, env.tokenEncryptionKey)
        : undefined,
      tokenExpiresAt: tokenJson.expires_in
        ? new Date(Date.now() + tokenJson.expires_in * 1000)
        : undefined,
      connected: true,
    },
  });

  res.redirect(`${env.webUrl}/clients/${clientId}?connected=tiktok`);
});

oauthRouter.get("/youtube/start", async (req, res) => {
  const clientId = req.query.clientId as string;
  const creds = await getAgencyCredentials();
  if (!clientId) {
    return redirectOAuthError(res, undefined, "missing_client");
  }
  if (!creds.google.clientId || !creds.google.clientSecret) {
    return redirectOAuthError(res, clientId, "youtube_not_configured");
  }
  const state = Buffer.from(JSON.stringify({ clientId })).toString("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", creds.google.clientId);
  url.searchParams.set("redirect_uri", creds.google.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/youtube.upload");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  res.redirect(url.toString());
});

oauthRouter.get("/youtube/callback", async (req, res) => {
  const { code, state } = req.query as { code?: string; state?: string };
  if (!code || !state) return res.status(400).send("Missing code/state");
  const { clientId } = JSON.parse(
    Buffer.from(state, "base64url").toString("utf8")
  ) as { clientId: string };
  const creds = await getAgencyCredentials();

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: creds.google.clientId,
      client_secret: creds.google.clientSecret,
      redirect_uri: creds.google.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!tokenJson.access_token) {
    return res.status(400).json(tokenJson);
  }

  await db.channelConnection.upsert({
    where: { clientId_platform: { clientId, platform: "YOUTUBE_SHORTS" } },
    create: {
      clientId,
      platform: "YOUTUBE_SHORTS",
      accessTokenEnc: encryptToken(tokenJson.access_token, env.tokenEncryptionKey),
      refreshTokenEnc: tokenJson.refresh_token
        ? encryptToken(tokenJson.refresh_token, env.tokenEncryptionKey)
        : null,
      tokenExpiresAt: tokenJson.expires_in
        ? new Date(Date.now() + tokenJson.expires_in * 1000)
        : null,
      connected: true,
    },
    update: {
      accessTokenEnc: encryptToken(tokenJson.access_token, env.tokenEncryptionKey),
      refreshTokenEnc: tokenJson.refresh_token
        ? encryptToken(tokenJson.refresh_token, env.tokenEncryptionKey)
        : undefined,
      tokenExpiresAt: tokenJson.expires_in
        ? new Date(Date.now() + tokenJson.expires_in * 1000)
        : undefined,
      connected: true,
    },
  });

  res.redirect(`${env.webUrl}/clients/${clientId}?connected=youtube`);
});
