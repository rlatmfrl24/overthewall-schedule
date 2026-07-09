import { OperationsDashboard } from "@/features/admin/operations-dashboard";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/operations")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OperationsDashboard />;
}
