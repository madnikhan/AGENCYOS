"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type Integrations = {
  claudeConfigured: boolean;
  metaConfigured: boolean;
  tiktokConfigured: boolean;
  youtubeConfigured: boolean;
  falConfigured: boolean;
};

type Stats = {
  clients: number;
  pending: number;
  scheduled: number;
  published: number;
  failed: number;
  integrations?: Integrations;
};

type Post = {
  id: string;
  platform: string;
  status: string;
  title: string | null;
  body: string | null;
  client: { name: string };
};

type Client = { id: string; name: string };

export default function HomePage() {
  const [stats, setStats] = useState<Stats>({
    clients: 0,
    pending: 0,
    scheduled: 0,
    published: 0,
    failed: 0,
  });
  const [recent, setRecent] = useState<Post[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [s, posts, c] = await Promise.all([
          api<Stats>("/dashboard/stats"),
          api<Post[]>("/posts"),
          api<Client[]>("/clients"),
        ]);
        setStats(s);
        setRecent(posts.slice(0, 8));
        setClients(c);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "API unavailable");
      }
    })();
  }, []);

  const integ = stats.integrations;
  const missingKeys =
    integ &&
    (!integ.claudeConfigured ||
      !integ.metaConfigured ||
      !integ.tiktokConfigured ||
      !integ.youtubeConfigured);

  return (
    <div>
      <div className="row">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">
            Configure API keys in Settings, then open a client to connect social
            pages and website blog — works for any industry.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link className="btn secondary" href="/settings">
            Settings
          </Link>
          <Link className="btn" href="/briefs/new">
            Create content
          </Link>
        </div>
      </div>

      {error && (
        <div className="panel" style={{ borderColor: "var(--bad)" }}>
          <strong>API offline.</strong>{" "}
          <span className="muted">{error}</span>
        </div>
      )}

      {integ && (
        <div className="panel">
          <div className="row" style={{ marginBottom: "0.75rem" }}>
            <h2 style={{ margin: 0 }}>Integrations</h2>
            {missingKeys && (
              <Link className="btn" href="/settings">
                Add API keys
              </Link>
            )}
          </div>
          <div className="channel-grid">
            {(
              [
                ["Claude", integ.claudeConfigured],
                ["Meta FB/IG", integ.metaConfigured],
                ["TikTok", integ.tiktokConfigured],
                ["YouTube", integ.youtubeConfigured],
                ["Images (fal)", integ.falConfigured],
              ] as const
            ).map(([label, ok]) => (
              <div className="channel-card" key={label}>
                <strong>{label}</strong>
                <div>
                  <span className={`badge ${ok ? "ok" : "failed"}`}>
                    {ok ? "Ready" : "Needs Settings"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="steps">
        <div className="step">
          <div className="n">Step 1</div>
          <p>
            Open <strong>Settings</strong> and paste agency API keys.
          </p>
        </div>
        <div className="step">
          <div className="n">Step 2</div>
          <p>
            Open a <strong>client</strong> → Connect Facebook, Instagram,
            TikTok, YouTube.
          </p>
        </div>
        <div className="step">
          <div className="n">Step 3</div>
          <p>
            Copy the <strong>website blog script</strong> onto their site.
          </p>
        </div>
        <div className="step">
          <div className="n">Step 4</div>
          <p>
            <strong>Create content</strong> → Review → publish to connected
            channels.
          </p>
        </div>
      </div>

      <div className="stats">
        {(
          [
            ["Clients", stats.clients],
            ["To review", stats.pending],
            ["Scheduled", stats.scheduled],
            ["Published", stats.published],
            ["Failed", stats.failed],
          ] as const
        ).map(([label, value]) => (
          <div className="stat" key={label}>
            <div className="label">{label}</div>
            <div className="value">{value}</div>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="row" style={{ marginBottom: "1rem" }}>
          <h2 style={{ margin: 0 }}>Connect channels</h2>
          <Link className="btn secondary" href="/clients/new">
            Add client
          </Link>
        </div>
        {clients.length === 0 ? (
          <p className="muted">
            No clients yet.{" "}
            <Link href="/clients/new">Add a client</Link> (taxi, restaurant,
            mechanics, security — any business), then connect social pages.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td style={{ textAlign: "right" }}>
                      <Link className="btn" href={`/clients/${c.id}`}>
                        Open → Connect
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="row" style={{ marginBottom: "1rem" }}>
          <h2 style={{ margin: 0 }}>Recent posts</h2>
          <Link className="btn secondary" href="/approval">
            Review queue
          </Link>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Channel</th>
                <th>Status</th>
                <th>Title</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((p) => (
                <tr key={p.id}>
                  <td>{p.client.name}</td>
                  <td>{p.platform}</td>
                  <td>
                    <span
                      className={`badge ${
                        p.status === "PENDING_APPROVAL"
                          ? "pending"
                          : p.status === "PUBLISHED"
                            ? "published"
                            : p.status === "FAILED"
                              ? "failed"
                              : ""
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td>
                    <Link href={`/posts/${p.id}`}>
                      {p.title ?? p.body?.slice(0, 60) ?? p.id}
                    </Link>
                  </td>
                </tr>
              ))}
              {!recent.length && (
                <tr>
                  <td colSpan={4} className="muted">
                    No posts yet.
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
