import { DailySchedule } from "@/components/daily-schedule";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

function RouteComponent() {
  return <DailySchedule />;
}
