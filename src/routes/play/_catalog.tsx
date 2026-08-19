import { useUser } from "@clerk/clerk-react";
import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { isAdminUser } from "@/app/admin";
import {
  OtwPlayMemberHome,
  OtwPlayMemberShell,
  OtwPlayShell,
} from "@/features/otw-play";

export const Route = createFileRoute("/play/_catalog")({
  component: RouteComponent,
});

function RouteComponent() {
  const { isLoaded, isSignedIn, user } = useUser();
  const matchRoute = useMatchRoute();
  const isPlayIndex = Boolean(matchRoute({ to: "/play", fuzzy: false }));
  if (isPlayIndex && isLoaded && isSignedIn && !isAdminUser(user?.id)) {
    return (
      <OtwPlayMemberShell>
        <OtwPlayMemberHome />
      </OtwPlayMemberShell>
    );
  }
  return (
    <OtwPlayShell>
      <Outlet />
    </OtwPlayShell>
  );
}
