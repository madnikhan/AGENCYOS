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

export const CreateClientSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  industry: z.string().optional(),
  locality: z.string().optional(),
  websiteUrl: z.string().url().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
});
export type CreateClientInput = z.infer<typeof CreateClientSchema>;

export const UpdateBrandKitSchema = z.object({
  voiceTone: z.string().optional(),
  tagline: z.string().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  logoUrl: z.string().url().optional().or(z.literal("")),
  bannedClaims: z.array(z.string()).optional(),
  bannedWords: z.array(z.string()).optional(),
  ctaDefaults: z
    .object({
      order: z.string().optional(),
      book: z.string().optional(),
      call: z.string().optional(),
    })
    .optional(),
});
export type UpdateBrandKitInput = z.infer<typeof UpdateBrandKitSchema>;

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

export const GeneratedShortScriptSchema = z.object({
  hook: z.string(),
  script: z.string(),
  onScreenText: z.array(z.string()),
  cta: z.string(),
  confidence: z.number().min(0).max(1),
});

export const QUEUE_NAMES = {
  GENERATE: "generate",
  PUBLISH: "publish",
  MEDIA: "media",
  NOTIFY: "notify",
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
};

export type NotifyJobData = {
  type: "PENDING_APPROVAL" | "PUBLISH_FAILED" | "PUBLISHED";
  clientId: string;
  postId: string;
  message: string;
};

export type RuleDecision = {
  action: "AUTO_PUBLISH" | "REQUIRE_APPROVAL" | "REJECT";
  reasons: string[];
};

export * from "./crypto";
export * from "./rules";
