import { createFileRoute } from "@tanstack/react-router";
import { OtwPlayPersonalPlaylistPage } from "@/features/otw-play";
export const Route = createFileRoute("/play/_catalog/playlists/$playlistId/")({ component: RouteComponent });
function RouteComponent() { const { playlistId } = Route.useParams(); return <OtwPlayPersonalPlaylistPage playlistId={playlistId} />; }
