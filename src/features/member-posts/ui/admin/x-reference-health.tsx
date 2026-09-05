import { MessageSquareQuote } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { useXReferenceHealth } from "../../queries/use-x-reference-health";
import { formatXEligibility, formatXTime, xReasonLabel } from "../../model/x-collection-monitoring";
import { openXSettings } from "./x-settings-navigation";

export function XReferenceHealth() {
  const query = useXReferenceHealth();
  const health = query.data?.referenceHydration;
  const stale = Boolean(query.data && (query.isError || Date.now() - query.dataUpdatedAt > 120_000));
  const label = !health ? (query.isError ? "확인 불가" : "확인 중")
    : stale ? "이전 조회 결과" : health.errors > 0 ? "재시도 확인 필요"
      : health.pendingPosts > 0 || health.pendingAuthors > 0 ? "보강 대기" : "대기 없음";
  return (
    <section className="min-w-0 space-y-4 rounded-lg border bg-background p-4" aria-label="X 원문 보강 상태">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><MessageSquareQuote className="size-4" />답글·인용 원문 보강</h3>
        <Button variant="ghost" size="sm" onClick={() => openXSettings("x-reference-settings")} aria-label="원문 보강 설정 열기">설정</Button>
      </div>
      <Badge variant={health && health.errors > 0 && !stale ? "destructive" : "secondary"}>{label}</Badge>
      {!health ? <p role="status" className="text-sm text-muted-foreground">{query.isError ? "원문 보강 상태를 확인할 수 없습니다." : "원문 보강 상태 확인 중"}</p> : <>
        {stale && <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">최신 상태를 확인하지 못했습니다. 마지막 조회 {formatXTime(query.dataUpdatedAt)}</p>}
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div><dt className="text-muted-foreground">원문 대기</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{health.pendingPosts}<span className="ml-1 text-xs font-normal">건</span></dd></div>
          <div><dt className="text-muted-foreground">작성자 대기</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{health.pendingAuthors}<span className="ml-1 text-xs font-normal">건</span></dd></div>
          <div><dt className="text-muted-foreground">가장 오래된 대기</dt><dd className="mt-1">{formatXTime(health.oldestPendingAt)}</dd></div>
          <div><dt className="text-muted-foreground">다음 보강 가능</dt><dd className="mt-1">{health.pendingPosts || health.pendingAuthors ? formatXEligibility(health.nextAttemptAt) : "대기 없음"}</dd></div>
        </dl>
        <p className="text-xs text-muted-foreground">접근 불가 {health.terminal}건 · 재시도 대상에서 제외</p>
        {health.byRelation ? <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
          {health.byRelation.map((item) => <span key={item.relation}>{item.relation === "reply" ? "답글" : "인용"}: 원문 {item.pendingPosts} · 작성자 {item.pendingAuthors} · 접근 불가 {item.terminal}</span>)}
        </div> : <p className="text-xs text-muted-foreground">답글·인용별 대기 기록 없음</p>}
        <div className="space-y-1 text-xs" role="status">
          {health.pendingReasons?.map((reason) => <p key={reason.stage + ":" + reason.code}>
            <span className="font-medium">{reason.stage === "post" ? "원문" : "작성자"} {reason.count}건</span> · {xReasonLabel(reason.code)}
            {reason.nextAttemptAt !== null && <span className="text-muted-foreground"> · {formatXEligibility(reason.nextAttemptAt)}</span>}
          </p>)}
          {!health.pendingReasons && (health.pendingPosts > 0 || health.pendingAuthors > 0) && <p>대기 사유 기록 없음</p>}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">현재 전체 대기 현황입니다. 원문과 작성자 대기는 중복될 수 있습니다. 가능 시각은 실행 예약이 아니며 다음 정규 실행에서 재확인합니다. 예산 대기는 신규 수집 실패가 아닙니다.</p>
      </>}
    </section>
  );
}
