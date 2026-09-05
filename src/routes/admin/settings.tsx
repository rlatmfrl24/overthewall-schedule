import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/admin/settings")({
 validateSearch: (search: Record<string, unknown>) => ({tab: typeof search.tab === "string" ? search.tab : "review"}),
 beforeLoad: ({search}) => {
 if(search.tab === "settings") throw redirect({to: "/admin/collection", search: {source: "schedule"}, replace: true});
 if(search.tab === "runs") throw redirect({to: "/admin/history", search: {tab: "runs", source: "schedule_auto_update"}, replace: true});
 throw redirect({to: "/admin/review", search: {tab: search.tab === "rejections" ? "rejections" : "schedule"}, replace: true});
 },
});
