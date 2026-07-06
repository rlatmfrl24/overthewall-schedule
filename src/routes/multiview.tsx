import { createFileRoute } from "@tanstack/react-router";
import { MultiviewPage } from "@/features/multiview/multiview-page";

export const Route = createFileRoute("/multiview")({
  component: MultiviewPage,
});
