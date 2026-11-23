import { Router } from "express";
import { getAgencyCredentials } from "@seo/db";

export const creatomateRouter = Router();

type TemplateMeta = {
  id: string;
  name: string;
  tags: string[];
  created_at?: string;
  updated_at?: string;
};

type CacheEntry = { at: number; data: TemplateMeta[] };
let templatesCache: CacheEntry | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

async function creatomateFetch(path: string) {
  const creds = await getAgencyCredentials();
  const apiKey = (creds.creatomate.apiKey || "").trim();
  if (!apiKey) {
    throw new Error("Creatomate API key not configured in Settings");
  }
  const res = await fetch(`https://api.creatomate.com/v2${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    throw new Error(
      typeof json === "object" && json && "message" in json
        ? String((json as { message: string }).message)
        : `Creatomate ${res.status}: ${text.slice(0, 300)}`
    );
  }
  return json;
}

creatomateRouter.get("/templates", async (_req, res) => {
  try {
    if (
      templatesCache &&
      Date.now() - templatesCache.at < CACHE_TTL_MS
    ) {
      return res.json(templatesCache.data);
    }
    const json = (await creatomateFetch("/templates")) as TemplateMeta[];
    const list = Array.isArray(json) ? json : [];
    templatesCache = { at: Date.now(), data: list };
    res.json(list);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

creatomateRouter.get("/templates/:id", async (req, res) => {
  try {
    const json = (await creatomateFetch(
      `/templates/${encodeURIComponent(req.params.id)}`
    )) as {
      id: string;
      name: string;
      tags?: string[];
      source?: unknown;
      elements?: Array<{ id?: string; name?: string; type?: string }>;
    };

    const elementNames: string[] = [];
    const walk = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      const obj = node as Record<string, unknown>;
      if (typeof obj.name === "string" && obj.name.trim()) {
        elementNames.push(obj.name.trim());
      }
      if (obj.elements) walk(obj.elements);
      if (obj.source) walk(obj.source);
    };
    walk(json.source ?? json);

    const unique = [...new Set(elementNames)];
    const fieldHints = {
      text: unique.filter((n) => /^Text/i.test(n) || /text/i.test(n)),
      logo: unique.filter((n) => /logo|image|photo/i.test(n)),
      fill: unique.filter((n) => /^Fill|Color|Background/i.test(n)),
      all: unique,
    };

    res.json({
      id: json.id,
      name: json.name,
      tags: json.tags ?? [],
      fieldHints,
      source: json.source ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

creatomateRouter.post("/templates/invalidate-cache", (_req, res) => {
  templatesCache = null;
  res.json({ ok: true });
});
