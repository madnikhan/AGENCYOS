import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import multer from "multer";
import { env } from "./config";

export const ALLOWED_ATTACHMENT_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function extForMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "application/pdf":
      return "pdf";
    default:
      return "bin";
  }
}

export const briefAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_ATTACHMENT_BYTES,
    files: MAX_ATTACHMENTS,
  },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_ATTACHMENT_MIMES.has(file.mimetype)) {
      cb(
        new Error(
          `Unsupported file type: ${file.mimetype}. Use JPEG, PNG, WebP, GIF, or PDF.`
        )
      );
      return;
    }
    cb(null, true);
  },
});

export async function saveBriefAttachment(
  file: Express.Multer.File
): Promise<{ filename: string; mimeType: string; url: string; sizeBytes: number }> {
  const date = new Date().toISOString().slice(0, 10);
  const ext = extForMime(file.mimetype);
  const key = `briefs/${date}/${randomUUID()}.${ext}`;
  const dir = path.join(env.uploadsDir, path.dirname(key));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(env.uploadsDir, key), file.buffer);
  return {
    filename: file.originalname || `attachment.${ext}`,
    mimeType: file.mimetype,
    url: `${env.apiUrl}/uploads/${key}`,
    sizeBytes: file.size,
  };
}
