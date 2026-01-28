import { VodsOverview } from "@/features/vods/vods-overview";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/vods/")({
  component: RouteComponent,
});

function RouteComponent() {
  return <VodsOverview />;
}
