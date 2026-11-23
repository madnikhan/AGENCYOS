import path from "path";
import { config } from "dotenv";

config({ path: path.resolve(__dirname, "../../../.env") });

function parseOrigins(raw: string | undefined, fallback: string): string[] {
  const list = (raw ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const base = fallback.replace(/\/$/, "");
  return [...new Set([base, ...list])];
}

const webUrl = (process.env.WEB_URL ?? "http://localhost:3000").replace(
  /\/$/,
  ""
);
const apiUrl = (process.env.API_URL ?? "http://localhost:4000").replace(
  /\/$/,
  ""
);
const corsOrigins = parseOrigins(process.env.CORS_ORIGINS, webUrl);

function hostsDiffer(a: string, b: string): boolean {
  try {
    return new URL(a).host !== new URL(b).host;
  } catch {
    return true;
  }
}

/** Cross-site cookies needed when the dashboard origin ≠ API origin (e.g. Vercel → Render). */
const crossSiteAuth =
  process.env.CROSS_SITE_AUTH === "true" ||
  (process.env.CROSS_SITE_AUTH !== "false" && hostsDiffer(webUrl, apiUrl));

export const env = {
  port: Number(process.env.API_PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? "",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  webUrl,
  apiUrl,
  corsOrigins,
  crossSiteAuth,
  tokenEncryptionKey:
    process.env.TOKEN_ENCRYPTION_KEY ?? "change-me-to-a-32-byte-secret-key!!",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  falKey: process.env.FAL_KEY ?? "",
  uploadsDir: process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.resolve(__dirname, "../../../uploads"),
  s3: {
    bucket: process.env.S3_BUCKET ?? "",
    region: process.env.S3_REGION ?? "auto",
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    endpoint: process.env.S3_ENDPOINT ?? "",
    publicUrl: process.env.S3_PUBLIC_URL ?? "",
  },
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
  notifyEmailFrom: process.env.NOTIFY_EMAIL_FROM ?? "alerts@agency.local",
};
