import { useState } from "react";
import { PiCaretDownBold as ChevronDown, PiWalletBold as Wallet } from "react-icons/pi";
import type { OperationRunDto, XCollectionOperationItemDto } from "@contracts/scheduled-operations";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader } from "@/shared/ui/card";
import { Progress } from "@/shared/ui/progress";
import { QueryReadback } from "@/shared/ui/query-readback";
import { useXCollectionStatus } from "../../queries/use-x-collection-status";
import { useXReferenceHealth } from "../../queries/use-x-reference-health";
import { formatXEligibility, formatXTime, xCollectionItemLabel, xCollectionResultText, xHydrationResultText, xPaidLookupText, xReasonLabel } from "../../model/x-collection-monitoring";

const money = (micros: number) => "$" + (micros / 1_000_000).toFixed(3);
const statusLabel = (status: string) => ({
  queued: "대기", running: "실행 중", succeeded: "성공", success: "성공",
  partial: "일부 실패", failed: "실패", skipped: "건너뜀", throttled: "제한됨",
}[status] ?? status);
const failed = (status: string) => ["failed", "partial", "throttled"].includes(status);
const runType = (run: OperationRunDto) => run.summary?.xCollectionScope === "pending" ? "이월 복구" : run.source === "manual" ? "수동" : "정기";

export function XCollectionMemberCounts() {
  const { data, isPending, isError } = useXCollectionStatus();
  const members = data?.collectedByMember24h?.slice().sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"));
  const total = members?.reduce((sum, { count }) => sum + count, 0) ?? 0;
  let counted = 0;
  const slices = members?.map((member, index) => {
    const color = index < 5 ? `var(--chart-${index + 1})` : `oklch(0.65 0.15 ${(index * 137.5) % 360})`;
    const start = counted;
    counted += member.count;
    const sector = member.count > 0 ? `${color} ${start / total * 100}% ${counted / total * 100}%` : null;
    return { ...member, color, sector };
  });
  const sectors = slices?.filter(({ sector }) => sector !== null) ?? [];
  const pieStyle = sectors.length > 1
    ? { backgroundImage: `conic-gradient(${sectors.map(({ sector }) => sector).join(", ")})` }
    : { backgroundColor: sectors[0]?.color };

  return <Card role="region" aria-labelledby="x-member-counts-title" className="gap-0 py-0 shadow-none">
    <CardHeader className="px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="x-member-counts-title" className="text-sm font-semibold">멤버별 X 수집</h2>
        <span className="text-xs text-muted-foreground">최근 24시간{slices && <> · 합계 <strong className="tabular-nums text-foreground">{total.toLocaleString("ko-KR")}건</strong></>}</span>
      </div>
    </CardHeader>
    <CardContent className="space-y-2 px-3 pb-3">
      {isError && slices && <p role="status" className="text-xs text-muted-foreground">새로고침 실패 · 이전 집계 표시 중</p>}
      {slices?.length ? <div className="flex items-center gap-4 sm:gap-6">
        <div aria-hidden="true" className="grid size-24 shrink-0 place-items-center rounded-full bg-muted sm:size-32"
          style={pieStyle}>
          {total === 0 && <span className="text-lg font-semibold tabular-nums text-muted-foreground">0</span>}
        </div>
        <ul aria-label="멤버별 수집 건수" className="min-w-0 flex-1 divide-y">
          {slices.map(({ handle, name, count, color, quoteCount, replyCount }) => <li key={handle} className="flex items-center gap-2 py-1.5 text-sm">
            <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: count ? color : "var(--muted-foreground)" }} />
            <div className="min-w-0 flex-1 break-words">
              <span>{name}</span>
              {quoteCount !== undefined && replyCount !== undefined && <p className="text-xs tabular-nums text-muted-foreground">
                인용 {quoteCount.toLocaleString("ko-KR")}건 · 답글 {replyCount.toLocaleString("ko-KR")}건
              </p>}
            </div>
            <strong className="shrink-0 tabular-nums">{count.toLocaleString("ko-KR")}건</strong>
          </li>)}
        </ul>
      </div> : <p role="status" className="text-sm text-muted-foreground">
        {isPending ? "수집 건수를 불러오는 중" : slices ? "수집 대상 멤버가 없습니다." : "수집 건수를 확인할 수 없습니다."}
      </p>}
    </CardContent>
  </Card>;
}

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

