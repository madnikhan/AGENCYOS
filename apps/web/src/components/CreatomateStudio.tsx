"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_URL } from "@/lib/api";
import { VIDEO_TEMPLATE_PRESETS } from "@seo/shared";

export type StudioModifications = {
  hook: string;
  punchline: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  cta: string;
};

export type StudioResult = {
  templateId: string;
  presetId: string;
  fieldMap: Record<string, string>;
  modifications: Record<string, string>;
  form: StudioModifications;
};

type TemplateMeta = {
  id: string;
  name: string;
  tags?: string[];
  updated_at?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onApply: (result: StudioResult) => void;
  publicToken: string | null;
  initialTemplateId?: string | null;
  initialForm?: Partial<StudioModifications>;
  title?: string;
};

const DEFAULT_FIELD_MAP: Record<string, string> = {
  hook: "Text-1",
  punchline: "Text-2",
  logo: "Logo.source",
  primaryColor: "Fill-1",
  secondaryColor: "Fill-2",
  cta: "CTA",
};

function isDesktop(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(min-width: 900px)").matches;
}

function buildCreatomateMods(
  form: StudioModifications,
  fieldMap: Record<string, string>
): Record<string, string> {
  const mods: Record<string, string> = {};
  if (form.hook) mods[fieldMap.hook || "Text-1"] = form.hook;
  if (form.punchline) mods[fieldMap.punchline || "Text-2"] = form.punchline;
  if (form.logoUrl) mods[fieldMap.logo || "Logo.source"] = form.logoUrl;
  if (form.primaryColor)
    mods[fieldMap.primaryColor || "Fill-1"] = form.primaryColor;
  if (form.secondaryColor)
    mods[fieldMap.secondaryColor || "Fill-2"] = form.secondaryColor;
  if (form.cta && fieldMap.cta) mods[fieldMap.cta] = form.cta;
  return mods;
}

