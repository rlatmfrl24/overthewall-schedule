import { createFileRoute } from "@tanstack/react-router";
import { OtwPlayCatalogManager } from "@/features/otw-play";

export const Route = createFileRoute("/admin/otw-play")({
  component: OtwPlayCatalogManager,
});
