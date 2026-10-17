import { decryptToken, encryptToken } from "@seo/shared";
import { prisma } from "./client";

const SETTINGS_ID = "default";

function encKey(): string {
  return (
    process.env.TOKEN_ENCRYPTION_KEY ?? "change-me-to-a-32-byte-secret-key!!"
  );
}

function decryptOpt(value: string | null | undefined): string {
  if (!value) return "";
  try {
    return decryptToken(value, encKey());
  } catch {
    return "";
  }
}

function encryptOpt(plain: string): string {
  return encryptToken(plain, encKey());
}

export type AgencyCredentials = {
  anthropicApiKey: string;
  falKey: string;
  meta: {
    appId: string;
    appSecret: string;
    redirectUri: string;
  };
  tiktok: {
    clientKey: string;
    clientSecret: string;
    redirectUri: string;
  };
  google: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
  creatomate: {
    apiKey: string;
    templateId: string;
  };
  slackWebhookUrl: string;
  resendApiKey: string;
  notifyEmailFrom: string;
};

export type AgencySettingsStatus = {
  claudeConfigured: boolean;
  falConfigured: boolean;
  metaConfigured: boolean;
  tiktokConfigured: boolean;
  youtubeConfigured: boolean;
  creatomateConfigured: boolean;
  metaAppId: string;
  tiktokClientKey: string;
  googleClientId: string;
  creatomateTemplateId: string;
  metaRedirectUri: string;
  tiktokRedirectUri: string;
  googleRedirectUri: string;
  slackConfigured: boolean;
  notifyEmailFrom: string;
  sources: {
    claude: "db" | "env" | "none";
    meta: "db" | "env" | "none";
    tiktok: "db" | "env" | "none";
    youtube: "db" | "env" | "none";
    fal: "db" | "env" | "none";
  };
};

function envFallback(): AgencyCredentials {
  return {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    falKey: process.env.FAL_KEY ?? "",
    meta: {
      appId: process.env.META_APP_ID ?? "",
      appSecret: process.env.META_APP_SECRET ?? "",
      redirectUri:
        process.env.META_REDIRECT_URI ??
        "http://localhost:4000/oauth/meta/callback",
    },
    tiktok: {
      clientKey: process.env.TIKTOK_CLIENT_KEY ?? "",
      clientSecret: process.env.TIKTOK_CLIENT_SECRET ?? "",
      redirectUri:
        process.env.TIKTOK_REDIRECT_URI ??
        "http://localhost:4000/oauth/tiktok/callback",
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirectUri:
        process.env.GOOGLE_REDIRECT_URI ??
        "http://localhost:4000/oauth/youtube/callback",
    },
    creatomate: {
      apiKey: process.env.CREATOMATE_API_KEY ?? "",
      templateId: process.env.CREATOMATE_TEMPLATE_ID ?? "",
    },
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL ?? "",
    resendApiKey: process.env.RESEND_API_KEY ?? "",
    notifyEmailFrom:
      process.env.NOTIFY_EMAIL_FROM ?? "alerts@agency.local",
  };
}

/** DB settings override env when present. */
export async function getAgencyCredentials(): Promise<AgencyCredentials> {
  const fallback = envFallback();
  let row = null;
  try {
    row = await prisma.agencySettings.findUnique({
      where: { id: SETTINGS_ID },
    });
  } catch {
    return fallback;
  }
  if (!row) return fallback;

  const anthropic = decryptOpt(row.anthropicApiKeyEnc) || fallback.anthropicApiKey;
  const fal = decryptOpt(row.falKeyEnc) || fallback.falKey;
  const metaSecret =
    decryptOpt(row.metaAppSecretEnc) || fallback.meta.appSecret;
  const tiktokSecret =
    decryptOpt(row.tiktokClientSecretEnc) || fallback.tiktok.clientSecret;
  const googleSecret =
    decryptOpt(row.googleClientSecretEnc) || fallback.google.clientSecret;
  const creatomateKey =
    decryptOpt(row.creatomateApiKeyEnc) || fallback.creatomate.apiKey;
  const resend = decryptOpt(row.resendApiKeyEnc) || fallback.resendApiKey;

  return {
    anthropicApiKey: anthropic,
    falKey: fal,
    meta: {
      appId: row.metaAppId || fallback.meta.appId,
      appSecret: metaSecret,
      redirectUri: row.metaRedirectUri || fallback.meta.redirectUri,
    },
    tiktok: {
      clientKey: row.tiktokClientKey || fallback.tiktok.clientKey,
      clientSecret: tiktokSecret,
      redirectUri: row.tiktokRedirectUri || fallback.tiktok.redirectUri,
    },
    google: {
      clientId: row.googleClientId || fallback.google.clientId,
      clientSecret: googleSecret,
      redirectUri: row.googleRedirectUri || fallback.google.redirectUri,
    },
    creatomate: {
      apiKey: creatomateKey,
      templateId: row.creatomateTemplateId || fallback.creatomate.templateId,
    },
    slackWebhookUrl: row.slackWebhookUrl || fallback.slackWebhookUrl,
    resendApiKey: resend,
    notifyEmailFrom: row.notifyEmailFrom || fallback.notifyEmailFrom,
  };
}

