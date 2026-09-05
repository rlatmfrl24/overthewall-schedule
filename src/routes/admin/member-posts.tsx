import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/admin/member-posts")({
 validateSearch: (search: Record<string, unknown>) => ({source: search.source === "naver-cafe" ? "naver-cafe" : "x"}),
 beforeLoad: ({search, location}) => {throw redirect({to: "/admin/collection", search, hash: location.hash, replace: true});},
});
