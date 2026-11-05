import { Suspense } from "react";
import SeoClientPage from "./SeoClientPage";

export default function ClientSeoPage() {
  return (
    <Suspense fallback={<p className="muted">Loading SEO…</p>}>
      <SeoClientPage />
    </Suspense>
  );
}
