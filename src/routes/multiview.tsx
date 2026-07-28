import { createFileRoute } from "@tanstack/react-router";
import { MultiviewPage } from "@/features/multiview";

export const Route = createFileRoute("/multiview")({
  component: MultiviewPage,
});
