import { Router } from "express";
import { db } from "@seo/db";
import {
  fetchBacklinksOverview,
  fetchCompetitorOverlap,
  fetchDomainOverview,
  fetchKeywordIdeas,
  fetchOnPageAudit,
  hostnameFromUrl,
} from "../seo/dataforseo";
import { enqueueSeoSync } from "../queues";

export const seoRouter = Router();

async function getClientOr404(clientId: string) {
  return db.client.findUnique({
    where: { id: clientId },
    include: { gscConnection: true },
  });
}

seoRouter.get("/:clientId/domain", async (req, res) => {
  const client = await getClientOr404(String(req.params.clientId));
  if (!client) return res.status(404).json({ error: "Client not found" });

  const overview = await fetchDomainOverview(client.websiteUrl);
  const snapshot = await db.seoDomainSnapshot.create({
    data: {
      clientId: client.id,
      domain: overview.domain,
      payload: overview as object,
      source: overview.demo ? "demo" : "dataforseo",
    },
  });

  res.json({ overview, snapshotId: snapshot.id });
});

seoRouter.get("/:clientId/keywords", async (req, res) => {
  const client = await getClientOr404(String(req.params.clientId));
  if (!client) return res.status(404).json({ error: "Client not found" });

  const q =
    String(req.query.q ?? "").trim() ||
    client.industry ||
    client.name ||
    "local business";

  const { keywords, demo } = await fetchKeywordIdeas({
    query: q,
    locality: client.locality,
  });

  res.json({ query: q, keywords, demo });
});

seoRouter.get("/:clientId/keywords/saved", async (req, res) => {
  const clientId = String(req.params.clientId);
  const rows = await db.seoKeyword.findMany({
    where: { clientId },
    orderBy: [{ selectedForBrief: "desc" }, { volume: "desc" }],
  });
  res.json(rows);
});

seoRouter.post("/:clientId/keywords/select", async (req, res) => {
  const client = await getClientOr404(String(req.params.clientId));
  if (!client) return res.status(404).json({ error: "Client not found" });

  const items = Array.isArray(req.body?.keywords) ? req.body.keywords : [];
  if (!items.length) {
    return res.status(400).json({ error: "keywords array required" });
  }

  const saved = [];
  for (const item of items) {
    const keyword = String(item.keyword ?? "").trim();
    if (!keyword) continue;
    const row = await db.seoKeyword.upsert({
      where: {
        clientId_keyword: { clientId: client.id, keyword },
      },
      create: {
        clientId: client.id,
        keyword,
        volume: item.volume ?? null,
        difficulty: item.difficulty ?? null,
        cpc: item.cpc ?? null,
        intent: item.intent ?? null,
        source: item.source ?? "dataforseo",
        selectedForBrief: true,
      },
      update: {
        volume: item.volume ?? undefined,
        difficulty: item.difficulty ?? undefined,
        cpc: item.cpc ?? undefined,
        intent: item.intent ?? undefined,
        selectedForBrief: true,
      },
    });
    saved.push(row);
  }

  res.json({ saved });
});

seoRouter.get("/:clientId/brief-keywords", async (req, res) => {
  const clientId = String(req.params.clientId);
  const rows = await db.seoKeyword.findMany({
    where: { clientId, selectedForBrief: true },
    orderBy: { updatedAt: "desc" },
  });
  res.json({
    keywords: rows.map((r) => r.keyword),
    rows,
  });
});

// —— Phase 2: ranks, backlinks, competitors ——

seoRouter.get("/:clientId/ranks", async (req, res) => {
  const clientId = String(req.params.clientId);
  const ranks = await db.rankKeyword.findMany({
    where: { clientId, active: true },
    include: {
      snapshots: { orderBy: { date: "desc" }, take: 14 },
    },
    orderBy: { createdAt: "asc" },
  });
  res.json(ranks);
});

