import { OperationsDashboard } from "@/features/operations";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/operations")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OperationsDashboard />;
}
