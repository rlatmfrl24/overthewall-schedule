import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/play")({ component: RouteComponent });

function RouteComponent() {
  return <Outlet />;
}
