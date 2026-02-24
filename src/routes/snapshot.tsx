import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { SnapshotSchedule } from "@/features/daily/snapshot/snapshot-schedule";

type SnapshotTheme = "light" | "dark";

export const Route = createFileRoute("/snapshot")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    date: string;
    mode: "grid" | "timeline";
    theme?: SnapshotTheme;
  } => {
    const date =
      typeof search.date === "string" && search.date.trim().length > 0
        ? search.date
        : format(new Date(), "yyyy-MM-dd");
    const mode: "grid" | "timeline" =
      search.mode === "grid" || search.mode === "timeline"
        ? search.mode
        : "timeline";
    const theme: SnapshotTheme | undefined =
      search.theme === "light" || search.theme === "dark"
        ? search.theme
        : undefined;
    return { date, mode, theme };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { date, mode, theme } = Route.useSearch();
  return <SnapshotSchedule date={date} mode={mode} theme={theme} />;
}
