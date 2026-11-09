import { createFileRoute, redirect } from "@tanstack/react-router";
import { validateConsoleSearch } from "@/shared/lib/admin-console-search";
export const Route = createFileRoute("/admin/settings")({
 validateSearch: validateConsoleSearch,
 beforeLoad: ({search,location}) => {
 if(search.tab === "runs") throw redirect({to: "/admin/history", search: {...search,tab: "runs", source: "schedule_auto_update"}, hash:location.hash,replace: true});
 throw redirect({to: "/admin/review", search: {...search,tab: search.tab === "rejections" ? "rejections" : "schedule",source:undefined}, hash:location.hash,replace: true});
 },
});
