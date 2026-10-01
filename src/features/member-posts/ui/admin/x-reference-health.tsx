import { PiChatTeardropTextBold as MessageSquareQuote } from "react-icons/pi";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader } from "@/shared/ui/card";
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
    <Card className="min-w-0 gap-0 py-0 shadow-none" aria-label="X 원문 보강 상태">
      <CardHeader className="px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><MessageSquareQuote className="size-4" />{health?.replyPolicy === "stored_or_link" ? "인용 원문 보강" : "답글·인용 원문 보강"}</h2>
        <Button variant="ghost" size="sm" onClick={() => openXSettings("x-reference-settings")} aria-label="원문 보강 설정 열기">설정</Button>
      </div>
      <Badge className="w-fit" variant={health && health.errors > 0 && !stale ? "destructive" : "secondary"}>{label}</Badge>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 px-3 pb-3">
      {!health ? <p role="status" className="text-sm text-muted-foreground">{query.isError ? "원문 보강 상태를 확인할 수 없습니다." : "원문 보강 상태 확인 중"}</p> : <>
        {stale && <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">최신 상태를 확인하지 못했습니다. 마지막 조회 {formatXTime(query.dataUpdatedAt)}</p>}
        <dl className="grid grid-cols-2 items-baseline gap-x-4 gap-y-3 text-[13px] tabular-nums">
          <div><dt className="text-xs text-muted-foreground">원문 대기</dt><dd className="mt-1 text-xl font-semibold">{health.pendingPosts}<span className="ml-1 text-xs font-normal">건</span></dd></div>
          <div><dt className="text-xs text-muted-foreground">작성자 대기</dt><dd className="mt-1 text-xl font-semibold">{health.pendingAuthors}<span className="ml-1 text-xs font-normal">건</span></dd></div>
          <div><dt className="text-xs text-muted-foreground">가장 오래된 대기</dt><dd className="mt-1 font-medium">{formatXTime(health.oldestPendingAt)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">다음 보강 가능</dt><dd className="mt-1 break-keep font-medium">{health.pendingPosts || health.pendingAuthors ? formatXEligibility(health.nextAttemptAt) : "대기 없음"}</dd></div>
        </dl>
        <details className="mt-auto border-t pt-2 text-[13px]">
        <summary className="cursor-pointer focus-visible:outline-2 focus-visible:outline-ring">진단 상세 · 접근 불가 {health.terminal}건 · 오류 {health.errors}건</summary>
        <div className="space-y-3 pt-3">
        {health.byRelation ? <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
          {health.byRelation.filter((item) => item.relation === "quote" || health.replyPolicy !== "stored_or_link").map((item) => <span key={item.relation}>{item.relation === "reply" ? "답글" : "인용"}: 원문 {item.pendingPosts} · 작성자 {item.pendingAuthors} · 접근 불가 {item.terminal}</span>)}
        </div> : <p className="text-xs text-muted-foreground">답글·인용별 대기 기록 없음</p>}
        {health.replyPolicy === "stored_or_link" && <div className="space-y-1 text-[13px]" aria-label="답글 표시 상태">
          <p className="font-medium">답글 표시</p>
          {health.replyDisplay ? <p>미리보기 있음 {health.replyDisplay.withPreview}건 · 관계 표시 {health.replyDisplay.linkOnly}건 · 접근 불가 {health.replyDisplay.terminal}건</p> : <p>답글 표시 건수 확인 불가</p>}
        </div>}
        <div className="space-y-1 text-[13px]" role="status">
          {health.pendingReasons?.map((reason) => <p key={reason.stage + ":" + reason.code}>
            <span className="font-medium">{reason.stage === "post" ? "원문" : "작성자"} {reason.count}건</span> · {xReasonLabel(reason.code)}
            {reason.nextAttemptAt !== null && <span className="text-muted-foreground"> · {formatXEligibility(reason.nextAttemptAt)}</span>}
          </p>)}
          {!health.pendingReasons && (health.pendingPosts > 0 || health.pendingAuthors > 0) && <p>대기 사유 기록 없음</p>}
        </div>
        </div>
        </details>
      </>}
      </CardContent>
    </Card>
  );
}
