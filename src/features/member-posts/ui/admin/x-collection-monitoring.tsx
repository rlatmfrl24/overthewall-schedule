import { useState } from "react";
import { ChevronDown, FileText, Wallet } from "lucide-react";
import type { OperationRunDto, XCollectionOperationItemDto } from "@contracts/scheduled-operations";
import type { XReferenceHydrationHealthDto } from "@contracts/x-posts";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import type { OperationsStatusResponse } from "@/features/operations";
import { useXReferenceHealth } from "../../queries/use-x-reference-health";
import { formatXEligibility, formatXTime, xCollectionItemLabel, xCollectionStatusText, xCollectionResultText, xHydrationResultText, xReasonLabel } from "../../model/x-collection-monitoring";
import { openXSettings } from "./x-settings-navigation";
import { XReferenceHealth } from "./x-reference-health";

const money = (micros: number) => "$" + (micros / 1_000_000).toFixed(3);
const statusLabel = (status: string) => ({
  queued: "대기", running: "실행 중", succeeded: "성공", success: "성공",
  partial: "일부 실패", failed: "실패", skipped: "건너뜀", throttled: "제한됨",
}[status] ?? status);
const failed = (status: string) => ["failed", "partial", "throttled"].includes(status);

function BudgetRow({ title, used, reserved, limit }: { title: string; used: number; reserved: number; limit: number }) {
  const percent = limit > 0 ? Math.min(100, Math.round((used + reserved) / limit * 100)) : 0;
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-1 text-xs"><span className="font-medium">{title}</span><span>한도 {money(limit)}</span></div>
    <div role="progressbar" aria-label={title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
      aria-valuetext={"사용 " + money(used) + ", 예약 " + money(reserved) + ", 한도 " + money(limit)}
      className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div className="h-full bg-foreground/60" style={{ width: percent + "%" }} />
    </div>
    <p className="text-xs text-muted-foreground">사용 {money(used)} · 예약 {money(reserved)} · 잔여 {money(Math.max(0, limit - used - reserved))}</p>
  </div>;
}

export function XCollectionBudget({ health }: { health: XReferenceHydrationHealthDto | undefined }) {
  const global = health?.globalBudget;
  return <section aria-label="X 예산" className="space-y-3 rounded-lg border bg-muted/10 p-4">
    <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold"><Wallet className="size-4" />X API 예산 <span className="text-xs font-normal text-muted-foreground">{health ? health.budgetDay + " UTC" : "확인 중"}</span></h3>
    <div className="grid gap-4 lg:grid-cols-2">
      {global ? <BudgetRow title="전체 X 예산" used={global.usedMicros} reserved={global.reservedMicros} limit={global.limitMicros} /> : <p className="text-sm text-muted-foreground">전체 예산 정보 확인 불가</p>}
      {health ? <BudgetRow title="원문 보강 한도 · 전체 예산에 포함" used={health.budgetUsedMicros} reserved={health.budgetReservedMicros} limit={health.budgetLimitMicros} /> : <p className="text-sm text-muted-foreground">원문 보강 예산 정보 확인 불가</p>}
    </div>
    <p className="text-xs leading-5 text-muted-foreground">원문 보강 비용은 전체 X 비용에 포함됩니다. 두 금액을 더하지 않습니다.
      {global && health ? " 현재 보강에 사용 가능한 금액 " + money(Math.max(0, Math.min(global.limitMicros - global.usedMicros - global.reservedMicros, health.budgetLimitMicros - health.budgetUsedMicros - health.budgetReservedMicros))) + "." : ""}
      {" "}예산은 UTC 자정에 갱신하며, 실제 조회는 다음 실행에서 보호 정책을 다시 확인합니다.</p>
  </section>;
}

export function XCollectionOverview({ operations, loading, error, latestRun, runsLoading, runsError, runsUpdatedAt, enabled }: {
  operations: OperationsStatusResponse | null; loading: boolean; error: boolean;
  latestRun: OperationRunDto | undefined; runsLoading: boolean; runsError: boolean; runsUpdatedAt: number; enabled: boolean;
}) {
  const query = useXReferenceHealth();
  const x = operations?.xCollection;
  const items = latestRun?.xCollection?.items ?? [];
  const known = items.filter((item) => item.collection !== null);
  const stale = Boolean(latestRun && (runsError || Date.now() - runsUpdatedAt > 120_000));
  const state = runsLoading ? "확인 중" : runsError || stale ? "최신 결과 확인 불가"
    : !latestRun ? "실행 이력 없음"
      : latestRun.status === "queued" || latestRun.status === "running" ? statusLabel(latestRun.status)
        : xCollectionStatusText(latestRun);
  return <div className="space-y-4">
    <p className="text-sm leading-6 text-muted-foreground">게시물 수집 후 원문·작성자 보강을 처리하며, 남은 보강은 이후 실행에서 이어집니다.</p>
    <div className="grid items-stretch gap-4 xl:grid-cols-2">
      <section aria-label="X 게시물 수집 상태" className="min-w-0 space-y-4 rounded-lg border bg-background p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><FileText className="size-4" />게시물 수집</h3>
          <Button variant="ghost" size="sm" onClick={() => openXSettings("x-collection-settings")} aria-label="게시물 수집 설정 열기">설정</Button>
        </div>
        <Badge variant={!stale && known.some((item) => item.collection?.status === "failed") ? "destructive" : "secondary"}>{state}</Badge>
        <p className="text-lg font-semibold">{xCollectionResultText(latestRun)}</p>
        {Array.from(new Set(known.flatMap((item) => item.collection?.error ? [item.collection.error] : []))).map((reason) => <p key={reason} className="text-xs text-muted-foreground">최근 실행 사유: {xReasonLabel(reason)}</p>)}
        {stale && <p role="alert" className="text-xs text-amber-700 dark:text-amber-300">이전 조회 결과입니다. 마지막 조회 {formatXTime(runsUpdatedAt)}</p>}
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div><dt className="text-muted-foreground">최근 실행</dt><dd className="mt-1">{formatXTime(latestRun?.startedAt ?? latestRun?.acceptedAt)}</dd></div>
          <div><dt className="text-muted-foreground">실행 유형</dt><dd className="mt-1">{latestRun ? latestRun.source === "manual" ? "수동" : "정기" : "기록 없음"}</dd></div>
          <div><dt className="text-muted-foreground">자동 수집</dt><dd className="mt-1">{error || loading || !x ? "설정 확인 불가" : (enabled ? "활성" : "중지") + " · " + x.intervalHours + "시간 주기"}</dd></div>
          <div><dt className="text-muted-foreground">다음 수집 가능</dt><dd className="mt-1">{!enabled ? "자동 수집 중지" : error || loading || !x ? "확인 불가" : formatXEligibility(x.nextEligibleAt)}</dd></div>
        </dl>
        <p className="border-t pt-3 text-xs leading-5 text-muted-foreground">새 게시물이 없어 저장 0건일 수 있습니다. 답글·인용 게시물 자체는 이 단계에서 수집하며, 참조 원문과 작성자는 원문 보강 카드에서 확인합니다. 가능 시각은 실행 예약 시각이 아닙니다.</p>
      </section>
      <XReferenceHealth />
    </div>
    {query.isError && <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">예산·대기 상태 최신 조회 실패{query.data ? " · 마지막으로 조회한 값을 표시합니다." : ""}</p>}
    <XCollectionBudget health={query.data?.referenceHydration} />
  </div>;
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
      <div className="space-y-1"><p className="font-medium">원문 보강</p>
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
  return <section aria-label="X 실행 이력" className="space-y-3 border-t pt-4">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-sm font-semibold">최근 정기·수동 작업 로그</h3><p className="text-xs text-muted-foreground">최근 10개 실행 · 행을 펼쳐 처리 결과 확인</p></div>
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
          <span>{formatXTime(run.startedAt ?? run.acceptedAt)}</span><span>{run.source === "manual" ? "수동" : "정기"}</span>
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
