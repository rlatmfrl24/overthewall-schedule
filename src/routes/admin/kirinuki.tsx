import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/admin/kirinuki")({ beforeLoad: () => { throw redirect({ to: "/admin/collection", search: { source: "kirinuki" }, replace: true }); } });
