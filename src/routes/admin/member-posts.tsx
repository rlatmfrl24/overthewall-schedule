import { createFileRoute } from "@tanstack/react-router";
import { MemberPostSettingsManager } from "@/features/admin/member-post-settings";

export const Route = createFileRoute("/admin/member-posts")({
  component: RouteComponent,
});

function RouteComponent() {
  return <MemberPostSettingsManager />;
}
