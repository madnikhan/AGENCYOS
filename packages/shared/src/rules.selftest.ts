import { evaluatePublishRules, type PublishRuleInput } from "./rules";

const baseRule: PublishRuleInput = {
  autoPublishEnabled: true,
  allowlistedTypes: ["DAILY_SPECIAL", "GENERAL"],
  bannedWords: ["cheap"],
  postingWindows: [{ days: [0, 1, 2, 3, 4, 5, 6], startHour: 0, endHour: 23 }],
  quietHours: null,
  minConfidence: 0.7,
  forceApprovalTypes: ["PROMO"],
  requireApprovalFirstN: 2,
};

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const noon = new Date("2026-09-22T12:00:00");

assert(
  evaluatePublishRules(baseRule, {
    contentType: "DAILY_SPECIAL",
    body: "Fresh special today",
    confidence: 0.9,
    clientPublishedCount: 5,
  }, noon).action === "AUTO_PUBLISH",
  "should auto-publish"
);

assert(
  evaluatePublishRules(baseRule, {
    contentType: "PROMO",
    body: "Promo",
    confidence: 0.9,
    clientPublishedCount: 5,
  }, noon).action === "REQUIRE_APPROVAL",
  "promo requires approval"
);

assert(
  evaluatePublishRules(baseRule, {
    contentType: "DAILY_SPECIAL",
    body: "Super cheap deal",
    confidence: 0.9,
    clientPublishedCount: 5,
  }, noon).action === "REQUIRE_APPROVAL",
  "banned word blocks"
);

assert(
  evaluatePublishRules(baseRule, {
    contentType: "DAILY_SPECIAL",
    body: "Special",
    confidence: 0.9,
    clientPublishedCount: 0,
  }, noon).action === "REQUIRE_APPROVAL",
  "first N require approval"
);

console.log("rules.selftest: all passed");