export function XCollectionBudget() {
  const query = useXReferenceHealth();
  const health = query.data?.referenceHydration;
  const global = health?.globalBudget;
  return <Card aria-label="X 예산" className="gap-0 py-0 shadow-none">
    <CardHeader className="px-3 py-2"><h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold"><Wallet className="size-4" />X API 예산 <span className="text-xs font-normal text-muted-foreground">{health ? health.budgetDay + " UTC" : query.isPending ? "확인 중" : "미확인"}</span></h2></CardHeader>
    <CardContent className="space-y-2 px-3 pb-3">
    <div className="grid gap-4 md:grid-cols-2">
      {global ? <BudgetRow title={health.sharedBudget?"양 사이트 합산 X 예산":"전체 X 예산"} used={global.usedMicros} reserved={global.reservedMicros} limit={global.limitMicros} /> : <p className="text-sm text-muted-foreground">공통 예산 정보 확인 불가 · 유료 조회 중지</p>}
      {health ? <BudgetRow title="원문 보강 한도 · 전체 예산에 포함" used={health.budgetUsedMicros} reserved={health.budgetReservedMicros} limit={health.budgetLimitMicros} /> : <p className="text-sm text-muted-foreground">원문 보강 예산 정보 확인 불가</p>}
    </div>
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-t pt-2">
      <p className="text-xs text-muted-foreground">보강 예산은 전체에 포함 · UTC 자정 초기화</p>
      {global && health && <p className="text-[13px]">보강 가능 <strong className="tabular-nums">{money(Math.max(0, Math.min(global.limitMicros - global.usedMicros - global.reservedMicros, health.budgetLimitMicros - health.budgetUsedMicros - health.budgetReservedMicros)))}</strong></p>}
    </div>
    <section aria-labelledby="x-reference-backlog-heading" className="space-y-2 border-t pt-2">
      <h3 id="x-reference-backlog-heading" className="text-sm font-semibold">자동 처리 대기</h3>
      <dl className="grid grid-cols-3 gap-2 tabular-nums">
        {([
          ["원문 대기", health?.pendingPosts],
          ["작성자 대기", health?.pendingAuthors],
          ["접근 불가", health?.terminal],
        ] as const).map(([label, count]) => <div key={label}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-1 text-sm font-medium">{count === undefined ? "미확인" : `${count.toLocaleString("ko-KR")}건`}</dd>
        </div>)}
      </dl>
      <QueryReadback updatedAt={query.dataUpdatedAt} fetching={query.isFetching} error={query.isError} className="my-0" />
    </section>
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
        {c?.provider && <p>{c.provider === "fxembed" ? "FxEmbed" : "공식 X"} · {c.scope === "pending" ? "미완료 재개" : c.scope === "fallback" ? "장애 임시 수집" : "정기"}</p>}
        <p>{c ? xCollectionItemLabel(c) + " · 계정 확인 " + c.checkedHandles + "개 · 갱신 " + c.refreshedHandles + "개" : "수집 결과 기록 없음"}</p>
        {c && <p className="text-muted-foreground">응답 {c.postsReturned}건 · 저장 {c.postsStored}건</p>}
        {c?.recentCheck && <><p>최근 {c.recentCheck.lookbackHours}시간 · 최대 {c.recentCheck.maxPages}페이지 확인 · 상한 도달 {c.recentCheck.limitedSources}계정</p><p className="text-xs text-muted-foreground">무료 확인은 전량 발견을 보장하지 않으며 누락은 공식 대조로 보완합니다.</p></>}
        {c?.mode === "rss_candidates" && <p>RSS 후보 확인 · {xPaidLookupText(c)}</p>}
        {c?.rss && <><p>목록 {c.rss.rawCount}건 · 발견 후보 {c.rss.candidatesFound}건 · 남은 후보 {c.rss.pendingCandidates}건</p>{c.rss.windowReduced && <p>RSS 발견창 축소</p>}{c.rss.nextAttemptAt !== null && <p>다음 점검 재개 자격 {formatXEligibility(c.rss.nextAttemptAt)} · 실행 시각은 보장되지 않습니다.</p>}</>}
        {c?.error && <p className="break-words">{xReasonLabel(c.error)}</p>}
      </div>
      <div className="space-y-1"><p className="font-medium">{h?.scope === "quotes" ? "인용 원문 보강" : "답글·인용 원문 보강"}</p>
        {h ? <>
          <p>{h.status === "complete" ? "이번 처리 완료" : h.status === "deferred" ? "이월 대기" : "오류·재시도 대기"}</p>
          <p className="text-muted-foreground">검토 관계 {h.scanned}건 · 원문 연결 {h.hydrated}건 · 작성자 해결 {h.authorsResolved}건</p>
          <p className="text-muted-foreground">이월 {h.deferred} · 오류 {h.failed} · 접근 불가 {h.terminal} · 중복 작업 병합 {h.coalesced}</p>
          {h.errorCode && <p className="break-words">{xReasonLabel(h.errorCode)}</p>}
          {h.retryAt !== null && <p>보강 재시도: {formatXEligibility(h.retryAt)}</p>}
        </> : <p className="text-muted-foreground">{c?.provider === "fxembed" ? `FxEmbed 실행 · ${xPaidLookupText(c)}` : "보강 결과 기록 없음"}</p>}
      </div>
    </div>
    <p className="text-xs text-muted-foreground">시도 {item.attempts}회 · 결과 갱신 {formatXTime(item.updatedAt)}{item.retryPending ? " · 작업 재시도 대기: " + formatXEligibility(item.nextRetryAt) : ""}</p>
    {item.error && <p className={"break-words text-xs " + (failed(item.status) ? "text-destructive" : "text-muted-foreground")}>{item.error === item.errorCode ? xReasonLabel(item.errorCode) : item.error}{item.errorCode ? " (" + item.errorCode + ")" : ""}</p>}
  </li>;
}

