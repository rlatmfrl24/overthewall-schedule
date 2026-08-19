import { createFileRoute } from "@tanstack/react-router";
import { OtwPlaySongDetailPage } from "@/features/otw-play";

export const Route = createFileRoute("/play/songs/$songSlug")({
  validateSearch: (search: Record<string, unknown>) => ({
    performance:
      typeof search.performance === "string" && search.performance.length > 0
        ? search.performance
        : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { songSlug } = Route.useParams();
  const { performance } = Route.useSearch();
  return <OtwPlaySongDetailPage songSlug={songSlug} highlightedPerformanceId={performance} />;
}
