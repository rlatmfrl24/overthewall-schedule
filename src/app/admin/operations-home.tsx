import { OperationsDashboard } from "@/features/operations";
import { useXActivityStatus } from "@/features/member-posts";

export function OperationsHome() {
  const activity = useXActivityStatus();
  return <OperationsDashboard
    view="home"
    xRestPendingSources={activity.isError ? null : activity.data?.recovery?.pendingSources ?? null}
    onRefresh={() => { void activity.refetch(); }}
  />;
}
