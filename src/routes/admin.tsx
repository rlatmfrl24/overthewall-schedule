import { createFileRoute } from "@tanstack/react-router";
import { AdminGate } from "@/app/admin";

export const Route = createFileRoute("/admin")({
  component: AdminGate,
});
