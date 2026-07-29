import { createFileRoute } from "@tanstack/react-router";
import { NoticePage } from "@/features/notices";

export const Route = createFileRoute("/notice")({
  component: NoticePage,
});
