import type { ContentType, RuleDecision } from "./index";

export type PublishRuleInput = {
  autoPublishEnabled: boolean;
  allowlistedTypes: ContentType[];
  bannedWords: string[];
  postingWindows: Array<{
    days: number[];
    startHour: number;
    endHour: number;
  }>;
  quietHours?: { startHour: number; endHour: number } | null;
  minConfidence: number;
  forceApprovalTypes: ContentType[];
  requireApprovalFirstN: number;
};

export type PostForRules = {
  contentType: ContentType;
  body?: string | null;
  title?: string | null;
  confidence?: number | null;
  clientPublishedCount: number;
};

function textContainsBanned(text: string, banned: string[]): string[] {
  const lower = text.toLowerCase();
  return banned.filter((w) => w && lower.includes(w.toLowerCase()));
}

function inPostingWindow(
  now: Date,
  windows: PublishRuleInput["postingWindows"]
): boolean {
  if (!windows.length) return true;
  const day = now.getDay();
  const hour = now.getHours();
  return windows.some((w) => {
    if (!w.days.includes(day)) return false;
    if (w.startHour <= w.endHour) {
      return hour >= w.startHour && hour < w.endHour;
    }
    return hour >= w.startHour || hour < w.endHour;
  });
}

function inQuietHours(
  now: Date,
  quiet?: { startHour: number; endHour: number } | null
): boolean {
  if (!quiet) return false;
  const hour = now.getHours();
  if (quiet.startHour <= quiet.endHour) {
    return hour >= quiet.startHour && hour < quiet.endHour;
  }
  return hour >= quiet.startHour || hour < quiet.endHour;
}

export function evaluatePublishRules(
  rule: PublishRuleInput,
  post: PostForRules,
  now: Date = new Date()
): RuleDecision {
  const reasons: string[] = [];
  const text = `${post.title ?? ""} ${post.body ?? ""}`;

  if (!rule.autoPublishEnabled) {
    reasons.push("Auto-publish disabled for client");
    return { action: "REQUIRE_APPROVAL", reasons };
  }

  if (post.clientPublishedCount < rule.requireApprovalFirstN) {
    reasons.push(
      `First ${rule.requireApprovalFirstN} posts require approval (published: ${post.clientPublishedCount})`
    );
    return { action: "REQUIRE_APPROVAL", reasons };
  }

  if (rule.forceApprovalTypes.includes(post.contentType)) {
    reasons.push(`Content type ${post.contentType} always requires approval`);
    return { action: "REQUIRE_APPROVAL", reasons };
  }

  if (!rule.allowlistedTypes.includes(post.contentType)) {
    reasons.push(`Content type ${post.contentType} not allowlisted for auto-publish`);
    return { action: "REQUIRE_APPROVAL", reasons };
  }

  const hits = textContainsBanned(text, rule.bannedWords);
  if (hits.length) {
    reasons.push(`Banned words detected: ${hits.join(", ")}`);
    return { action: "REQUIRE_APPROVAL", reasons };
  }

  const confidence = post.confidence ?? 0;
  if (confidence < rule.minConfidence) {
    reasons.push(
      `Confidence ${confidence.toFixed(2)} below minimum ${rule.minConfidence}`
    );
    return { action: "REQUIRE_APPROVAL", reasons };
  }

  if (inQuietHours(now, rule.quietHours)) {
    reasons.push("Within quiet hours");
    return { action: "REQUIRE_APPROVAL", reasons };
  }

  if (!inPostingWindow(now, rule.postingWindows)) {
    reasons.push("Outside configured posting windows");
    return { action: "REQUIRE_APPROVAL", reasons };
  }

  reasons.push("All auto-publish rules passed");
  return { action: "AUTO_PUBLISH", reasons };
}
