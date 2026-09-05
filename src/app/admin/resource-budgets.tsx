import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { fetchXHistoryHealth, xReferenceHealthQueryKey } from "@/features/member-posts";
import { fetchYouTubeCacheStatus } from "@/features/youtube";
import { queryKeys } from "@/shared/query/query-keys";
import { QueryReadback } from "@/shared/ui/query-readback";
import { Button } from "@/shared/ui/button";

const dollars = (micros: number) => `$${(micros / 1_000_000).toFixed(4)}`;

export function ResourceBudgets() {
  const queryClient = useQueryClient();
  const x = useQuery({ queryKey: xReferenceHealthQueryKey, queryFn: fetchXHistoryHealth, staleTime: 30_000 });
  const youtube = useQuery({ queryKey: queryKeys.youtubeCache.status(24), queryFn: () => fetchYouTubeCacheStatus(24), staleTime: 30_000 });
  const hydration = x.data?.referenceHydration;
  const global = hydration?.globalBudget;
  const quota = youtube.data?.warmup?.quota;
  return <section aria-label="외부 서비스 예산" className="space-y-2">
    <div className="flex items-center justify-between gap-3"><h1 className="text-xl font-semibold">사용량·한도</h1><Button variant="outline" onClick={() => { void x.refetch(); void youtube.refetch(); void queryClient.refetchQueries({queryKey: queryKeys.operations.all, type: "active"}); }} disabled={x.isFetching || youtube.isFetching}>예산 상태 새로고침</Button></div>
    <div className="grid gap-3 lg:grid-cols-2">
      <article className="rounded-lg border bg-card p-3">
        <div className="flex justify-between gap-3"><h2 className="font-semibold">X 일일 예산</h2><Link to="/admin/collection" search={{source: "x"}} hash="x-collection-settings" className="underline">설정 열기</Link></div>
        <QueryReadback updatedAt={x.dataUpdatedAt} error={x.isError} fetching={x.isFetching}/>
        <p className="text-xs text-muted-foreground">UTC 기준일 {hydration?.budgetDay ?? "미확인"} · 보강 한도는 전체 한도에 포함됩니다.</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div><dt>전체 한도</dt><dd className="font-semibold">{global ? dollars(global.limitMicros) : "미확인"}</dd></div>
          <div><dt>원문·작성자 보강 한도</dt><dd className="font-semibold">{hydration ? dollars(hydration.budgetLimitMicros) : "미확인"}</dd></div>
          <div><dt>전체 사용 / 예약 / 잔여</dt><dd>{global ? `${dollars(global.usedMicros)} / ${dollars(global.reservedMicros)} / ${dollars(Math.max(0, global.limitMicros - global.usedMicros - global.reservedMicros))}` : "미확인"}</dd></div>
          <div><dt>보강 사용 / 예약 / 잔여</dt><dd>{hydration ? `${dollars(hydration.budgetUsedMicros)} / ${dollars(hydration.budgetReservedMicros)} / ${dollars(Math.max(0, hydration.budgetLimitMicros - hydration.budgetUsedMicros - hydration.budgetReservedMicros))}` : "미확인"}</dd></div>
        </dl>
      </article>
      <article className="rounded-lg border bg-card p-3">
        <div className="flex justify-between gap-3"><h2 className="font-semibold">YouTube 일일 쿼터</h2><Link to="/admin/collection" search={{source: "youtube"}} className="underline">설정 열기</Link></div>
        <QueryReadback updatedAt={youtube.dataUpdatedAt} error={youtube.isError} fetching={youtube.isFetching}/>
        <p className="text-xs text-muted-foreground">America/Los_Angeles (Pacific) 기준 · 저장된 API 사용 장부</p>
        <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">{([['한도', quota?.limit], ['사용', quota?.used], ['잔여', quota?.remaining]] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="font-semibold">{value === undefined ? "미확인" : `${value.toLocaleString('ko-KR')} units`}</dd></div>)}</dl>
        <p className="mt-3 text-xs text-muted-foreground">다음 초기화 {quota ? new Date(quota.nextResetAt).toLocaleString('ko-KR') : "미확인"}. X 금액이나 D1 행 수와 합산하지 않습니다.</p>
      </article>
    </div>
  </section>;
}
