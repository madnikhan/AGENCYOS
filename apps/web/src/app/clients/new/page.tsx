"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";

export default function NewClientPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") ?? ""),
      slug: String(fd.get("slug") ?? ""),
      industry: String(fd.get("industry") ?? ""),
      locality: String(fd.get("locality") ?? ""),
      websiteUrl: String(fd.get("websiteUrl") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      address: String(fd.get("address") ?? ""),
    };
    try {
      const res = await fetch(`${API_URL}/clients`, { credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const client = await res.json();
      router.push(`/clients/${client.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setSaving(false);
    }
  }

  return (
    <div>
      <h1>Add client</h1>
      <p className="muted">
        Taxi, restaurant, car mechanics, security — any local business.
      </p>
      <form className="panel form-grid" onSubmit={onSubmit}>
        <label>
          Name
          <input name="name" required placeholder="City Taxi Co" />
        </label>
        <label>
          Slug
          <input
            name="slug"
            required
            pattern="[a-z0-9-]+"
            placeholder="city-taxi"
          />
        </label>
        <label>
          Industry
          <input
            name="industry"
            list="industry-presets"
            placeholder="Taxi, Restaurant, Mechanics, Security…"
          />
          <datalist id="industry-presets">
            <option value="Taxi" />
            <option value="Restaurant" />
            <option value="Takeaway" />
            <option value="Car mechanics" />
            <option value="Security" />
            <option value="Plumbing" />
            <option value="Salon" />
            <option value="Dental" />
          </datalist>
        </label>
        <label>
          Locality
          <input name="locality" placeholder="Leeds" />
        </label>
        <label>
          Website
          <input name="websiteUrl" type="url" placeholder="https://" />
        </label>
        <label>
          Phone
          <input name="phone" />
        </label>
        <label>
          Address
          <input name="address" />
        </label>
        {error && <p style={{ color: "var(--bad)" }}>{error}</p>}
        <button className="btn" disabled={saving}>
          {saving ? "Saving…" : "Create client"}
        </button>
      </form>
    </div>
  );
}
