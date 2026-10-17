"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api";

type Post = {
  id: string;
  platform: string;
  status: string;
  title: string | null;
  body: string | null;
  confidence: number | null;
  ruleDecision: { action?: string; reasons?: string[] } | null;
  client: { id: string; name: string };
  asset?: { url: string } | null;
};

export default function ApprovalPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch(`${API_URL}/posts/approval-queue`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      setPosts(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function approve(id: string) {
    setBusy(id);
    try {
      await fetch(`${API_URL}/posts/${id}/approve`, { credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function reject(id: string) {
    const reason = window.prompt("Rejection reason?") ?? "";
    if (!reason) return;
    setBusy(id);
    try {
      await fetch(`${API_URL}/posts/${id}/reject`, { credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h1>Review posts</h1>
      <p className="muted">
        Hybrid mode: posts land here when auto-publish rules do not pass.
        Approve to send them to connected social pages or the website blog.
      </p>
      {error && <div className="panel">{error}</div>}
      {posts.map((p) => (
        <div className="panel" key={p.id}>
          <div className="row">
            <div>
              <div className="badge pending">{p.platform}</div>{" "}
              <strong>{p.client.name}</strong>
              <h3 style={{ margin: "0.5rem 0" }}>{p.title ?? "Untitled"}</h3>
              <p style={{ whiteSpace: "pre-wrap" }}>{p.body}</p>
              {p.confidence != null && (
                <p className="muted">Confidence: {p.confidence.toFixed(2)}</p>
              )}
              {p.ruleDecision?.reasons && (
                <p className="muted">
                  Rules: {p.ruleDecision.reasons.join(" · ")}
                </p>
              )}
            </div>
            {p.asset?.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.asset.url}
                alt=""
                style={{
                  width: 160,
                  height: 160,
                  objectFit: "cover",
                  borderRadius: 10,
                }}
              />
            )}
          </div>
          <div className="row" style={{ marginTop: "1rem", justifyContent: "flex-start", gap: "0.5rem" }}>
            <button
              className="btn"
              disabled={busy === p.id}
              onClick={() => void approve(p.id)}
            >
              Approve & schedule
            </button>
            <button
              className="btn danger"
              disabled={busy === p.id}
              onClick={() => void reject(p.id)}
            >
              Reject
            </button>
            <Link className="btn secondary" href={`/posts/${p.id}`}>
              Details
            </Link>
          </div>
        </div>
      ))}
      {!posts.length && !error && (
        <div className="panel muted">
          <p style={{ marginTop: 0 }}>
            Nothing to review right now. Posts appear here after generation when
            hybrid rules require approval (or confidence is low).
          </p>
          <p style={{ marginBottom: 0 }}>
            Drafts and in-progress items stay on{" "}
            <Link href="/posts">All posts</Link>. Create new work from{" "}
            <Link href="/briefs/new">Create content</Link>.
          </p>
        </div>
      )}
    </div>
  );
}
