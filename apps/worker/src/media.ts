import { getAgencyCredentials } from "@seo/db";
import { VIDEO_TEMPLATE_PRESETS } from "@seo/shared";
import { storeBuffer, storeFromUrl } from "./storage";

export async function generateImage(
  prompt: string,
  opts?: {
    imageSize?: "square_hd" | "portrait_16_9";
    /** Return fal CDN URL (public) instead of storing locally — needed for Creatomate Video.source */
    preferRemoteUrl?: boolean;
  }
): Promise<string> {
  const creds = await getAgencyCredentials();
  if (!creds.falKey) {
    return storePlaceholderImage(prompt);
  }

  const res = await fetch("https://fal.run/fal-ai/flux/dev", {
    method: "POST",
    headers: {
      Authorization: `Key ${creds.falKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_size: opts?.imageSize ?? "square_hd",
      num_images: 1,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`fal.ai image generation failed: ${res.status} ${errText}`);
  }

  const json = (await res.json()) as {
    images?: Array<{ url: string }>;
  };
  const url = json.images?.[0]?.url;
  if (!url) throw new Error("No image URL from fal.ai");
  if (opts?.preferRemoteUrl) return url;
  return storeFromUrl(url);
}

export function isPublicHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    if (
      u.hostname === "localhost" ||
      u.hostname === "127.0.0.1" ||
      u.hostname.endsWith(".local")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function asciiSafe(s: string, max = 400): string {
  return s
    .normalize("NFKD")
    .replace(/[^\x20-\x7E\n]/g, "")
    .trim()
    .slice(0, max);
}

export type BrandRenderOpts = {
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  headingFont?: string | null;
  bodyFont?: string | null;
};

export type TemplateRenderOpts = {
  /** Override Creatomate template UUID */
  templateId?: string | null;
  /** Logical keys → Creatomate element keys */
  fieldMap?: Record<string, string> | null;
  presetId?: string | null;
};

const DEFAULT_FIELD_MAP: Record<string, string> = {
  hook: "Text-1",
  punchline: "Text-2",
  logo: "Logo.source",
  primaryColor: "Fill-1",
  secondaryColor: "Fill-2",
};

export function resolveFieldMap(
  opts?: TemplateRenderOpts
): Record<string, string> {
  if (opts?.fieldMap && Object.keys(opts.fieldMap).length) {
    return opts.fieldMap;
  }
  const preset = VIDEO_TEMPLATE_PRESETS.find((p) => p.id === opts?.presetId);
  if (preset) return { ...preset.fieldMap };
  return { ...DEFAULT_FIELD_MAP };
}

export async function renderShortVideo(opts: {
  hook: string;
  punchline: string;
  cta: string;
  brandName: string;
  videoSourceUrl?: string;
  brand?: BrandRenderOpts;
  template?: TemplateRenderOpts;
  /** Studio / canvas modifications merged last (win over defaults) */
  extraModifications?: Record<string, string>;
}): Promise<string> {
  const creds = await getAgencyCredentials();
  const apiKey = (creds.creatomate.apiKey || "").trim();
  const templateId = (
    opts.template?.templateId ||
    creds.creatomate.templateId ||
    ""
  ).trim();
  if (!apiKey || !templateId) {
    return storePlaceholderVideo(opts);
  }

  const map = resolveFieldMap(opts.template);
  const hookKey = map.hook || "Text-1";
  const punchKey = map.punchline || "Text-2";
  const logoKey = map.logo || "Logo.source";
  const primaryKey = map.primaryColor || "Fill-1";
  const secondaryKey = map.secondaryColor || "Fill-2";

  try {
    const modifications: Record<string, string> = {
      [hookKey]: asciiSafe(opts.hook, 120),
      [punchKey]: asciiSafe(opts.punchline, 120),
    };
    if (opts.videoSourceUrl && isPublicHttpUrl(opts.videoSourceUrl)) {
      modifications["Video.source"] = opts.videoSourceUrl;
    }
    const logo = opts.brand?.logoUrl?.trim();
    if (logo && isPublicHttpUrl(logo)) {
      modifications[logoKey] = logo;
      // Some templates use Logo without .source
      if (logoKey.endsWith(".source")) {
        modifications[logoKey.replace(/\.source$/, "")] = logo;
      }
    }
    const primary = opts.brand?.primaryColor?.trim();
    if (primary) modifications[primaryKey] = primary;
    const secondary = opts.brand?.secondaryColor?.trim();
    if (secondary) modifications[secondaryKey] = secondary;
    if (opts.extraModifications) {
      for (const [k, v] of Object.entries(opts.extraModifications)) {
        if (v != null && String(v).trim()) {
          modifications[k] = asciiSafe(String(v), 500);
        }
      }
    }

    const createRes = await fetch("https://api.creatomate.com/v1/renders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        template_id: templateId,
        modifications,
      }),
    });

    if (!createRes.ok) {
      throw new Error(`Creatomate create failed: ${await createRes.text()}`);
    }

    const created = (await createRes.json()) as Array<{
      id: string;
      status: string;
      url?: string;
      error_message?: string;
    }>;
    const renderId = created[0]?.id;
    if (!renderId) throw new Error("No Creatomate render id");

    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const statusRes = await fetch(
        `https://api.creatomate.com/v1/renders/${renderId}`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );
      const statusJson = (await statusRes.json()) as {
        status: string;
        url?: string;
        error_message?: string;
      };
      if (statusJson.status === "succeeded" && statusJson.url) {
        return storeFromUrl(statusJson.url);
      }
      if (statusJson.status === "failed") {
        throw new Error(
          `Creatomate render failed: ${statusJson.error_message ?? "unknown"}`
        );
      }
    }
    throw new Error("Creatomate render timed out");
  } catch (err) {
    console.warn(
      "[creatomate] falling back to placeholder:",
      err instanceof Error ? err.message : err
    );
    return storePlaceholderVideo(opts);
  }
}

async function storePlaceholderImage(prompt: string): Promise<string> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#C45C26"/><stop offset="1" stop-color="#1A1A1A"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1080" fill="url(#g)"/>
  <text x="540" y="500" fill="#fff" font-size="42" text-anchor="middle" font-family="Georgia, serif">Picture Ad Placeholder</text>
  <text x="540" y="560" fill="#f5e6d3" font-size="22" text-anchor="middle" font-family="sans-serif">${escapeXml(prompt.slice(0, 80))}</text>
</svg>`;
  return storeBuffer(Buffer.from(svg), "image/svg+xml", "svg");
}

async function storePlaceholderVideo(opts: {
  hook: string;
  brandName: string;
  brand?: BrandRenderOpts;
}): Promise<string> {
  const fill = opts.brand?.primaryColor || "#C45C26";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
  <rect width="1080" height="1920" fill="#1A1A1A"/>
  <text x="540" y="900" fill="${escapeXml(fill)}" font-size="64" text-anchor="middle" font-family="Georgia, serif">${escapeXml(opts.brandName)}</text>
  <text x="540" y="1000" fill="#fff" font-size="40" text-anchor="middle" font-family="sans-serif">${escapeXml(opts.hook)}</text>
  <text x="540" y="1100" fill="#aaa" font-size="28" text-anchor="middle">Short video placeholder — set CREATOMATE_*</text>
</svg>`;
  return storeBuffer(Buffer.from(svg), "image/svg+xml", "svg");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
