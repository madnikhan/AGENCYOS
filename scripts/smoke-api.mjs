#!/usr/bin/env node
/**
 * Smoke test: login → me → stats → clients → create brief → posts → logout.
 * Skips live OAuth when Meta/TikTok/Google keys are not configured.
 *
 * Usage: node scripts/smoke-api.mjs
 * Env: API_URL (default http://localhost:4000),
 *      SMOKE_EMAIL, SMOKE_PASSWORD (defaults from seed)
 */

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const EMAIL = process.env.SMOKE_EMAIL ?? "editor@agency.local";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "reachline-demo";

let cookie = "";

function parseSetCookie(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  if (raw.length) {
    cookie = raw.map((c) => c.split(";")[0]).join("; ");
    return;
  }
  const single = res.headers.get("set-cookie");
  if (single) cookie = single.split(";")[0];
}

async function req(path, init = {}) {
  const headers = {
    ...(init.headers ?? {}),
  };
  if (cookie) headers.cookie = cookie;
  if (init.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  parseSetCookie(res);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { res, json };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log(`Smoke against ${API_URL}`);

  const health = await req("/health");
  assert(health.res.ok, "health failed");
  console.log("OK  health");

  const login = await req("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  assert(login.res.ok, `login failed: ${JSON.stringify(login.json)}`);
  assert(cookie.includes("reachline_session"), "session cookie missing");
  console.log("OK  login");

  const me = await req("/auth/me");
  assert(me.res.ok, `me failed: ${JSON.stringify(me.json)}`);
  console.log("OK  me", me.json.email);

  const stats = await req("/dashboard/stats");
  assert(stats.res.ok, "stats failed");
  console.log("OK  stats", {
    clients: stats.json.clients,
    published: stats.json.published,
  });

  const clients = await req("/clients");
  assert(clients.res.ok, "clients failed");
  assert(Array.isArray(clients.json) && clients.json.length > 0, "no clients");
  const clientId = clients.json[0].id;
  console.log("OK  clients", clients.json[0].name);

  const brief = await req("/briefs", {
    method: "POST",
    body: JSON.stringify({
      clientId,
      title: `Smoke brief ${new Date().toISOString()}`,
      offer: "Smoke test offer",
      localityKeywords: ["smoke test"],
      contentType: "GENERAL",
      platforms: ["FACEBOOK"],
      cta: "book",
      notes: "Automated smoke test — safe to ignore",
    }),
  });
  assert(brief.res.ok, `brief failed: ${JSON.stringify(brief.json)}`);
  console.log("OK  create brief", brief.json.brief?.id);

  const posts = await req("/posts");
  assert(posts.res.ok, "posts failed");
  console.log("OK  posts", posts.json.length);

  const analytics = await req("/analytics/summary");
  assert(analytics.res.ok, `analytics failed: ${JSON.stringify(analytics.json)}`);
  console.log("OK  analytics");

  const settings = await req("/settings");
  assert(settings.res.ok, "settings failed");
  const integ = settings.json;
  const metaOk = integ.metaConfigured;
  const tiktokOk = integ.tiktokConfigured;
  const ytOk = integ.youtubeConfigured;
  if (!metaOk) console.log("SKIP live Meta OAuth (keys not configured)");
  else console.log("NOTE Meta configured — run manual Connect checklist");
  if (!tiktokOk) console.log("SKIP live TikTok OAuth (keys not configured)");
  if (!ytOk) console.log("SKIP live YouTube OAuth (keys not configured)");

  const logout = await req("/auth/logout", { method: "POST" });
  assert(logout.res.ok, "logout failed");
  console.log("OK  logout");

  const denied = await req("/clients");
  assert(denied.res.status === 401, "expected 401 after logout");
  console.log("OK  unauthorized after logout");

  console.log("\nSmoke passed.");
}

main().catch((err) => {
  console.error("\nSmoke FAILED:", err.message);
  process.exit(1);
});
