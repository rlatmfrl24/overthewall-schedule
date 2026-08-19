import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/play/_catalog/songs")({
  component: RouteComponent,
});

function RouteComponent() {
  return <Outlet />;
}
