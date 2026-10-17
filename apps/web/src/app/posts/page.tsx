import { Suspense } from "react";
import PostsList from "./PostsList";

export default function PostsPage() {
  return (
    <Suspense fallback={<p className="muted">Loading posts…</p>}>
      <PostsList />
    </Suspense>
  );
}
