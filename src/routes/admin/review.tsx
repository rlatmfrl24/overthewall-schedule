import { createFileRoute, redirect } from "@tanstack/react-router";
import { ConsoleScreen } from "@/app/admin/console-screen";
import { validateConsoleSearch } from "@/shared/lib/admin-console-search";
export const Route = createFileRoute("/admin/review")({
  validateSearch: validateConsoleSearch,
  beforeLoad: ({ search, location }) => {
    if (search.tab === "rejections") throw redirect({to:"/admin/review",search:{...search,tab:"schedule",state:"rejections"},hash:location.hash,replace:true});
    if (["automatic-review", "review", "import"].includes(search.tab ?? "")) throw redirect({ to: "/admin/otw-play", search: search, hash: location.hash, replace: true });
  },
  component: () => <ConsoleScreen area="review" />,
});
