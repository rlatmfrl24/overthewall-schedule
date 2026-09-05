import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/admin/logs")({ beforeLoad: () => { throw redirect({ to: "/admin/history", search: { tab: "schedule" }, replace: true }); } });
