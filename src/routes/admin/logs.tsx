import { createFileRoute } from "@tanstack/react-router";
import { AutoUpdateLogsManager } from "@/features/admin/auto-update-logs";

export const Route = createFileRoute("/admin/logs")({
  component: RouteComponent,
});

function RouteComponent() {
  return <AutoUpdateLogsManager />;
}
