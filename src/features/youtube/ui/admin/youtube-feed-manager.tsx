import { useEffect, useRef, useState, type ReactNode } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { PiArrowRightBold, PiArrowsClockwiseBold } from "react-icons/pi";
import type { OperationRunAcceptedDto, OperationRunDto } from "@contracts/scheduled-operations";
import type { YouTubeFeedChannelDto, YouTubeFeedRole, YouTubeFeedState, YouTubeFeedStatusDto } from "@contracts/youtube";
import { createOperationRun, useOperationRun } from "@/features/operations";
import { useConsoleSearch } from "@/shared/lib/admin-console-search";
import { queryKeys } from "@/shared/query/query-keys";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/shared/ui/chart";
import { ConfirmActionDialog } from "@/shared/ui/confirm-action-dialog";
import { Input } from "@/shared/ui/input";
import { Progress } from "@/shared/ui/progress";
import { QueryReadback } from "@/shared/ui/query-readback";
import { SelectField } from "@/shared/ui/select-field";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/shared/ui/sheet";
import { Skeleton } from "@/shared/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { useToast } from "@/shared/ui/toast";
import { fetchYouTubeFeedStatus } from "../../api/youtube-feed";
import "./youtube-feed-manager.css";

const labels: Record<YouTubeFeedState, string> = { misconfigured: "설정 오류", failed: "수집 실패", initializing: "초기 수집 중", paused: "자동 수집 중지", due: "확인 대기", delayed: "지연", healthy: "정상", unknown: "미확인" };
const roles: Record<YouTubeFeedRole, string> = { official: "공식", vod: "다시보기", kirinuki: "키리누키" };
const priorities: YouTubeFeedState[] = ["misconfigured", "failed", "delayed", "due", "initializing", "paused", "unknown", "healthy"];
const origins = { scheduled: "예약", manual: "수동", demand: "요청", legacy_unknown: "과거 출처 미기록" };
const terminal = new Set(["succeeded", "failed", "partial", "skipped", "throttled"]);
const time = (value: number | null | undefined) => value == null ? "—" : new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const number = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("ko-KR");
const age = (value: number | null | undefined, now: number) => value == null ? "—" : `${Math.max(0, (now - value) / 3_600_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}시간`;
const isDue = (channel: YouTubeFeedChannelDto, now: number) => channel.nextCheckAt === null || channel.nextCheckAt <= now;
const runLabel = (run: OperationRunDto) => ({ queued: "접수 · 큐 대기", running: "실행 중", succeeded: "완료", failed: "실패", partial: "일부 미완료", skipped: "처리 대상 없음", throttled: "예산 제한" })[run.status];
const channelResult = (run: OperationRunDto | undefined) => !run?.youtubeCollection ? "—" : run.youtubeCollection.attempted === 0 ? run.status === "skipped" ? "처리 대상 없음" : "채널 시도 없음" : `${number(run.youtubeCollection.succeeded)} / ${number(run.youtubeCollection.attempted)}`;
const stateColor = (state: YouTubeFeedState) => ["misconfigured", "failed"].includes(state) ? "var(--destructive)" : ["delayed", "due"].includes(state) ? "var(--chart-3)" : state === "healthy" ? "var(--chart-2)" : "var(--muted-foreground)";

function StateBadge({ state }: { state: YouTubeFeedState }) {
  return <Badge variant="outline" className={`feed-state feed-state-${state}`}>{labels[state]}</Badge>;
}

function Metric({ label, value, children, onClick }: { label: string; value: ReactNode; children: ReactNode; onClick?: () => void }) {
  return <Card className="feed-metric"><CardContent>
    <h2 className="text-xs font-medium text-muted-foreground">{label}</h2>
    {onClick ? <Button variant="ghost" className="feed-metric-value" onClick={onClick} aria-label={`${label} ${typeof value === "string" ? value : ""} 상세 보기`}>{value}</Button> : <p className="feed-metric-value">{value}</p>}
    <div className="feed-metric-note">{children}</div>
  </CardContent></Card>;
}

