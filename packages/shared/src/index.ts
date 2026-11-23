import { z } from "zod";

export const PlatformSchema = z.enum([
  "FACEBOOK",
  "INSTAGRAM",
  "TIKTOK",
  "YOUTUBE_SHORTS",
  "WEBSITE_BLOG",
  "PICTURE_AD",
]);
export type Platform = z.infer<typeof PlatformSchema>;

export const PostStatusSchema = z.enum([
  "DRAFT",
  "PENDING_APPROVAL",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "FAILED",
  "REJECTED",
]);
export type PostStatus = z.infer<typeof PostStatusSchema>;

export const ContentTypeSchema = z.enum([
  "DAILY_SPECIAL",
  "PROMO",
  "BLOG",
  "STORY",
  "SHORT_VIDEO",
  "PICTURE_AD",
  "GENERAL",
]);
export type ContentType = z.infer<typeof ContentTypeSchema>;

export const AssetTypeSchema = z.enum(["IMAGE", "VIDEO"]);
export type AssetType = z.infer<typeof AssetTypeSchema>;

const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

export const CreateClientSchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .transform((s) => s.trim().toLowerCase())
    .pipe(z.string().regex(/^[a-z0-9-]+$/, "Slug: lowercase letters, numbers, hyphens only")),
  industry: z.preprocess(emptyToUndefined, z.string().optional()),
  locality: z.preprocess(emptyToUndefined, z.string().optional()),
  websiteUrl: z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    if (!t) return undefined;
    if (!/^https?:\/\//i.test(t)) return `https://${t}`;
    return t;
  }, z.string().url().optional()),
  phone: z.preprocess(emptyToUndefined, z.string().optional()),
  address: z.preprocess(emptyToUndefined, z.string().optional()),
});
export type CreateClientInput = z.infer<typeof CreateClientSchema>;

export const UpdateBrandKitSchema = z.object({
  voiceTone: z.string().optional(),
  tagline: z.string().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  logoUrl: z.preprocess(
    (v) => (typeof v === "string" && !v.trim() ? "" : v),
    z.union([z.string().url(), z.literal("")]).optional()
  ),
  headingFont: z.string().optional().nullable(),
  bodyFont: z.string().optional().nullable(),
  bannedClaims: z.array(z.string()).optional(),
  bannedWords: z.array(z.string()).optional(),
  ctaDefaults: z
    .object({
      primary: z.string().optional(),
      order: z.string().optional(),
      book: z.string().optional(),
      call: z.string().optional(),
    })
    .optional(),
  videoTemplatePreset: z.string().optional().nullable(),
  creatomateTemplateId: z.string().optional().nullable(),
  creatomateFieldMap: z.record(z.string()).optional().nullable(),
  brandSourceUrl: z.string().url().optional().nullable(),
  brandExtractedAt: z.string().datetime().optional().nullable(),
  brandExtractRaw: z.record(z.unknown()).optional().nullable(),
});
export type UpdateBrandKitInput = z.infer<typeof UpdateBrandKitSchema>;

/** Curated Creatomate-style Shorts presets (hybrid catalog). */
export const VIDEO_TEMPLATE_PRESETS = [
  {
    id: "quick_promo",
    name: "Quick Promo",
    description: "Two text lines over background — Text-1 / Text-2",
    creatomateTemplateIdEnv: true,
    fieldMap: {
      hook: "Text-1",
      punchline: "Text-2",
      logo: "Logo.source",
      primaryColor: "Fill-1",
      secondaryColor: "Fill-2",
    },
  },
  {
    id: "logo_promo",
    name: "Logo + Promo",
    description: "Logo lockup with hook and offer line",
    creatomateTemplateIdEnv: true,
    fieldMap: {
      hook: "Text-1",
      punchline: "Text-2",
      logo: "Logo.source",
      primaryColor: "Fill-1",
      secondaryColor: "Fill-2",
    },
  },
  {
    id: "offer_burst",
    name: "Offer Burst",
    description: "Price/offer-forward punchline with brand color fill",
    creatomateTemplateIdEnv: true,
    fieldMap: {
      hook: "Text-1",
      punchline: "Text-2",
      logo: "Logo.source",
      primaryColor: "Fill-1",
      secondaryColor: "Fill-2",
    },
  },
] as const;

export type VideoTemplatePresetId =
  (typeof VIDEO_TEMPLATE_PRESETS)[number]["id"];

export const BrandExtractPreviewSchema = z.object({
  logoUrl: z.string().url().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  headingFont: z.string().optional(),
  bodyFont: z.string().optional(),
  suggestedTagline: z.string().optional(),
  sourceUrl: z.string().url(),
  raw: z.record(z.unknown()).optional(),
});
export type BrandExtractPreview = z.infer<typeof BrandExtractPreviewSchema>;