seoRouter.post("/:clientId/ranks", async (req, res) => {
  const client = await getClientOr404(String(req.params.clientId));
  if (!client) return res.status(404).json({ error: "Client not found" });
  const keyword = String(req.body?.keyword ?? "").trim();
  if (!keyword) return res.status(400).json({ error: "keyword required" });

  const row = await db.rankKeyword.upsert({
    where: { clientId_keyword: { clientId: client.id, keyword } },
    create: { clientId: client.id, keyword, active: true },
    update: { active: true },
  });
  res.status(201).json(row);
});

seoRouter.delete("/:clientId/ranks/:rankId", async (req, res) => {
  await db.rankKeyword.update({
    where: { id: String(req.params.rankId) },
    data: { active: false },
  });
  res.json({ ok: true });
});

seoRouter.post("/:clientId/ranks/sync", async (req, res) => {
  const clientId = String(req.params.clientId);
  const client = await getClientOr404(clientId);
  if (!client) return res.status(404).json({ error: "Client not found" });
  await enqueueSeoSync({ clientId, type: "gsc_ranks" });
  res.json({ ok: true, queued: true });
});

seoRouter.get("/:clientId/backlinks", async (req, res) => {
  const client = await getClientOr404(String(req.params.clientId));
  if (!client) return res.status(404).json({ error: "Client not found" });

  const overview = await fetchBacklinksOverview(client.websiteUrl);
  const snapshot = await db.backlinkSnapshot.create({
    data: {
      clientId: client.id,
      referringDomains: overview.referringDomains,
      backlinks: overview.backlinks,
      newLinks: overview.newLinks,
      lostLinks: overview.lostLinks,
      topReferrers: overview.topReferrers,
      payload: overview as object,
    },
  });

  res.json({ overview, snapshotId: snapshot.id });
});

seoRouter.post("/:clientId/competitors", async (req, res) => {
  const client = await getClientOr404(String(req.params.clientId));
  if (!client) return res.status(404).json({ error: "Client not found" });

  const competitors = Array.isArray(req.body?.competitors)
    ? req.body.competitors.map(String).filter(Boolean).slice(0, 2)
    : [];
  if (!competitors.length) {
    return res.status(400).json({ error: "competitors array required (1–2)" });
  }

  const result = await fetchCompetitorOverlap({
    domain: client.websiteUrl || client.slug,
    competitors,
  });
  res.json(result);
});

// —— Phase 3: audit, local checklist, report ——

seoRouter.post("/:clientId/audit", async (req, res) => {
  const client = await getClientOr404(String(req.params.clientId));
  if (!client) return res.status(404).json({ error: "Client not found" });
  const url =
    String(req.body?.url ?? "").trim() ||
    client.websiteUrl ||
    `https://${hostnameFromUrl(client.slug)}.example`;

  const audit = await fetchOnPageAudit(url);
  const snapshot = await db.seoAuditSnapshot.create({
    data: {
      clientId: client.id,
      url: audit.url,
      score: audit.score,
      issues: audit.issues,
      payload: audit as object,
    },
  });

  res.json({ audit, snapshotId: snapshot.id });
});

seoRouter.get("/:clientId/audit/latest", async (req, res) => {
  const latest = await db.seoAuditSnapshot.findFirst({
    where: { clientId: String(req.params.clientId) },
    orderBy: { fetchedAt: "desc" },
  });
  res.json(latest);
});

seoRouter.get("/:clientId/local-checklist", async (req, res) => {
  const client = await getClientOr404(String(req.params.clientId));
  if (!client) return res.status(404).json({ error: "Client not found" });

  const items = [
    {
      id: "nap",
      title: "NAP consistency",
      done: Boolean(client.name && client.phone && client.address),
      hint: "Name, phone, and address should match Google Business Profile",
    },
    {
      id: "website",
      title: "Website URL set",
      done: Boolean(client.websiteUrl),
      hint: "Required for domain research and audits",
    },
    {
      id: "locality",
      title: "Locality / service area",
      done: Boolean(client.locality),
      hint: "Used for local keyword packs",
    },
    {
      id: "industry",
      title: "Industry tagged",
      done: Boolean(client.industry),
      hint: "Improves keyword suggestions",
    },
    {
      id: "gbp",
      title: "Google Business Profile",
      done: false,
      hint: "Confirm GBP is claimed, categories set, and posts weekly (manual)",
    },
    {
      id: "gsc",
      title: "Search Console connected",
      done: Boolean(client.gscConnection?.connected),
      hint: "Connect GSC to sync real query ranks",
    },
  ];

  const packSeed = [client.industry, client.locality].filter(Boolean).join(" ");
  const pack = packSeed
    ? (
        await fetchKeywordIdeas({
          query: packSeed,
          locality: client.locality,
        })
      ).keywords.slice(0, 8)
    : [];

  res.json({ items, localKeywordPack: pack });
});

