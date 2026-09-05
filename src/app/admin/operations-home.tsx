import { useQuery } from "@tanstack/react-query";
import { OperationsDashboard } from "@/features/operations";
import { fetchXHistoryHealth, xReferenceHealthQueryKey } from "@/features/member-posts";
import { QueryReadback } from "@/shared/ui/query-readback";

export function OperationsHome() {
  const references = useQuery({queryKey: xReferenceHealthQueryKey, queryFn: fetchXHistoryHealth, staleTime: 30_000});
  const health = references.data?.referenceHydration;
  return <OperationsDashboard view="home" onRefresh={() => { void references.refetch(); }} referenceBacklog={<div className="space-y-1 text-sm">
    <div className="grid gap-x-4 gap-y-1 sm:grid-cols-3">
      {([
        ["X 원문 대기", health?.pendingPosts],
        ["작성자 대기", health?.pendingAuthors],
        ["접근 불가", health?.terminal],
      ] as const).map(([label, count]) => <p key={label} className="flex items-baseline justify-between gap-2"><span>{label}</span><strong className="whitespace-nowrap tabular-nums">{count === undefined ? "미확인" : `${count}건`}</strong></p>)}
    </div>
    <a className="text-xs text-muted-foreground underline" href="/admin/collection?source=x">보강 대기 사유 확인 →</a>
    <QueryReadback updatedAt={references.dataUpdatedAt} error={references.isError} fetching={references.isFetching} />
  </div>} />;
}
