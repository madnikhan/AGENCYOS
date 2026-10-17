import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { db } from "@seo/db";
import {
  QUEUE_NAMES,
  evaluatePublishRules,
  type GenerateJobData,
  type MediaJobData,
  type NotifyJobData,
  type PublishJobData,
  type PublishRuleInput,
  type ContentType,
} from "@seo/shared";
import { env } from "./config";
import {
  generateAd,
  generateBlog,
  generateCaption,
  generateShortScript,
  type BrandContext,
} from "./claude";
import { generateImage, renderShortVideo } from "./media";
import {
  publishFacebook,
  publishInstagram,
  publishPictureAdExport,
  publishTikTok,
  publishYouTubeShort,
} from "./publishers";

const connection = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });

const publishQueue = new Queue<PublishJobData>(QUEUE_NAMES.PUBLISH, {
  connection,
});
const mediaQueue = new Queue<MediaJobData>(QUEUE_NAMES.MEDIA, { connection });
const notifyQueue = new Queue<NotifyJobData>(QUEUE_NAMES.NOTIFY, {
  connection,
});

function ctaLabel(
  ctaDefaults: unknown,
  cta: string
): string {
  const defaults = (ctaDefaults ?? {}) as Record<string, string>;
  return (
    defaults[cta] ??
    defaults.primary ??
    defaults.order ??
    defaults.call ??
    "Contact us"
  );
}

async function applyRuleDecision(postId: string) {
  const post = await db.post.findUnique({
    where: { id: postId },
    include: {
      client: { include: { publishRule: true } },
    },
  });
  if (!post) return;
  if (!post.client.publishRule) {
    await db.post.update({
      where: { id: postId },
      data: {
        status: "PENDING_APPROVAL",
        ruleDecision: {
          action: "REQUIRE_APPROVAL",
          reasons: ["No publish rules configured"],
        },
      },
    });
    await notifyQueue.add("notify", {
      type: "PENDING_APPROVAL",
      clientId: post.clientId,
      postId,
      message: `Post pending approval (no rules)`,
    });
    return;
  }

  const publishedCount = await db.post.count({
    where: { clientId: post.clientId, status: "PUBLISHED" },
  });

  const rule = post.client.publishRule;
  const ruleInput: PublishRuleInput = {
    autoPublishEnabled: rule.autoPublishEnabled,
    allowlistedTypes: rule.allowlistedTypes as ContentType[],
    bannedWords: [
      ...rule.bannedWords,
      ...(post.client
        ? (
            await db.brandKit.findUnique({ where: { clientId: post.clientId } })
          )?.bannedWords ?? []
        : []),
    ],
    postingWindows: (rule.postingWindows as PublishRuleInput["postingWindows"]) ?? [],
    quietHours: (rule.quietHours as PublishRuleInput["quietHours"]) ?? null,
    minConfidence: rule.minConfidence,
    forceApprovalTypes: rule.forceApprovalTypes as ContentType[],
    requireApprovalFirstN: rule.requireApprovalFirstN,
  };

  const decision = evaluatePublishRules(ruleInput, {
    contentType: post.contentType as ContentType,
    body: post.body,
    title: post.title,
    confidence: post.confidence,
    clientPublishedCount: publishedCount,
  });

  if (decision.action === "AUTO_PUBLISH") {
    const scheduledAt = post.scheduledAt ?? new Date();
    await db.post.update({
      where: { id: postId },
      data: {
        status: "SCHEDULED",
        scheduledAt,
        ruleDecision: decision,
      },
    });
    const delay = Math.max(0, scheduledAt.getTime() - Date.now());
    await publishQueue.add("publish-post", { postId }, { delay, attempts: 5 });
  } else {
    await db.post.update({
      where: { id: postId },
      data: { status: "PENDING_APPROVAL", ruleDecision: decision },
    });
    await notifyQueue.add("notify", {
      type: "PENDING_APPROVAL",
      clientId: post.clientId,
      postId,
      message: `Approval needed: ${decision.reasons.join("; ")}`,
    });
  }
}