export async function getAgencySettingsStatus(): Promise<AgencySettingsStatus> {
  const creds = await getAgencyCredentials();
  let row = null;
  try {
    row = await prisma.agencySettings.findUnique({
      where: { id: SETTINGS_ID },
    });
  } catch {
    /* table may not exist yet */
  }

  const claudeFromDb = Boolean(decryptOpt(row?.anthropicApiKeyEnc));
  const falFromDb = Boolean(decryptOpt(row?.falKeyEnc));
  const metaFromDb = Boolean(row?.metaAppId && decryptOpt(row?.metaAppSecretEnc));
  const tiktokFromDb = Boolean(
    row?.tiktokClientKey && decryptOpt(row?.tiktokClientSecretEnc)
  );
  const youtubeFromDb = Boolean(
    row?.googleClientId && decryptOpt(row?.googleClientSecretEnc)
  );

  return {
    claudeConfigured: Boolean(creds.anthropicApiKey),
    falConfigured: Boolean(creds.falKey),
    metaConfigured: Boolean(creds.meta.appId && creds.meta.appSecret),
    tiktokConfigured: Boolean(
      creds.tiktok.clientKey && creds.tiktok.clientSecret
    ),
    youtubeConfigured: Boolean(
      creds.google.clientId && creds.google.clientSecret
    ),
    creatomateConfigured: Boolean(
      creds.creatomate.apiKey && creds.creatomate.templateId
    ),
    metaAppId: creds.meta.appId,
    tiktokClientKey: creds.tiktok.clientKey,
    googleClientId: creds.google.clientId,
    creatomateTemplateId: creds.creatomate.templateId,
    metaRedirectUri: creds.meta.redirectUri,
    tiktokRedirectUri: creds.tiktok.redirectUri,
    googleRedirectUri: creds.google.redirectUri,
    slackConfigured: Boolean(creds.slackWebhookUrl),
    notifyEmailFrom: creds.notifyEmailFrom,
    sources: {
      claude: claudeFromDb
        ? "db"
        : creds.anthropicApiKey
          ? "env"
          : "none",
      meta: metaFromDb
        ? "db"
        : creds.meta.appId
          ? "env"
          : "none",
      tiktok: tiktokFromDb
        ? "db"
        : creds.tiktok.clientKey
          ? "env"
          : "none",
      youtube: youtubeFromDb
        ? "db"
        : creds.google.clientId
          ? "env"
          : "none",
      fal: falFromDb ? "db" : creds.falKey ? "env" : "none",
    },
  };
}

export type UpdateAgencySettingsInput = {
  anthropicApiKey?: string;
  falKey?: string;
  metaAppId?: string;
  metaAppSecret?: string;
  metaRedirectUri?: string;
  tiktokClientKey?: string;
  tiktokClientSecret?: string;
  tiktokRedirectUri?: string;
  googleClientId?: string;
  googleClientSecret?: string;
  googleRedirectUri?: string;
  creatomateApiKey?: string;
  creatomateTemplateId?: string;
  slackWebhookUrl?: string;
  resendApiKey?: string;
  notifyEmailFrom?: string;
};

/** Partial update; empty string for secrets means leave unchanged. */
export async function updateAgencySettings(
  input: UpdateAgencySettingsInput
): Promise<AgencySettingsStatus> {
  const existing = await prisma.agencySettings.findUnique({
    where: { id: SETTINGS_ID },
  });

  const data: Record<string, string | null | undefined> = {};

  if (input.anthropicApiKey !== undefined && input.anthropicApiKey !== "") {
    data.anthropicApiKeyEnc = encryptOpt(input.anthropicApiKey);
  }
  if (input.falKey !== undefined && input.falKey !== "") {
    data.falKeyEnc = encryptOpt(input.falKey);
  }
  if (input.metaAppId !== undefined) {
    data.metaAppId = input.metaAppId || null;
  }
  if (input.metaAppSecret !== undefined && input.metaAppSecret !== "") {
    data.metaAppSecretEnc = encryptOpt(input.metaAppSecret);
  }
  if (input.metaRedirectUri !== undefined) {
    data.metaRedirectUri = input.metaRedirectUri || null;
  }
  if (input.tiktokClientKey !== undefined) {
    data.tiktokClientKey = input.tiktokClientKey || null;
  }
  if (
    input.tiktokClientSecret !== undefined &&
    input.tiktokClientSecret !== ""
  ) {
    data.tiktokClientSecretEnc = encryptOpt(input.tiktokClientSecret);
  }
  if (input.tiktokRedirectUri !== undefined) {
    data.tiktokRedirectUri = input.tiktokRedirectUri || null;
  }
  if (input.googleClientId !== undefined) {
    data.googleClientId = input.googleClientId || null;
  }
  if (
    input.googleClientSecret !== undefined &&
    input.googleClientSecret !== ""
  ) {
    data.googleClientSecretEnc = encryptOpt(input.googleClientSecret);
  }
  if (input.googleRedirectUri !== undefined) {
    data.googleRedirectUri = input.googleRedirectUri || null;
  }
  if (input.creatomateApiKey !== undefined && input.creatomateApiKey !== "") {
    data.creatomateApiKeyEnc = encryptOpt(input.creatomateApiKey);
  }
  if (input.creatomateTemplateId !== undefined) {
    data.creatomateTemplateId = input.creatomateTemplateId || null;
  }
  if (input.slackWebhookUrl !== undefined) {
    data.slackWebhookUrl = input.slackWebhookUrl || null;
  }
  if (input.resendApiKey !== undefined && input.resendApiKey !== "") {
    data.resendApiKeyEnc = encryptOpt(input.resendApiKey);
  }
  if (input.notifyEmailFrom !== undefined) {
    data.notifyEmailFrom = input.notifyEmailFrom || null;
  }

  if (existing) {
    await prisma.agencySettings.update({
      where: { id: SETTINGS_ID },
      data,
    });
  } else {
    await prisma.agencySettings.create({
      data: { id: SETTINGS_ID, ...data },
    });
  }

  return getAgencySettingsStatus();
}
