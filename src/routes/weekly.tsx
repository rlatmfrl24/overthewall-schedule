import { WeeklySchedule } from "@/features/schedule-board";
import { createFileRoute } from "@tanstack/react-router";
import { useUser } from "@clerk/clerk-react";
import { useAdminStatus } from "@/features/auth";

export const Route = createFileRoute("/weekly")({
  component: RouteComponent,
});

function RouteComponent() {
  const { isLoaded, user } = useUser();
  const adminStatus = useAdminStatus(isLoaded ? user?.id : null);
  return <WeeklySchedule isAdmin={adminStatus.data?.isAdmin === true} />;
}
