import { useState } from "react";
import { PiCaretDownBold as ChevronDown, PiFileTextBold as FileText, PiWalletBold as Wallet } from "react-icons/pi";
import type { OperationRunDto, XCollectionOperationItemDto } from "@contracts/scheduled-operations";
import type { XReferenceHydrationHealthDto } from "@contracts/x-posts";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader } from "@/shared/ui/card";
import { Progress } from "@/shared/ui/progress";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/shared/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import type { OperationsStatusResponse } from "@/features/operations";
import { useXReferenceHealth } from "../../queries/use-x-reference-health";
import { useXActivityStatus } from "../../queries/use-x-activity-status";
import { formatXEligibility, formatXTime, xCollectionItemLabel, xCollectionStatusText, xCollectionResultText, xHydrationResultText, xReasonLabel } from "../../model/x-collection-monitoring";
import { openXSettings } from "./x-settings-navigation";
import { XReferenceHealth } from "./x-reference-health";

const money = (micros: number) => "$" + (micros / 1_000_000).toFixed(3);
const statusLabel = (status: string) => ({
  queued: "대기", running: "실행 중", succeeded: "성공", success: "성공",
  partial: "일부 실패", failed: "실패", skipped: "건너뜀", throttled: "제한됨",
}[status] ?? status);
const failed = (status: string) => ["failed", "partial", "throttled"].includes(status);
const runType = (run: OperationRunDto) => run.summary?.xCollectionScope === "pending" ? "이월 복구" : run.source === "manual" ? "수동" : "정기";