function ChannelDetail({ channel, now }: { channel: YouTubeFeedChannelDto; now: number }) {
  return <Sheet><Tooltip><TooltipTrigger asChild><SheetTrigger asChild><Button variant="link" className="h-auto min-w-0 justify-start p-0 text-left font-semibold" aria-label={`${channel.names.join(" / ")} 상세 보기`}><span className="truncate">{channel.names.join(" / ")}</span></Button></SheetTrigger></TooltipTrigger><TooltipContent>{channel.names.join(" / ")}</TooltipContent></Tooltip>
    <SheetContent className="overflow-y-auto p-5 sm:max-w-md"><SheetTitle className="pr-6">{channel.names.join(" / ")}</SheetTitle><SheetDescription>채널 상세 · 시각 KST</SheetDescription><StateBadge state={channel.state} />
      <dl className="feed-detail">
        <dt>채널 ID</dt><dd className="break-all">{channel.channelId}</dd>
        <dt>역할</dt><dd>{channel.roles.map((role) => roles[role]).join(" · ")}</dd>
        <dt>초기화</dt><dd>{channel.initialized ? "완료" : "대기"}</dd>
        <dt>마지막 시도</dt><dd>{time(channel.lastAttemptAt)}</dd>
        <dt>마지막 성공</dt><dd>{time(channel.lastSuccessAt)}</dd>
        <dt>다음 확인</dt><dd>{time(channel.nextCheckAt)}</dd>
        <dt>저장 영상</dt><dd>{number(channel.videoCount)}</dd>
        <dt>갱신 대기</dt><dd>{number(channel.metadataPending)}</dd>
        <dt>최대 경과</dt><dd>{age(channel.oldestMetadataAt, now)}</dd>
      </dl>
      <Alert variant={channel.error ? "destructive" : "default"}><AlertTitle>현재 오류</AlertTitle><AlertDescription className="break-words">{channel.error ?? "기록 없음"}</AlertDescription></Alert>
    </SheetContent>
  </Sheet>;
}

