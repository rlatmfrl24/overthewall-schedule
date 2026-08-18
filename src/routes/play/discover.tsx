import { createFileRoute } from "@tanstack/react-router";
import { OtwPlayDiscoverPage } from "@/features/otw-play";

export const Route = createFileRoute("/play/discover")({
  component: OtwPlayDiscoverPage,
});