export function XCollectionRuns({ runs, loading, error, updatedAt }: { runs: OperationRunDto[]; loading: boolean; error: boolean; updatedAt: number }) {
  const [expanded, setExpanded] = useState<string[]>([]);
  return <section aria-label="X 실행 이력" className="space-y-3 border-t pt-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-sm font-semibold">게시물 수집 실행 이력</h3><p className="text-xs text-muted-foreground">최근 10개 실행 · 과거 실패 기록 포함</p></div>
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
          {expanded.includes(run.runId) && <>
          <p className="text-xs">작업 묶음: 성공·부분 완료 {run.progress.succeeded} / 건너뜀 {run.progress.skipped} / 실패 {run.progress.failed} / 제한 {run.progress.throttled} / 대기 {run.progress.queued} / 실행 중 {run.progress.running} · 전체 {run.progress.total}개</p>
          <p className="text-xs text-muted-foreground">각 수치는 이번 실행 결과입니다. 현재 전체 대기량과 다르며, 검토·연결·이월·오류는 집계 단위가 달라 합산 완료율로 표시하지 않습니다.</p>
          {run.xCollection?.items.length ? <ul className="space-y-2">{run.xCollection.items.map((item) => <ItemResult key={item.itemId} item={item} />)}</ul> : <p className="text-sm text-muted-foreground">계정 묶음별 결과 기록 없음</p>}
          {run.lastError && <p className="break-words text-sm text-destructive">{run.lastError}</p>}
          {run.failures.map((failure) => <p key={failure.itemId} className="break-words text-xs text-destructive">{failure.targetKey}: {failure.message}</p>)}
          </>}
        </div>
      </div>)}
    </div>}
  </section>;
}