new Worker<GenerateJobData>(
  QUEUE_NAMES.GENERATE,
  async (job) => {
    const { postId, briefId } = job.data;
    const post = await db.post.findUnique({
      where: { id: postId },
      include: {
        brief: { include: { attachments: true } },
        client: { include: { brandKit: true } },
      },
    });
    if (!post || !post.brief || !post.client.brandKit) {
      throw new Error("Post/brief/brand kit missing");
    }

    const brandKit = post.client.brandKit;
    const brand: BrandContext = {
      name: post.client.name,
      industry: post.client.industry,
      locality: post.client.locality,
      voiceTone: brandKit.voiceTone,
      tagline: brandKit.tagline,
      bannedWords: brandKit.bannedWords,
      bannedClaims: brandKit.bannedClaims,
      ctaLabel: ctaLabel(brandKit.ctaDefaults, post.brief.cta),
      primaryColor: brandKit.primaryColor,
      secondaryColor: brandKit.secondaryColor,
      logoUrl: brandKit.logoUrl,
    };
    const brief = {
      title: post.brief.title,
      offer: post.brief.offer,
      localityKeywords: post.brief.localityKeywords,
      contentType: post.brief.contentType,
      notes: post.brief.notes,
    };
    const attachments = post.brief.attachments.map((a) => ({
      filename: a.filename,
      mimeType: a.mimeType,
      url: a.url,
    }));

    const platform = post.platform;

    if (platform === "WEBSITE_BLOG") {
      const blog = await generateBlog(brand, brief, attachments);
      await db.post.update({
        where: { id: postId },
        data: {
          title: blog.title,
          slug: blog.slug,
          body: blog.bodyHtml,
          metaTitle: blog.metaTitle,
          metaDescription: blog.metaDescription,
          confidence: blog.confidence,
          contentType: "BLOG",
        },
      });
    } else if (platform === "PICTURE_AD") {
      const ad = await generateAd(brand, brief, attachments);
      await db.post.update({
        where: { id: postId },
        data: {
          title: ad.headline,
          body: ad.primaryText,
          ctaLabel: ad.ctaLabel,
          confidence: ad.confidence,
          contentType: "PICTURE_AD",
        },
      });
      await mediaQueue.add("render-media", {
        postId,
        prompt: ad.imagePrompt,
        type: "IMAGE",
      });
      return;
    } else if (platform === "TIKTOK" || platform === "YOUTUBE_SHORTS") {
      const short = await generateShortScript(brand, brief, attachments);
      await db.post.update({
        where: { id: postId },
        data: {
          title: short.hook,
          body: `${short.script}\n\n${short.cta}`,
          hashtags: [
            "Shorts",
            (brand.industry ?? "local").replace(/\s+/g, ""),
            brand.locality?.replace(/\s+/g, "") ?? "local",
          ].filter(Boolean),
          ctaLabel: short.cta,
          confidence: short.confidence,
          contentType: "SHORT_VIDEO",
        },
      });
      await mediaQueue.add("render-media", {
        postId,
        prompt: JSON.stringify(short),
        type: "VIDEO",
      });
      return;
    } else {
      const caption = await generateCaption(brand, brief, platform, attachments);
      await db.post.update({
        where: { id: postId },
        data: {
          body: caption.caption,
          hashtags: caption.hashtags,
          altText: caption.altText,
          confidence: caption.confidence,
          ctaLabel: brand.ctaLabel,
        },
      });
      // Optional image for IG/FB from offer prompt
      if (platform === "INSTAGRAM" || brief.offer) {
        await mediaQueue.add("render-media", {
          postId,
          prompt: `Professional marketing photo for a ${brand.industry ?? "local"} business: ${brief.offer ?? brief.title} at ${brand.name}`,
          type: "IMAGE",
        });
        return;
      }
    }

    await applyRuleDecision(postId);
    void briefId;
  },
  { connection, concurrency: 2 }
);

new Worker<MediaJobData>(
  QUEUE_NAMES.MEDIA,
  async (job) => {
    const { postId, prompt, type } = job.data;
    const post = await db.post.findUnique({
      where: { id: postId },
      include: { client: true },
    });
    if (!post) throw new Error("Post not found for media job");

    let url: string;
    if (type === "VIDEO") {
      let parsed: {
        hook?: string;
        script?: string;
        onScreenText?: string[];
        cta?: string;
      } = {};
      try {
        parsed = JSON.parse(prompt);
      } catch {
        parsed = { hook: prompt, script: prompt, onScreenText: [prompt], cta: "Order now" };
      }
      url = await renderShortVideo({
        hook: parsed.hook ?? post.title ?? "Watch this",
        script: parsed.script ?? post.body ?? "",
        onScreenText: parsed.onScreenText ?? [post.title ?? ""],
        cta: parsed.cta ?? post.ctaLabel ?? "Order now",
        brandName: post.client.name,
      });
    } else {
      url = await generateImage(prompt);
    }

    const asset = await db.asset.create({
      data: {
        clientId: post.clientId,
        type: type === "VIDEO" ? "VIDEO" : "IMAGE",
        url,
        prompt,
        mimeType: url.endsWith(".mp4") ? "video/mp4" : url.endsWith(".svg") ? "image/svg+xml" : "image/png",
      },
    });

    await db.post.update({
      where: { id: postId },
      data: { assetId: asset.id },
    });

    await applyRuleDecision(postId);
  },
  { connection, concurrency: 1 }
);

