"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";
import { AppShell } from "./AppShell";

type Me = { id: string; email: string; name: string; role: string };

export function AuthShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/login";
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(isLogin);

  useEffect(() => {
    if (isLogin) {
      setReady(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/me`, {
          credentials: "include",
        });
        if (!res.ok) {
          if (!cancelled) router.replace("/login");
          return;
        }
        const user = (await res.json()) as Me;
        if (!cancelled) {
          setMe(user);
          setReady(true);
        }
      } catch {
        if (!cancelled) router.replace("/login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLogin, pathname, router]);

  if (isLogin) {
    return <>{children}</>;
  }

  if (!ready) {
    return (
      <div className="auth-loading">
        <p className="muted">Checking session…</p>
      </div>
    );
  }

  return (
    <AppShell user={me}>
      {children}
    </AppShell>
  );
}
