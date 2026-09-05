import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/admin/ddays")({ beforeLoad: () => { throw redirect({ to: "/admin/content", search: { tab: "ddays" }, replace: true }); } });
