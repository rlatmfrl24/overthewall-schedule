import { QueryReadback } from "@/shared/ui/query-readback";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader } from "@/shared/ui/card";
import { PiBroadcastBold as Webhook } from "react-icons/pi";
import type { XActivityReadback } from "../../queries/use-x-activity-status";
import { xActivityStateLabel, xActivityErrorMessage } from "../../model/x-activity-monitoring";

const money = (value: number) => `$${(value / 1_000_000).toFixed(3)}`;
const time = (value: number) => new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
export function XActivityStatusCard({ query, onRefresh, headingLevel = 2, href }: {
  query: XActivityReadback; onRefresh?: () => void; headingLevel?: 2 | 3; href?: string;
}) {
  const data = query.data, Heading = headingLevel === 2 ? "h2" : "h3";
  const previous = !!data && (query.isError || query.isFetching);
  const current = data?.sites?.find(item => item.site === data.site);
  const events = data?.events ?? [];
  const latest = events.reduce<number | null>((value, event) => value === null ? event.receivedAt : Math.max(value, event.receivedAt), null);
  return <Card role="article" className="min-w-0 gap-0 py-0 shadow-none" aria-label="현재 X 웹훅 상태">
    <CardHeader className="space-y-1 px-3 py-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Heading className="flex items-center gap-2 text-sm font-semibold"><Webhook className="size-4" />웹훅 신규 게시물</Heading>
      {onRefresh && <Button type="button" variant="outline" size="sm" disabled={query.isFetching} onClick={onRefresh}>웹훅 상태 새로고침</Button>}
      {href && <a className="text-xs underline" href={href}>웹훅 수집 상세 보기</a>}
    </div>
    <div role={query.isError ? "alert" : "status"}><Badge variant={query.isError||data?.mode==="unavailable"||data?.mode==="partial"?"destructive":"secondary"}>{query.isError ? "최신 웹훅 상태 확인 불가" : query.isPending ? "웹훅 상태 확인 중" : previous ? "웹훅 상태 갱신 중" : data ? xActivityStateLabel(data) : "웹훅 상태 미확인"}</Badge></div>
    </CardHeader>
    <CardContent className="space-y-2 px-3 pb-3 text-[13px] tabular-nums">
    {previous && <p className="text-sm text-muted-foreground">이전 확인: {xActivityStateLabel(data!)} · 아래 수치는 마지막 조회 결과입니다.</p>}
    {data && <div className="space-y-2">
      <p>이 사이트 구독 {current?.activeCount ?? 0} / 대상 {current?.targetCount ?? 0} · 공급자 고유 활성 구독 {data.providerActiveCount ?? 0}개</p>
      <p>최근 수신 {latest === null ? "아직 없음" : time(latest)}</p>
      <p>최근 수신 {events.length}건 기준 · 저장 완료 {events.filter(item => item.status === "complete").length} · 처리 대기 {events.filter(item => item.status === "pending").length} · 처리 실패 {events.filter(item => item.status === "failed").length}</p>
      {events.some(item=>item.status==="skipped"||item.status==="unavailable")&&<p>처리 제외 {events.filter(item=>item.status==="skipped").length} · 원문 미확보 {events.filter(item=>item.status==="unavailable").length}</p>}
      {data.budgetReady ? <p>양 사이트 합산 UTC 예산 {money(data.budget.usedMicros)} / {money(data.budget.limitMicros)} · 예약 {money(data.budget.reservedMicros)}</p> : <p>공통 장부 준비 전에는 유료 조회를 실행하지 않습니다.</p>}
      {data.coordinatorError && <p role="alert">{xActivityErrorMessage(data.coordinatorError)}</p>}
    </div>}
    <QueryReadback updatedAt={query.dataUpdatedAt} fetching={query.isFetching} error={query.isError} className="my-0" />
    </CardContent>
  </Card>;
}
