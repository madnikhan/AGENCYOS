"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { API_URL, formatApiError } from "@/lib/api";

type Tab =
  | "research"
  | "ranks"
  | "backlinks"
  | "competitors"
  | "audit"
  | "local";

type KeywordIdea = {
  keyword: string;
  volume: number | null;
  difficulty: number | null;
  cpc: number | null;
  intent: string | null;
};

type Client = {
  id: string;
  name: string;
  websiteUrl: string | null;
  industry: string | null;
  locality: string | null;
};

export default function ClientSeoPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const clientId = params.id;
  const [tab, setTab] = useState<Tab>("research");
  const [client, setClient] = useState<Client | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [ideas, setIdeas] = useState<KeywordIdea[]>([]);
  const [demo, setDemo] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<KeywordIdea[]>([]);
  const [ranks, setRanks] = useState<
    Array<{
      id: string;
      keyword: string;
      snapshots: Array<{ position: number | null; date: string; source: string }>;
    }>
  >([]);
  const [rankInput, setRankInput] = useState("");
  const [backlinks, setBacklinks] = useState<Record<string, unknown> | null>(null);
  const [competitors, setCompetitors] = useState("");
  const [competitorResult, setCompetitorResult] = useState<{
    sharedKeywords: Array<{
      keyword: string;
      volume: number | null;
      competitorRanks: Record<string, number>;
    }>;
    demo: boolean;
  } | null>(null);
  const [audit, setAudit] = useState<{
    score: number | null;
    issues: Array<{ severity: string; message: string }>;
    demo?: boolean;
  } | null>(null);
  const [local, setLocal] = useState<{
    items: Array<{ id: string; title: string; done: boolean; hint: string }>;
    localKeywordPack: KeywordIdea[];
  } | null>(null);
  const [gsc, setGsc] = useState<{ connected: boolean; siteUrl: string | null }>({
    connected: false,
    siteUrl: null,
  });
  const [gscSite, setGscSite] = useState("");
  const [busy, setBusy] = useState(false);

  const loadClient = useCallback(async () => {
    const res = await fetch(`${API_URL}/clients/${clientId}`, {
      credentials: "include",
    });
    if (res.ok) {
      const c = (await res.json()) as Client;
      setClient(c);
      setQuery(c.industry || c.name);
      setGscSite(c.websiteUrl || "");
    }
  }, [clientId]);

  const loadSaved = useCallback(async () => {
    const res = await fetch(`${API_URL}/seo/${clientId}/keywords/saved`, {
      credentials: "include",
    });
    if (res.ok) setSaved(await res.json());
  }, [clientId]);

  const loadGsc = useCallback(async () => {
    const res = await fetch(`${API_URL}/seo/${clientId}/gsc`, {
      credentials: "include",
    });
    if (res.ok) setGsc(await res.json());
  }, [clientId]);

  useEffect(() => {
    void loadClient();
    void loadSaved();
    void loadGsc();
    if (search.get("connected") === "gsc") {
      setMessage("Search Console connected");
    }
  }, [loadClient, loadSaved, loadGsc, search]);

  async function loadDomain() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/seo/${clientId}/domain`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(formatApiError(await res.text()));
      const json = await res.json();
      setOverview(json.overview);
      if (json.overview?.demo) setDemo(true);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function searchKeywords() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(
        `${API_URL}/seo/${clientId}/keywords?q=${encodeURIComponent(query)}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error(formatApiError(await res.text()));
      const json = await res.json();
      setIdeas(json.keywords);
      setDemo(Boolean(json.demo));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  function toggle(kw: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(kw)) next.delete(kw);
      else next.add(kw);
      return next;
    });
  }

  async function saveSelected() {
    const keywords = ideas.filter((k) => selected.has(k.keyword));
    if (!keywords.length) {
      setMessage("Select at least one keyword");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/seo/${clientId}/keywords/select`, {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords }),
      });
      if (!res.ok) throw new Error(formatApiError(await res.text()));
      setMessage(`Saved ${keywords.length} keyword(s) for briefs`);
      setSelected(new Set());
      await loadSaved();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadRanks() {
    const res = await fetch(`${API_URL}/seo/${clientId}/ranks`, {
      credentials: "include",
    });
    if (res.ok) setRanks(await res.json());
  }

  async function addRank() {
    if (!rankInput.trim()) return;
    await fetch(`${API_URL}/seo/${clientId}/ranks`, {
      credentials: "include",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword: rankInput.trim() }),
    });
    setRankInput("");
    await loadRanks();
  }

  async function syncRanks() {
    setBusy(true);
    try {
      await fetch(`${API_URL}/seo/${clientId}/ranks/sync`, {
        credentials: "include",
        method: "POST",
      });
      setMessage("Rank sync queued — refresh in a few seconds");
      setTimeout(() => void loadRanks(), 2500);
    } finally {
      setBusy(false);
    }
  }

  async function loadBacklinks() {
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/seo/${clientId}/backlinks`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(formatApiError(await res.text()));
      const json = await res.json();
      setBacklinks(json.overview);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function runCompetitors() {
    const list = competitors
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 2);
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/seo/${clientId}/competitors`, {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitors: list }),
      });
      if (!res.ok) throw new Error(formatApiError(await res.text()));
      setCompetitorResult(await res.json());
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function runAudit() {
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/seo/${clientId}/audit`, {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(formatApiError(await res.text()));
      const json = await res.json();
      setAudit(json.audit);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadLocal() {
    const res = await fetch(`${API_URL}/seo/${clientId}/local-checklist`, {
      credentials: "include",
    });
    if (res.ok) setLocal(await res.json());
  }

  useEffect(() => {
    if (tab === "ranks") void loadRanks();
    if (tab === "local") void loadLocal();
  }, [tab, clientId]);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "research", label: "Research" },
    { id: "ranks", label: "Ranks" },
    { id: "backlinks", label: "Backlinks" },
    { id: "competitors", label: "Competitors" },
    { id: "audit", label: "Site health" },
    { id: "local", label: "Local" },
  ];

  return (
    <div>
      <p className="muted">
        <Link href="/seo">SEO</Link> / {client?.name ?? "…"}
      </p>
      <div className="row">
        <div>
          <h1>SEO — {client?.name ?? "Client"}</h1>
          <p className="muted">
            {client?.websiteUrl ?? "No website URL"} ·{" "}
            {client?.industry ?? "Industry n/a"}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link className="btn secondary" href={`/clients/${clientId}/report`}>
            Client report
          </Link>
          <Link
            className="btn"
            href={`/briefs/new?clientId=${clientId}&fromSeo=1`}
          >
            Create content from SEO
          </Link>
        </div>
      </div>

      {message && <div className="panel">{message}</div>}
      {demo && (
        <p className="muted">
          Showing demo SEO data until DataForSEO credentials are saved in{" "}
          <Link href="/settings">Settings</Link>.
        </p>
      )}

      <div className="filter-chips">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`btn ${tab === t.id ? "" : "secondary"}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "research" && (
        <>
          <div className="panel">
            <div className="row">
              <h2 style={{ margin: 0 }}>Domain overview</h2>
              <button className="btn secondary" disabled={busy} onClick={() => void loadDomain()}>
                Refresh domain
              </button>
            </div>
            {overview ? (
              <div className="stats" style={{ marginTop: "1rem" }}>
                {(
                  [
                    ["Organic traffic", overview.organicTraffic],
                    ["Keywords", overview.organicKeywords],
                    ["Ref. domains", overview.referringDomains],
                    ["Backlinks", overview.backlinks],
                  ] as const
                ).map(([label, value]) => (
                  <div className="stat" key={label}>
                    <div className="label">{label}</div>
                    <div className="value">
                      {value == null || value === ""
                        ? "—"
                        : String(value)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">Load domain metrics for this client’s website.</p>
            )}
          </div>

          <div className="panel">
            <h2>Keyword ideas</h2>
            <div className="row" style={{ marginBottom: "1rem" }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Seed keyword"
                style={{ flex: 1 }}
              />
              <button className="btn" disabled={busy} onClick={() => void searchKeywords()}>
                Search
              </button>
              <button
                className="btn secondary"
                disabled={busy || !selected.size}
                onClick={() => void saveSelected()}
              >
                Save selected ({selected.size})
              </button>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Keyword</th>
                    <th>Volume</th>
                    <th>Difficulty</th>
                    <th>CPC</th>
                    <th>Intent</th>
                  </tr>
                </thead>
                <tbody>
                  {ideas.map((k) => (
                    <tr key={k.keyword}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(k.keyword)}
                          onChange={() => toggle(k.keyword)}
                        />
                      </td>
                      <td>{k.keyword}</td>
                      <td>{k.volume ?? "—"}</td>
                      <td>{k.difficulty ?? "—"}</td>
                      <td>{k.cpc ?? "—"}</td>
                      <td>{k.intent ?? "—"}</td>
                    </tr>
                  ))}
                  {!ideas.length && (
                    <tr>
                      <td colSpan={6} className="muted">
                        Search to load keyword ideas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {!!saved.length && (
            <div className="panel">
              <h2>Saved for briefs</h2>
              <p className="muted">{saved.map((s) => s.keyword).join(", ")}</p>
            </div>
          )}
        </>
      )}

      {tab === "ranks" && (
        <div className="panel">
          <div className="row">
            <h2 style={{ margin: 0 }}>Rank tracker</h2>
            <button className="btn secondary" disabled={busy} onClick={() => void syncRanks()}>
              Sync from GSC
            </button>
          </div>
          <div className="panel" style={{ marginTop: "1rem" }}>
            <h3 style={{ marginTop: 0 }}>Search Console</h3>
            <p className="muted">
              Status: {gsc.connected ? `Connected (${gsc.siteUrl ?? "site"})` : "Not connected"}
            </p>
            <div className="row">
              <input
                value={gscSite}
                onChange={(e) => setGscSite(e.target.value)}
                placeholder="https://example.com/ or sc-domain:example.com"
                style={{ flex: 1 }}
              />
              <a
                className="btn"
                href={`${API_URL}/oauth/gsc/start?clientId=${clientId}&siteUrl=${encodeURIComponent(gscSite)}`}
              >
                Connect GSC
              </a>
            </div>
          </div>
          <div className="row" style={{ margin: "1rem 0" }}>
            <input
              value={rankInput}
              onChange={(e) => setRankInput(e.target.value)}
              placeholder="Add keyword to track"
              style={{ flex: 1 }}
            />
            <button className="btn" onClick={() => void addRank()}>
              Add
            </button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Keyword</th>
                  <th>Latest position</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {ranks.map((r) => (
                  <tr key={r.id}>
                    <td>{r.keyword}</td>
                    <td>{r.snapshots[0]?.position ?? "—"}</td>
                    <td className="muted">{r.snapshots[0]?.source ?? "—"}</td>
                  </tr>
                ))}
                {!ranks.length && (
                  <tr>
                    <td colSpan={3} className="muted">
                      No tracked keywords yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "backlinks" && (
        <div className="panel">
          <div className="row">
            <h2 style={{ margin: 0 }}>Backlinks</h2>
            <button className="btn" disabled={busy} onClick={() => void loadBacklinks()}>
              Refresh
            </button>
          </div>
          {backlinks ? (
            <div className="stats" style={{ marginTop: "1rem" }}>
              {(
                [
                  ["Referring domains", backlinks.referringDomains],
                  ["Backlinks", backlinks.backlinks],
                  ["New", backlinks.newLinks],
                  ["Lost", backlinks.lostLinks],
                ] as const
              ).map(([label, value]) => (
                <div className="stat" key={label}>
                  <div className="label">{label}</div>
                  <div className="value">{(value as number | null) ?? "—"}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Load backlink overview for this domain.</p>
          )}
        </div>
      )}

      {tab === "competitors" && (
        <div className="panel">
          <h2>Competitor compare</h2>
          <p className="muted">Enter 1–2 competitor domains, comma-separated.</p>
          <div className="row">
            <input
              value={competitors}
              onChange={(e) => setCompetitors(e.target.value)}
              placeholder="rival.com, otherlocal.com"
              style={{ flex: 1 }}
            />
            <button className="btn" disabled={busy} onClick={() => void runCompetitors()}>
              Compare
            </button>
          </div>
          {competitorResult && (
            <div className="table-wrap" style={{ marginTop: "1rem" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Keyword</th>
                    <th>Volume</th>
                    <th>Competitor ranks</th>
                  </tr>
                </thead>
                <tbody>
                  {competitorResult.sharedKeywords.map((row) => (
                    <tr key={row.keyword}>
                      <td>{row.keyword}</td>
                      <td>{row.volume ?? "—"}</td>
                      <td className="muted">
                        {Object.entries(row.competitorRanks)
                          .map(([d, p]) => `${d}: #${p}`)
                          .join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "audit" && (
        <div className="panel">
          <div className="row">
            <h2 style={{ margin: 0 }}>Site health</h2>
            <button className="btn" disabled={busy} onClick={() => void runAudit()}>
              Run check
            </button>
          </div>
          {audit ? (
            <>
              <p>
                Score: <strong>{audit.score ?? "—"}</strong>
                {audit.demo ? " (demo)" : ""}
              </p>
              <ul>
                {audit.issues.map((issue, i) => (
                  <li key={i}>
                    <span className="badge">{issue.severity}</span> {issue.message}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="muted">Run an on-page check for the client website.</p>
          )}
        </div>
      )}

      {tab === "local" && (
        <div className="panel">
          <h2>Local SEO checklist</h2>
          {local ? (
            <>
              <ul>
                {local.items.map((item) => (
                  <li key={item.id} style={{ marginBottom: "0.75rem" }}>
                    <strong>
                      {item.done ? "✓" : "○"} {item.title}
                    </strong>
                    <div className="muted">{item.hint}</div>
                  </li>
                ))}
              </ul>
              {!!local.localKeywordPack.length && (
                <>
                  <h3>Local keyword pack</h3>
                  <p className="muted">
                    {local.localKeywordPack.map((k) => k.keyword).join(", ")}
                  </p>
                </>
              )}
            </>
          ) : (
            <p className="muted">Loading checklist…</p>
          )}
        </div>
      )}
    </div>
  );
}
