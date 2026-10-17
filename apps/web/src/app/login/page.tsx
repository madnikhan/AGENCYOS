"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL, formatApiError } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(fd.get("email") ?? ""),
          password: String(fd.get("password") ?? ""),
        }),
      });
      if (!res.ok) throw new Error(formatApiError(await res.text()));
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setSaving(false);
    }
  }

  return (
    <div className="login-page">
      <form className="panel login-card form-grid" onSubmit={onSubmit}>
        <div>
          <p className="muted" style={{ margin: 0, letterSpacing: "0.12em", textTransform: "uppercase", fontSize: "0.75rem" }}>
            AI Digital Marketing Automation
          </p>
          <h1 style={{ marginTop: "0.35rem" }}>Agency OS</h1>
          <p className="muted">Sign in to manage clients and content.</p>
        </div>
        <label>
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="username"
            defaultValue="editor@agency.local"
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </label>
        {error && <p style={{ color: "var(--bad)", margin: 0 }}>{error}</p>}
        <button className="btn" disabled={saving}>
          {saving ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
