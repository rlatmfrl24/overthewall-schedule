import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Coffee,
  DatabaseZap,
  ExternalLink,
  Gauge,
  Inbox,
  Loader2,
  MessageSquareText,
  RefreshCw,
  ShieldAlert,
  TimerReset,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { AdminSectionHeader } from "@/app/admin";
import { cn } from "@/shared/lib/utils";
import { queryKeys } from "@/shared/query/query-keys";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { useToast } from "@/shared/ui/toast";
import { fetchDataRetentionStatus, fetchOperationRuns, fetchOperationsStatus, runDataRetentionPrune } from "../../api/operations";
import type { DataRetentionPolicyStatus, OperationRun, OperationsIssue, OperationsStatusResponse } from "../../model/types";

const WINDOW_HOURS = 24;
const terminalStatuses = new Set(["succeeded", "partial", "failed", "skipped", "throttled"]);
const formatDateTime = (value: number | null | undefined) => value ? new Date(value).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "아직 없음";
const formatBytes = (value: number | null) => value === null
  ? "확인 불가"
  : `${(value / 1024 / 1024).toFixed(1)} MB`;
const formatDuration = (startedAt: number | null, finishedAt: number | null) => {
  if (!startedAt) return "대기 중";
  const seconds = Math.max(0, Math.round(((finishedAt ?? Date.now()) - startedAt) / 1000));
  return seconds < 60 ? `${seconds}초` : `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
};
const runLabel = (jobType: OperationRun["jobType"]) => ({ x_collection: "X 게시글 수집", naver_cafe_collection: "네이버 카페 수집", youtube_feed_collection: "YouTube 신규 피드 수집", schedule_auto_update: "자동 업데이트", retention_prune: "D1 데이터 보존", ingestion_recovery: "수집 복구", channel_reconcile: "채널 동기화", recent_reconcile: "최근 영상 동기화", websub_maintenance: "WebSub 정비", source_health: "소스 상태 점검" }[jobType] ?? jobType);
const statusLabel = (status: string) => ({ queued: "대기", running: "실행 중", succeeded: "성공", partial: "일부 실패", failed: "실패", skipped: "건너뜀", throttled: "제한됨", ok: "정상", warning: "주의", critical: "위험" }[status] ?? status);
const statusClass = (status: string) => cn(status === "succeeded" || status === "success" || status === "ok" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700" : status === "queued" || status === "running" || status === "skipped" || status === "warning" ? "border-amber-500/40 bg-amber-500/10 text-amber-700" : "border-destructive/40 bg-destructive/10 text-destructive");
const progressValue = (run: OperationRun) => run.progress.total === 0 ? 0 : Math.round(((run.progress.succeeded + run.progress.failed + run.progress.skipped + run.progress.throttled) / run.progress.total) * 100);

type StatusTone = "neutral" | "success" | "warning" | "critical";

const statusToneClass = (tone: StatusTone) =>
  ({
    neutral: "border-border",
    success: "border-emerald-500/25",
    warning: "border-amber-500/30",
    critical: "border-destructive/30",
  })[tone];

const statusIconClass = (tone: StatusTone) =>
  ({
    neutral: "border-border bg-muted text-muted-foreground",
    success:
      "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    warning:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    critical: "border-destructive/30 bg-destructive/10 text-destructive",
  })[tone];

function StatusCard({
  title,
  value,
  detail,
  href,
  icon: Icon,
  tone = "neutral",
  featured = false,
}: {
  title: string;
  value: string;
  detail: string;
  href: string;
  icon: LucideIcon;
  tone?: StatusTone;
  featured?: boolean;
}) {
  return (
    <Card
      className={cn(
        "group gap-0 overflow-hidden py-0 shadow-sm transition-colors hover:bg-muted/20",
        statusToneClass(tone),
        featured && "sm:col-span-2 xl:col-span-2",
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg border",
              statusIconClass(tone),
            )}
          >
            <Icon className="size-4" />
          </span>
          <Button asChild variant="ghost" size="icon-sm" className="-mr-2 -mt-2">
            <a href={href} aria-label={`${title} 로그 보기`}>
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        </div>
        <div className="mt-3 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className="text-xl font-semibold leading-none tabular-nums">{value}</p>
          <p className="truncate text-xs text-muted-foreground" title={detail}>
            {detail}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function QueueMetric({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone?: "neutral" | "warning" | "critical" | "primary";
}) {
  const toneClass = {
    neutral: "border-border bg-muted/25 text-foreground",
    warning:
      "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300",
    critical: "border-destructive/30 bg-destructive/5 text-destructive",
    primary: "border-primary/25 bg-primary/5 text-primary",
  }[tone];

  return (
    <div className={cn("rounded-md border px-2.5 py-2", toneClass)}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="mt-1 text-lg font-semibold leading-none tabular-nums">
        {value.toLocaleString("ko-KR")}
      </p>
    </div>
  );
}

function QueueHealthCard({
  activeRunCount,
  outboxBacklog,
  staleLeaseCount,
  used,
  limit,
  usedPercent,
}: {
  activeRunCount: number;
  outboxBacklog: number;
  staleLeaseCount: number;
  used: number;
  limit: number;
  usedPercent: number;
}) {
  const percent = Math.max(0, Math.min(100, usedPercent));
  const remaining = Math.max(0, limit - used);
  const barClass =
    percent >= 90
      ? "bg-destructive"
      : percent >= 70
        ? "bg-amber-500"
        : "bg-emerald-500";

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-4 pb-2 pt-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className="flex size-7 items-center justify-center rounded-md border bg-muted text-muted-foreground">
            <Clock3 className="size-3.5" />
          </span>
          작업 큐
        </CardTitle>
        <CardDescription className="text-xs">대기열과 일일 Queue 사용량</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4">
        <div className="grid grid-cols-3 gap-2">
          <QueueMetric icon={Activity} label="실행 중" value={activeRunCount} tone="primary" />
          <QueueMetric
            icon={Inbox}
            label="대기 outbox"
            value={outboxBacklog}
            tone={outboxBacklog > 0 ? "warning" : "neutral"}
          />
          <QueueMetric
            icon={TimerReset}
            label="stale lease"
            value={staleLeaseCount}
            tone={staleLeaseCount > 0 ? "critical" : "neutral"}
          />
        </div>
        <div className="space-y-2 rounded-md border bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-1.5 font-medium">
              <Gauge className="size-3.5" />
              일일 Queue 사용량
            </span>
            <span className="tabular-nums text-muted-foreground">{percent}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="일일 Queue 사용량"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-2 overflow-hidden rounded-full bg-background"
          >
            <div
              className={cn("h-full rounded-full transition-[width]", barClass)}
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
            <span className="tabular-nums">
              사용 {used.toLocaleString("ko-KR")} / {limit.toLocaleString("ko-KR")}
            </span>
            <span className="tabular-nums">잔여 {remaining.toLocaleString("ko-KR")}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
function D1WriteGuardCard({
  guard,
}: {
  guard: OperationsStatusResponse["scheduledOperations"]["d1WriteGuard"];
}) {
  const blocked = guard.status === "blocked";
  const unavailable = guard.status === "unavailable";
  const percent = Math.max(0, Math.min(100, guard.usedPercent));
  const status = blocked
    ? "Workflow 생성 차단"
    : unavailable
      ? "상태 확인 불가"
      : "생성 가능";

  return (
    <Card
      id="d1-write-guard"
      role={blocked ? "alert" : "status"}
      className={cn(
        "gap-0 py-0 shadow-sm",
        blocked
          ? "border-destructive/40 bg-destructive/[0.03]"
          : unavailable
            ? "border-amber-500/30"
            : "border-emerald-500/25",
      )}
    >
      <CardHeader className="px-4 pb-3 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldAlert className="size-4" />
              D1 write guard · 예상치
            </CardTitle>
            <CardDescription className="mt-1 text-xs">
              {blocked
                ? "일일 쓰기 한도에 도달해 cron이 Workflow와 run을 만들지 않는 사전 차단입니다. 기존 run의 일반 ‘건너뜀’과 다릅니다."
                : unavailable
                  ? "usage ledger를 읽지 못해 cron guard 상태를 확인할 수 없습니다."
                  : "cron Workflow 생성 전에 작업별 보수적 상한을 합산한 admission 예상치입니다. Cloudflare의 실제 Rows Written과는 다릅니다."}
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className={statusClass(blocked ? "critical" : unavailable ? "warning" : "ok")}
          >
            {status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border bg-background/70 p-3">
            <p className="text-xs text-muted-foreground">예상 사용</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {guard.used.toLocaleString("ko-KR")}
            </p>
          </div>
          <div className="rounded-md border bg-background/70 p-3">
            <p className="text-xs text-muted-foreground">예약</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {guard.reserved.toLocaleString("ko-KR")}
            </p>
          </div>
          <div className="rounded-md border bg-background/70 p-3">
            <p className="text-xs text-muted-foreground">일일 한도</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {guard.limit.toLocaleString("ko-KR")}
            </p>
          </div>
          <div className="rounded-md border bg-background/70 p-3">
            <p className="text-xs text-muted-foreground">다음 reset</p>
            <p className="mt-1 text-sm font-semibold">
              {new Date(guard.resetAt).toLocaleString("ko-KR", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                timeZoneName: "short",
              })}
            </p>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">사용 + 예약</span>
            <span className="tabular-nums text-muted-foreground">{percent}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="D1 일일 예상 쓰기 사용량"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div
              className={cn(
                "h-full rounded-full",
                blocked ? "bg-destructive" : percent >= 80 ? "bg-amber-500" : "bg-emerald-500",
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        {blocked ? (
          <div className="space-y-2">
            <p className="text-xs font-medium">Workflow 생성 차단 작업</p>
            <div className="flex flex-wrap gap-1.5">
              {guard.blockedJobTypes.map((jobType) => (
                <Badge key={jobType} variant="outline" className="border-destructive/30 text-destructive">
                  {runLabel(jobType)}
                </Badge>
              ))}
              {guard.blockedJobTypes.length === 0 ? (
                <span className="text-xs text-muted-foreground">현재 활성화된 정기 작업이 없습니다.</span>
              ) : null}
            </div>
            <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              안전 안내: reset 전에는 수동 재실행·prune 등 추가 D1 쓰기 작업을 피하세요. 자동 reset 뒤 새로고침하여 guard 해제를 확인하세요.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
function IssueList({ issues }: { issues: OperationsIssue[] }) {
  if (issues.length === 0) return <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />현재 표시할 운영 이슈가 없습니다.</div>;
  return <div className="space-y-2">{issues.map((issue, index) => <div key={`${issue.code}-${index}`} className={cn("flex gap-2 rounded-md border px-3 py-2 text-sm", issue.severity === "critical" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-amber-500/30 bg-amber-500/5 text-amber-700")}>{issue.severity === "critical" ? <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}<span>{issue.message}</span></div>)}</div>;
}
function RunRow({ run }: { run: OperationRun }) {
  const terminal = terminalStatuses.has(run.status);
  const skippedReason = run.status === "skipped" && typeof run.summary?.reason === "string" ? run.summary.reason : null;
  return <TableRow className={run.status === "queued" || run.status === "running" ? "bg-amber-500/[0.03]" : undefined}><TableCell className="font-medium">{runLabel(run.jobType)}<p className="mt-1 text-xs text-muted-foreground">{run.source === "manual" ? "수동 실행" : "정기 실행"}</p></TableCell><TableCell><Badge variant="outline" className={statusClass(run.status)}>{statusLabel(run.status)}</Badge></TableCell><TableCell className="min-w-48"><div className="flex items-center justify-between text-xs"><span>{run.progress.total === 0 && run.status === "skipped" ? "대상 없음" : `${progressValue(run)}%`}</span><span>{run.progress.succeeded + run.progress.failed + run.progress.skipped + run.progress.throttled}/{run.progress.total}</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full", run.progress.failed > 0 ? "bg-destructive" : terminal ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${progressValue(run)}%` }} /></div><p className="mt-1 text-xs text-muted-foreground">성공 {run.progress.succeeded} · 실패 {run.progress.failed} · 진행 {run.progress.running} · 대기 {run.progress.queued}</p></TableCell><TableCell>{formatDateTime(run.startedAt ?? run.acceptedAt)}<p className="mt-1 text-xs text-muted-foreground">{terminal ? `완료 ${formatDateTime(run.finishedAt)}` : `경과 ${formatDuration(run.startedAt, null)}`}</p></TableCell><TableCell className="max-w-64"><details><summary className="flex cursor-pointer list-none items-center gap-1 text-sm text-muted-foreground">상세 <ChevronDown className="h-3.5 w-3.5" /></summary><div className="mt-2 space-y-1 text-xs"><p>run ID: {run.runId}</p>{skippedReason ? <p>사유: {skippedReason}</p> : null}{run.lastError ? <p className="text-destructive">{run.lastError}</p> : null}{run.failures.map((failure) => <p key={failure.itemId} className="text-destructive">{failure.phase} · {failure.code ?? "오류"}: {failure.message} (재시도 {failure.attempts})</p>)}</div></details></TableCell></TableRow>;
}
function RetentionPolicyTable({ policies }: { policies: DataRetentionPolicyStatus[] }) {
  return <Table><TableHeader><TableRow><TableHead>정책</TableHead><TableHead>보존</TableHead><TableHead>현재 삭제 대상</TableHead></TableRow></TableHeader><TableBody>{policies.map((policy) => <TableRow key={policy.id}><TableCell>{policy.category === "scheduled_operations" ? "정기 작업 · " : ""}{policy.label}</TableCell><TableCell>{policy.retentionDays}일</TableCell><TableCell>{policy.prunableRows.toLocaleString("ko-KR")}건</TableCell></TableRow>)}</TableBody></Table>;
}

