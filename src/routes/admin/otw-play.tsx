import { createFileRoute, redirect } from "@tanstack/react-router";
import { ConsoleScreen } from "@/app/admin/console-screen";
import { validateConsoleSearch, normalizePlayAdminSearch } from "@/shared/lib/admin-console-search";
export const Route = createFileRoute("/admin/otw-play")({
  validateSearch: validateConsoleSearch,
  beforeLoad: ({ search, location }) => {
    if (search.tab === "requests" || search.tab === "review") throw redirect({
      to: "/admin/otw-play", replace: true, hash: location.hash,
      search: normalizePlayAdminSearch(search),
    });
  },
  component: () => <ConsoleScreen area="otw-play" />,
});
