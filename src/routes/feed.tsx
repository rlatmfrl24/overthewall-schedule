import { createFileRoute } from "@tanstack/react-router";
import { MemberPostsPage } from "@/features/member-posts/member-posts-page";

export const Route = createFileRoute("/feed")({
  component: MemberPostsPage,
});
