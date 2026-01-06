import { DailySchedule } from "@/features/daily/daily-schedule";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

function RouteComponent() {
  return <DailySchedule />;
}
