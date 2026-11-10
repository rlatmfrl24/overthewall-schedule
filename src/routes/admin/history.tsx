import { createFileRoute, redirect } from "@tanstack/react-router";
import { ConsoleScreen } from "@/app/admin/console-screen";
import { validateConsoleSearch } from "@/shared/lib/admin-console-search";
export const Route = createFileRoute("/admin/history")({
  validateSearch: validateConsoleSearch,
  beforeLoad: ({ search }) => {
    if (search.tab === "audit") throw redirect({ to: "/admin/history", search: { tab: "runs" }, replace: true });
  },
  component: () => <ConsoleScreen area="history" />,
});
