"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import CreatomateStudio, {
  type StudioResult,
} from "@/components/CreatomateStudio";

type BrandKit = {
  voiceTone: string;
  tagline: string | null;
  bannedWords: string[];
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
  headingFont: string | null;
  bodyFont: string | null;
  ctaDefaults?: {
    primary?: string;
    book?: string;
    call?: string;
    order?: string;
  } | null;
  videoTemplatePreset: string | null;
  creatomateTemplateId: string | null;
  brandSourceUrl?: string | null;
  brandExtractedAt?: string | null;
};

type BrandExtractPreview = {
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  headingFont?: string;
  bodyFont?: string;
  suggestedTagline?: string;
  sourceUrl: string;
};

type VideoPreset = {
  id: string;
  name: string;
  description: string;
};

type Client = {
  id: string;
  name: string;
  slug: string;
  blogSiteKey: string;
  industry: string | null;
  locality: string | null;
  websiteUrl: string | null;
  brandKit: BrandKit | null;
  publishRule: {
    autoPublishEnabled: boolean;
    minConfidence: number;
    requireApprovalFirstN: number;
    allowlistedTypes: string[];
    forceApprovalTypes: string[];
  } | null;
  channelConnections: Array<{
    platform: string;
    connected: boolean;
    accountLabel: string | null;
    metadata?: {
      canPublish?: boolean;
      grantedScopes?: string[];
    } | null;
  }>;
};

type SettingsStatus = {
  metaConfigured: boolean;
  tiktokConfigured: boolean;
  youtubeConfigured: boolean;
  creatomatePublicToken?: string;
  creatomatePublicTokenConfigured?: boolean;
};

const SOCIAL = [
  {
    platform: "FACEBOOK",
    title: "Facebook Page",
    blurb: "Posts go to the client’s Facebook Page.",
    oauth: "meta",
    needs: "meta" as const,
  },
  {
    platform: "INSTAGRAM",
    title: "Instagram",
    blurb: "Linked via the same Meta login as Facebook.",
    oauth: "meta",
    needs: "meta" as const,
  },
  {
    platform: "TIKTOK",
    title: "TikTok",
    blurb: "Short videos publish to their TikTok business account.",
    oauth: "tiktok",
    needs: "tiktok" as const,
  },
  {
    platform: "YOUTUBE_SHORTS",
    title: "YouTube Shorts",
    blurb: "Vertical videos upload as YouTube Shorts.",
    oauth: "youtube",
    needs: "youtube" as const,
  },
] as const;

