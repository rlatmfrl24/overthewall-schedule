import { createFileRoute } from "@tanstack/react-router";
import { OtwPlaySubmissionsPage } from "@/features/otw-play";

export const Route = createFileRoute("/play/submissions")({
  component: OtwPlaySubmissionsPage,
});
