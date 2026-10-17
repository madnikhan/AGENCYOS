import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { env } from "./config";

const s3Enabled = Boolean(env.s3.bucket && env.s3.accessKeyId);

const s3 = s3Enabled
  ? new S3Client({
      region: env.s3.region,
      endpoint: env.s3.endpoint || undefined,
      credentials: {
        accessKeyId: env.s3.accessKeyId,
        secretAccessKey: env.s3.secretAccessKey,
      },
      forcePathStyle: Boolean(env.s3.endpoint),
    })
  : null;

export async function storeBuffer(
  buffer: Buffer,
  mimeType: string,
  ext: string
): Promise<string> {
  const key = `assets/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;

  if (s3 && env.s3.bucket) {
    await s3.send(
      new PutObjectCommand({
        Bucket: env.s3.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      })
    );
    if (env.s3.publicUrl) {
      return `${env.s3.publicUrl.replace(/\/$/, "")}/${key}`;
    }
    return `s3://${env.s3.bucket}/${key}`;
  }

  const dir = path.join(env.uploadsDir, path.dirname(key));
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(env.uploadsDir, key);
  await fs.writeFile(filePath, buffer);
  return `${env.apiUrl}/uploads/${key}`;
}

export async function storeFromUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download media: ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "image/png";
  const ext = contentType.includes("mp4")
    ? "mp4"
    : contentType.includes("jpeg") || contentType.includes("jpg")
      ? "jpg"
      : contentType.includes("webp")
        ? "webp"
        : "png";
  const buffer = Buffer.from(await res.arrayBuffer());
  return storeBuffer(buffer, contentType, ext);
}
