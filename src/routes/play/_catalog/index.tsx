import { createFileRoute } from "@tanstack/react-router";
import { OtwPlayHomePage } from "@/features/otw-play";

export const Route = createFileRoute("/play/_catalog/")({
  component: OtwPlayHomePage,
});
