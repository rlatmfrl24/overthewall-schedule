import { useUser } from "@clerk/clerk-react";
import { useAdminStatus } from "@/features/auth";
import { DailySchedule } from "@/features/schedule-board";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { isLoaded, user } = useUser();
  const adminStatusQuery = useAdminStatus(isLoaded ? user?.id : null);
  return (
    <DailySchedule
      enableAdminLiveScheduleAutoFill={adminStatusQuery.data?.isAdmin === true}
    />
  );
}
