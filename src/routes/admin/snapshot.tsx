import { format, isValid, parseISO } from "date-fns";
import { createFileRoute } from "@tanstack/react-router";
import { SnapshotPreviewManager } from "@/features/admin/snapshot-preview-manager";

type SnapshotMode = "grid" | "timeline";
type SnapshotTheme = "light" | "dark";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const getToday = () => format(new Date(), "yyyy-MM-dd");

const normalizeDate = (value: unknown): string => {
  if (typeof value !== "string" || !DATE_REGEX.test(value)) {
    return getToday();
  }

  const parsed = parseISO(value);
  if (!isValid(parsed)) {
    return getToday();
  }

  return format(parsed, "yyyy-MM-dd") === value ? value : getToday();
};

const normalizeMode = (value: unknown): SnapshotMode => {
  if (value === "grid" || value === "timeline") {
    return value;
  }
  return "grid";
};

const normalizeTheme = (value: unknown): SnapshotTheme => {
  if (value === "light" || value === "dark") {
    return value;
  }
  return "light";
};

export const Route = createFileRoute("/admin/snapshot")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { date: string; mode: SnapshotMode; theme: SnapshotTheme } => ({
    date: normalizeDate(search.date),
    mode: normalizeMode(search.mode),
    theme: normalizeTheme(search.theme),
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = Route.useNavigate();
  const { date, mode, theme } = Route.useSearch();

  return (
    <SnapshotPreviewManager
      date={date}
      mode={mode}
      theme={theme}
      onDateChange={(nextDate) => {
        void navigate({
          search: (prev) => ({
            ...prev,
            date: nextDate,
          }),
          replace: true,
        });
      }}
      onModeChange={(nextMode) => {
        void navigate({
          search: (prev) => ({
            ...prev,
            mode: nextMode,
          }),
          replace: true,
        });
      }}
      onThemeChange={(nextTheme) => {
        void navigate({
          search: (prev) => ({
            ...prev,
            theme: nextTheme,
          }),
          replace: true,
        });
      }}
    />
  );
}
