import { createFileRoute } from "@tanstack/react-router";
import { MemberPostsPage } from "@/features/member-posts";

export const Route = createFileRoute("/feed")({
  component: MemberPostsPage,
});
