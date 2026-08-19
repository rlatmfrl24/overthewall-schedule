import { createFileRoute, Outlet } from "@tanstack/react-router";
import { OtwPlayShell } from "@/features/otw-play";

export const Route = createFileRoute("/play/_catalog")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <OtwPlayShell>
      <Outlet />
    </OtwPlayShell>
  );
}
