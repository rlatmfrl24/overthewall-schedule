import { createFileRoute, Outlet } from "@tanstack/react-router";
import { OtwPlayMemberShell } from "@/features/otw-play";

export const Route = createFileRoute("/play/_member")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <OtwPlayMemberShell>
      <Outlet />
    </OtwPlayMemberShell>
  );
}
