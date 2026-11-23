import dns from "dns/promises";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { isIP } from "net";
import type { BrandExtractPreview } from "@seo/shared";
import { env } from "./config";

const FETCH_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 1_500_000;
const MAX_LOGO_BYTES = 2_500_000;

function isPrivateIp(ip: string): boolean {
  if (ip === "::1" || ip === "0.0.0.0") return true;
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) {
    return true;
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  if (a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid website URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http/https websites are supported");
  }
  if (url.hostname === "localhost" || url.hostname.endsWith(".local")) {
    throw new Error("Localhost URLs cannot be scraped");
  }
  const host = url.hostname;
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error("Private IP addresses are blocked");
    return url;
  }
  const records = await dns.lookup(host, { all: true });
  for (const r of records) {
    if (isPrivateIp(r.address)) {
      throw new Error("Website resolves to a private IP (blocked)");
    }
  }
  return url;
}

function absUrl(base: URL, href: string | undefined | null): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href.trim(), base).toString();
  } catch {
    return undefined;
  }
}

function metaContent(html: string, nameOrProp: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${nameOrProp}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${nameOrProp}["']`,
    "i"
  );
  return html.match(re)?.[1] ?? html.match(re2)?.[1];
}

function linkHref(html: string, relPart: string): string | undefined {
  const re = new RegExp(
    `<link[^>]+rel=["'][^"']*${relPart}[^"']*["'][^>]+href=["']([^"']+)["']`,
    "i"
  );
  const re2 = new RegExp(
    `<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*${relPart}[^"']*["']`,
    "i"
  );
  return html.match(re)?.[1] ?? html.match(re2)?.[1];
}

function firstLogoImg(html: string): string | undefined {
  const imgRe =
    /<img[^>]+(?:class|id|alt)=["'][^"']*logo[^"']*["'][^>]*>/gi;
  const matches = html.match(imgRe) ?? [];
  for (const tag of matches) {
    const src = tag.match(/src=["']([^"']+)["']/i)?.[1];
    if (src && !src.startsWith("data:")) return src;
  }
  const headerChunk = html.match(/<header[\s\S]{0,8000}/i)?.[0] ?? "";
  const headerImg = headerChunk.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1];
  if (headerImg && !headerImg.startsWith("data:")) return headerImg;
  return undefined;
}

function extractCssVars(html: string): { primary?: string; secondary?: string } {
  const primary =
    html.match(/--(?:primary|brand|accent)(?:-color)?:\s*(#[0-9a-fA-F]{3,8}|rgb[a]?\([^)]+\))/i)?.[1] ??
    metaContent(html, "theme-color");
  const secondary = html.match(
    /--(?:secondary|dark|text)(?:-color)?:\s*(#[0-9a-fA-F]{3,8}|rgb[a]?\([^)]+\))/i
  )?.[1];
  return {
    primary: normalizeColor(primary),
    secondary: normalizeColor(secondary),
  };
}

function normalizeColor(c: string | undefined): string | undefined {
  if (!c) return undefined;
  const t = c.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(t)) {
    return `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`.toUpperCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(t) || /^#[0-9a-fA-F]{8}$/.test(t)) {
    return t.slice(0, 7).toUpperCase();
  }
  const rgb = t.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) {
    const hex = [rgb[1], rgb[2], rgb[3]]
      .map((n) => Number(n).toString(16).padStart(2, "0"))
      .join("");
    return `#${hex}`.toUpperCase();
  }
  return undefined;
}

function extractFonts(html: string): { heading?: string; body?: string } {
  const google = [
    ...html.matchAll(
      /fonts\.googleapis\.com\/css2?\?[^"'>\s]*family=([^"'&\s]+)/gi
    ),
  ].map((m) => decodeURIComponent(m[1].replace(/\+/g, " ").split(":")[0]));
  const family =
    html.match(/font-family:\s*["']?([A-Za-z0-9 _-]+)/i)?.[1]?.trim() ??
    google[0];
  const heading = google[0] ?? family;
  const body = google[1] ?? family;
  return {
    heading: heading || undefined,
    body: body || undefined,
  };
}

async function storeRemoteImage(
  imageUrl: string,
  base: URL
): Promise<string | undefined> {
  const absolute = absUrl(base, imageUrl);
  if (!absolute) return undefined;
  try {
    await assertPublicUrl(absolute);
  } catch {
    return undefined;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(absolute, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "AgencyOS-BrandExtract/1.0" },
    });
    if (!res.ok) return undefined;
    const ctype = res.headers.get("content-type") ?? "image/png";
    if (!ctype.startsWith("image/")) return undefined;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_LOGO_BYTES || buf.length < 32) return undefined;
    const ext = ctype.includes("jpeg") || ctype.includes("jpg")
      ? "jpg"
      : ctype.includes("webp")
        ? "webp"
        : ctype.includes("svg")
          ? "svg"
          : "png";
    const key = `brand/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
    const dir = path.join(env.uploadsDir, path.dirname(key));
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(env.uploadsDir, key), buf);
    return `${env.apiUrl}/uploads/${key}`;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export async function extractBrandFromWebsite(
  websiteUrl: string
): Promise<BrandExtractPreview> {
  const url = await assertPublicUrl(websiteUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let html: string;
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "AgencyOS-BrandExtract/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) {
      throw new Error(`Website returned ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_HTML_BYTES) {
      html = buf.subarray(0, MAX_HTML_BYTES).toString("utf8");
    } else {
      html = buf.toString("utf8");
    }
  } finally {
    clearTimeout(timer);
  }

  const colors = extractCssVars(html);
  const fonts = extractFonts(html);
  const ogTitle = metaContent(html, "og:title");
  const siteName = metaContent(html, "og:site_name");
  const title =
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? undefined;

  const logoCandidates = [
    linkHref(html, "apple-touch-icon"),
    linkHref(html, "icon"),
    metaContent(html, "og:image"),
    firstLogoImg(html),
  ].filter(Boolean) as string[];

  let logoUrl: string | undefined;
  for (const candidate of logoCandidates) {
    logoUrl = await storeRemoteImage(candidate, url);
    if (logoUrl) break;
  }

  const suggestedTagline =
    siteName ||
    ogTitle ||
    (title && title.length < 80 ? title : undefined);

  return {
    sourceUrl: url.toString(),
    logoUrl,
    primaryColor: colors.primary,
    secondaryColor: colors.secondary,
    headingFont: fonts.heading,
    bodyFont: fonts.body,
    suggestedTagline,
    raw: {
      logoCandidates,
      title,
      ogTitle,
      siteName,
      themeColor: metaContent(html, "theme-color"),
    },
  };
}
