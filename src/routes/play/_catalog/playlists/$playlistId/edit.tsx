import { createFileRoute } from "@tanstack/react-router";
import { OtwPlayPlaylistEditorPage } from "@/features/otw-play";
export const Route = createFileRoute("/play/_catalog/playlists/$playlistId/edit")({ component: RouteComponent });
function RouteComponent() { const { playlistId } = Route.useParams(); return <OtwPlayPlaylistEditorPage playlistId={playlistId} />; }
