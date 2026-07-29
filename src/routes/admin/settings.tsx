import { createFileRoute } from "@tanstack/react-router";
import { AutoUpdateSettingsManager } from "@/features/configuration";

export const Route = createFileRoute("/admin/settings")({
  component: RouteComponent,
});

function RouteComponent() {
  return <AutoUpdateSettingsManager />;
}
