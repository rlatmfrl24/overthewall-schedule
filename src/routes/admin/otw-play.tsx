import { createFileRoute, redirect } from "@tanstack/react-router";
import { ConsoleScreen } from "@/app/admin/console-screen";
import { validateConsoleSearch, normalizePlayAdminSearch } from "@/shared/lib/admin-console-search";
export const Route = createFileRoute("/admin/otw-play")({
  validateSearch: validateConsoleSearch,
  beforeLoad: ({ search, location }) => {
    const legacyChannelAnchor = search.tab === "operations" && !search.view && location.hash.replace(/^#/, "") === "play-channels";
    const normalized = normalizePlayAdminSearch(legacyChannelAnchor ? { ...search, view: "channels" } : search);
    if (normalized !== search) throw redirect({
      to: "/admin/otw-play", replace: true,
      hash: legacyChannelAnchor ? undefined : location.hash,
      search: normalized,
    });
  },
  component: () => <ConsoleScreen area="otw-play" />,
});
