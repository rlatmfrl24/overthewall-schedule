import { WeeklySchedule } from "@/features/schedule-board";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/weekly")({
  component: RouteComponent,
});

function RouteComponent() {
  return <WeeklySchedule />;
}
