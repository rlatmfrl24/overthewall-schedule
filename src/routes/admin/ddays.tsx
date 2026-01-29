import { createFileRoute } from "@tanstack/react-router";
import { DDayManager } from "@/features/admin/dday-manager";

export const Route = createFileRoute("/admin/ddays")({
  component: RouteComponent,
});

function RouteComponent() {
  return <DDayManager />;
}
