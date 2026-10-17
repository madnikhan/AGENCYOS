import { Router } from "express";
import { db, Prisma } from "@seo/db";
import {
  CreateClientSchema,
  UpdateBrandKitSchema,
  UpdatePublishRuleSchema,
} from "@seo/shared";

export const clientsRouter = Router();

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
  const brandKit = await db.brandKit.update({
    where: { clientId },
    data: {
      ...parsed.data,
      logoUrl: parsed.data.logoUrl || undefined,
      ctaDefaults: parsed.data.ctaDefaults ?? undefined,
    },
  });
  res.json(brandKit);
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
