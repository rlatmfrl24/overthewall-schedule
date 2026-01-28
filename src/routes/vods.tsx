import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/vods")({
  component: RouteComponent,
});

function RouteComponent() {
  return <Outlet />;
}
