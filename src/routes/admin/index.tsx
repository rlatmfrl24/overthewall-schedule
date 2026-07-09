import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/")({
  component: RouteComponent,
});

function RouteComponent() {
  return <Navigate to="/admin/operations" replace />;
}