export const BriefVideoSettingsSchema = z.object({
  templateId: z.string().optional(),
  presetId: z.string().optional(),
  fieldMap: z.record(z.string()).optional(),
  modifications: z.record(z.string()).optional(),
});
export type BriefVideoSettings = z.infer<typeof BriefVideoSettingsSchema>;

export const CreateBriefSchema = z.object({
  clientId: z.string().cuid(),
  title: z.string().min(1),
  offer: z.string().optional(),
  localityKeywords: z.array(z.string()).default([]),
  contentType: ContentTypeSchema.default("GENERAL"),
  platforms: z.array(PlatformSchema).min(1),
  cta: z.enum(["order", "book", "call"]).default("order"),
  scheduledAt: z.string().datetime().optional(),
  notes: z.string().optional(),
  videoSettings: BriefVideoSettingsSchema.optional(),
});
export type CreateBriefInput = z.infer<typeof CreateBriefSchema>;

export const ApprovePostSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
  note: z.string().optional(),
});
export type ApprovePostInput = z.infer<typeof ApprovePostSchema>;

export const RejectPostSchema = z.object({
  reason: z.string().min(1),
});
export type RejectPostInput = z.infer<typeof RejectPostSchema>;

export const UpdatePublishRuleSchema = z.object({
  autoPublishEnabled: z.boolean().optional(),
  allowlistedTypes: z.array(ContentTypeSchema).optional(),
  bannedWords: z.array(z.string()).optional(),
  postingWindows: z
    .array(
      z.object({
        days: z.array(z.number().int().min(0).max(6)),
        startHour: z.number().int().min(0).max(23),
        endHour: z.number().int().min(0).max(23),
      })
    )
    .optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  forceApprovalTypes: z.array(ContentTypeSchema).optional(),
  requireApprovalFirstN: z.number().int().min(0).optional(),
  quietHours: z
    .object({
      startHour: z.number().int().min(0).max(23),
      endHour: z.number().int().min(0).max(23),
    })
    .nullable()
    .optional(),
});
export type UpdatePublishRuleInput = z.infer<typeof UpdatePublishRuleSchema>;

export const GeneratedCaptionSchema = z.object({
  caption: z.string(),
  hashtags: z.array(z.string()),
  altText: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

export const GeneratedBlogSchema = z.object({
  title: z.string(),
  slug: z.string(),
  metaTitle: z.string(),
  metaDescription: z.string(),
  bodyHtml: z.string(),
  confidence: z.number().min(0).max(1),
});

export const GeneratedAdSchema = z.object({
  headline: z.string(),
  primaryText: z.string(),
  ctaLabel: z.string(),
  imagePrompt: z.string(),
  confidence: z.number().min(0).max(1),
});

/** Creatomate Quick Promo–ready short: two on-screen lines + caption. */
export const GeneratedShortScriptSchema = z.object({
  /** Creatomate Text-1 — short hook, max ~8 words */
  hook: z.string(),
  /** Creatomate Text-2 — price / offer punchline */
  punchline: z.string(),
  /** YouTube/TikTok description (not a film shot list) */
  caption: z.string(),
  cta: z.string(),
  /** Optional still prompt for fal → Video.source */
  visualPrompt: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

export const QUEUE_NAMES = {
  GENERATE: "generate",
  PUBLISH: "publish",
  MEDIA: "media",
  NOTIFY: "notify",
  SEO_SYNC: "seo-sync",
} as const;

export type GenerateJobData = {
  briefId: string;
  postId: string;
};

export type PublishJobData = {
  postId: string;
  attempt?: number;
};

export type MediaJobData = {
  postId: string;
  prompt: string;
  type: "IMAGE" | "VIDEO";
  templateId?: string;
  /** Sibling posts that should reuse this rendered asset (multi-platform Shorts) */
  shareAssetWithPostIds?: string[];
  /** Direct Creatomate modifications from Template Studio */
  modifications?: Record<string, string>;
};

export type NotifyJobData = {
  type: "PENDING_APPROVAL" | "PUBLISH_FAILED" | "PUBLISHED";
  clientId: string;
  postId: string;
  message: string;
};

export type SeoSyncJobData = {
  clientId?: string;
  type: "gsc_ranks" | "all" | "daily_all";
};

export type RuleDecision = {
  action: "AUTO_PUBLISH" | "REQUIRE_APPROVAL" | "REJECT";
  reasons: string[];
};

export * from "./crypto";
export * from "./rules";
