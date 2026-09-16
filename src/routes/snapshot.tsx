import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { SnapshotSchedule } from "@/features/schedule-board";
import { normalizeSnapshotDesign, type SnapshotDesign } from "@/features/schedule-board";

type SnapshotTheme = "light" | "dark";

export const Route = createFileRoute("/snapshot")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    date: string;
    mode: "grid" | "timeline";
    theme?: SnapshotTheme;
    design: SnapshotDesign;
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
    return { date, mode, theme, design: mode === "grid" ? "poster" : normalizeSnapshotDesign(search.design) };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { date, mode, theme, design } = Route.useSearch();
  return (
    <main className="h-screen w-screen overflow-auto bg-background">
      <SnapshotSchedule date={date} mode={mode} theme={theme} design={design} />
    </main>
  );
}
