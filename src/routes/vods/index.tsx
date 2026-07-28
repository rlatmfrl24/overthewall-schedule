import { VodsOverview } from "@/features/media-library";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/vods/")({
  component: RouteComponent,
});

function RouteComponent() {
  return <VodsOverview />;
}
