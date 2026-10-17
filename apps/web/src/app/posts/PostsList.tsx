"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { API_URL, formatApiError } from "@/lib/api";

type Post = {
  id: string;
  platform: string;
  status: string;
  title: string | null;
  body: string | null;
  errorMessage: string | null;
  client: { name: string };
  updatedAt: string;
};

const FILTERS = [
  { id: "ALL", label: "All" },
  { id: "FAILED", label: "Failed" },
  { id: "PENDING_APPROVAL", label: "Pending" },
  { id: "PUBLISHED", label: "Published" },
  { id: "DRAFT", label: "Draft" },
] as const;

function badgeClass(status: string) {
  if (status === "FAILED") return "badge failed";
  if (status === "PUBLISHED") return "badge published";
  if (status === "PENDING_APPROVAL") return "badge pending";
  return "badge";
}

export default function PostsList() {
  const search = useSearchParams();
  const generating = search.get("generating") === "1";
  const [posts, setPosts] = useState<Post[]>([]);
  const [filter, setFilter] = useState<string>("ALL");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch(`${API_URL}/posts`, { credentials: "include" });
      if (!res.ok) throw new Error(formatApiError(await res.text()));
      setPosts(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }

  useEffect(() => {
    void load();
    if (!generating) return;
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [generating]);

  const filtered = useMemo(() => {
    if (filter === "ALL") return posts;
    return posts.filter((p) => p.status === filter);
  }, [posts, filter]);

  return (
    <div>
      <h1>All posts</h1>
      {generating && (
        <div className="panel">
          <p style={{ margin: 0 }}>
            Generating drafts… This list refreshes automatically. Open a post
            when status leaves Draft, or check{" "}
            <Link href="/approval">Review posts</Link> when approval is
            required.
          </p>
        </div>
      )}
      <div className="filter-chips">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`btn ${filter === f.id ? "" : "secondary"}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      {error && <div className="panel" style={{ color: "var(--bad)" }}>{error}</div>}
      <div className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Updated</th>
                <th>Client</th>
                <th>Platform</th>
                <th>Status</th>
                <th>Content</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td className="muted">
                    {new Date(p.updatedAt).toLocaleString()}
                  </td>
                  <td>{p.client.name}</td>
                  <td>{p.platform}</td>
                  <td>
                    <span className={badgeClass(p.status)}>{p.status}</span>
                    {p.errorMessage && (
                      <div className="muted" style={{ fontSize: "0.8rem", maxWidth: 220 }}>
                        {p.errorMessage.slice(0, 80)}
                      </div>
                    )}
                  </td>
                  <td>
                    <Link href={`/posts/${p.id}`}>
                      {p.title ?? p.body?.slice(0, 80) ?? p.id}
                    </Link>
                  </td>
                </tr>
              ))}
              {!filtered.length && !error && (
                <tr>
                  <td colSpan={5} className="muted">
                    No posts in this filter.
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