seoRouter.post("/:clientId/report/notify", async (req, res) => {
  const clientId = String(req.params.clientId);
  const client = await getClientOr404(clientId);
  if (!client) return res.status(404).json({ error: "Client not found" });

  const { getAgencyCredentials } = await import("@seo/db");
  const creds = await getAgencyCredentials();
  if (!creds.slackWebhookUrl) {
    return res.status(400).json({ error: "Slack webhook not configured" });
  }

  const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
  const message = `Monthly SEO report ready for ${client.name}: ${webUrl}/clients/${clientId}/report`;
  await fetch(creds.slackWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message }),
  });
  res.json({ ok: true });
});

seoRouter.get("/:clientId/report", async (req, res) => {
  const clientId = String(req.params.clientId);
  const client = await getClientOr404(clientId);
  if (!client) return res.status(404).json({ error: "Client not found" });

  const since = new Date();
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const [posts, keywords, ranks, backlinks, audit, domain] = await Promise.all([
    db.post.findMany({
      where: {
        clientId,
        createdAt: { gte: since },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        platform: true,
        status: true,
        title: true,
        publishedAt: true,
        engagement: true,
      },
    }),
    db.seoKeyword.findMany({
      where: { clientId, selectedForBrief: true },
      take: 20,
      orderBy: { volume: "desc" },
    }),
    db.rankKeyword.findMany({
      where: { clientId, active: true },
      include: { snapshots: { orderBy: { date: "desc" }, take: 2 } },
    }),
    db.backlinkSnapshot.findFirst({
      where: { clientId },
      orderBy: { fetchedAt: "desc" },
    }),
    db.seoAuditSnapshot.findFirst({
      where: { clientId },
      orderBy: { fetchedAt: "desc" },
    }),
    db.seoDomainSnapshot.findFirst({
      where: { clientId },
      orderBy: { fetchedAt: "desc" },
    }),
  ]);

  res.json({
    client: {
      id: client.id,
      name: client.name,
      industry: client.industry,
      locality: client.locality,
      websiteUrl: client.websiteUrl,
    },
    period: { from: since.toISOString(), to: new Date().toISOString() },
    posts,
    selectedKeywords: keywords,
    ranks,
    backlinks,
    audit,
    domain,
  });
});

// GSC connection status
seoRouter.get("/:clientId/gsc", async (req, res) => {
  const client = await getClientOr404(String(req.params.clientId));
  if (!client) return res.status(404).json({ error: "Client not found" });
  const gsc = client.gscConnection;
  res.json({
    connected: Boolean(gsc?.connected),
    siteUrl: gsc?.siteUrl ?? null,
  });
});

seoRouter.put("/:clientId/gsc", async (req, res) => {
  const client = await getClientOr404(String(req.params.clientId));
  if (!client) return res.status(404).json({ error: "Client not found" });
  const siteUrl = String(req.body?.siteUrl ?? "").trim();
  if (!siteUrl) return res.status(400).json({ error: "siteUrl required" });

  const row = await db.gscConnection.upsert({
    where: { clientId: client.id },
    create: {
      clientId: client.id,
      siteUrl,
      connected: Boolean(req.body?.connected ?? false),
    },
    update: {
      siteUrl,
      connected: Boolean(req.body?.connected ?? false),
    },
  });
  res.json({
    connected: row.connected,
    siteUrl: row.siteUrl,
  });
});
