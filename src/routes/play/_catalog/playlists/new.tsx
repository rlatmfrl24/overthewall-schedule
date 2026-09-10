import { createFileRoute } from "@tanstack/react-router";
import { OtwPlayPlaylistEditorPage } from "@/features/otw-play";
export const Route = createFileRoute("/play/_catalog/playlists/new")({
  validateSearch: (search: Record<string, unknown>): { from?: string } => ({ from: typeof search.from === "string" ? search.from : undefined }),
  component: RouteComponent,
});
function RouteComponent() { const { from } = Route.useSearch(); return <OtwPlayPlaylistEditorPage from={from} />; }
