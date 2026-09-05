import { OperationsHome } from "@/app/admin/operations-home";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/operations")({
  beforeLoad: ({location}) => {
    if (["resources-heading", "retention-heading", "d1-write-guard"].includes(location.hash)) throw redirect({to: "/admin/resources", hash: location.hash});
    if (["scheduled-jobs", "jobs-heading", "job-history-panel", "job-summary-panel"].includes(location.hash)) throw redirect({to: "/admin/history", search: {tab: "runs"}, hash: location.hash});
  },
  component: RouteComponent,
});

function RouteComponent() {
  return <OperationsHome />;
}
