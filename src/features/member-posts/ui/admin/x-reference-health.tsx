import { useQuery } from "@tanstack/react-query";
import { fetchXHistoryHealth } from "../../api/x-history-api";
import { queryKeys } from "@/shared/query/query-keys";

const money = (micros: number) => `$${(micros / 1_000_000).toFixed(3)}`;
const date = (timestamp: number | null) =>
  timestamp == null ? "없음" : new Date(timestamp).toLocaleString("ko-KR");

export function XReferenceHealth() {
  const query = useQuery({
    queryKey: [...queryKeys.memberPosts.all, "x-reference-health"],
    queryFn: fetchXHistoryHealth,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const health = query.data?.referenceHydration;
  return (
    <section
      className="space-y-2 rounded-md border p-3"
      aria-label="X 원문 보강 상태"
    >
      <h3 className="text-sm font-semibold">답글·인용 원문 보강</h3>
      {!health ? (
        <p className="text-sm text-muted-foreground">
          {query.isError
            ? "원문 보강 상태를 확인할 수 없습니다."
            : "원문 보강 상태 확인 중"}
        </p>
      ) : (
        <>
          <p className="text-sm" role="status">
            {health.errors > 0
              ? `재시도 확인 필요 ${health.errors}건`
              : "신규 수집과 별도로 원문을 보강합니다."}
          </p>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">원문 / 작성자 대기</dt>
              <dd>
                {health.pendingPosts} / {health.pendingAuthors}건
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">확인된 접근 불가</dt>
              <dd>{health.terminal}건</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">가장 오래된 대기</dt>
              <dd>{date(health.oldestPendingAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">다음 보강 가능 시각</dt>
              <dd>{date(health.nextAttemptAt)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">
                {health.budgetDay} UTC 미리보기 예산
              </dt>
              <dd>
                사용 {money(health.budgetUsedMicros)} · 예약{" "}
                {money(health.budgetReservedMicros)} /{" "}
                {money(health.budgetLimitMicros)}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            예산 대기는 신규 수집 실패가 아닙니다. 저장된 원문 연결은 비용 없이
            진행하며, 외부 조회는 다음 정규 실행과 UTC 예산 범위에서 재개합니다.
          </p>
        </>
      )}
    </section>
  );
}
