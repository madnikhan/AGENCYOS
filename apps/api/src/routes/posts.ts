import { Router, type Request, type Response } from "express";
import { db } from "@seo/db";
import {
  ApprovePostSchema,
  CreateBriefSchema,
  RejectPostSchema,
} from "@seo/shared";
import { enqueueGenerate, enqueuePublish } from "../queues";
import type { AuthedRequest } from "../auth";
import {
  briefAttachmentUpload,
  MAX_ATTACHMENTS,
  saveBriefAttachment,
} from "../uploads";

export const briefsRouter = Router();
export const postsRouter = Router();

function parseBriefBody(body: Record<string, unknown>) {
  const platformsRaw = body.platforms;
  let platforms: unknown = platformsRaw;
  if (typeof platformsRaw === "string") {
    try {
      platforms = JSON.parse(platformsRaw);
    } catch {
      platforms = platformsRaw.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }

  const keywordsRaw = body.localityKeywords;
  let localityKeywords: unknown = keywordsRaw ?? [];
  if (typeof keywordsRaw === "string") {
    try {
      localityKeywords = JSON.parse(keywordsRaw);
    } catch {
      localityKeywords = keywordsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  let scheduledAt: unknown =
    body.scheduledAt === "" || body.scheduledAt == null
      ? undefined
      : body.scheduledAt;
  if (typeof scheduledAt === "string" && scheduledAt && !scheduledAt.endsWith("Z")) {
    const d = new Date(scheduledAt);
    scheduledAt = Number.isNaN(d.getTime()) ? scheduledAt : d.toISOString();
  }

  return CreateBriefSchema.safeParse({
    ...body,
    platforms,
    localityKeywords,
    offer: body.offer === "" ? undefined : body.offer,
    notes: body.notes === "" ? undefined : body.notes,
    scheduledAt,
  });
}

async function createBriefWithPosts(
  input: ReturnType<typeof CreateBriefSchema.parse>,
  files: Express.Multer.File[]
) {
  const client = await db.client.findUnique({ where: { id: input.clientId } });
  if (!client) return { error: "Client not found" as const, status: 404 as const };

  if (files.length > MAX_ATTACHMENTS) {
    return {
      error: `Max ${MAX_ATTACHMENTS} attachments`,
      status: 400 as const,
    };
  }

  const saved = await Promise.all(files.map((f) => saveBriefAttachment(f)));

  const brief = await db.contentBrief.create({
    data: {
      clientId: input.clientId,
      title: input.title,
      offer: input.offer,
      localityKeywords: input.localityKeywords,
      contentType: input.contentType,
      platforms: input.platforms,
      cta: input.cta,
      notes: input.notes,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      attachments: {
        create: saved.map((a) => ({
          filename: a.filename,
          mimeType: a.mimeType,
          url: a.url,
          sizeBytes: a.sizeBytes,
        })),
      },
    },
    include: { attachments: true },
  });

  const posts = await Promise.all(
    input.platforms.map((platform) =>
      db.post.create({
        data: {
          clientId: input.clientId,
          briefId: brief.id,
          platform,
          contentType: input.contentType,
          status: "DRAFT",
          title: input.title,
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        },
      })
    )
  );

  for (const post of posts) {
    await enqueueGenerate({ briefId: brief.id, postId: post.id });
  }

  return { brief, posts };
}

briefsRouter.get("/", async (req, res) => {
  const clientId = req.query.clientId as string | undefined;
  const briefs = await db.contentBrief.findMany({
    where: clientId ? { clientId } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      posts: true,
      attachments: true,
      client: { select: { id: true, name: true } },
    },
    take: 50,
  });
  res.json(briefs);
});

briefsRouter.post("/", (req: Request, res: Response) => {
  const isMultipart = Boolean(
    req.is("multipart/form-data") ||
      req.headers["content-type"]?.includes("multipart/form-data")
  );

  const run = async (files: Express.Multer.File[]) => {
    const parsed = parseBriefBody(req.body as Record<string, unknown>);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    try {
      const result = await createBriefWithPosts(parsed.data, files);
      if ("error" in result && result.error) {
        return res.status(result.status ?? 400).json({ error: result.error });
      }
      if ("brief" in result) {
        return res.status(201).json(result);
      }
      return res.status(500).json({ error: "Unexpected response" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create brief";
      return res.status(400).json({ error: message });
    }
  };

  if (!isMultipart) {
    void run([]);
    return;
  }

  briefAttachmentUpload.array("attachments", MAX_ATTACHMENTS)(req, res, (err) => {
    if (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      return res.status(400).json({ error: message });
    }
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    void run(files);
  });
});

postsRouter.get("/", async (req, res) => {
  const status = req.query.status as string | undefined;
  const clientId = req.query.clientId as string | undefined;
  const posts = await db.post.findMany({
    where: {
      ...(status ? { status: status as never } : {}),
      ...(clientId ? { clientId } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      client: { select: { id: true, name: true, slug: true } },
      asset: true,
      brief: true,
      approvals: { orderBy: { createdAt: "desc" }, take: 5 },
    },
    take: 100,
  });
  res.json(posts);
});

postsRouter.get("/approval-queue", async (_req, res) => {
  const posts = await db.post.findMany({
    where: { status: "PENDING_APPROVAL" },
    orderBy: { updatedAt: "asc" },
    include: {
      client: { select: { id: true, name: true, slug: true } },
      asset: true,
      brief: true,
    },
  });
  res.json(posts);
});

postsRouter.get("/:id", async (req, res) => {
  const post = await db.post.findUnique({
    where: { id: req.params.id },
    include: {
      client: true,
      asset: true,
      brief: true,
      approvals: true,
      publishAttempts: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!post) return res.status(404).json({ error: "Post not found" });
  res.json(post);
});

postsRouter.post("/:id/approve", async (req: AuthedRequest, res) => {
  const parsed = ApprovePostSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const postId = String(req.params.id);
  const post = await db.post.findUnique({ where: { id: postId } });
  if (!post) return res.status(404).json({ error: "Post not found" });
  if (post.status !== "PENDING_APPROVAL" && post.status !== "DRAFT") {
    return res.status(400).json({ error: `Cannot approve post in status ${post.status}` });
  }

  const scheduledAt = parsed.data.scheduledAt
    ? new Date(parsed.data.scheduledAt)
    : post.scheduledAt ?? new Date();

  const updated = await db.post.update({
    where: { id: post.id },
    data: { status: "SCHEDULED", scheduledAt },
  });

  await db.approval.create({
    data: {
      postId: post.id,
      action: "APPROVED",
      note: parsed.data.note,
      userId: req.user?.id ?? null,
    },
  });

  const delay = Math.max(0, scheduledAt.getTime() - Date.now());
  await enqueuePublish({ postId: post.id }, delay);

  res.json(updated);
});

postsRouter.post("/:id/reject", async (req: AuthedRequest, res) => {
  const parsed = RejectPostSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const postId = String(req.params.id);
  const post = await db.post.findUnique({ where: { id: postId } });
  if (!post) return res.status(404).json({ error: "Post not found" });

  const updated = await db.post.update({
    where: { id: post.id },
    data: { status: "REJECTED", errorMessage: parsed.data.reason },
  });

  await db.approval.create({
    data: {
      postId: post.id,
      action: "REJECTED",
      note: parsed.data.reason,
      userId: req.user?.id ?? null,
    },
  });

  res.json(updated);
});postsRouter.post("/:id/retry-publish", async (req, res) => {
  const post = await db.post.findUnique({ where: { id: req.params.id } });
  if (!post) return res.status(404).json({ error: "Post not found" });
  await db.post.update({
    where: { id: post.id },
    data: { status: "SCHEDULED", errorMessage: null },
  });
  await enqueuePublish({ postId: post.id });
  res.json({ ok: true });
});

postsRouter.post("/:id/regenerate", async (req, res) => {
  const post = await db.post.findUnique({ where: { id: req.params.id } });
  if (!post || !post.briefId) {
    return res.status(404).json({ error: "Post or brief not found" });
  }
  await db.post.update({
    where: { id: post.id },
    data: { status: "DRAFT", errorMessage: null },
  });
  await enqueueGenerate({ briefId: post.briefId, postId: post.id });
  res.json({ ok: true });
});
