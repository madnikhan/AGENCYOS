"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { API_URL } from "@/lib/api";

type PageOption = {
  id: string;
  name: string;
  hasInstagram: boolean;
};

export default function MetaConnectPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const pendingId = search.get("pending");
  const [pages, setPages] = useState<PageOption[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [connectIg, setConnectIg] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!pendingId) {
      setError("Missing pending session. Start Connect again from the client.");
      return;
    }
    void fetch(`${API_URL}/oauth/meta/pending/${pendingId}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
      .then((data: { pages: PageOption[] }) => {
        setPages(data.pages);
        if (data.pages[0]) setSelected(data.pages[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load pages"));
  }, [pendingId]);

  async function confirm() {
    if (!pendingId || !selected) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/oauth/meta/confirm`, { credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pendingId,
          pageId: selected,
          connectInstagram: connectIg,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push(`/clients/${params.id}?connected=meta`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setSaving(false);
    }
  }

  const chosen = pages.find((p) => p.id === selected);

  return (
    <div>
      <p className="muted">
        <Link href={`/clients/${params.id}`}>← Back to client</Link>
      </p>
      <h1>Choose Facebook Page</h1>
      <p className="muted">
        Pick which Page Agency OS should post to for this client. If the Page
        has Instagram linked, you can connect that too.
      </p>

      {error && <div className="panel" style={{ borderColor: "var(--bad)" }}>{error}</div>}

      <div className="panel form-grid">
        {pages.map((p) => (
          <label
            key={p.id}
            style={{
              display: "flex",
              gap: "0.75rem",
              alignItems: "flex-start",
              padding: "0.75rem",
              border: "1px solid var(--line)",
              borderRadius: 10,
              background: selected === p.id ? "var(--bg-soft)" : "#fff",
            }}
          >
            <input
              type="radio"
              name="page"
              checked={selected === p.id}
              onChange={() => setSelected(p.id)}
            />
            <span>
              <strong>{p.name}</strong>
              <div className="muted">
                {p.hasInstagram
                  ? "Instagram business account available"
                  : "No Instagram linked to this Page"}
              </div>
            </span>
          </label>
        ))}

        {chosen?.hasInstagram && (
          <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={connectIg}
              onChange={(e) => setConnectIg(e.target.checked)}
            />
            Also connect Instagram for this Page
          </label>
        )}

        <button
          className="btn"
          type="button"
          disabled={!selected || saving}
          onClick={() => void confirm()}
        >
          {saving ? "Saving…" : "Save connection"}
        </button>
      </div>
    </div>
  );
}
