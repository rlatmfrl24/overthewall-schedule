import { createFileRoute } from "@tanstack/react-router";
import { AutoUpdateSettingsManager } from "@/features/admin/auto-update-settings";

export const Route = createFileRoute("/admin/settings")({
  component: RouteComponent,
});

function RouteComponent() {
  return <AutoUpdateSettingsManager />;
}
