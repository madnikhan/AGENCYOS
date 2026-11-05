"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { API_URL, formatApiError } from "@/lib/api";

type Report = {
  client: {
    id: string;
    name: string;
    industry: string | null;
    locality: string | null;
    websiteUrl: string | null;
  };
  period: { from: string; to: string };
  posts: Array<{
    id: string;
    platform: string;
    status: string;
    title: string | null;
    publishedAt: string | null;
  }>;
  selectedKeywords: Array<{ keyword: string; volume: number | null }>;
  ranks: Array<{
    keyword: string;
    snapshots: Array<{ position: number | null; source: string }>;
  }>;
  backlinks: {
    referringDomains: number | null;
    backlinks: number | null;
  } | null;
  audit: { score: number | null; issues: unknown } | null;
};

export default function ClientReportPage() {
  const params = useParams<{ id: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notifyMsg, setNotifyMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${API_URL}/seo/${params.id}/report`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(formatApiError(await res.text()));
        setReport(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    })();
  }, [params.id]);

  if (error) {
    return (
      <div>
        <p className="muted">
          <Link href={`/clients/${params.id}/seo`}>← SEO</Link>
        </p>
        <div className="panel" style={{ color: "var(--bad)" }}>
          {error}
        </div>
      </div>
    );
  }

  if (!report) return <p className="muted">Building report…</p>;

  const published = report.posts.filter((p) => p.status === "PUBLISHED");

  return (
    <div className="report-print">
      <p className="muted no-print">
        <Link href={`/clients/${params.id}/seo`}>← SEO</Link>
      </p>
      <div className="row">
        <div>
          <h1>{report.client.name} — monthly report</h1>
          <p className="muted">
            {report.client.industry ?? "Business"}
            {report.client.locality ? ` · ${report.client.locality}` : ""} ·{" "}
            {new Date(report.period.from).toLocaleDateString()} –{" "}
            {new Date(report.period.to).toLocaleDateString()}
          </p>
        </div>
        <div className="row no-print" style={{ gap: "0.5rem" }}>
          <button
            type="button"
            className="btn secondary"
            onClick={() => window.print()}
          >
            Print / PDF
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              void (async () => {
                try {
                  const res = await fetch(
                    `${API_URL}/seo/${params.id}/report/notify`,
                    { method: "POST", credentials: "include" }
                  );
                  if (!res.ok) throw new Error(formatApiError(await res.text()));
                  setNotifyMsg("Slack notified.");
                } catch (e) {
                  setNotifyMsg(
                    e instanceof Error ? e.message : "Notify failed"
                  );
                }
              })();
            }}
          >
            Notify Slack
          </button>
        </div>
      </div>
      {notifyMsg && (
        <p className="muted no-print" style={{ marginTop: "0.5rem" }}>
          {notifyMsg}
        </p>
      )}

      <div className="stats">
        <div className="stat">
          <div className="label">Published posts</div>
          <div className="value">{published.length}</div>
        </div>
        <div className="stat">
          <div className="label">Tracked keywords</div>
          <div className="value">{report.ranks.length}</div>
        </div>
        <div className="stat">
          <div className="label">Referring domains</div>
          <div className="value">
            {report.backlinks?.referringDomains ?? "—"}
          </div>
        </div>
        <div className="stat">
          <div className="label">Site score</div>
          <div className="value">{report.audit?.score ?? "—"}</div>
        </div>
      </div>

      <div className="panel">
        <h2>Content shipped</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Platform</th>
                <th>Status</th>
                <th>Title</th>
              </tr>
            </thead>
            <tbody>
              {report.posts.map((p) => (
                <tr key={p.id}>
                  <td>{p.platform}</td>
                  <td>{p.status}</td>
                  <td>{p.title ?? p.id}</td>
                </tr>
              ))}
              {!report.posts.length && (
                <tr>
                  <td colSpan={3} className="muted">
                    No posts this month yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h2>Keyword opportunities</h2>
        <p className="muted">
          {report.selectedKeywords.length
            ? report.selectedKeywords
                .map((k) => `${k.keyword}${k.volume ? ` (${k.volume})` : ""}`)
                .join(", ")
            : "No keywords selected for briefs yet."}
        </p>
      </div>

      <div className="panel">
        <h2>Rank snapshot</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Keyword</th>
                <th>Position</th>
              </tr>
            </thead>
            <tbody>
              {report.ranks.map((r) => (
                <tr key={r.keyword}>
                  <td>{r.keyword}</td>
                  <td>{r.snapshots[0]?.position ?? "—"}</td>
                </tr>
              ))}
              {!report.ranks.length && (
                <tr>
                  <td colSpan={2} className="muted">
                    No rank tracking yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
