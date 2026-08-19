import { createFileRoute } from "@tanstack/react-router";
import { OtwPlaySubmissionPage } from "@/features/otw-play";

export const Route = createFileRoute("/play/_member/submit")({
  component: OtwPlaySubmissionPage,
});
