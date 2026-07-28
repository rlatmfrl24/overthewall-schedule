import { createFileRoute } from "@tanstack/react-router";
import { MemberPostSettingsManager } from "@/features/member-posts";

export const Route = createFileRoute("/admin/member-posts")({
  component: RouteComponent,
});

function RouteComponent() {
  return <MemberPostSettingsManager />;
}
