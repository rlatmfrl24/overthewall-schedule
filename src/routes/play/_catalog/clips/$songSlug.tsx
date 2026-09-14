import { createFileRoute } from "@tanstack/react-router";
import { OtwPlaySongDetailPage } from "@/features/otw-play";

export const Route = createFileRoute("/play/_catalog/clips/$songSlug")({
  validateSearch: (search: Record<string, unknown>) => ({ performance: typeof search.performance === "string" ? search.performance : undefined }),
  component: ClipDetail,
});
function ClipDetail() {
  const { songSlug } = Route.useParams();
  const { performance } = Route.useSearch();
  return <OtwPlaySongDetailPage songSlug={songSlug} highlightedPerformanceId={performance} clipMode />;
}
