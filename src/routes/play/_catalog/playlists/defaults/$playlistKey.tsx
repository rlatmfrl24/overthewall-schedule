import { createFileRoute } from "@tanstack/react-router";
import { OtwPlayDefaultPlaylistPage } from "@/features/otw-play";
export const Route = createFileRoute("/play/_catalog/playlists/defaults/$playlistKey")({ component: RouteComponent });
function RouteComponent() { const { playlistKey } = Route.useParams(); return <OtwPlayDefaultPlaylistPage playlistKey={playlistKey} />; }
