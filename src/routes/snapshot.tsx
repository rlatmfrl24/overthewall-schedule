import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { SnapshotSchedule } from "@/features/daily/snapshot/snapshot-schedule";

export const Route = createFileRoute("/snapshot")({
  validateSearch: (
    search: Record<string, unknown>
  ): { date: string; mode: "grid" | "timeline" } => {
    const date =
      typeof search.date === "string" && search.date.trim().length > 0
        ? search.date
        : format(new Date(), "yyyy-MM-dd");
    const mode: "grid" | "timeline" =
      search.mode === "grid" || search.mode === "timeline"
        ? search.mode
        : "timeline";
    return { date, mode };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { date, mode } = Route.useSearch();
  return <SnapshotSchedule date={date} mode={mode} />;
}
