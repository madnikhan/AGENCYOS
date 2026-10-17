"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/analytics", label: "Analytics" },
  { href: "/approval", label: "Review posts" },
  { href: "/clients", label: "Clients" },
  { href: "/briefs/new", label: "Create content" },
  { href: "/posts", label: "Posts" },
  { href: "/settings", label: "Settings" },
];

type User = { id: string; email: string; name: string; role: string };

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user?: User | null;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function logout() {
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    router.replace("/login");
  }

  return (
    <div className={`shell${open ? " nav-open" : ""}`}>
      <header className="topbar">
        <button
          type="button"
          className="nav-toggle"
          aria-expanded={open}
          aria-controls="app-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
        <div className="topbar-brand">
          <span>Agency OS</span>
          Reachline
        </div>
      </header>

      {open && (
        <button
          type="button"
          className="nav-backdrop"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      )}

      <aside className="nav" id="app-nav">
        <div className="brand">
          <span>Agency OS</span>
          Reachline
        </div>
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={pathname === l.href ? "active" : undefined}
            onClick={() => setOpen(false)}
          >
            {l.label}
          </Link>
        ))}
        <div className="nav-footer">
          {user && (
            <p className="muted" style={{ fontSize: "0.85rem", margin: "0 0 0.5rem" }}>
              {user.name}
            </p>
          )}
          <button type="button" className="btn secondary" onClick={() => void logout()}>
            Log out
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
