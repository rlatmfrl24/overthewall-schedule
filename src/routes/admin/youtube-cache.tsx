import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/admin/youtube-cache")({ beforeLoad: () => { throw redirect({ to: "/admin/collection", search: { source: "youtube" }, replace: true }); } });