function RunDetail({ run }: { run: OperationRunDto }) {
  const result = run.youtubeCollection;
  const fields = [
    ["출처", run.source === "manual" ? "수동" : "예약"], ["접수", time(run.acceptedAt)], ["시작", time(run.startedAt)], ["종료", time(run.finishedAt)],
    ["채널 성공 / 시도", channelResult(run)], ["채널 실패", number(result?.failed)], ["메타데이터 갱신", number(result?.metadataRefreshed)], ["접근 불가 처리", number(result?.unavailableMarked)],
    ["Shorts 저장", number(result?.shortsStored)], ["백필 페이지", number(result?.scanPages)], ["탐색 완료 채널", number(result?.exhaustedSources)], ["백필 실패", number(result?.backfillFailed)], ["재시도 대기", number(result?.backoffSources)], ["할당량 대기", result ? result.quotaBlocked ? "있음" : "없음" : "—"],
  ];
  return <Sheet><SheetTrigger asChild><Button variant="link" className="h-auto p-0" aria-label={`${time(run.acceptedAt)} 실행 상세 보기`}>{time(run.acceptedAt)}</Button></SheetTrigger>
    <SheetContent className="overflow-y-auto p-5 sm:max-w-md"><SheetTitle>수집 실행 상세</SheetTitle><SheetDescription className="break-all">{run.runId}</SheetDescription><Badge variant="outline">{runLabel(run)}</Badge>
      <dl className="feed-detail">{fields.map(([label, value]) => <div key={label} className="contents"><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      {!result && <p className="text-sm text-muted-foreground">{terminal.has(run.status) ? "채널 처리 결과 기록 없음" : "접수는 수집 완료가 아닙니다. 종료 결과를 확인 중입니다."}</p>}
      {(run.lastError || run.failures.length > 0) && <Alert variant="destructive"><AlertTitle>실행 오류</AlertTitle><AlertDescription className="break-words">{run.lastError}{run.failures.map((failure) => <p key={failure.itemId}>{failure.message}</p>)}</AlertDescription></Alert>}
    </SheetContent>
  </Sheet>;
}

export function YouTubeFeedManager() {
  const executeButton = useRef<HTMLButtonElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, update] = useConsoleSearch();
  const [hours, setHours] = useState<24 | 168>(24);
  const [usageMetric, setUsageMetric] = useState<"quotaUnits" | "apiCalls">("quotaUnits");
  const [confirmation, setConfirmation] = useState(false);
  const [tracked, setTracked] = useState<OperationRunAcceptedDto | null>(null);
  const status = useQuery({ queryKey: queryKeys.youtubeFeed.status(hours), queryFn: () => fetchYouTubeFeedStatus(hours), staleTime: 60_000, placeholderData: keepPreviousData });
  // Keep the authoritative cached snapshot visible even if changing periods fails.
  const data = status.data ?? (status.isError ? queryClient.getQueryData<YouTubeFeedStatusDto>(queryKeys.youtubeFeed.status(hours === 24 ? 168 : 24)) : undefined);
  const recentRuns = data?.recentRuns ?? [];
  const active = recentRuns.find((run) => !terminal.has(run.status));
  const activeAccepted = active ? { runId: active.runId, jobType: active.jobType, status: "queued" as const, acceptedAt: active.acceptedAt, idempotencyKey: active.idempotencyKey, statusUrl: "" } : null;
  // Track the selected run across the refresh that removes it from active runs.
  if (activeAccepted && activeAccepted.runId !== tracked?.runId) setTracked(activeAccepted);
  const accepted = activeAccepted ?? tracked;
  const monitor = useOperationRun(accepted);
  const refreshedRun = useRef("");
  useEffect(() => {
    if (!monitor.data || !terminal.has(monitor.data.status) || refreshedRun.current === monitor.data.runId) return;
    refreshedRun.current = monitor.data.runId;
    toast({ description: `YouTube 수집 ${runLabel(monitor.data)}. 최신 잔여량을 조회합니다.`, variant: ["failed", "partial", "throttled"].includes(monitor.data.status) ? "error" : "success" });
    void queryClient.invalidateQueries({ queryKey: queryKeys.youtubeFeed.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.media.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.operations.all });
  }, [monitor.data, queryClient, toast]);
  const execute = useMutation({ mutationFn: () => createOperationRun("youtube_feed_collection"), onSuccess: (run) => { toast({ description: "실행 접수 완료. 실제 종료 결과를 확인합니다.", variant: "info" }); setTracked(run); void queryClient.invalidateQueries({ queryKey: queryKeys.youtubeFeed.all }); } });
  const running = execute.isPending || Boolean(accepted && (!monitor.data || !terminal.has(monitor.data.status)));
  const showState = (state = "") => update({ view: "channels", state, q: undefined, category: undefined });
  const channels = (data?.channels ?? []).filter((channel) =>
    (!search.q || `${channel.names.join(" ")} ${channel.channelId}`.toLowerCase().includes(search.q.toLowerCase())) &&
    (!search.category || channel.roles.includes(search.category as YouTubeFeedRole)) &&
    (!search.state || (search.state === "pending" ? isDue(channel, data!.updatedAt) : search.state === "errors" ? ["misconfigured", "failed"].includes(channel.state) : channel.state === search.state)),
  ).sort((a, b) => search.sort === "name" ? (a.names[0] ?? a.channelId).localeCompare(b.names[0] ?? b.channelId, "ko") : priorities.indexOf(a.state) - priorities.indexOf(b.state) || (a.nextCheckAt ?? 0) - (b.nextCheckAt ?? 0));
  const queued = data ? data.channels.filter((channel) => isDue(channel, data.updatedAt)).length : null;
  const latest = recentRuns[0];
  const view = ["runs", "issues"].includes(search.view ?? "") ? search.view : "channels";
  const period = data?.window.hours === 168 ? "최근 7일" : "최근 24시간";
  const refresh = () => { void status.refetch(); if (accepted) void monitor.refetch(); };
  const states = data ? priorities.map((state) => ({ state, label: labels[state], count: data.summary.states[state], fill: stateColor(state) })) : [];
  const usage = data ? Object.entries(origins).map(([origin, label]) => {
    const row = data.usage.byOrigin.find((item) => item.origin === origin);
    return { label, apiCalls: row?.apiCalls ?? 0, quotaUnits: row?.quotaUnits ?? 0, failures: row?.failures ?? 0 };
  }) : [];

  return <section className="youtube-collection-dashboard min-w-0 space-y-3" aria-label="YouTube 수집 대시보드">
    <header className="feed-toolbar">
      <div className="flex min-w-0 flex-wrap items-center gap-2"><h1 className="mr-1 text-xl font-semibold tracking-tight">YouTube 수집</h1>{import.meta.env.DEV && <Badge variant="outline" title="운영 DB와 별도의 로컬 저장 데이터입니다.">로컬 데이터</Badge>}{data && <><Badge variant="outline">{data.automaticEnabled ? "자동 수집 켜짐" : "자동 수집 중지"}</Badge><Badge variant={data.apiConfigured ? "secondary" : "destructive"}>{data.apiConfigured ? "API 연결 설정됨" : "API 키 미설정"}</Badge></>}</div>
      <div className="feed-toolbar-actions"><SelectField aria-label="사용량·실행 조회 기간" value={String(hours)} onValueChange={(value) => setHours(value === "168" ? 168 : 24)} options={[{ value: "24", label: "최근 24시간" }, { value: "168", label: "최근 7일" }]} /><Button variant="outline" onClick={refresh} disabled={status.isFetching}><PiArrowsClockwiseBold />상태 새로고침</Button><Button ref={executeButton} onClick={() => setConfirmation(true)} disabled={running || !data?.apiConfigured}>대기 작업 실행<PiArrowRightBold /></Button></div>
    </header>
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground"><QueryReadback updatedAt={data?.updatedAt ?? 0} fetching={status.isFetching} error={status.isError} /><span>채널·할당량: 현재 상태 · 사용량·실행: {period} · 시각 KST</span></div>
    {status.isError && <Alert variant="destructive"><AlertTitle>{data ? "조회 실패 · 이전 조회 결과" : "수집 상태 조회 실패"}</AlertTitle><AlertDescription>상태 새로고침으로 다시 확인해 주세요. 미확인 값을 0이나 정상으로 표시하지 않습니다.</AlertDescription></Alert>}
    {status.isPlaceholderData && <p role="status" className="text-xs text-muted-foreground">기간 변경 조회 중 · 이전 조회 결과 ({period})</p>}
    {data && (!data.apiConfigured || !data.automaticEnabled) && <Alert role="status"><AlertDescription>{!data.apiConfigured ? "YouTube API 키 미설정 · 저장 영상 제공은 유지됩니다." : "자동 수집 중지 · 저장 영상 제공과 수동 실행은 유지됩니다."}</AlertDescription></Alert>}
    {execute.isError && <Alert variant="destructive"><AlertTitle>실행 접수 실패</AlertTitle><AlertDescription>{execute.error.message}</AlertDescription></Alert>}
    {accepted && <Alert role="status" aria-live="polite"><AlertTitle>{monitor.data ? runLabel(monitor.data) : "실행 접수 완료 · 종료 결과 확인 중"}</AlertTitle><AlertDescription>
      {monitor.data?.youtubeCollection ? <p>채널 성공 / 시도 {channelResult(monitor.data)} · 실패 {number(monitor.data.youtubeCollection.failed)} · 메타데이터 갱신 {number(monitor.data.youtubeCollection.metadataRefreshed)}{monitor.data.youtubeCollection.quotaBlocked ? " · 할당량 제한으로 대기" : ""}</p> : <p>{monitor.data && terminal.has(monitor.data.status) ? "채널 처리 결과 기록 없음" : "접수는 수집 완료가 아닙니다. 실제 종료 결과를 확인합니다."}</p>}
      {monitor.data?.lastError && <p className="break-words text-destructive">{monitor.data.lastError}</p>}
      {monitor.data?.failures.map((failure) => <p key={failure.itemId} className="break-words text-destructive">{failure.message}</p>)}
      <QueryReadback updatedAt={monitor.dataUpdatedAt} error={monitor.isError} fetching={monitor.isFetching} />
      {monitor.isError && <Button variant="outline" size="sm" onClick={() => void monitor.refetch()}>실행 상태 다시 확인</Button>}
      {monitor.data && terminal.has(monitor.data.status) && <p>현재 남은 채널 대기 {number(queued)} · 메타데이터 대기 {number(data?.summary.metadataPending)}영상{status.isFetching || status.isError ? " · 최신 잔여량 재조회 필요" : ""}</p>}
    </AlertDescription></Alert>}
    {!data && !status.isError && <div role="status" aria-label="수집 상태 확인 중" className="grid grid-cols-2 gap-2 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>}
    {data && <>
      <section aria-label="수집 상태 요약" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Metric label="등록 채널" value={number(data.summary.channels)} onClick={() => showState()}>정상 {number(data.summary.states.healthy)} · 중복 역할 제외</Metric>
        <Metric label="확인 대기" value={number(queued)} onClick={() => showState("pending")}>지연 {number(data.summary.states.delayed)} · 중지 채널 포함</Metric>
        <Metric label="오류 채널" value={number(data.summary.states.misconfigured + data.summary.states.failed)} onClick={() => showState("errors")}>설정 {number(data.summary.states.misconfigured)} · 수집 실패 {number(data.summary.states.failed)}</Metric>
        <Metric label="저장 영상" value={number(data.summary.videos)}>등록 채널 저장 피드</Metric>
        <Metric label="메타데이터 갱신 대기" value={number(data.summary.metadataPending)}>최대 경과 {age(data.summary.oldestMetadataAt, data.updatedAt)} · 24시간 기준</Metric>
        <Metric label="기간 API 호출" value={number(data.usage.apiCalls)}>{period} · 실패 {number(data.usage.failures)}회 · {number(data.usage.quotaUnits)} units</Metric>
        <Metric label="Pacific 일자 할당량" value={<>{number(data.quota.used)} <span className="text-sm font-normal text-muted-foreground">/ {number(data.quota.limit)}</span></>}>
          {data.quota.limit != null && data.quota.limit > 0 && <Progress aria-label="Pacific 일일 할당량 사용" value={Math.min(100, data.quota.used / data.quota.limit * 100)} aria-valuetext={`${number(data.quota.used)} / ${number(data.quota.limit)} units`} className="mb-1 h-1" />}
          <p>{data.quota.day} · 초기화 {time(data.quota.nextResetAt)}</p><p>피드 한도 {number(data.quota.lowPriorityLimit)} units</p>
        </Metric>
        <Metric label="최근 실행 결과" value={channelResult(latest)} onClick={() => update({ view: "runs" })}>{latest ? `${runLabel(latest)} · 채널 성공 / 시도` : "조회 기간 내 기록 없음"}<p>메타데이터 {number(latest?.youtubeCollection?.metadataRefreshed)} · 종료 {time(latest?.finishedAt)}</p></Metric>
      </section>
      <section aria-label="수집 분석" className="grid gap-3 lg:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-sm">채널 상태별 건수</CardTitle><span className="text-xs text-muted-foreground">현재 {number(data.summary.channels)}채널 · 상태 선택 시 필터</span></CardHeader><CardContent>
          <div className="feed-chart-layout"><div className="feed-state-controls">{states.map((row) => <Button key={row.state} variant="ghost" className="justify-between px-1 text-xs" aria-label={`${row.label} ${row.count}채널 보기`} aria-pressed={search.state === row.state && view === "channels"} onClick={() => showState(row.state)}><span className={`feed-state-text-${row.state}`}>{row.label}</span><span className="tabular-nums">{number(row.count)}</span></Button>)}</div>
            <ChartContainer config={{ count: { label: "채널 수" } }} className="feed-chart" aria-label="채널 상태 건수 막대 차트"><BarChart accessibilityLayer layout="vertical" data={states} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}><CartesianGrid horizontal={false} /><XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} height={20} domain={[0, (max: number) => Math.max(1, max)]} /><YAxis type="category" dataKey="label" hide /><ChartTooltip cursor={false} isAnimationActive={false} content={<ChartTooltipContent />} /><Bar dataKey="count" barSize={13} radius={2} isAnimationActive={false} onClick={(_, index) => showState(states[index].state)} /></BarChart></ChartContainer>
          </div>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">출처별 API 사용량</CardTitle><Tabs value={usageMetric} onValueChange={(value) => setUsageMetric(value === "apiCalls" ? "apiCalls" : "quotaUnits")}><TabsList aria-label="API 사용량 단위" className="h-7"><TabsTrigger value="quotaUnits" className="text-xs">할당량 단위</TabsTrigger><TabsTrigger value="apiCalls" className="text-xs">호출 수</TabsTrigger></TabsList></Tabs></CardHeader><CardContent>
          <div className="feed-chart-layout"><dl className="feed-origin-values">{usage.map((row) => <div key={row.label}><dt className="text-xs font-medium">{row.label}</dt><dd className="text-xs tabular-nums">{number(row[usageMetric])} {usageMetric === "quotaUnits" ? "units" : "회"}<span className="block text-muted-foreground">실패 {number(row.failures)}회</span></dd></div>)}</dl>
            <ChartContainer config={{ quotaUnits: { label: "할당량 단위", color: "var(--chart-1)" }, apiCalls: { label: "호출 수", color: "var(--chart-1)" } }} className="feed-chart" aria-label="출처별 API 사용량 막대 차트"><BarChart accessibilityLayer layout="vertical" data={usage} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}><CartesianGrid horizontal={false} /><XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} height={20} domain={[0, (max: number) => Math.max(1, max)]} /><YAxis type="category" dataKey="label" hide /><ChartTooltip cursor={false} isAnimationActive={false} content={<ChartTooltipContent />} /><Bar dataKey={usageMetric} fill={`var(--color-${usageMetric})`} barSize={16} radius={2} isAnimationActive={false} /></BarChart></ChartContainer>
          </div>
        </CardContent></Card>
      </section>
      <Card><CardContent><Tabs value={view} onValueChange={(value) => update({ view: value })}>
        <div className="flex flex-wrap items-center justify-between gap-2"><TabsList aria-label="수집 상세"><TabsTrigger value="channels">채널 상태 <Badge variant="secondary">{data.channels.length}</Badge></TabsTrigger><TabsTrigger value="runs">최근 실행 <Badge variant="secondary">{recentRuns.length}</Badge></TabsTrigger><TabsTrigger value="issues">설정 문제 <Badge variant={data.configurationIssues.length ? "destructive" : "secondary"}>{data.configurationIssues.length}</Badge></TabsTrigger></TabsList><span className="text-xs text-muted-foreground">{view === "channels" ? `${channels.length} / ${data.channels.length}채널` : view === "runs" ? `${period} · 최대 8건` : "등록 정보·수집 소스 비교"}</span></div>
        <TabsContent value="channels" className="space-y-2">
          <div className="feed-filters"><Input aria-label="채널 이름 검색" placeholder="이름 또는 채널 ID 검색" value={search.q ?? ""} onChange={(event) => update({ q: event.target.value })} /><SelectField aria-label="채널 유형" value={search.category ?? ""} onValueChange={(category) => update({ category })} options={[{ value: "", label: "모든 유형" }, ...Object.entries(roles).map(([value, label]) => ({ value, label }))]} /><SelectField aria-label="수집 상태" value={search.state ?? ""} onValueChange={(state) => update({ state })} options={[{ value: "", label: "모든 상태" }, { value: "pending", label: "확인 시각 지난 전체" }, { value: "errors", label: "설정 오류·수집 실패" }, ...priorities.map((value) => ({ value, label: labels[value] }))]} /><SelectField aria-label="채널 정렬" value={search.sort === "name" ? "name" : "attention"} onValueChange={(sort) => update({ sort })} options={[{ value: "attention", label: "오류·지연 우선" }, { value: "name", label: "이름순" }]} />{(search.q || search.category || search.state) && <Button variant="ghost" onClick={() => update({ q: undefined, category: undefined, state: undefined })}>초기화</Button>}</div>
          <div className="feed-table-region" tabIndex={0} role="region" aria-label="채널 표 스크롤"><Table aria-label="채널 상태" className="min-w-[780px]"><TableHeader><TableRow><TableHead className="w-[28%]">채널 / 역할</TableHead><TableHead>상태</TableHead><TableHead>마지막 성공</TableHead><TableHead>다음 확인</TableHead><TableHead className="text-right">영상 수</TableHead><TableHead className="text-right">갱신 대기</TableHead></TableRow></TableHeader><TableBody>
            {channels.map((channel) => <TableRow key={channel.channelId}><TableCell className="max-w-64"><ChannelDetail channel={channel} now={data.updatedAt} /><p className="text-xs text-muted-foreground">{channel.roles.map((role) => roles[role]).join(" · ")}</p></TableCell><TableCell><StateBadge state={channel.state} /></TableCell><TableCell className="tabular-nums">{time(channel.lastSuccessAt)}</TableCell><TableCell className="tabular-nums">{time(channel.nextCheckAt)}{isDue(channel, data.updatedAt) && <p className="text-xs text-muted-foreground">{channel.nextCheckAt == null ? "확인 시각 미설정" : `${age(channel.nextCheckAt, data.updatedAt)} 초과`}</p>}</TableCell><TableCell className="text-right tabular-nums">{number(channel.videoCount)}</TableCell><TableCell className="text-right tabular-nums">{number(channel.metadataPending)}<p className="text-xs text-muted-foreground">{channel.metadataPending ? `최대 ${age(channel.oldestMetadataAt, data.updatedAt)}` : "대기 없음"}</p></TableCell></TableRow>)}
            {!channels.length && <TableRow><TableCell colSpan={6} className="h-24 text-center">{data.channels.length ? "조건에 맞는 채널이 없습니다." : "등록된 채널이 없습니다."}</TableCell></TableRow>}
          </TableBody></Table></div>
        </TabsContent>
        <TabsContent value="runs"><div className="feed-table-region" tabIndex={0} role="region" aria-label="실행 표 스크롤"><Table aria-label="최근 수집 실행" className="min-w-[850px]"><TableHeader><TableRow><TableHead>접수 / 소요 시간</TableHead><TableHead>출처</TableHead><TableHead>상태</TableHead><TableHead className="text-right">채널 성공 / 시도</TableHead><TableHead className="text-right">실패</TableHead><TableHead className="text-right">메타데이터</TableHead><TableHead className="text-right">Shorts</TableHead><TableHead>예산 대기</TableHead></TableRow></TableHeader><TableBody>
          {recentRuns.map((run) => <TableRow key={run.runId}><TableCell><RunDetail run={run} /><p className="text-xs text-muted-foreground">{run.startedAt != null && run.finishedAt != null ? `${Math.max(0, (run.finishedAt - run.startedAt) / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}초` : "—"}</p></TableCell><TableCell>{run.source === "manual" ? "수동" : "예약"}</TableCell><TableCell><Badge variant={["failed", "partial"].includes(run.status) ? "destructive" : "outline"}>{runLabel(run)}</Badge></TableCell><TableCell className="text-right tabular-nums">{channelResult(run)}</TableCell><TableCell className="text-right tabular-nums">{number(run.youtubeCollection?.failed)}</TableCell><TableCell className="text-right tabular-nums">{number(run.youtubeCollection?.metadataRefreshed)}</TableCell><TableCell className="text-right tabular-nums">{number(run.youtubeCollection?.shortsStored)}</TableCell><TableCell>{run.youtubeCollection ? run.youtubeCollection.quotaBlocked ? "대기 있음" : "없음" : "—"}</TableCell></TableRow>)}
          {!recentRuns.length && <TableRow><TableCell colSpan={8} className="h-24 text-center">조회 기간 내 실행 기록 없음</TableCell></TableRow>}
        </TableBody></Table></div></TabsContent>
        <TabsContent value="issues"><Table aria-label="등록·수집 설정 문제"><TableHeader><TableRow><TableHead>등록 이름</TableHead><TableHead>채널 ID</TableHead><TableHead>문제</TableHead></TableRow></TableHeader><TableBody>{data.configurationIssues.map((issue, index) => <TableRow key={index}><TableCell className="whitespace-normal">{issue.name}</TableCell><TableCell className="break-all whitespace-normal">{issue.channelId ?? "—"}</TableCell><TableCell className="whitespace-normal text-destructive">{issue.issue}</TableCell></TableRow>)}{!data.configurationIssues.length && <TableRow><TableCell colSpan={3} className="h-24 text-center">등록·수집 소스 불일치 없음</TableCell></TableRow>}</TableBody></Table></TabsContent>
      </Tabs></CardContent></Card>
    </>}
    <ConfirmActionDialog open={confirmation} onOpenChange={setConfirmation} title="대기 작업을 실행할까요?" description="확인 시각이 된 채널과 오래된 메타데이터를 기존 큐·수집량·할당량 제한 안에서 처리합니다. 접수 후 실제 종료 결과와 남은 대기를 확인할 수 있습니다." confirmLabel="대기 작업 실행" onConfirm={() => { setConfirmation(false); execute.mutate(); }} isProcessing={execute.isPending} restoreFocusTo={executeButton.current} />
  </section>;
}