export default function CreatomateStudio({
  open,
  onClose,
  onApply,
  publicToken,
  initialTemplateId,
  initialForm,
  title = "Template Studio",
}: Props) {
  const previewEl = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const previewRef = useRef<any>(null);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(initialTemplateId ?? "");
  const [presetId, setPresetId] = useState("custom");
  const [fieldMap, setFieldMap] =
    useState<Record<string, string>>(DEFAULT_FIELD_MAP);
  const [mode, setMode] = useState<"player" | "interactive">("player");
  const [desktop, setDesktop] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [form, setForm] = useState<StudioModifications>({
    hook: initialForm?.hook ?? "Your offer headline",
    punchline: initialForm?.punchline ?? "Price · CTA",
    logoUrl: initialForm?.logoUrl ?? "",
    primaryColor: initialForm?.primaryColor ?? "#C45C26",
    secondaryColor: initialForm?.secondaryColor ?? "#1A1A1A",
    cta: initialForm?.cta ?? "Book now",
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        (t.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
    );
  }, [templates, query]);

  useEffect(() => {
    setDesktop(isDesktop());
    const onResize = () => setDesktop(isDesktop());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoadingList(true);
    setError(null);
    void fetch(`${API_URL}/creatomate/templates`, { credentials: "include" })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || "Failed to load templates");
        return body as TemplateMeta[];
      })
      .then((list) => {
        setTemplates(list);
        if (!selectedId && list[0]) setSelectedId(list[0].id);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load templates")
      )
      .finally(() => setLoadingList(false));
  }, [open]);

  useEffect(() => {
    if (!open || !selectedId) return;
    void fetch(`${API_URL}/creatomate/templates/${selectedId}`, {
      credentials: "include",
    })
      .then(async (r) => {
        if (!r.ok) return null;
        return r.json() as Promise<{
          fieldHints?: { text?: string[]; logo?: string[]; fill?: string[] };
        }>;
      })
      .then((detail) => {
        if (!detail?.fieldHints) return;
        const next = { ...DEFAULT_FIELD_MAP };
        if (detail.fieldHints.text?.[0]) next.hook = detail.fieldHints.text[0];
        if (detail.fieldHints.text?.[1])
          next.punchline = detail.fieldHints.text[1];
        if (detail.fieldHints.logo?.[0]) next.logo = detail.fieldHints.logo[0];
        if (detail.fieldHints.fill?.[0])
          next.primaryColor = detail.fieldHints.fill[0];
        if (detail.fieldHints.fill?.[1])
          next.secondaryColor = detail.fieldHints.fill[1];
        setFieldMap(next);
        setPresetId("custom");
      })
      .catch(() => undefined);
  }, [open, selectedId]);

  const disposePreview = useCallback(() => {
    try {
      previewRef.current?.dispose?.();
    } catch {
      /* ignore */
    }
    previewRef.current = null;
  }, []);

  useEffect(() => {
    if (!open || !desktop || !publicToken || !selectedId || !previewEl.current) {
      return;
    }

    let cancelled = false;
    disposePreview();

    void (async () => {
      try {
        const { Preview } = await import("@creatomate/preview");
        if (cancelled || !previewEl.current) return;
        const preview = new Preview(previewEl.current, mode, publicToken);
        previewRef.current = preview;
        preview.onReady = async () => {
          if (cancelled) return;
          await preview.loadTemplate(selectedId);
          const mods = buildCreatomateMods(form, fieldMap);
          if (Object.keys(mods).length) {
            await preview.setModifications(mods);
          }
          if (mode === "player") {
            try {
              await preview.play();
            } catch {
              /* autoplay may fail */
            }
          }
        };
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Failed to load Creatomate preview"
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      disposePreview();
    };
    // Recreate when template/mode/token changes — form updates via setModifications below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, desktop, publicToken, selectedId, mode, disposePreview]);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview || !preview.ready) return;
    const mods = buildCreatomateMods(form, fieldMap);
    void preview.setModifications(mods).catch(() => undefined);
  }, [form, fieldMap]);

  if (!open) return null;

  function applyPreset(id: string) {
    setPresetId(id);
    const preset = VIDEO_TEMPLATE_PRESETS.find((p) => p.id === id);
    if (preset) setFieldMap({ ...DEFAULT_FIELD_MAP, ...preset.fieldMap });
  }

  function handleApply() {
    if (!selectedId) {
      setError("Select a template first");
      return;
    }
    onApply({
      templateId: selectedId,
      presetId,
      fieldMap,
      modifications: buildCreatomateMods(form, fieldMap),
      form,
    });
    onClose();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(0,0,0,0.45)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="panel"
        style={{
          width: "min(1100px, 100%)",
          maxHeight: "92vh",
          overflow: "auto",
          margin: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row" style={{ alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button type="button" className="btn secondary" onClick={onClose}>
            Close
          </button>
        </div>

        {error && (
          <p style={{ color: "var(--bad)" }} role="alert">
            {error}
          </p>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: desktop ? "280px 1fr 260px" : "1fr",
            gap: "1rem",
            marginTop: "1rem",
          }}
        >
          <div>
            <label>
              Search templates
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name or tag"
              />
            </label>
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              Curated presets (field maps)
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {VIDEO_TEMPLATE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={
                    presetId === p.id ? "btn" : "btn secondary"
                  }
                  style={{ fontSize: "0.8rem", padding: "0.35rem 0.6rem" }}
                  onClick={() => applyPreset(p.id)}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <div
              style={{
                marginTop: 8,
                maxHeight: 360,
                overflow: "auto",
                border: "1px solid var(--line)",
                borderRadius: 8,
              }}
            >
              {loadingList && <p className="muted">Loading gallery…</p>}
              {!loadingList &&
                filtered.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "0.65rem 0.75rem",
                      border: "none",
                      borderBottom: "1px solid var(--line)",
                      background:
                        selectedId === t.id ? "var(--bg-soft)" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <strong>{t.name}</strong>
                    <div className="muted" style={{ fontSize: "0.75rem" }}>
                      {t.id.slice(0, 8)}…
                      {(t.tags ?? []).length
                        ? ` · ${(t.tags ?? []).slice(0, 3).join(", ")}`
                        : ""}
                    </div>
                  </button>
                ))}
            </div>
          </div>

          <div>
            {!publicToken && (
              <p className="muted">
                Set Creatomate <strong>public token</strong> in Settings to
                enable live preview.
              </p>
            )}
            {!desktop && (
              <p className="muted">
                Live preview needs a desktop browser. Edit fields below — the
                worker will still render the final MP4.
              </p>
            )}
            <div
              ref={previewEl}
              style={{
                width: "100%",
                aspectRatio: "9 / 16",
                maxHeight: 520,
                background: "#111",
                borderRadius: 12,
                overflow: "hidden",
              }}
            />
            <div className="row" style={{ marginTop: 8, gap: 8 }}>
              <button
                type="button"
                className={mode === "player" ? "btn" : "btn secondary"}
                disabled={!desktop || !publicToken}
                onClick={() => setMode("player")}
              >
                Form preview
              </button>
              <button
                type="button"
                className={mode === "interactive" ? "btn" : "btn secondary"}
                disabled={!desktop || !publicToken}
                onClick={() => setMode("interactive")}
              >
                Open canvas editor
              </button>
            </div>
            {mode === "interactive" && (
              <p className="muted" style={{ fontSize: "0.85rem" }}>
                Interactive canvas is desktop-only (Creatomate). Drag elements,
                then Apply — form fields still seed Text/logo/colors.
              </p>
            )}
          </div>

          <div className="form-grid">
            <label>
              Hook (Text-1)
              <input
                value={form.hook}
                onChange={(e) =>
                  setForm((f) => ({ ...f, hook: e.target.value }))
                }
              />
            </label>
            <label>
              Punchline (Text-2)
              <input
                value={form.punchline}
                onChange={(e) =>
                  setForm((f) => ({ ...f, punchline: e.target.value }))
                }
              />
            </label>
            <label>
              Logo URL
              <input
                value={form.logoUrl}
                onChange={(e) =>
                  setForm((f) => ({ ...f, logoUrl: e.target.value }))
                }
              />
            </label>
            <label>
              Primary color
              <input
                type="color"
                value={form.primaryColor}
                onChange={(e) =>
                  setForm((f) => ({ ...f, primaryColor: e.target.value }))
                }
              />
            </label>
            <label>
              Secondary color
              <input
                type="color"
                value={form.secondaryColor}
                onChange={(e) =>
                  setForm((f) => ({ ...f, secondaryColor: e.target.value }))
                }
              />
            </label>
            <label>
              CTA
              <input
                value={form.cta}
                onChange={(e) =>
                  setForm((f) => ({ ...f, cta: e.target.value }))
                }
              />
            </label>
            <button type="button" className="btn" onClick={handleApply}>
              Apply template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
