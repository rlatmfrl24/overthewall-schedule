import { createFileRoute } from "@tanstack/react-router";
import { YouTubeCacheManager } from "@/features/youtube";

export const Route = createFileRoute("/admin/youtube-cache")({
  component: RouteComponent,
});

function RouteComponent() {
  return <YouTubeCacheManager />;
}
