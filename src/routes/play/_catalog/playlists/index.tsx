import { createFileRoute } from "@tanstack/react-router";
import { OtwPlayPlaylistsPage } from "@/features/otw-play";
export const Route = createFileRoute("/play/_catalog/playlists/")({ component: OtwPlayPlaylistsPage });
