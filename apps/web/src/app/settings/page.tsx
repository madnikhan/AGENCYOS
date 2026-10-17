"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api";

type SettingsStatus = {
  claudeConfigured: boolean;
  falConfigured: boolean;
  metaConfigured: boolean;
  tiktokConfigured: boolean;
  youtubeConfigured: boolean;
  creatomateConfigured: boolean;
  metaAppId: string;
  tiktokClientKey: string;
  googleClientId: string;
  creatomateTemplateId: string;
  metaRedirectUri: string;
  tiktokRedirectUri: string;
  googleRedirectUri: string;
  sources: Record<string, string>;
};

export default function SettingsPage() {
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch(`${API_URL}/settings`, { credentials: "include" });
    if (res.ok) setStatus(await res.json());
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const fd = new FormData(e.currentTarget);
    const payload: Record<string, string> = {};
    for (const [k, v] of fd.entries()) {
      const s = String(v).trim();
      if (s) payload[k] = s;
    }
    try {
      const res = await fetch(`${API_URL}/settings`, { credentials: "include",
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      setStatus(await res.json());
      setMessage("Settings saved. Secrets are encrypted in the database.");
      e.currentTarget.reset();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function badge(ok: boolean, source?: string) {
    if (ok) {
      return (
        <span className="badge ok">
          Configured{source ? ` (${source})` : ""}
        </span>
      );
    }
    return <span className="badge failed">Not configured</span>;
  }

  return (
    <div>
      <h1>Settings</h1>
      <p className="muted">
        Save agency API keys here instead of editing <code>.env</code>. One Meta
        / TikTok / Google app for the whole agency — then connect each
        client’s pages under{" "}
        <Link href="/clients">Clients</Link>.
      </p>

      {message && <div className="panel">{message}</div>}

      {status && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Integration status</h2>
          <div className="channel-grid">
            <div className="channel-card">
              <strong>Claude</strong>
              <div>{badge(status.claudeConfigured, status.sources.claude)}</div>
            </div>
            <div className="channel-card">
              <strong>Meta (FB/IG)</strong>
              <div>{badge(status.metaConfigured, status.sources.meta)}</div>
            </div>
            <div className="channel-card">
              <strong>TikTok</strong>
              <div>{badge(status.tiktokConfigured, status.sources.tiktok)}</div>
            </div>
            <div className="channel-card">
              <strong>YouTube</strong>
              <div>
                {badge(status.youtubeConfigured, status.sources.youtube)}
              </div>
            </div>
            <div className="channel-card">
              <strong>fal.ai images</strong>
              <div>{badge(status.falConfigured, status.sources.fal)}</div>
            </div>
            <div className="channel-card">
              <strong>Creatomate video</strong>
              <div>{badge(status.creatomateConfigured)}</div>
            </div>
          </div>
        </div>
      )}

      <form className="panel form-grid" onSubmit={onSubmit}>
        <h2 style={{ margin: 0 }}>Claude</h2>
        <label>
          Anthropic API key
          <input
            name="anthropicApiKey"
            type="password"
            placeholder={
              status?.claudeConfigured ? "•••• leave blank to keep" : "sk-ant-…"
            }
            autoComplete="off"
          />
        </label>

        <h2 style={{ margin: "1rem 0 0" }}>Meta (Facebook & Instagram)</h2>
        <label>
          App ID
          <input
            name="metaAppId"
            defaultValue={status?.metaAppId ?? ""}
            placeholder="App ID from Meta developers"
          />
        </label>
        <label>
          App Secret
          <input
            name="metaAppSecret"
            type="password"
            placeholder={
              status?.metaConfigured ? "•••• leave blank to keep" : "App Secret"
            }
            autoComplete="off"
          />
        </label>
        <label>
          OAuth redirect URI
          <input
            name="metaRedirectUri"
            defaultValue={
              status?.metaRedirectUri ||
              "http://localhost:4000/oauth/meta/callback"
            }
          />
        </label>

        <h2 style={{ margin: "1rem 0 0" }}>TikTok</h2>
        <label>
          Client key
          <input
            name="tiktokClientKey"
            defaultValue={status?.tiktokClientKey ?? ""}
          />
        </label>
        <label>
          Client secret
          <input
            name="tiktokClientSecret"
            type="password"
            placeholder={
              status?.tiktokConfigured ? "•••• leave blank to keep" : ""
            }
            autoComplete="off"
          />
        </label>
        <label>
          OAuth redirect URI
          <input
            name="tiktokRedirectUri"
            defaultValue={
              status?.tiktokRedirectUri ||
              "http://localhost:4000/oauth/tiktok/callback"
            }
          />
        </label>

        <h2 style={{ margin: "1rem 0 0" }}>YouTube (Google)</h2>
        <label>
          Client ID
          <input
            name="googleClientId"
            defaultValue={status?.googleClientId ?? ""}
          />
        </label>
        <label>
          Client secret
          <input
            name="googleClientSecret"
            type="password"
            placeholder={
              status?.youtubeConfigured ? "•••• leave blank to keep" : ""
            }
            autoComplete="off"
          />
        </label>
        <label>
          OAuth redirect URI
          <input
            name="googleRedirectUri"
            defaultValue={
              status?.googleRedirectUri ||
              "http://localhost:4000/oauth/youtube/callback"
            }
          />
        </label>

        <h2 style={{ margin: "1rem 0 0" }}>Media (optional)</h2>
        <label>
          fal.ai API key
          <input
            name="falKey"
            type="password"
            placeholder={status?.falConfigured ? "•••• leave blank to keep" : ""}
            autoComplete="off"
          />
        </label>
        <label>
          Creatomate API key
          <input name="creatomateApiKey" type="password" autoComplete="off" />
        </label>
        <label>
          Creatomate template ID
          <input
            name="creatomateTemplateId"
            defaultValue={status?.creatomateTemplateId ?? ""}
          />
        </label>

        <button className="btn" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </button>
      </form>
    </div>
  );
}
