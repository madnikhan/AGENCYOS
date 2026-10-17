import Anthropic from "@anthropic-ai/sdk";
import { getAgencyCredentials } from "@seo/db";
import {
  GeneratedAdSchema,
  GeneratedBlogSchema,
  GeneratedCaptionSchema,
  GeneratedShortScriptSchema,
  type Platform,
} from "@seo/shared";

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in Claude response");
  return JSON.parse(raw.slice(start, end + 1));
}

async function getClient(): Promise<Anthropic | null> {
  const creds = await getAgencyCredentials();
  if (!creds.anthropicApiKey) return null;
  return new Anthropic({ apiKey: creds.anthropicApiKey });
}

export type BrandContext = {
  name: string;
  industry?: string | null;
  locality?: string | null;
  voiceTone: string;
  tagline?: string | null;
  bannedWords: string[];
  bannedClaims: string[];
  ctaLabel: string;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  logoUrl?: string | null;
};

export type BriefContext = {
  title: string;
  offer?: string | null;
  localityKeywords: string[];
  contentType: string;
  notes?: string | null;
};

export type BriefAttachmentInput = {
  filename: string;
  mimeType: string;
  url: string;
};

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

type UserContent = Anthropic.MessageCreateParams["messages"][0]["content"];

async function fetchAttachmentBlock(
  att: BriefAttachmentInput
): Promise<Anthropic.ContentBlockParam | null> {
  try {
    const res = await fetch(att.url);
    if (!res.ok) {
      console.warn(`Failed to fetch attachment ${att.url}: ${res.status}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const data = buf.toString("base64");

    if (att.mimeType === "application/pdf") {
      return {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data,
        },
      } as Anthropic.ContentBlockParam;
    }

    const mediaType = att.mimeType as ImageMediaType;
    if (
      mediaType === "image/jpeg" ||
      mediaType === "image/png" ||
      mediaType === "image/gif" ||
      mediaType === "image/webp"
    ) {
      return {
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType,
          data,
        },
      };
    }

    return null;
  } catch (err) {
    console.warn(`Attachment load error for ${att.url}`, err);
    return null;
  }
}

async function buildUserContent(
  text: string,
  attachments: BriefAttachmentInput[]
): Promise<UserContent> {
  if (!attachments.length) return text;

  const blocks: Anthropic.ContentBlockParam[] = [
    { type: "text", text },
  ];

  for (const att of attachments) {
    const block = await fetchAttachmentBlock(att);
    if (block) {
      blocks.push({
        type: "text",
        text: `Attached file: ${att.filename} (${att.mimeType})`,
      });
      blocks.push(block);
    }
  }

  return blocks.length === 1 ? text : blocks;
}

async function complete(
  system: string,
  userText: string,
  attachments: BriefAttachmentInput[] = []
): Promise<string> {
  const client = await getClient();
  if (!client) {
    throw new Error("ANTHROPIC_API_KEY is not configured (Settings or .env)");
  }
  const content = await buildUserContent(userText, attachments);
  const res = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content }],
  });
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("Empty Claude response");
  return block.text;
}

function brandPrompt(brand: BrandContext, brief: BriefContext): string {
  return `Business: ${brand.name}
Industry: ${brand.industry ?? "local services"}
Locality: ${brand.locality ?? "n/a"}
Voice: ${brand.voiceTone}
Tagline: ${brand.tagline ?? ""}
Primary color: ${brand.primaryColor ?? "n/a"}
Secondary color: ${brand.secondaryColor ?? "n/a"}
Logo URL: ${brand.logoUrl ?? "n/a"}
Banned words: ${brand.bannedWords.join(", ") || "none"}
Banned claims: ${brand.bannedClaims.join(", ") || "none"}
CTA: ${brand.ctaLabel}

Brief title: ${brief.title}
Offer / hook: ${brief.offer ?? "n/a"}
Local SEO keywords: ${brief.localityKeywords.join(", ") || "none"}
Content type: ${brief.contentType}
Notes: ${brief.notes ?? ""}

If reference images or PDFs are attached, match their colors, logo style, typography cues, and layout when writing copy and image prompts.

Return ONLY valid JSON. Include confidence 0-1.`;
}

const ATTACHMENT_SYSTEM_HINT =
  " When brand/reference files are attached, use them for visual and brand consistency.";

export async function generateCaption(
  brand: BrandContext,
  brief: BriefContext,
  platform: Platform,
  attachments: BriefAttachmentInput[] = []
) {
  const client = await getClient();
  if (!client) return mockCaption(brand, brief, platform);
  const text = await complete(
    `You write high-converting social captions for local businesses (any industry: taxi, restaurant, mechanics, security, etc.). Platform: ${platform}. Match the industry. Local SEO aware, no banned claims.${ATTACHMENT_SYSTEM_HINT}`,
    `${brandPrompt(brand, brief)}
Schema: {"caption": string, "hashtags": string[], "altText": string, "confidence": number}`,
    attachments
  );
  return GeneratedCaptionSchema.parse(extractJson(text));
}

export async function generateBlog(
  brand: BrandContext,
  brief: BriefContext,
  attachments: BriefAttachmentInput[] = []
) {
  const client = await getClient();
  if (!client) return mockBlog(brand, brief);
  const text = await complete(
    `You write SEO blog posts for local service businesses of any industry. Use H2s, natural keyword use, honest professional copy suited to the industry.${ATTACHMENT_SYSTEM_HINT}`,
    `${brandPrompt(brand, brief)}
Schema: {"title": string, "slug": string, "metaTitle": string, "metaDescription": string, "bodyHtml": string, "confidence": number}
bodyHtml should be semantic HTML (h2, p, ul) without html/body wrappers.`,
    attachments
  );
  return GeneratedBlogSchema.parse(extractJson(text));
}

export async function generateAd(
  brand: BrandContext,
  brief: BriefContext,
  attachments: BriefAttachmentInput[] = []
) {
  const client = await getClient();
  if (!client) return mockAd(brand, brief);
  const text = await complete(
    `You write picture ad copy and image prompts for local business ads in any industry. Image prompts should describe professional marketing photography suited to that industry and match attached brand visuals when present.${ATTACHMENT_SYSTEM_HINT}`,
    `${brandPrompt(brand, brief)}
Schema: {"headline": string, "primaryText": string, "ctaLabel": string, "imagePrompt": string, "confidence": number}`,
    attachments
  );
  return GeneratedAdSchema.parse(extractJson(text));
}

export async function generateShortScript(
  brand: BrandContext,
  brief: BriefContext,
  attachments: BriefAttachmentInput[] = []
) {
  const client = await getClient();
  if (!client) return mockShort(brand, brief);
  const text = await complete(
    `You write short-form vertical video scripts for TikTok and YouTube Shorts for local businesses (any industry). Hook in first 2 seconds.${ATTACHMENT_SYSTEM_HINT}`,
    `${brandPrompt(brand, brief)}
Schema: {"hook": string, "script": string, "onScreenText": string[], "cta": string, "confidence": number}`,
    attachments
  );
  return GeneratedShortScriptSchema.parse(extractJson(text));
}

function mockCaption(
  brand: BrandContext,
  brief: BriefContext,
  platform: Platform
) {
  return GeneratedCaptionSchema.parse({
    caption: `${brief.offer ?? brief.title} — ${brand.name}${brand.locality ? ` in ${brand.locality}` : ""}. ${brand.ctaLabel}! (${platform})`,
    hashtags: [
      brand.locality?.replace(/\s+/g, "") ?? "local",
      (brand.industry ?? "business").replace(/\s+/g, ""),
      "localbusiness",
    ],
    altText: `${brief.title} from ${brand.name}`,
    confidence: 0.65,
  });
}

function mockBlog(brand: BrandContext, brief: BriefContext) {
  const title = `${brief.title} | ${brand.name}${brand.locality ? ` ${brand.locality}` : ""}`;
  return GeneratedBlogSchema.parse({
    title,
    slug: brief.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    metaTitle: title.slice(0, 60),
    metaDescription: `Discover ${brief.offer ?? brief.title} at ${brand.name}. ${brand.ctaLabel}.`.slice(0, 155),
    bodyHtml: `<h2>${brief.title}</h2><p>${brief.offer ?? "Quality service from a trusted local business."}</p><p>${brand.ctaLabel}</p>`,
    confidence: 0.6,
  });
}

function mockAd(brand: BrandContext, brief: BriefContext) {
  const colorHint = brand.primaryColor
    ? `, brand colors ${brand.primaryColor}${brand.secondaryColor ? ` and ${brand.secondaryColor}` : ""}`
    : "";
  return GeneratedAdSchema.parse({
    headline: brief.offer ?? brief.title,
    primaryText: `${brand.name} — ${brief.title}. ${brand.ctaLabel}`,
    ctaLabel: brand.ctaLabel,
    imagePrompt: `Professional marketing photography for a ${brand.industry ?? "local"} business featuring ${brief.offer ?? brief.title}, clean composition, no text overlay${colorHint}`,
    confidence: 0.62,
  });
}

function mockShort(brand: BrandContext, brief: BriefContext) {
  return GeneratedShortScriptSchema.parse({
    hook: `Looking for ${brand.industry ?? "help"} in ${brand.locality ?? "town"}?`,
    script: `${brief.offer ?? brief.title} at ${brand.name}. ${brand.ctaLabel}!`,
    onScreenText: [brief.title, brand.ctaLabel],
    cta: brand.ctaLabel,
    confidence: 0.64,
  });
}
