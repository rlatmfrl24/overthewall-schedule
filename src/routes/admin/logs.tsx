import { createFileRoute } from "@tanstack/react-router";
import { AutoUpdateLogsManager } from "@/features/audit";

export const Route = createFileRoute("/admin/logs")({
  component: RouteComponent,
});

function RouteComponent() {
  return <AutoUpdateLogsManager />;
}
