import { Suspense } from "react";
import BriefForm from "./BriefForm";

export default function NewBriefPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <BriefForm />
    </Suspense>
  );
}
