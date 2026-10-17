import { Router } from "express";
import path from "path";
import fs from "fs";
import { db } from "@seo/db";

export const publicRouter = Router();

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

publicRouter.get("/embed.js", (_req, res) => {
  const candidates = [
    path.join(__dirname, "../../public/embed.js"),
    path.join(__dirname, "../public/embed.js"),
    path.join(process.cwd(), "public/embed.js"),
    path.join(process.cwd(), "apps/api/public/embed.js"),
  ];
  const filePath = candidates.find((p) => fs.existsSync(p));
  if (!filePath) {
    return res.status(500).json({ error: "embed.js not found" });
  }
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.send(fs.readFileSync(filePath, "utf8"));
});

publicRouter.get("/blog/:siteKey", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const client = await db.client.findUnique({
    where: { blogSiteKey: req.params.siteKey },
  });
  if (!client) return res.status(404).json({ error: "Unknown site key" });

  const posts = await db.post.findMany({
    where: {
      clientId: client.id,
      platform: "WEBSITE_BLOG",
      status: "PUBLISHED",
    },
    orderBy: { publishedAt: "desc" },
    take: 50,
  });

  res.json({
    business: {
      name: client.name,
      locality: client.locality,
      industry: client.industry,
    },
    /** @deprecated use business */
    restaurant: {
      name: client.name,
      locality: client.locality,
    },
    posts: posts.map((p) => {
      const slug = p.slug || slugify(p.title ?? p.id);
      return {
        id: p.id,
        title: p.title,
        slug,
        excerpt:
          (p.metaDescription ??
            p.body?.replace(/<[^>]+>/g, "").slice(0, 160)) ??
          "",
        metaTitle: p.metaTitle,
        metaDescription: p.metaDescription,
        publishedAt: p.publishedAt,
      };
    }),
  });
});

publicRouter.get("/blog/:siteKey/:slug", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const client = await db.client.findUnique({
    where: { blogSiteKey: req.params.siteKey },
  });
  if (!client) return res.status(404).json({ error: "Unknown site key" });

  const posts = await db.post.findMany({
    where: {
      clientId: client.id,
      platform: "WEBSITE_BLOG",
      status: "PUBLISHED",
    },
  });

  const post = posts.find(
    (p) => (p.slug || slugify(p.title ?? p.id)) === req.params.slug
  );
  if (!post) return res.status(404).json({ error: "Post not found" });

  res.json({
    id: post.id,
    title: post.title,
    slug: post.slug || slugify(post.title ?? post.id),
    bodyHtml: post.body,
    metaTitle: post.metaTitle,
    metaDescription: post.metaDescription,
    publishedAt: post.publishedAt,
    business: {
      name: client.name,
      locality: client.locality,
      industry: client.industry,
    },
    restaurant: { name: client.name, locality: client.locality },
  });
});
