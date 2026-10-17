const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function formatApiError(body: string): string {
  try {
    const json = JSON.parse(body) as {
      error?: string | { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
    };
    if (typeof json.error === "string") return json.error;
    if (json.error && typeof json.error === "object") {
      const field = json.error.fieldErrors
        ? Object.entries(json.error.fieldErrors)
            .flatMap(([k, v]) => (v ?? []).map((m) => `${k}: ${m}`))
            .join("; ")
        : "";
      const form = (json.error.formErrors ?? []).join("; ");
      return field || form || body;
    }
  } catch {
    /* keep raw */
  }
  return body || "Request failed";
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(formatApiError(body) || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export { API_URL };