export function OperationsDashboard() {
  const queryClient = useQueryClient(); const { toast } = useToast(); const [retentionRunId, setRetentionRunId] = useState<string | null>(null);
  const statusQuery = useQuery({ queryKey: queryKeys.operations.status(WINDOW_HOURS), queryFn: () => fetchOperationsStatus(WINDOW_HOURS), staleTime: 30_000 });
  const runsQuery = useQuery({ queryKey: queryKeys.operations.runs(), queryFn: () => fetchOperationRuns({ limit: 20 }), staleTime: 5_000, refetchInterval: (query) => query.state.data?.runs.some((run) => run.status === "queued" || run.status === "running") ? 5_000 : 30_000 });
  const retentionQuery = useQuery({ queryKey: queryKeys.operations.dataRetention(), queryFn: fetchDataRetentionStatus, staleTime: 30_000 });
  const invalidate = useCallback(() => Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.operations.all }), queryClient.invalidateQueries({ queryKey: queryKeys.settings.all })]), [queryClient]);
  const retentionMutation = useMutation({ mutationFn: () => runDataRetentionPrune({ dryRun: false }), onSuccess: (result) => { if ("runId" in result) { setRetentionRunId(result.runId); void invalidate(); toast({ variant: "success", description: "D1 데이터 정리가 대기열에 등록되었습니다." }); } }, onError: () => toast({ variant: "error", description: "D1 데이터 정리에 실패했습니다." }) });
  useEffect(() => { const run = runsQuery.data?.runs.find((item) => item.runId === retentionRunId); if (run && terminalStatuses.has(run.status)) { setRetentionRunId(null); void invalidate(); } }, [retentionRunId, runsQuery.data, invalidate]);
  const runs = useMemo(() => [...(runsQuery.data?.runs ?? [])].sort((a, b) => Number(b.status === "queued" || b.status === "running") - Number(a.status === "queued" || a.status === "running") || b.acceptedAt - a.acceptedAt), [runsQuery.data]);
  const data = statusQuery.data;
  if (statusQuery.isLoading) return <div className="flex min-h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (!data) return <div className="mx-auto max-w-3xl"><AdminSectionHeader title="운영 대시보드" description="운영 상태를 불러오지 못했습니다." actions={<Button variant="outline" onClick={() => void statusQuery.refetch()}><RefreshCw />다시 시도</Button>} /></div>;
  const latestRetention = retentionQuery.data?.recentRuns[0];
  const queue = data.scheduledOperations.queueOperations;
  const d1WriteGuard = data.scheduledOperations.d1WriteGuard;
  const queuePercent = Math.max(0, Math.min(100, queue.usedPercent));
  const summaryTone: StatusTone = data.summary.status === "ok" ? "success" : data.summary.status === "warning" ? "warning" : "critical";
  const confirmPrune = () => { const count = retentionQuery.data?.totalPrunableRows ?? 0; if (window.confirm(`보존 기간이 지난 D1 데이터 ${count.toLocaleString("ko-KR")}건을 삭제합니다. 계속할까요?`)) retentionMutation.mutate(); };
  return <div className="mx-auto flex max-w-7xl flex-col gap-4"><AdminSectionHeader title="운영 대시보드" description={`최근 ${data.window.hours}시간 기준 상태입니다.`} actions={<Button variant="outline" onClick={() => { void statusQuery.refetch(); void runsQuery.refetch(); void retentionQuery.refetch(); }} disabled={statusQuery.isFetching}><RefreshCw className={cn(statusQuery.isFetching && "animate-spin")} />새로고침</Button>} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <StatusCard title="전체 상태" value={statusLabel(data.summary.status)} detail={`운영 이슈 ${data.summary.issues.length}건`} href="#issues" icon={Activity} tone={summaryTone} featured />
      <StatusCard title="자동 업데이트" value={data.autoUpdate.enabled ? "활성" : "비활성"} detail={`최근 실행 ${formatDateTime(data.autoUpdate.lastRun)}`} href="/admin/settings?tab=runs" icon={CalendarClock} tone={data.autoUpdate.enabled ? "success" : "neutral"} />
      <StatusCard title="X 수집" value={`${data.xCollection.usage.apiCalls} calls`} detail={`예산 ${data.xCollection.usage.quota.todayBudgetUsedPercent}% · ${formatDateTime(data.xCollection.lastRun)}`} href="/admin/member-posts?source=x#x-monitoring" icon={MessageSquareText} tone={data.xCollection.usage.quota.todayBudgetUsedPercent >= 90 ? "critical" : data.xCollection.usage.quota.todayBudgetUsedPercent >= 70 ? "warning" : "neutral"} />
      <StatusCard title="네이버 카페" value={`${data.naverCafe.enabledSourceCount}/${data.naverCafe.sourceCount}`} detail={`주의 ${data.naverCafe.failingSourceCount + data.naverCafe.staleSourceCount}개 · ${formatDateTime(data.naverCafe.collection.lastRun)}`} href="/admin/member-posts?source=naver-cafe#naver-cafe-monitoring" icon={Coffee} tone={data.naverCafe.failingSourceCount > 0 ? "critical" : data.naverCafe.staleSourceCount > 0 ? "warning" : "neutral"} />
      <StatusCard title="D1 write guard" value={d1WriteGuard.status === "blocked" ? "차단" : d1WriteGuard.status === "unavailable" ? "확인 불가" : `${Math.max(0, Math.min(100, d1WriteGuard.usedPercent))}%`} detail={d1WriteGuard.status === "blocked" ? `${d1WriteGuard.blockedJobTypes.length}개 작업 · reset ${formatDateTime(d1WriteGuard.resetAt)}` : `예상 ${d1WriteGuard.used.toLocaleString("ko-KR")} · 예약 ${d1WriteGuard.reserved.toLocaleString("ko-KR")}`} href="#d1-write-guard" icon={ShieldAlert} tone={d1WriteGuard.status === "blocked" ? "critical" : d1WriteGuard.status === "unavailable" ? "warning" : d1WriteGuard.usedPercent >= 80 ? "warning" : "neutral"} />
    </div>
    <D1WriteGuardCard guard={d1WriteGuard} />
    <Card id="recent-runs"><CardHeader><CardTitle>최근 정기·수동 작업</CardTitle><CardDescription>실행 중인 작업을 먼저 표시합니다. 작업별 상세 로그는 각 관리 페이지에서 확인합니다.</CardDescription></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>작업</TableHead><TableHead>상태</TableHead><TableHead>진행률</TableHead><TableHead>시각</TableHead><TableHead>결과</TableHead></TableRow></TableHeader><TableBody>{runs.map((run) => <RunRow key={run.runId} run={run} />)}{!runsQuery.isLoading && runs.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">아직 기록된 작업이 없습니다.</TableCell></TableRow> : null}</TableBody></Table></CardContent></Card>
    <div id="issues" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]"><Card><CardHeader><CardTitle>주의 필요</CardTitle><CardDescription>마지막 업데이트 {new Date(data.updatedAt).toLocaleString("ko-KR")}</CardDescription></CardHeader><CardContent><IssueList issues={data.summary.issues} /></CardContent></Card><QueueHealthCard activeRunCount={data.scheduledOperations.activeRunCount} outboxBacklog={data.scheduledOperations.outboxBacklog} staleLeaseCount={data.scheduledOperations.staleLeaseCount} used={queue.used} limit={queue.limit} usedPercent={queuePercent} /></div>
    <Card><CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="flex items-center gap-2"><DatabaseZap className="h-4 w-4" />D1 데이터 보존</CardTitle><CardDescription>게시물 식별 이력과 일별 집계는 보존하고, 기간이 지난 운영 원문 로그만 정리합니다.</CardDescription></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => void retentionQuery.refetch()} disabled={retentionQuery.isFetching}><RefreshCw className={cn(retentionQuery.isFetching && "animate-spin")} />계산</Button><Button variant="destructive" size="sm" onClick={confirmPrune} disabled={!retentionQuery.data || retentionMutation.isPending}>{retentionMutation.isPending ? <Loader2 className="animate-spin" /> : <DatabaseZap />}prune</Button></div></div></CardHeader><CardContent className="space-y-5">{retentionQuery.data ? <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">D1 사용량</p><p className="mt-1 text-2xl font-semibold">{retentionQuery.data.capacity.usedPercent === null ? "-" : `${retentionQuery.data.capacity.usedPercent}%`}</p><p className="text-xs text-muted-foreground">{formatBytes(retentionQuery.data.capacity.sizeBytes)} / {formatBytes(retentionQuery.data.capacity.maxBytes)}</p><Badge variant="outline" className={statusClass(retentionQuery.data.capacity.status === "notice" ? "warning" : retentionQuery.data.capacity.status)}>{retentionQuery.data.capacity.status === "unavailable" ? "확인 불가" : retentionQuery.data.capacity.status === "ok" ? "정상" : retentionQuery.data.capacity.status === "notice" ? "60% 알림" : retentionQuery.data.capacity.status === "warning" ? "75% 경고" : "85% 위험"}</Badge></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">현재 삭제 대상</p><p className="mt-1 text-2xl font-semibold">{retentionQuery.data.totalPrunableRows.toLocaleString("ko-KR")}건</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">최근 삭제</p><p className="mt-1 text-2xl font-semibold">{latestRetention?.totalDeletedRows.toLocaleString("ko-KR") ?? "-"}건</p><p className="text-xs text-muted-foreground">{formatDateTime(latestRetention?.finishedAt)}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">최근 검증</p><p className="mt-1 font-semibold">{latestRetention?.verification === "verified" ? "삭제 후 대상 없음" : latestRetention?.verification === "remaining" ? `잔여 ${latestRetention.remainingPrunableRows?.toLocaleString("ko-KR")}건` : "기존 이력: 검증 정보 없음"}</p></div></div><RetentionPolicyTable policies={retentionQuery.data.policies} /><section><h3 className="mb-2 text-sm font-semibold">최근 prune 이력</h3><Table><TableHeader><TableRow><TableHead>완료</TableHead><TableHead>구분</TableHead><TableHead>상태</TableHead><TableHead>삭제</TableHead><TableHead>검증</TableHead></TableRow></TableHeader><TableBody>{retentionQuery.data.recentRuns.map((run) => <TableRow key={run.runId}><TableCell>{formatDateTime(run.finishedAt)}</TableCell><TableCell>{run.source === "manual" ? "수동" : "정기"}</TableCell><TableCell><Badge variant="outline" className={statusClass(run.status)}>{statusLabel(run.status)}</Badge></TableCell><TableCell>{run.totalDeletedRows.toLocaleString("ko-KR")}건</TableCell><TableCell>{run.verification === "verified" ? "정상" : run.verification === "remaining" ? `잔여 ${run.remainingPrunableRows}건` : "미확인"}</TableCell></TableRow>)}{retentionQuery.data.recentRuns.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">prune 이력이 없습니다.</TableCell></TableRow> : null}</TableBody></Table></section></> : <p className="text-sm text-destructive">D1 보존 상태를 불러오지 못했습니다.</p>}</CardContent></Card>
  </div>;
}