const ERROR_MESSAGES: Record<string, string> = {
  meta_not_configured:
    "Meta App ID/Secret not set. Add them in Settings before connecting Facebook or Instagram.",
  tiktok_not_configured:
    "TikTok client key/secret not set. Add them in Settings first.",
  youtube_not_configured:
    "Google client ID/secret not set. Add them in Settings first.",
  missing_client: "Missing client id for OAuth.",
};

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const [client, setClient] = useState<Client | null>(null);
  const [settings, setSettings] = useState<SettingsStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualPlatform, setManualPlatform] = useState("FACEBOOK");
  const [manualToken, setManualToken] = useState("");
  const [manualExternalId, setManualExternalId] = useState("");
  const [manualLabel, setManualLabel] = useState("");
  const [presets, setPresets] = useState<VideoPreset[]>([]);
  const [extractPreview, setExtractPreview] =
    useState<BrandExtractPreview | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);

  async function load() {
    const [cRes, sRes, pRes] = await Promise.all([
      fetch(`${API_URL}/clients/${params.id}`, { credentials: "include" }),
      fetch(`${API_URL}/settings`, { credentials: "include" }),
      fetch(`${API_URL}/clients/video-templates/presets`, {
        credentials: "include",
      }),
    ]);
    if (cRes.ok) setClient(await cRes.json());
    if (sRes.ok) setSettings(await sRes.json());
    if (pRes.ok) setPresets(await pRes.json());
  }

  useEffect(() => {
    void load();
  }, [params.id]);

  useEffect(() => {
    const connected = search.get("connected");
    const err = search.get("error");
    if (connected) setMessage(`Connected: ${connected}`);
    if (err) {
      setMessage(ERROR_MESSAGES[err] ?? `Connection error: ${err}`);
    }
  }, [search]);

  const embedSnippet = useMemo(() => {
    if (!client) return "";
    return `<div id="reachline-blog"></div>
<script
  src="${API_URL}/public/embed.js"
  data-site-key="${client.blogSiteKey}"
  data-api="${API_URL}"
  async></script>`;
  }, [client]);

  function isConfigured(needs: "meta" | "tiktok" | "youtube"): boolean {
    if (!settings) return false;
    if (needs === "meta") return settings.metaConfigured;
    if (needs === "tiktok") return settings.tiktokConfigured;
    return settings.youtubeConfigured;
  }

  async function saveRules(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`${API_URL}/clients/${params.id}/publish-rules`, { credentials: "include",
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        autoPublishEnabled: fd.get("autoPublishEnabled") === "on",
        minConfidence: Number(fd.get("minConfidence")),
        requireApprovalFirstN: Number(fd.get("requireApprovalFirstN")),
      }),
    });
    if (!res.ok) {
      setMessage(await res.text());
      return;
    }
    setMessage("Publish rules saved");
    await load();
  }

  async function saveBrand(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const banned = String(fd.get("bannedWords") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const logoRaw = String(fd.get("logoUrl") ?? "").trim();
    const customTemplate = String(fd.get("creatomateTemplateId") ?? "").trim();
    const res = await fetch(`${API_URL}/clients/${params.id}/brand-kit`, {
      credentials: "include",
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        voiceTone: fd.get("voiceTone"),
        tagline: fd.get("tagline"),
        bannedWords: banned,
        primaryColor: fd.get("primaryColor") || undefined,
        secondaryColor: fd.get("secondaryColor") || undefined,
        logoUrl: logoRaw || "",
        headingFont: String(fd.get("headingFont") ?? "").trim() || null,
        bodyFont: String(fd.get("bodyFont") ?? "").trim() || null,
        ctaDefaults: {
          primary: String(fd.get("ctaPrimary") ?? "").trim() || undefined,
          book: String(fd.get("ctaBook") ?? "").trim() || undefined,
          call: String(fd.get("ctaCall") ?? "").trim() || undefined,
          order: String(fd.get("ctaOrder") ?? "").trim() || undefined,
        },
        videoTemplatePreset:
          String(fd.get("videoTemplatePreset") ?? "").trim() || null,
        creatomateTemplateId: customTemplate || null,
      }),
    });
    if (!res.ok) {
      setMessage(await res.text());
      return;
    }
    setMessage("Brand kit saved");
    setExtractPreview(null);
    await load();
  }

  async function extractBrand() {
    setExtracting(true);
    setMessage(null);
    try {
      const res = await fetch(
        `${API_URL}/clients/${params.id}/brand/extract`,
        {
          credentials: "include",
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(
          typeof body.error === "string" ? body.error : "Brand extract failed"
        );
        return;
      }
      setExtractPreview(body as BrandExtractPreview);
      setMessage("Brand preview ready — review and Apply below");
    } finally {
      setExtracting(false);
    }
  }

  async function applyExtract() {
    if (!extractPreview) return;
    const res = await fetch(`${API_URL}/clients/${params.id}/brand-kit`, {
      credentials: "include",
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        logoUrl: extractPreview.logoUrl || undefined,
        primaryColor: extractPreview.primaryColor,
        secondaryColor: extractPreview.secondaryColor,
        headingFont: extractPreview.headingFont ?? null,
        bodyFont: extractPreview.bodyFont ?? null,
        tagline: extractPreview.suggestedTagline,
        brandSourceUrl: extractPreview.sourceUrl,
        brandExtractedAt: new Date().toISOString(),
        brandExtractRaw: extractPreview as unknown as Record<string, unknown>,
      }),
    });
    if (!res.ok) {
      setMessage(await res.text());
      return;
    }
    setMessage("Extracted brand applied to Brand Kit");
    setExtractPreview(null);
    await load();
  }

  async function applyStudio(result: StudioResult) {
    const res = await fetch(`${API_URL}/clients/${params.id}/brand-kit`, {
      credentials: "include",
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creatomateTemplateId: result.templateId,
        videoTemplatePreset: result.presetId || "custom",
        creatomateFieldMap: result.fieldMap,
        primaryColor: result.form.primaryColor || undefined,
        secondaryColor: result.form.secondaryColor || undefined,
        logoUrl: result.form.logoUrl || undefined,
      }),
    });
    if (!res.ok) {
      setMessage(await res.text());
      return;
    }
    setMessage(`Template applied: ${result.templateId.slice(0, 8)}…`);
    await load();
  }

  async function copyEmbed() {
    await navigator.clipboard.writeText(embedSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function saveManualToken(e: React.FormEvent) {
    e.preventDefault();
    if (!manualToken.trim() || !manualExternalId.trim()) {
      setMessage("Access token and Page/account ID are required");
      return;
    }
    const res = await fetch(
      `${API_URL}/channels/${params.id}/${manualPlatform}`, { credentials: "include",
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: manualToken.trim(),
          externalId: manualExternalId.trim(),
          accountLabel: manualLabel.trim() || manualPlatform,
          connected: true,
        }),
      }
    );
    if (!res.ok) {
      setMessage(await res.text());
      return;
    }
    setMessage(`${manualPlatform} connected via pasted token`);
    setManualToken("");
    setManualExternalId("");
    setManualLabel("");
    setManualOpen(false);
    await load();
  }

  if (!client) return <p className="muted">Loading…</p>;

  function conn(platform: string) {
    return client!.channelConnections.find((c) => c.platform === platform);
  }

  const fbConn = conn("FACEBOOK");
  const fbScopes = fbConn?.metadata?.grantedScopes ?? [];
  const fbMissingPublish =
    fbConn?.connected &&
    (fbConn.metadata?.canPublish === false ||
      (fbScopes.length > 0 &&
        (!fbScopes.includes("pages_manage_posts") ||
          !fbScopes.includes("pages_read_engagement"))));

  return (
    <div>
      <h1>{client.name}</h1>
      <p className="muted">
        {client.industry ?? "Business"} · {client.locality ?? "Local"} ·{" "}
        {client.slug}
      </p>
      {message && (
        <div
          className="panel"
          style={{
            borderColor: message.toLowerCase().includes("not set")
              ? "var(--bad)"
              : undefined,
          }}
        >
          {message}{" "}
          {message.includes("Settings") && (
            <Link href="/settings">Open Settings →</Link>
          )}
        </div>
      )}

      {fbMissingPublish && (
        <div className="panel" style={{ borderColor: "var(--bad)" }}>
          Facebook is connected but the Page token cannot publish (missing{" "}
          <code>pages_manage_posts</code> / <code>pages_read_engagement</code>
          ). Update your Meta Login for Business configuration, then click
          Reconnect on Facebook below. See{" "}
          <Link href="/settings">Settings</Link> for the required permissions
          list.
        </div>
      )}

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>1. Connect social pages</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Connect each channel once. Agency API keys must be set in{" "}
          <Link href="/settings">Settings</Link> first (one Meta app for all
          clients).
        </p>
        <div className="channel-grid">
          {SOCIAL.map((s) => {
            const c = conn(s.platform);
            const connected = Boolean(c?.connected);
            const ready = isConfigured(s.needs);
            return (
              <div className="channel-card" key={s.platform}>
                <div className="row" style={{ alignItems: "flex-start" }}>
                  <div>
                    <h3>{s.title}</h3>
                    <p className="muted" style={{ margin: "0 0 0.5rem" }}>
                      {s.blurb}
                    </p>
                    {connected ? (
                      <span className="badge ok">
                        Connected
                        {c?.accountLabel ? ` · ${c.accountLabel}` : ""}
                      </span>
                    ) : (
                      <span className="badge">Not connected</span>
                    )}
                    {!ready && (
                      <p
                        className="muted"
                        style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}
                      >
                        Configure {s.needs === "meta" ? "Meta" : s.needs} in
                        Settings first.
                      </p>
                    )}
                  </div>
                  {ready ? (
                    <a
                      className="btn"
                      href={`${API_URL}/oauth/${s.oauth}/start?clientId=${client.id}`}
                    >
                      {connected ? "Reconnect" : "Connect"}
                    </a>
                  ) : (
                    <Link className="btn secondary" href="/settings">
                      Settings
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="muted" style={{ marginTop: "1rem" }}>
          Tip: Facebook and Instagram share one Meta login — you’ll pick which
          Page after signing in.
        </p>
        <button
          type="button"
          className="btn secondary"
          onClick={() => setManualOpen((v) => !v)}
        >
          {manualOpen ? "Hide" : "Paste access token (advanced)"}
        </button>
        {manualOpen && (
          <form
            className="form-grid"
            style={{ marginTop: "1rem" }}
            onSubmit={saveManualToken}
          >
            <p className="muted" style={{ margin: 0 }}>
              Use when OAuth/App Review is pending. Paste a Page access token
              and the Page / IG / open_id / channel ID.
            </p>
            <label>
              Platform
              <select
                value={manualPlatform}
                onChange={(e) => setManualPlatform(e.target.value)}
              >
                <option value="FACEBOOK">Facebook</option>
                <option value="INSTAGRAM">Instagram</option>
                <option value="TIKTOK">TikTok</option>
                <option value="YOUTUBE_SHORTS">YouTube Shorts</option>
              </select>
            </label>
            <label>
              Access token
              <input
                type="password"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                required
              />
            </label>
            <label>
              Page / account ID
              <input
                value={manualExternalId}
                onChange={(e) => setManualExternalId(e.target.value)}
                required
                placeholder="Facebook Page ID or IG user ID"
              />
            </label>
            <label>
              Label (optional)
              <input
                value={manualLabel}
                onChange={(e) => setManualLabel(e.target.value)}
                placeholder="Client Page name"
              />
            </label>
            <button className="btn" type="submit">
              Save token
            </button>
          </form>
        )}
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>2. Website blog (any site)</h2>
        <p className="muted">
          Paste this script on the client website. Published blog posts appear
          automatically — no CMS login.
        </p>
        <p className="muted">
          Site key: <code>{client.blogSiteKey}</code>
        </p>
        <pre className="code-block">{embedSnippet}</pre>
        <button className="btn" type="button" onClick={() => void copyEmbed()}>
          {copied ? "Copied" : "Copy embed code"}
        </button>
      </div>

      <details className="panel details-panel" open>
        <summary>Brand kit</summary>
        <div
          style={{
            display: "flex",
            gap: "1rem",
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: "1rem",
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 12,
              background: `linear-gradient(135deg, ${client.brandKit?.primaryColor ?? "#C45C26"}, ${client.brandKit?.secondaryColor ?? "#1A1A1A"})`,
              display: "grid",
              placeItems: "center",
              overflow: "hidden",
              border: "1px solid var(--line)",
            }}
          >
            {client.brandKit?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={client.brandKit.logoUrl}
                alt=""
                style={{ maxWidth: "100%", maxHeight: "100%" }}
              />
            ) : (
              <span style={{ color: "#fff", fontSize: 12 }}>No logo</span>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <p className="muted" style={{ margin: 0 }}>
              Website: {client.websiteUrl ?? "not set"}
            </p>
            <button
              type="button"
              className="btn secondary"
              style={{ marginTop: 8 }}
              disabled={!client.websiteUrl || extracting}
              onClick={() => void extractBrand()}
            >
              {extracting ? "Extracting…" : "Extract from website"}
            </button>
          </div>
        </div>

        {extractPreview && (
          <div
            className="panel"
            style={{ borderColor: "var(--accent, #C45C26)", marginBottom: "1rem" }}
          >
            <p style={{ marginTop: 0 }}>
              <strong>Extract preview</strong> from {extractPreview.sourceUrl}
            </p>
            <p className="muted" style={{ margin: "0 0 0.5rem" }}>
              {[
                extractPreview.primaryColor &&
                  `Primary ${extractPreview.primaryColor}`,
                extractPreview.secondaryColor &&
                  `Secondary ${extractPreview.secondaryColor}`,
                extractPreview.headingFont &&
                  `Heading ${extractPreview.headingFont}`,
                extractPreview.suggestedTagline,
              ]
                .filter(Boolean)
                .join(" · ") || "No strong signals found — you can still Apply"}
            </p>
            {extractPreview.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={extractPreview.logoUrl}
                alt="Extracted logo"
                style={{ maxHeight: 48, marginBottom: 8 }}
              />
            )}
            <button
              type="button"
              className="btn"
              onClick={() => void applyExtract()}
            >
              Apply to Brand Kit
            </button>
          </div>
        )}

        <form className="form-grid" onSubmit={saveBrand} key={client.brandKit?.brandExtractedAt ?? "brand"}>
          <label>
            Voice / tone
            <textarea
              name="voiceTone"
              rows={3}
              defaultValue={client.brandKit?.voiceTone ?? ""}
            />
          </label>
          <label>
            Tagline
            <input name="tagline" defaultValue={client.brandKit?.tagline ?? ""} />
          </label>
          <label>
            Primary color
            <input
              name="primaryColor"
              type="color"
              defaultValue={client.brandKit?.primaryColor ?? "#C45C26"}
            />
          </label>
          <label>
            Secondary color
            <input
              name="secondaryColor"
              type="color"
              defaultValue={client.brandKit?.secondaryColor ?? "#1A1A1A"}
            />
          </label>
          <label>
            Logo URL
            <input
              name="logoUrl"
              defaultValue={client.brandKit?.logoUrl ?? ""}
              placeholder="https://…"
            />
          </label>
          <label>
            Heading font
            <input
              name="headingFont"
              defaultValue={client.brandKit?.headingFont ?? ""}
              placeholder="e.g. Montserrat"
            />
          </label>
          <label>
            Body font
            <input
              name="bodyFont"
              defaultValue={client.brandKit?.bodyFont ?? ""}
              placeholder="e.g. Inter"
            />
          </label>
          <label>
            CTA primary
            <input
              name="ctaPrimary"
              defaultValue={client.brandKit?.ctaDefaults?.primary ?? ""}
            />
          </label>
          <label>
            CTA book
            <input
              name="ctaBook"
              defaultValue={client.brandKit?.ctaDefaults?.book ?? ""}
            />
          </label>
          <label>
            CTA call
            <input
              name="ctaCall"
              defaultValue={client.brandKit?.ctaDefaults?.call ?? ""}
            />
          </label>
          <label>
            CTA order / quote
            <input
              name="ctaOrder"
              defaultValue={client.brandKit?.ctaDefaults?.order ?? ""}
            />
          </label>
          <div>
            <p className="muted" style={{ margin: "0 0 0.5rem" }}>
              Video template:{" "}
              {client.brandKit?.creatomateTemplateId
                ? `${client.brandKit.creatomateTemplateId.slice(0, 12)}… (${client.brandKit.videoTemplatePreset ?? "custom"})`
                : `preset ${client.brandKit?.videoTemplatePreset ?? "agency default"}`}
            </p>
            <button
              type="button"
              className="btn secondary"
              onClick={() => setStudioOpen(true)}
            >
              Open Template Studio
            </button>
          </div>
          <label>
            Video template preset
            <select
              name="videoTemplatePreset"
              defaultValue={client.brandKit?.videoTemplatePreset ?? "quick_promo"}
            >
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.description}
                </option>
              ))}
              <option value="custom">Custom Creatomate ID (advanced)</option>
            </select>
          </label>
          <label>
            Creatomate template ID (advanced override)
            <input
              name="creatomateTemplateId"
              defaultValue={client.brandKit?.creatomateTemplateId ?? ""}
              placeholder="Leave blank to use Settings default"
            />
          </label>
          <label>
            Banned words (comma-separated)
            <input
              name="bannedWords"
              defaultValue={client.brandKit?.bannedWords.join(", ") ?? ""}
            />
          </label>
          <button className="btn" type="submit">
            Save brand kit
          </button>
        </form>
      </details>

      <CreatomateStudio
        open={studioOpen}
        onClose={() => setStudioOpen(false)}
        onApply={(r) => void applyStudio(r)}
        publicToken={settings?.creatomatePublicToken ?? null}
        initialTemplateId={client.brandKit?.creatomateTemplateId}
        initialForm={{
          logoUrl: client.brandKit?.logoUrl ?? "",
          primaryColor: client.brandKit?.primaryColor ?? "#C45C26",
          secondaryColor: client.brandKit?.secondaryColor ?? "#1A1A1A",
          cta: client.brandKit?.ctaDefaults?.book ?? "Book now",
        }}
        title={`Template Studio — ${client.name}`}
      />

      <details className="panel details-panel">
        <summary>Auto-publish rules (hybrid)</summary>
        <form className="form-grid" onSubmit={saveRules}>
          <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="checkbox"
              name="autoPublishEnabled"
              defaultChecked={client.publishRule?.autoPublishEnabled ?? false}
            />
            Enable auto-publish when rules pass
          </label>
          <label>
            Minimum confidence
            <input
              name="minConfidence"
              type="number"
              step="0.05"
              min="0"
              max="1"
              defaultValue={client.publishRule?.minConfidence ?? 0.7}
            />
          </label>
          <label>
            Require approval for first N published posts
            <input
              name="requireApprovalFirstN"
              type="number"
              min="0"
              defaultValue={client.publishRule?.requireApprovalFirstN ?? 5}
            />
          </label>
          <button className="btn" type="submit">
            Save rules
          </button>
        </form>
      </details>
    </div>
  );
}
