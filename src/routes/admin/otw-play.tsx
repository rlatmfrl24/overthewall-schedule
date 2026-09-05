import { createFileRoute } from "@tanstack/react-router";
import { ConsoleScreen } from "@/app/admin/console-screen";
import { validateConsoleSearch } from "@/shared/lib/admin-console-search";
export const Route = createFileRoute("/admin/otw-play")({
  validateSearch: validateConsoleSearch,
  component: () => <ConsoleScreen area="otw-play" />,
});
