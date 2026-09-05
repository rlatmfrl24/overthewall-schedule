import { createFileRoute, redirect } from "@tanstack/react-router";
import { ConsoleScreen } from "@/app/admin/console-screen";
import { validateConsoleSearch } from "@/shared/lib/admin-console-search";
export const Route = createFileRoute("/admin/content")({
  validateSearch: validateConsoleSearch,
  beforeLoad: ({ search, location }) => {
    if (["catalog", "operations"].includes(search.tab ?? "")) throw redirect({ to: "/admin/otw-play", search: search, hash: location.hash, replace: true });
  },
  component: () => <ConsoleScreen area="content" />,
});
