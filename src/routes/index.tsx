import { useUser } from "@clerk/clerk-react";
import { isAdminUser } from "@/app/admin";
import { DailySchedule } from "@/features/schedule-board";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { isLoaded, user } = useUser();
  return (
    <DailySchedule
      enableAdminLiveScheduleAutoFill={isLoaded && isAdminUser(user?.id)}
    />
  );
}
