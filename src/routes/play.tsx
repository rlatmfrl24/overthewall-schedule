import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { OtwPlayMemberShell, OtwPlayShell } from "@/features/otw-play";

export const Route = createFileRoute("/play")({ component: RouteComponent });

function RouteComponent() {
  const pathname = useLocation().pathname;
  const memberRoute =
    pathname === "/play/submit" || pathname.startsWith("/play/submissions");
  return memberRoute ? (
    <OtwPlayMemberShell><Outlet /></OtwPlayMemberShell>
  ) : (
    <OtwPlayShell><Outlet /></OtwPlayShell>
  );
}
