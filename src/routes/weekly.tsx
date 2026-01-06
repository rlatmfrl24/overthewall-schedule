import { WeeklySchedule } from "@/features/weekly/weekly-schedule";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/weekly")({
  component: RouteComponent,
});

function RouteComponent() {
  return <WeeklySchedule />;
}
