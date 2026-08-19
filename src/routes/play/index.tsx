import { useUser } from "@clerk/clerk-react";
import { createFileRoute } from "@tanstack/react-router";
import { isAdminUser } from "@/app/admin";
import {
  OtwPlayHomePage,
  OtwPlayMemberHome,
  OtwPlayMemberShell,
  OtwPlayShell,
} from "@/features/otw-play";

export const Route = createFileRoute("/play/")({ component: RouteComponent });

function RouteComponent() {
  const { isLoaded, isSignedIn, user } = useUser();
  if (isLoaded && isSignedIn && !isAdminUser(user?.id)) {
    return (
      <OtwPlayMemberShell>
        <OtwPlayMemberHome />
      </OtwPlayMemberShell>
    );
  }
  return (
    <OtwPlayShell>
      <OtwPlayHomePage />
    </OtwPlayShell>
  );
}
