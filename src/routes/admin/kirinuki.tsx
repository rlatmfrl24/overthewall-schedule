import { KirinukiChannelManager } from "@/features/youtube";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/kirinuki")({
  component: RouteComponent,
});

function RouteComponent() {
  return <KirinukiChannelManager />;
}
