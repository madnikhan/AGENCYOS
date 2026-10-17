"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type Client = {
  id: string;
  name: string;
  slug: string;
  locality: string | null;
  industry: string | null;
  _count: { posts: number; channelConnections: number };
  publishRule: { autoPublishEnabled: boolean } | null;
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<Client[]>("/clients")
      .then(setClients)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  return (
    <div>
      <div className="row">
        <div>
          <h1>Clients</h1>
          <p className="muted">
            Any local business — taxi, restaurant, mechanics, security, and
            more. Open a client to connect channels. Agency API keys live in{" "}
            <Link href="/settings">Settings</Link>.
          </p>
        </div>
        <Link className="btn" href="/clients/new">
          Add client
        </Link>
      </div>
      {error && <div className="panel">{error}</div>}
      {!clients.length && !error && (
        <div className="panel muted">
          No clients yet. Add one, then use <strong>Connect channels</strong> on
          its page.
        </div>
      )}
      <div className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Industry</th>
                <th>Locality</th>
                <th>Posts</th>
                <th>Auto-publish</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/clients/${c.id}`}>{c.name}</Link>
                  </td>
                  <td>{c.industry ?? "—"}</td>
                  <td>{c.locality ?? "—"}</td>
                  <td>{c._count.posts}</td>
                  <td>
                    {c.publishRule?.autoPublishEnabled ? "On (hybrid)" : "Off"}
                  </td>
                  <td>
                    <Link className="btn" href={`/clients/${c.id}`}>
                      Connect
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
