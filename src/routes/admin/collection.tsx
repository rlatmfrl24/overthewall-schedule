import { createFileRoute, redirect } from "@tanstack/react-router";
import { ConsoleScreen } from "@/app/admin/console-screen";
import { validateConsoleSearch } from "@/shared/lib/admin-console-search";
export const Route = createFileRoute("/admin/collection")({
  validateSearch: validateConsoleSearch,
  beforeLoad: ({ search, location }) => {
    if (search.source === "schedule") throw redirect({ to: "/admin/review", search: { ...search, tab: "schedule", source: undefined }, hash: location.hash, replace: true });
    if (["play-monitor", "channels", "source-health"].includes(search.source ?? "")) throw redirect({ to: "/admin/otw-play", search: { ...search, tab: search.source, source: undefined }, hash: location.hash, replace: true });
  },
  component: () => <ConsoleScreen area="collection" />,
});
