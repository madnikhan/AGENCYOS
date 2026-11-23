"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { API_URL, formatApiError } from "@/lib/api";
import CreatomateStudio, {
  type StudioResult,
} from "@/components/CreatomateStudio";
import type { BriefVideoSettings } from "@seo/shared";

const PLATFORMS = [
  "FACEBOOK",
  "INSTAGRAM",
  "TIKTOK",
  "YOUTUBE_SHORTS",
  "WEBSITE_BLOG",
  "PICTURE_AD",
] as const;

const CONTENT_TYPES = [
  "DAILY_SPECIAL",
  "PROMO",
  "BLOG",
  "STORY",
  "SHORT_VIDEO",
  "PICTURE_AD",
  "GENERAL",
] as const;

const ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,application/pdf,.jpg,.jpeg,.png,.webp,.gif,.pdf";
const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;

type Client = {
  id: string;
  name: string;
  brandKit?: {
    logoUrl?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
    creatomateTemplateId?: string | null;
    ctaDefaults?: { book?: string } | null;
  } | null;
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function NewBriefPage() {
  const router = useRouter();
  const search = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [platforms, setPlatforms] = useState<string[]>(["FACEBOOK", "INSTAGRAM"]);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [clientId, setClientId] = useState(search.get("clientId") ?? "");
  const [seoKeywords, setSeoKeywords] = useState("");
  const [seoNotes, setSeoNotes] = useState("");
  const [studioOpen, setStudioOpen] = useState(false);
  const [videoSettings, setVideoSettings] =
    useState<BriefVideoSettings | null>(null);
  const [publicToken, setPublicToken] = useState<string | null>(null);

  const wantsShortVideo =
    platforms.includes("YOUTUBE_SHORTS") ||
    platforms.includes("TIKTOK") ||
    platforms.includes("INSTAGRAM") ||
    platforms.includes("FACEBOOK");

  const selectedClient = clients.find((c) => c.id === clientId);

  useEffect(() => {
    void fetch(`${API_URL}/clients`, { credentials: "include" })
      .then((r) => r.json())
      .then(setClients)
      .catch(() => setClients([]));
    void fetch(`${API_URL}/settings`, { credentials: "include" })
      .then((r) => r.json())
      .then((s: { creatomatePublicToken?: string }) =>
        setPublicToken(s.creatomatePublicToken ?? null)
      )
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const fromSeo = search.get("fromSeo") === "1";
    const id = search.get("clientId");
    if (!fromSeo || !id) return;
    setClientId(id);
    void fetch(`${API_URL}/seo/${id}/brief-keywords`, {
      credentials: "include",
    })
      .then(async (r) => {
        if (!r.ok) return null;
        return r.json() as Promise<{ keywords: string[] }>;
      })
      .then((data) => {
        if (!data?.keywords?.length) return;
        setSeoKeywords(data.keywords.join(", "));
        setSeoNotes(
          `SEO keywords from research: ${data.keywords.slice(0, 12).join(", ")}`
        );
      })
      .catch(() => undefined);
  }, [search]);

  function togglePlatform(p: string) {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  function onFilesChosen(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    const next = [...files];
    for (const file of Array.from(list)) {
      if (next.length >= MAX_FILES) {
        setError(`Max ${MAX_FILES} attachments`);
        break;
      }
      if (file.size > MAX_BYTES) {
        setError(`${file.name} exceeds 10MB`);
        continue;
      }
      if (next.some((f) => f.name === file.name && f.size === file.size)) continue;
      next.push(file);
    }
    setFiles(next);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!platforms.length) {
      setError("Select at least one platform");
      return;
    }
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const keywords = String(fd.get("localityKeywords") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const body = new FormData();
    body.append("clientId", String(fd.get("clientId")));
    body.append("title", String(fd.get("title")));
    body.append("offer", String(fd.get("offer") ?? ""));
    body.append("localityKeywords", JSON.stringify(keywords));
    body.append("contentType", String(fd.get("contentType")));
    body.append("platforms", JSON.stringify(platforms));
    body.append("cta", String(fd.get("cta")));
    body.append("notes", String(fd.get("notes") ?? ""));
    const scheduledRaw = fd.get("scheduledAt");
    if (scheduledRaw) {
      body.append(
        "scheduledAt",
        new Date(String(scheduledRaw)).toISOString()
      );
    }
    for (const file of files) {
      body.append("attachments", file);
    }
    if (videoSettings) {
      body.append("videoSettings", JSON.stringify(videoSettings));
    }

    try {
      const res = await fetch(`${API_URL}/briefs`, {
        method: "POST",
        credentials: "include",
        body,
      });
      if (!res.ok) throw new Error(formatApiError(await res.text()));
      router.push("/posts?generating=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setSaving(false);
    }
  }

  return (
    <div>
      <h1>New content brief</h1>
      <p className="muted">
        Claude drafts captions, blogs, ads, and short scripts per platform.
      </p>
      <form className="panel form-grid" onSubmit={onSubmit}>
        <label>
          Client
          <select
            name="clientId"
            required
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            <option value="">Select…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Title
          <input name="title" required placeholder="Spring promo / service highlight" />
        </label>
        <label>
          Offer / hook
          <input name="offer" placeholder="20% off first booking this week" />
        </label>
        <label>
          Local SEO keywords (comma-separated)
          <input
            name="localityKeywords"
            value={seoKeywords}
            onChange={(e) => setSeoKeywords(e.target.value)}
            placeholder="taxi Leeds, 24 hour taxi city centre"
          />
        </label>
        <label>
          Content type
          <select name="contentType" defaultValue="DAILY_SPECIAL">
            {CONTENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          CTA
          <select name="cta" defaultValue="book">
            <option value="book">Book now</option>
            <option value="call">Call us</option>
            <option value="order">Get a quote</option>
          </select>
        </label>
        <label>
          Schedule (optional)
          <input name="scheduledAt" type="datetime-local" />
        </label>
        <div>
          <div className="muted" style={{ marginBottom: "0.5rem" }}>
            Platforms
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {PLATFORMS.map((p) => (
              <button
                key={p}
                type="button"
                className={`btn ${platforms.includes(p) ? "" : "secondary"}`}
                onClick={() => togglePlatform(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        {wantsShortVideo && (
          <div>
            <div className="muted" style={{ marginBottom: "0.35rem" }}>
              Video template (Shorts / Reels)
            </div>
            <p className="muted" style={{ marginTop: 0, fontSize: "0.9rem" }}>
              {videoSettings?.templateId
                ? `Override: ${videoSettings.templateId.slice(0, 12)}…`
                : "Using client Brand Kit / agency default"}
            </p>
            <button
              type="button"
              className="btn secondary"
              onClick={() => setStudioOpen(true)}
            >
              Choose template in Studio
            </button>
            {videoSettings && (
              <button
                type="button"
                className="btn secondary"
                style={{ marginLeft: 8 }}
                onClick={() => setVideoSettings(null)}
              >
                Clear override
              </button>
            )}
          </div>
        )}
        <label>
          Notes for Claude
          <textarea
            name="notes"
            rows={3}
            value={seoNotes}
            onChange={(e) => setSeoNotes(e.target.value)}
          />
        </label>
        <div>
          <div className="muted" style={{ marginBottom: "0.35rem" }}>
            Brand / reference files
          </div>
          <p className="muted" style={{ marginTop: 0, marginBottom: "0.75rem", fontSize: "0.9rem" }}>
            Attach logos, brand boards, or PDFs so Claude matches your look
            (max {MAX_FILES}, 10MB each).
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            multiple
            onChange={(e) => onFilesChosen(e.target.files)}
          />
          {files.length > 0 && (
            <ul className="attachment-chips">
              {files.map((f, i) => (
                <li key={`${f.name}-${f.size}-${i}`}>
                  <span>
                    {f.name}{" "}
                    <span className="muted">({formatSize(f.size)})</span>
                  </span>
                  <button
                    type="button"
                    className="btn secondary"
                    aria-label={`Remove ${f.name}`}
                    onClick={() => removeFile(i)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {error && <p style={{ color: "var(--bad)" }}>{error}</p>}
        <button className="btn" disabled={saving}>
          {saving ? "Queuing…" : "Generate drafts"}
        </button>
      </form>

      <CreatomateStudio
        open={studioOpen}
        onClose={() => setStudioOpen(false)}
        onApply={(r: StudioResult) => {
          setVideoSettings({
            templateId: r.templateId,
            presetId: r.presetId,
            fieldMap: r.fieldMap,
            modifications: r.modifications,
          });
        }}
        publicToken={publicToken}
        initialTemplateId={
          videoSettings?.templateId ||
          selectedClient?.brandKit?.creatomateTemplateId
        }
        initialForm={{
          logoUrl: selectedClient?.brandKit?.logoUrl ?? "",
          primaryColor: selectedClient?.brandKit?.primaryColor ?? "#C45C26",
          secondaryColor:
            selectedClient?.brandKit?.secondaryColor ?? "#1A1A1A",
          cta: selectedClient?.brandKit?.ctaDefaults?.book ?? "Book now",
        }}
        title="Shorts template for this brief"
      />
    </div>
  );
}
