import { Router } from "express";
import { db, Prisma } from "@seo/db";
import {
  CreateClientSchema,
  UpdateBrandKitSchema,
  UpdatePublishRuleSchema,
  VIDEO_TEMPLATE_PRESETS,
} from "@seo/shared";
import { extractBrandFromWebsite } from "../brandExtract";

export const clientsRouter = Router();

clientsRouter.get("/video-templates/presets", (_req, res) => {
  res.json(VIDEO_TEMPLATE_PRESETS);
});

clientsRouter.get("/", async (_req, res) => {
  const clients = await db.client.findMany({
    orderBy: { name: "asc" },
    include: {
      brandKit: true,
      publishRule: true,
      _count: { select: { posts: true, channelConnections: true } },
    },
  });
  res.json(clients);
});

clientsRouter.get("/:id", async (req, res) => {
  const client = await db.client.findUnique({
    where: { id: req.params.id },
    include: {
      brandKit: true,
      publishRule: true,
      channelConnections: true,
      campaigns: true,
    },
  });
  if (!client) return res.status(404).json({ error: "Client not found" });
  res.json(client);
});

clientsRouter.post("/", async (req, res) => {
  const parsed = CreateClientSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const data = parsed.data;
  const client = await db.client.create({
    data: {
      name: data.name,
      slug: data.slug,
      industry: data.industry,
      locality: data.locality,
      websiteUrl: data.websiteUrl || null,
      phone: data.phone,
      address: data.address,
      brandKit: { create: {} },
      publishRule: { create: {} },
      channelConnections: {
        create: [
          {
            platform: "WEBSITE_BLOG",
            accountLabel: "Website embed",
            connected: true,
            metadata: { mode: "embed" },
          },
        ],
      },
    },
    include: { brandKit: true, publishRule: true, channelConnections: true },
  });
  res.status(201).json(client);
});

clientsRouter.patch("/:id/brand-kit", async (req, res) => {
  const parsed = UpdateBrandKitSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const clientId = req.params.id;
  const existing = await db.brandKit.findUnique({ where: { clientId } });
  if (!existing) {
    return res.status(404).json({ error: "Brand kit not found" });
  }
  const d = parsed.data;
  const brandKit = await db.brandKit.update({
    where: { clientId },
    data: {
      voiceTone: d.voiceTone,
      tagline: d.tagline,
      primaryColor: d.primaryColor,
      secondaryColor: d.secondaryColor,
      logoUrl: d.logoUrl === "" ? null : d.logoUrl,
      headingFont: d.headingFont === undefined ? undefined : d.headingFont,
      bodyFont: d.bodyFont === undefined ? undefined : d.bodyFont,
      bannedClaims: d.bannedClaims,
      bannedWords: d.bannedWords,
      ctaDefaults:
        d.ctaDefaults === undefined
          ? undefined
          : (d.ctaDefaults as Prisma.InputJsonValue),
      videoTemplatePreset:
        d.videoTemplatePreset === undefined
          ? undefined
          : d.videoTemplatePreset,
      creatomateTemplateId:
        d.creatomateTemplateId === undefined
          ? undefined
          : d.creatomateTemplateId,
      creatomateFieldMap:
        d.creatomateFieldMap === undefined
          ? undefined
          : d.creatomateFieldMap === null
            ? Prisma.JsonNull
            : (d.creatomateFieldMap as Prisma.InputJsonValue),
      brandSourceUrl:
        d.brandSourceUrl === undefined ? undefined : d.brandSourceUrl,
      brandExtractedAt:
        d.brandExtractedAt === undefined
          ? undefined
          : d.brandExtractedAt
            ? new Date(d.brandExtractedAt)
            : null,
      brandExtractRaw:
        d.brandExtractRaw === undefined
          ? undefined
          : d.brandExtractRaw === null
            ? Prisma.JsonNull
            : (d.brandExtractRaw as Prisma.InputJsonValue),
    },
  });
  res.json(brandKit);
});

clientsRouter.post("/:id/brand/extract", async (req, res) => {
  const client = await db.client.findUnique({ where: { id: req.params.id } });
  if (!client) return res.status(404).json({ error: "Client not found" });
  const overrideUrl =
    typeof req.body?.websiteUrl === "string"
      ? req.body.websiteUrl.trim()
      : "";
  const websiteUrl = overrideUrl || client.websiteUrl;
  if (!websiteUrl) {
    return res.status(400).json({
      error: "Client has no website URL — set one on the client or pass websiteUrl",
    });
  }
  try {
    const preview = await extractBrandFromWebsite(websiteUrl);
    res.json(preview);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

clientsRouter.patch("/:id/publish-rules", async (req, res) => {
  const parsed = UpdatePublishRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const clientId = req.params.id;
  const rule = await db.publishRule.upsert({
    where: { clientId },
    create: {
      clientId,
      ...parsed.data,
      postingWindows: (parsed.data.postingWindows ?? []) as Prisma.InputJsonValue,
      quietHours:
        parsed.data.quietHours === undefined
          ? undefined
          : parsed.data.quietHours === null
            ? Prisma.JsonNull
            : (parsed.data.quietHours as Prisma.InputJsonValue),
    },
    update: {
      ...parsed.data,
      postingWindows:
        parsed.data.postingWindows === undefined
          ? undefined
          : (parsed.data.postingWindows as Prisma.InputJsonValue),
      quietHours:
        parsed.data.quietHours === undefined
          ? undefined
          : parsed.data.quietHours === null
            ? Prisma.JsonNull
            : (parsed.data.quietHours as Prisma.InputJsonValue),
    },
  });
  res.json(rule);
});