function BudgetRow({ title, used, reserved, limit }: { title: string; used: number; reserved: number; limit: number }) {
  const percent = limit > 0 ? Math.min(100, Math.round((used + reserved) / limit * 100)) : 0;
  return <div className="space-y-2">
    <div className="flex flex-wrap items-baseline justify-between gap-2 text-[13px]"><span className="font-medium">{title}</span><span className="tabular-nums">{percent}% · 한도 {money(limit)}</span></div>
    <Progress value={percent} aria-label={title}
      aria-valuetext={"사용 " + money(used) + ", 예약 " + money(reserved) + ", 한도 " + money(limit)}
      className="h-2 bg-muted" />
    <dl className="grid grid-cols-3 gap-2 tabular-nums">
      {([["사용", used], ["예약", reserved], ["잔여", Math.max(0, limit - used - reserved)]] as const).map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-medium">{money(value)}</dd></div>)}
    </dl>
  </div>;
}

export function XCollectionBudget({ health }: { health: XReferenceHydrationHealthDto | undefined }) {
  const global = health?.globalBudget;
  return <Card aria-label="X 예산" className="gap-0 py-0 shadow-none">
    <CardHeader className="px-3 py-2"><h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold"><Wallet className="size-4" />X API 예산 <span className="text-xs font-normal text-muted-foreground">{health ? health.budgetDay + " UTC" : "확인 중"}</span></h2></CardHeader>
    <CardContent className="space-y-2 px-3 pb-3">
    <div className="grid gap-4 md:grid-cols-2">
      {global ? <BudgetRow title={health.sharedBudget?"양 사이트 합산 X 예산":"전체 X 예산"} used={global.usedMicros} reserved={global.reservedMicros} limit={global.limitMicros} /> : <p className="text-sm text-muted-foreground">공통 예산 정보 확인 불가 · 유료 조회 중지</p>}
      {health ? <BudgetRow title="원문 보강 한도 · 전체 예산에 포함" used={health.budgetUsedMicros} reserved={health.budgetReservedMicros} limit={health.budgetLimitMicros} /> : <p className="text-sm text-muted-foreground">원문 보강 예산 정보 확인 불가</p>}
    </div>
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-t pt-2">
      <p className="text-xs text-muted-foreground">보강 예산은 전체에 포함 · UTC 자정 초기화</p>
      {global && health && <p className="text-[13px]">보강 가능 <strong className="tabular-nums">{money(Math.max(0, Math.min(global.limitMicros - global.usedMicros - global.reservedMicros, health.budgetLimitMicros - health.budgetUsedMicros - health.budgetReservedMicros)))}</strong></p>}
    </div>
    </CardContent>
  </Card>;
}

export function XCollectionOverview({ operations, loading, error, latestRun, runsLoading, runsError, runsUpdatedAt, enabled, onRunPending, isRunning }: {
  operations: OperationsStatusResponse | null; loading: boolean; error: boolean;
  latestRun: OperationRunDto | undefined; runsLoading: boolean; runsError: boolean; runsUpdatedAt: number; enabled: boolean;
  onRunPending?: () => void; isRunning?: boolean;
}) {
  const query = useXReferenceHealth();
  const activity=useXActivityStatus();
  const recoveryBudget=activity.data?.recovery?.budget;
  const x = operations?.xCollection;
  const items = latestRun?.xCollection?.items ?? [];
  const known = items.filter((item) => item.collection !== null);
  const stale = Boolean(latestRun && (runsError || Date.now() - runsUpdatedAt > 120_000));
  const state = runsLoading ? "확인 중" : runsError || stale ? "최신 결과 확인 불가"
    : !latestRun ? "실행 이력 없음"
      : latestRun.status === "queued" || latestRun.status === "running" ? statusLabel(latestRun.status)
        : xCollectionStatusText(latestRun);
  return <div className="space-y-3">
    <div className="grid items-stretch gap-3 md:grid-cols-2">
      <Card aria-label="X REST 누락 복구 상태" className="min-w-0 gap-0 py-0 shadow-none">
        <CardHeader className="px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><FileText className="size-4" />REST 누락 복구</h2>
          <Button variant="ghost" size="sm" onClick={() => openXSettings("x-collection-settings")} aria-label="게시물 수집 설정 열기">설정</Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant={!stale && known.some((item) => item.collection?.status === "failed") ? "destructive" : "secondary"}>{state}</Badge>
        </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3 px-3 pb-3">
        {stale && <p role="alert" className="text-xs text-amber-700 dark:text-amber-300">이전 조회 결과입니다. 마지막 조회 {formatXTime(runsUpdatedAt)}</p>}
        <dl className="grid grid-cols-2 items-baseline gap-x-4 gap-y-3 text-[13px] tabular-nums">
          <div><dt className="text-xs text-muted-foreground">최근 실행 저장</dt><dd className="mt-1 text-xl font-semibold">{known.length ? known.reduce((sum, item) => sum + item.collection!.postsStored, 0) : "—"}<span className="ml-1 text-xs font-normal">건</span></dd></div>
          <div><dt className="text-xs text-muted-foreground">실행 유형</dt><dd className="mt-1 font-medium">{latestRun ? runType(latestRun) : "기록 없음"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">최근 실행</dt><dd className="mt-1 font-medium">{formatXTime(latestRun?.startedAt ?? latestRun?.acceptedAt)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">다음 수집 가능</dt><dd className="mt-1 break-keep font-medium">{!enabled ? "자동 수집 중지" : error || loading || !x ? "확인 불가" : formatXEligibility(x.nextEligibleAt)}</dd></div>
        </dl>
        {Array.from(new Set(known.flatMap((item) => item.collection?.error ? [item.collection.error] : []))).map((reason) => <p key={reason} className="text-[13px]">{xReasonLabel(reason)}</p>)}
        <section aria-label="REST 실행 전 예산" className="space-y-2 border-t pt-2 text-[13px]">
          <h3 className="font-medium">REST 실행 전 예산{recoveryBudget?` · ${recoveryBudget.day} UTC`:""}</h3>
          {activity.isError&&<p role="alert">REST 예산 산정 최신 조회 실패{recoveryBudget?" · 아래는 이전 조회값입니다.":""}</p>}
          {!activity.isError&&activity.isFetching&&recoveryBudget&&<p className="text-muted-foreground">REST 예산 갱신 중 · 아래는 이전 조회값입니다.</p>}
          {recoveryBudget?<>
            <div className="grid gap-1 sm:grid-cols-2"><p>공통 첫 페이지 예상 예약 <strong>{money(recoveryBudget.firstPagesMicros)}</strong></p><p>사용 가능 <strong>{money(recoveryBudget.availableMicros)}</strong></p></div>
            <p>사이트 보호 예약 {money(recoveryBudget.siteFirstPagesMicros)}</p>
            <p>대상 {recoveryBudget.targetCount}개 · 신규 스캔 계정당 {recoveryBudget.pageSize}개 · 기본 페이지 예약 {money(recoveryBudget.perPageMicros)}</p>
            {!!activity.data?.recovery?.pendingSources&&<div className="space-y-1"><p>이월 커서 {activity.data.recovery.pendingSources}개는 계정당 {recoveryBudget.continuationPageSize}개 요청으로 포함했습니다.</p><p>다음 페이지당 공통 예약 {money(recoveryBudget.perPageMicros * recoveryBudget.continuationPageSize / recoveryBudget.pageSize)} (계정 갱신·보강 별도)</p><Button variant="outline" size="sm" onClick={onRunPending} disabled={!onRunPending || !enabled || isRunning || activity.isError || activity.isFetching || recoveryBudget.sharedRemainingMicros < recoveryBudget.perPageMicros * recoveryBudget.continuationPageSize / recoveryBudget.pageSize}>미완료 페이지만 복구</Button></div>}
            <p className="text-muted-foreground">공통 잔여 {money(recoveryBudget.sharedRemainingMicros)} · 사이트 보호 잔여 {money(recoveryBudget.siteRemainingMicros)} · 계정 캐시 갱신 상한 {money(recoveryBudget.identityMicros)} 포함</p>
            {!activity.isError&&!activity.isFetching&&(recoveryBudget.firstPagesMicros>recoveryBudget.sharedRemainingMicros||recoveryBudget.siteFirstPagesMicros>recoveryBudget.siteRemainingMicros)&&<p role="alert">공통 또는 사이트 예상 예약액이 해당 잔여액보다 큽니다. 실제 요청별 잔여 예산을 확인하며 진행합니다.</p>}
          </>:<p>{activity.isPending?"REST 예산 산정 중":"REST 필요액·잔여액 확인 불가 · 웹훅 상태와 공통 장부를 새로고침해주세요."}</p>}
          <p className="text-xs text-muted-foreground">조회 시점의 첫 요청 예약 합계이며 한 번에 차감하는 금액이 아닙니다. 공통·사이트 기준을 각각 비교하고 별도 배정 없이 요청별 예약·정산합니다. 유효한 계정 캐시는 재조회하지 않으며 실제 비용은 응답량에 따라 다릅니다. 추가 페이지·인용 원문 보강 비용은 별도입니다.</p>
        </section>
        <p className="mt-auto border-t pt-2 text-[13px]"><span className="mr-2 text-xs text-muted-foreground">REST 누락 복구</span>{error || loading || !x ? "설정 확인 불가" : (enabled ? "활성" : "중지") + " · " + x.intervalHours + "시간 주기"}</p>
        </CardContent>
      </Card>
      <XReferenceHealth />
    </div>
    <XCollectionBudget health={query.data?.referenceHydration} />
    {query.isError && <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">예산·대기 상태 최신 조회 실패{query.data ? " · 마지막으로 조회한 값을 표시합니다." : ""}</p>}
  </div>;
}

export function XUsageChart({ usage, error, hours }: { usage: OperationsStatusResponse["xCollection"]["usage"] | undefined; error: boolean; hours: number }) {
  const rows = [...(usage?.byOperation ?? [])].sort((a, b) => b.apiCalls - a.apiCalls);
  return <Card className="min-w-0 gap-0 py-0 shadow-none">
    <CardHeader className="px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">작업별 X API 호출</h2>
        <span className="text-xs text-muted-foreground">최근 {hours}시간 · {usage ? `${usage.apiCalls}회 · 추정 ${money(usage.estimatedCostMicros)}` : "미확인"}</span>
      </div>
    </CardHeader>
    <CardContent className="space-y-2 px-3 pb-3">
      {error && <p role="alert" className="text-xs text-destructive">사용량 조회 실패{usage ? " · 이전 조회 결과" : ""}</p>}
      {!usage ? <p className="py-3 text-sm text-muted-foreground">API 사용량을 확인할 수 없습니다.</p> : rows.length === 0 ? <p className="py-3 text-sm text-muted-foreground">{usage.apiCalls === 0 ? "조회 기간에 기록된 API 호출이 없습니다." : "작업별 호출 내역 미기록"}</p> : <>
        <ChartContainer config={{ apiCalls: { label: "API 호출 수", color: "var(--chart-1)" } }} className="h-44 w-full aspect-auto" aria-label={`최근 ${hours}시간 작업별 X API 호출 수`}>
          <BarChart data={rows} layout="vertical" accessibilityLayer margin={{left: 0, right: 32, top: 4, bottom: 0}}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="operation" width={145} tickLine={false} axisLine={false} interval={0} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="apiCalls" fill="var(--color-apiCalls)" barSize={16} isAnimationActive={false}><LabelList dataKey="apiCalls" position="right" className="fill-foreground" /></Bar>
          </BarChart>
        </ChartContainer>
        <details className="text-xs"><summary className="cursor-pointer py-1 focus-visible:outline-2 focus-visible:outline-ring">호출·비용 상세</summary>
          <Table className="text-xs"><TableHeader><TableRow><TableHead>작업</TableHead><TableHead className="text-right">호출</TableHead><TableHead className="text-right">추정 비용</TableHead><TableHead className="text-right">실패</TableHead><TableHead className="text-right">호출 제한</TableHead></TableRow></TableHeader>
            <TableBody>{rows.map((row) => <TableRow key={row.operation}><TableCell>{row.operation}</TableCell><TableCell className="text-right">{row.apiCalls}</TableCell><TableCell className="text-right">{money(row.estimatedCostMicros)}</TableCell><TableCell className="text-right">{row.failureCount}</TableCell><TableCell className="text-right">{row.rateLimitCount}</TableCell></TableRow>)}</TableBody>
          </Table>
          <p className="pt-2 text-muted-foreground">강제 새로고침 경로: {usage.forceRefreshPaths.map((item) => `${item.label} ${item.apiCalls}회`).join(" · ") || "기록 없음"}</p>
        </details>
      </>}
    </CardContent>
  </Card>;
}

function ItemResult({ item }: { item: XCollectionOperationItemDto }) {
  const h = item.referenceHydration;
  const c = item.collection;
  return <li className="space-y-3 rounded-md border bg-background p-3 text-sm">
    <div className="flex flex-wrap justify-between gap-2"><span className="break-all font-medium">{item.targetKey.replace(/^handles:\d+:/, "@").replaceAll(",", " · @")}</span><Badge variant={failed(item.status) ? "destructive" : "secondary"}>{statusLabel(item.status)}</Badge></div>
    <div className="grid gap-3 md:grid-cols-2">
      {(item.status === "queued" || item.status === "running") && <p className="text-xs text-muted-foreground md:col-span-2">현재 작업이 진행 중입니다. 아래에 남아 있는 결과는 이전 시도에서 저장된 값입니다.</p>}
      <div className="space-y-1"><p className="font-medium">게시물 수집</p>
        <p>{c ? xCollectionItemLabel(c) + " · 계정 확인 " + c.checkedHandles + "개 · 갱신 " + c.refreshedHandles + "개" : "수집 결과 기록 없음"}</p>
        {c && <p className="text-muted-foreground">응답 {c.postsReturned}건 · 저장 {c.postsStored}건</p>}
        {c?.error && <p className="break-words">{xReasonLabel(c.error)}</p>}
      </div>
      <div className="space-y-1"><p className="font-medium">{h?.scope === "quotes" ? "인용 원문 보강" : "답글·인용 원문 보강"}</p>
        {h ? <>
          <p>{h.status === "complete" ? "이번 처리 완료" : h.status === "deferred" ? "이월 대기" : "오류·재시도 대기"}</p>
          <p className="text-muted-foreground">검토 관계 {h.scanned}건 · 원문 연결 {h.hydrated}건 · 작성자 해결 {h.authorsResolved}건</p>
          <p className="text-muted-foreground">이월 {h.deferred} · 오류 {h.failed} · 접근 불가 {h.terminal} · 중복 작업 병합 {h.coalesced}</p>
          {h.errorCode && <p className="break-words">{xReasonLabel(h.errorCode)}</p>}
          {h.retryAt !== null && <p>보강 재시도: {formatXEligibility(h.retryAt)}</p>}
        </> : <p className="text-muted-foreground">보강 결과 기록 없음</p>}
      </div>
    </div>
    <p className="text-xs text-muted-foreground">시도 {item.attempts}회 · 결과 갱신 {formatXTime(item.updatedAt)}{item.retryPending ? " · 작업 재시도 대기: " + formatXEligibility(item.nextRetryAt) : ""}</p>
    {item.error && <p className={"break-words text-xs " + (failed(item.status) ? "text-destructive" : "text-muted-foreground")}>{item.error === item.errorCode ? xReasonLabel(item.errorCode) : item.error}{item.errorCode ? " (" + item.errorCode + ")" : ""}</p>}
  </li>;
}

export function XCollectionRuns({ runs, loading, error, updatedAt }: { runs: OperationRunDto[]; loading: boolean; error: boolean; updatedAt: number }) {
  const [expanded, setExpanded] = useState<string[]>([]);
  return <section aria-label="X 실행 이력" className="space-y-3 border-t pt-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-sm font-semibold">REST 누락 복구 실행 이력</h3><p className="text-xs text-muted-foreground">최근 10개 실행 · 과거 실패 기록 포함</p></div>
    {error && <p role="alert" className="text-sm text-destructive">작업 이력을 갱신하지 못했습니다.{runs.length > 0 ? " 이전 조회: " + formatXTime(updatedAt) : ""}</p>}
    {!error && runs.length > 0 && Date.now() - updatedAt > 120_000 && <p role="status" className="text-sm text-muted-foreground">이전 조회 결과 · {formatXTime(updatedAt)}</p>}
    {loading && <p role="status" className="text-sm text-muted-foreground">작업 이력 확인 중</p>}
    {!loading && !error && runs.length === 0 && <p className="text-sm text-muted-foreground">작업 이력이 없습니다.</p>}
    {runs.length > 0 && <div className="overflow-hidden rounded-lg border">
      <div aria-hidden="true" className="hidden grid-cols-[130px_58px_86px_minmax(0,1fr)_minmax(0,1fr)_20px] gap-3 bg-muted/40 px-3 py-2 text-xs text-muted-foreground md:grid"><span>시작</span><span>유형</span><span>전체 결과</span><span>게시물 수집</span><span>원문 보강</span><span /></div>
      {runs.map((run) => <div key={run.runId} className="border-t first:border-t-0">
        <button type="button" className="grid w-full grid-cols-[1fr_auto] items-center gap-2 px-3 py-3 text-left text-xs hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-ring md:grid-cols-[130px_58px_86px_minmax(0,1fr)_minmax(0,1fr)_20px] md:gap-3"
          aria-expanded={expanded.includes(run.runId)} aria-controls={"x-run-" + run.runId}
          onClick={() => setExpanded((current) => current.includes(run.runId) ? current.filter((id) => id !== run.runId) : [...current, run.runId])}>
          <span>{formatXTime(run.startedAt ?? run.acceptedAt)}</span><span>{runType(run)}</span>
          <span><span className="mr-1 md:sr-only">전체 결과: </span><Badge variant={failed(run.status) ? "destructive" : "secondary"}>{statusLabel(run.status)}</Badge></span>
          <span className="col-span-2 md:col-span-1"><span className="mr-1 md:sr-only">게시물 수집: </span>{xCollectionResultText(run)}</span>
          <span className="col-span-2 md:col-span-1"><span className="mr-1 md:sr-only">원문 보강: </span>{xHydrationResultText(run)}</span>
          <ChevronDown className={"size-4 " + (expanded.includes(run.runId) ? "rotate-180" : "")} />
        </button>
        <div id={"x-run-" + run.runId} hidden={!expanded.includes(run.runId)} className="space-y-3 border-t bg-muted/10 p-3">
          <p className="text-xs">작업 묶음: 성공·부분 완료 {run.progress.succeeded} / 건너뜀 {run.progress.skipped} / 실패 {run.progress.failed} / 제한 {run.progress.throttled} / 대기 {run.progress.queued} / 실행 중 {run.progress.running} · 전체 {run.progress.total}개</p>
          <p className="text-xs text-muted-foreground">각 수치는 이번 실행 결과입니다. 현재 전체 대기량과 다르며, 검토·연결·이월·오류는 집계 단위가 달라 합산 완료율로 표시하지 않습니다.</p>
          {run.xCollection?.items.length ? <ul className="space-y-2">{run.xCollection.items.map((item) => <ItemResult key={item.itemId} item={item} />)}</ul> : <p className="text-sm text-muted-foreground">계정 묶음별 결과 기록 없음</p>}
          {run.lastError && <p className="break-words text-sm text-destructive">{run.lastError}</p>}
          {run.failures.map((failure) => <p key={failure.itemId} className="break-words text-xs text-destructive">{failure.targetKey}: {failure.message}</p>)}
        </div>
      </div>)}
    </div>}
  </section>;
}
