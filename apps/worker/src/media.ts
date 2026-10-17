import { getAgencyCredentials } from "@seo/db";
import { storeBuffer, storeFromUrl } from "./storage";

export async function generateImage(prompt: string): Promise<string> {
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
      image_size: "square_hd",
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
  return storeFromUrl(url);
}

export async function renderShortVideo(opts: {
  hook: string;
  script: string;
  onScreenText: string[];
  cta: string;
  brandName: string;
}): Promise<string> {
  const creds = await getAgencyCredentials();
  if (!creds.creatomate.apiKey || !creds.creatomate.templateId) {
    return storePlaceholderVideo(opts);
  }

  const createRes = await fetch("https://api.creatomate.com/v1/renders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.creatomate.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      template_id: creds.creatomate.templateId,
      modifications: {
        "Hook": opts.hook,
        "Script": opts.script,
        "CTA": opts.cta,
        "Brand": opts.brandName,
        "Text-1": opts.onScreenText[0] ?? opts.hook,
        "Text-2": opts.onScreenText[1] ?? opts.cta,
      },
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Creatomate create failed: ${await createRes.text()}`);
  }

  const created = (await createRes.json()) as Array<{ id: string; status: string; url?: string }>;
  const renderId = created[0]?.id;
  if (!renderId) throw new Error("No Creatomate render id");

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const statusRes = await fetch(
      `https://api.creatomate.com/v1/renders/${renderId}`,
      { headers: { Authorization: `Bearer ${creds.creatomate.apiKey}` } }
    );
    const statusJson = (await statusRes.json()) as {
      status: string;
      url?: string;
    };
    if (statusJson.status === "succeeded" && statusJson.url) {
      return storeFromUrl(statusJson.url);
    }
    if (statusJson.status === "failed") {
      throw new Error("Creatomate render failed");
    }
  }
  throw new Error("Creatomate render timed out");
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
}): Promise<string> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
  <rect width="1080" height="1920" fill="#1A1A1A"/>
  <text x="540" y="900" fill="#C45C26" font-size="64" text-anchor="middle" font-family="Georgia, serif">${escapeXml(opts.brandName)}</text>
  <text x="540" y="1000" fill="#fff" font-size="40" text-anchor="middle" font-family="sans-serif">${escapeXml(opts.hook)}</text>
  <text x="540" y="1100" fill="#aaa" font-size="28" text-anchor="middle">Short video placeholder — set CREATOMATE_*</text>
</svg>`;
  // Store as image placeholder URL used when video APIs unavailable
  return storeBuffer(Buffer.from(svg), "image/svg+xml", "svg");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
