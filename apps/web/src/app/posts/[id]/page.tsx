"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { API_URL } from "@/lib/api";

type Post = {
  id: string;
  platform: string;
  status: string;
  title: string | null;
  body: string | null;
  hashtags: string[];
  metaTitle: string | null;
  metaDescription: string | null;
  confidence: number | null;
  externalUrl: string | null;
  errorMessage: string | null;
  ruleDecision: { action?: string; reasons?: string[] } | null;
  client: { id: string; name: string };
  asset?: { url: string; type: string } | null;
  approvals: Array<{ action: string; note: string | null; createdAt: string }>;
  publishAttempts: Array<{
    attemptNumber: number;
    success: boolean;
    errorMessage: string | null;
  }>;
};

export default function PostDetailPage() {
  const params = useParams<{ id: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`${API_URL}/posts/${params.id}`, { credentials: "include" });
    if (res.ok) setPost(await res.json());
  }

  useEffect(() => {
    void load();
  }, [params.id]);

  async function action(path: string, body?: object) {
    const res = await fetch(`${API_URL}/posts/${params.id}/${path}`, { credentials: "include",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    setMsg(res.ok ? `OK: ${path}` : await res.text());
    await load();
  }

  if (!post) return <p className="muted">Loading…</p>;

  return (
    <div>
      <p className="muted">
        <Link href="/posts">Posts</Link> / {post.platform}
      </p>
      <h1>{post.title ?? "Post"}</h1>
      <p>
        <span className="badge">{post.status}</span> · {post.client.name}
        {post.confidence != null && ` · confidence ${post.confidence.toFixed(2)}`}
      </p>
      {msg && <div className="panel">{msg}</div>}
      <div className="panel">
        {post.body ? (
          <p style={{ whiteSpace: "pre-wrap" }}>{post.body}</p>
        ) : (
          <p className="muted">
            {post.status === "DRAFT"
              ? "Content is still generating — refresh in a few seconds. If this stays empty, open the post after Regenerate or check Settings → Claude."
              : post.errorMessage
                ? `Generation failed: ${post.errorMessage}`
                : "No body yet."}
          </p>
        )}
        {!!post.hashtags.length && (
          <p className="muted">{post.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}</p>
        )}
        {post.metaTitle && (
          <p className="muted">
            SEO: {post.metaTitle} — {post.metaDescription}
          </p>
        )}
        {post.ruleDecision && (
          <p className="muted">
            Rule: {post.ruleDecision.action} —{" "}
            {post.ruleDecision.reasons?.join("; ")}
          </p>
        )}
        {post.errorMessage && (
          <p style={{ color: "var(--bad)" }}>{post.errorMessage}</p>
        )}
        {post.externalUrl && (
          <p>
            <a href={post.externalUrl} target="_blank" rel="noreferrer">
              View published
            </a>
          </p>
        )}
        {post.asset?.url && (
          <div style={{ marginTop: 12 }}>
            {post.asset.type === "VIDEO" &&
            !post.asset.url.endsWith(".svg") ? (
              <video
                src={post.asset.url}
                controls
                style={{ maxWidth: 360, borderRadius: 12, width: "100%" }}
              />
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.asset.url}
                  alt=""
                  style={{ maxWidth: 360, borderRadius: 12 }}
                />
                {post.asset.url.endsWith(".svg") &&
                  post.platform.includes("YOUTUBE") && (
                    <p className="muted" style={{ marginTop: 8 }}>
                      Placeholder image only — Creatomate did not return a real
                      MP4. Check Settings → Creatomate API key (paste the full
                      key, not a truncated <code>…</code> value), then
                      Regenerate.
                    </p>
                  )}
              </>
            )}
          </div>
        )}
      </div>
      <div className="row" style={{ justifyContent: "flex-start", gap: "0.5rem" }}>
        {(post.status === "DRAFT" || post.status === "PENDING_APPROVAL") && (
          <>
            <button className="btn" onClick={() => void action("approve")}>
              Approve &amp; schedule
            </button>
            <button
              className="btn danger"
              onClick={() => {
                const reason = window.prompt("Reason?") ?? "Rejected";
                void action("reject", { reason });
              }}
            >
              Reject
            </button>
            <button
              className="btn secondary"
              onClick={() => void action("regenerate")}
            >
              Regenerate
            </button>
          </>
        )}
        {(post.status === "FAILED" || post.status === "SCHEDULED") && (
          <button
            className="btn"
            onClick={() => void action("retry-publish")}
          >
            Retry publish
          </button>
        )}
        {post.status === "FAILED" && (
          <button
            className="btn secondary"
            onClick={() => void action("regenerate")}
          >
            Regenerate
          </button>
        )}
      </div>
      <div className="panel" style={{ marginTop: "1.5rem" }}>
        <h3>Approvals</h3>
        {post.approvals.map((a, i) => (
          <p key={i} className="muted">
            {a.action} — {a.note ?? "—"} — {new Date(a.createdAt).toLocaleString()}
          </p>
        ))}
        <h3>Publish attempts</h3>
        {post.publishAttempts.map((a, i) => (
          <p key={i} className="muted">
            #{a.attemptNumber} {a.success ? "ok" : "fail"} {a.errorMessage ?? ""}
          </p>
        ))}
      </div>
    </div>
  );
}
