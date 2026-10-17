import path from "path";
import { config } from "dotenv";

config({ path: path.resolve(__dirname, "../../../.env") });

export const env = {
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  tokenEncryptionKey:
    process.env.TOKEN_ENCRYPTION_KEY ?? "change-me-to-a-32-byte-secret-key!!",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  falKey: process.env.FAL_KEY ?? "",
  apiUrl: process.env.API_URL ?? "http://localhost:4000",
  s3: {
    bucket: process.env.S3_BUCKET ?? "",
    region: process.env.S3_REGION ?? "auto",
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    endpoint: process.env.S3_ENDPOINT ?? "",
    publicUrl: process.env.S3_PUBLIC_URL ?? "",
  },
  creatomate: {
    apiKey: process.env.CREATOMATE_API_KEY ?? "",
    templateId: process.env.CREATOMATE_TEMPLATE_ID ?? "",
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  },
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL ?? "",
  uploadsDir: process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.resolve(__dirname, "../../../uploads"),
};