new Worker<PublishJobData>(
  QUEUE_NAMES.PUBLISH,
  async (job) => {
    const { postId } = job.data;
    const post = await db.post.findUnique({
      where: { id: postId },
      include: {
        asset: true,
        client: true,
      },
    });
    if (!post) throw new Error("Post not found");

    await db.post.update({
      where: { id: postId },
      data: { status: "PUBLISHING" },
    });

    const connectionRow = await db.channelConnection.findUnique({
      where: {
        clientId_platform: {
          clientId: post.clientId,
          platform: post.platform,
        },
      },
    });

    const attemptNumber =
      (await db.publishAttempt.count({ where: { postId } })) + 1;

    try {
      let result;
      const message = [post.body, post.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")]
        .filter(Boolean)
        .join("\n\n");

      switch (post.platform) {
        case "FACEBOOK": {
          if (!connectionRow?.connected || !connectionRow.externalId) {
            throw new Error("Facebook channel not connected");
          }
          result = await publishFacebook({
            accessTokenEnc: connectionRow.accessTokenEnc!,
            pageId: connectionRow.externalId,
            message,
            imageUrl: post.asset?.url,
          });
          break;
        }
        case "INSTAGRAM": {
          if (!connectionRow?.connected || !connectionRow.externalId || !post.asset?.url) {
            throw new Error("Instagram requires connected account and image asset");
          }
          result = await publishInstagram({
            accessTokenEnc: connectionRow.accessTokenEnc!,
            igUserId: connectionRow.externalId,
            caption: message,
            imageUrl: post.asset.url,
          });
          break;
        }
        case "WEBSITE_BLOG": {
          const slug =
            post.slug ||
            (post.title ?? post.id)
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/(^-|-$)/g, "")
              .slice(0, 80);
          const siteKey = (
            await db.client.findUnique({ where: { id: post.clientId } })
          )?.blogSiteKey;
          result = {
            externalPostId: slug,
            externalUrl: siteKey
              ? `${process.env.API_URL ?? "http://localhost:4000"}/public/blog/${siteKey}/${slug}`
              : undefined,
            raw: { mode: "website_embed", slug },
          };
          if (!post.slug) {
            await db.post.update({
              where: { id: postId },
              data: { slug },
            });
          }
          break;
        }
        case "TIKTOK": {
          if (!connectionRow?.connected || !connectionRow.externalId) {
            throw new Error("TikTok channel not connected");
          }
          if (!post.asset?.url) throw new Error("TikTok requires video asset");
          result = await publishTikTok({
            accessTokenEnc: connectionRow.accessTokenEnc!,
            openId: connectionRow.externalId,
            caption: message,
            videoUrl: post.asset.url,
          });
          break;
        }
        case "YOUTUBE_SHORTS": {
          if (!connectionRow?.connected) {
            throw new Error("YouTube channel not connected");
          }
          if (!post.asset?.url) throw new Error("YouTube Shorts requires video asset");
          result = await publishYouTubeShort({
            accessTokenEnc: connectionRow.accessTokenEnc!,
            refreshTokenEnc: connectionRow.refreshTokenEnc,
            title: post.title ?? "Short",
            description: post.body ?? "",
            videoUrl: post.asset.url,
          });
          break;
        }
        case "PICTURE_AD": {
          if (!post.asset?.url) throw new Error("Picture ad requires image asset");
          result = await publishPictureAdExport({
            imageUrl: post.asset.url,
            headline: post.title ?? "",
          });
          break;
        }
        default:
          throw new Error(`Unsupported platform ${post.platform}`);
      }

      await db.publishAttempt.create({
        data: {
          postId,
          attemptNumber,
          success: true,
          response: result.raw as object ?? {},
        },
      });

      await db.post.update({
        where: { id: postId },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          externalPostId: result.externalPostId,
          externalUrl: result.externalUrl,
          errorMessage: null,
        },
      });

      await notifyQueue.add("notify", {
        type: "PUBLISHED",
        clientId: post.clientId,
        postId,
        message: `Published to ${post.platform}: ${result.externalUrl ?? result.externalPostId}`,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await db.publishAttempt.create({
        data: {
          postId,
          attemptNumber,
          success: false,
          errorMessage,
        },
      });
      await db.post.update({
        where: { id: postId },
        data: { status: "FAILED", errorMessage },
      });
      await notifyQueue.add("notify", {
        type: "PUBLISH_FAILED",
        clientId: post.clientId,
        postId,
        message: errorMessage,
      });
      throw err;
    }
  },
  { connection, concurrency: 2 }
);

new Worker<NotifyJobData>(
  QUEUE_NAMES.NOTIFY,
  async (job) => {
    const { message, type, postId } = job.data;
    console.log(`[notify:${type}] post=${postId} ${message}`);
    const { getAgencyCredentials } = await import("@seo/db");
    const creds = await getAgencyCredentials();
    if (creds.slackWebhookUrl) {
      await fetch(creds.slackWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `[${type}] ${message}` }),
      });
    }
  },
  { connection }
);

console.log("Worker running — queues:", Object.values(QUEUE_NAMES).join(", "));
