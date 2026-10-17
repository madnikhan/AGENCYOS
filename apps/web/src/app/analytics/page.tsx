"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type Engagement = {
  impressions?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  views?: number;
  fetchedAt: string;
  source: string;
  unavailableReason?: string;
};

type Summary = {
  windowDays: number;
  byStatus: Record<string, number>;
  byPlatform: Record<string, number>;
  byClient: Array<{ clientId: string; name: string; count: number }>;
  publishSuccess: number;
  publishFailed: number;
  engagement: Array<{
    postId: string;
    title: string | null;
    platform: string;
    clientName: string;
    externalUrl: string | null;
    engagement: Engagement;
  }>;
};

export default function AnalyticsPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const summary = await api<Summary>(
        `/analytics/summary${refresh ? "?refresh=1" : ""}`
      );
      setData(summary);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  return (
    <div>
      <div className="row">
        <div>
          <h1>Analytics</h1>
          <p className="muted">
            Funnel from your database plus live engagement for published Meta /
            YouTube posts (TikTok when scopes allow).
          </p>
        </div>
        <button
          type="button"
          className="btn secondary"
          disabled={loading}
          onClick={() => void load(true)}
        >
          {loading ? "Refreshing…" : "Refresh insights"}
        </button>
      </div>

      {error && (
        <div className="panel" style={{ color: "var(--bad)" }}>
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="stats">
            {(
              [
                ["Published", data.publishSuccess],
                ["Failed", data.publishFailed],
                ["Pending", data.byStatus.PENDING_APPROVAL ?? 0],
                ["Draft", data.byStatus.DRAFT ?? 0],
                ["Scheduled", data.byStatus.SCHEDULED ?? 0],
              ] as const
            ).map(([label, value]) => (
              <div className="stat" key={label}>
                <div className="label">{label}</div>
                <div className="value">{value}</div>
              </div>
            ))}
          </div>

          <div className="panel">
            <h2>By platform</h2>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Platform</th>
                    <th>Posts</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.byPlatform).map(([platform, count]) => (
                    <tr key={platform}>
                      <td>{platform}</td>
                      <td>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <h2>Clients (last {data.windowDays} days)</h2>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Posts</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byClient.map((c) => (
                    <tr key={c.clientId}>
                      <td>
                        <Link href={`/clients/${c.clientId}`}>{c.name}</Link>
                      </td>
                      <td>{c.count}</td>
                    </tr>
                  ))}
                  {!data.byClient.length && (
                    <tr>
                      <td colSpan={2} className="muted">
                        No posts in this window.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <h2>Live engagement</h2>
            <p className="muted">
              Cached ~15 minutes. Refresh to pull latest from connected
              platforms.
            </p>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Post</th>
                    <th>Platform</th>
                    <th>Views / impressions</th>
                    <th>Likes</th>
                    <th>Comments</th>
                    <th>Shares</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {data.engagement.map((row) => {
                    const e = row.engagement;
                    return (
                      <tr key={row.postId}>
                        <td>
                          <Link href={`/posts/${row.postId}`}>
                            {row.title ?? row.postId.slice(0, 8)}
                          </Link>
                          <div className="muted">{row.clientName}</div>
                        </td>
                        <td>{row.platform}</td>
                        <td>{e.views ?? e.impressions ?? "—"}</td>
                        <td>{e.likes ?? "—"}</td>
                        <td>{e.comments ?? "—"}</td>
                        <td>{e.shares ?? "—"}</td>
                        <td className="muted">
                          {e.unavailableReason ??
                            (row.externalUrl ? (
                              <a href={row.externalUrl} target="_blank" rel="noreferrer">
                                Open
                              </a>
                            ) : (
                              e.source
                            ))}
                        </td>
                      </tr>
                    );
                  })}
                  {!data.engagement.length && (
                    <tr>
                      <td colSpan={7} className="muted">
                        No published social posts with external IDs yet. Connect
                        channels and publish, then refresh.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
