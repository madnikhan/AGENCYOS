"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type Client = {
  id: string;
  name: string;
  websiteUrl: string | null;
  industry: string | null;
  locality: string | null;
};

export default function SeoIndexPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<Client[]>("/clients")
      .then(setClients)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  return (
    <div>
      <h1>SEO research</h1>
      <p className="muted">
        Keyword research, ranks, backlinks, and site checks per client —
        powered by DataForSEO + Google Search Console. Pick a client to open
        their SEO workspace.
      </p>
      {error && <div className="panel" style={{ color: "var(--bad)" }}>{error}</div>}
      <div className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Website</th>
                <th>Industry</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td className="muted">{c.websiteUrl ?? "—"}</td>
                  <td>{c.industry ?? "—"}</td>
                  <td>
                    <Link className="btn" href={`/clients/${c.id}/seo`}>
                      Open SEO
                    </Link>
                  </td>
                </tr>
              ))}
              {!clients.length && !error && (
                <tr>
                  <td colSpan={4} className="muted">
                    No clients yet.{" "}
                    <Link href="/clients/new">Add a client</Link> first.
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
