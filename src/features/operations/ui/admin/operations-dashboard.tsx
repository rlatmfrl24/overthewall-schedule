import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Coffee,
  DatabaseZap,
  ExternalLink,
  Gauge,
  HardDrive,
  History,
  Inbox,
  Info,
  ListChecks,
  Loader2,
  MessageSquareText,
  RefreshCw,
  ShieldAlert,
  TimerReset,
  Youtube,
  type LucideIcon,
} from "lucide-react";
import { AdminSectionHeader } from "@/app/admin";
import { cn } from "@/shared/lib/utils";
import { queryKeys } from "@/shared/query/query-keys";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { useToast } from "@/shared/ui/toast";
import {
  fetchD1Observability,
  fetchDataRetentionStatus,
  fetchOperationJobSummaries,
  fetchOperationRuns,
  fetchOperationsStatus,
  runDataRetentionPrune,
} from "../../api/operations";
import type {
  D1ObservabilityResponse,
  DataRetentionPolicyStatus,
  OperationJobSummary,
  OperationRun,
  OperationsIssue,
  OperationsStatusResponse,
} from "../../model/types";

const WINDOW_HOURS = 24;
const terminalStatuses = new Set([
  "succeeded",
  "partial",
  "failed",
  "skipped",
  "throttled",
]);
const neutralSkipReasons = new Set([
  "no_targets",
  "no_eligible_targets",
  "all_handles_cooldown",
  "coalesced",
  "not_due",
]);

const formatDateTime = (value: number | null | undefined) =>
  value
    ? new Date(value).toLocaleString("ko-KR", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "아직 없음";

const formatBytes = (value: number | null) =>
  value === null ? "확인 불가" : `${(value / 1024 / 1024).toFixed(1)} MB`;

const formatDuration = (startedAt: number | null, finishedAt: number | null) => {
  if (!startedAt) return "대기 중";
  const seconds = Math.max(
    0,
    Math.round(((finishedAt ?? Date.now()) - startedAt) / 1_000),
  );
  return seconds < 60
    ? `${seconds}초`
    : `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
};

const runLabel = (jobType: OperationRun["jobType"]) =>
  ({
    x_collection: "X 게시글 수집",
    naver_cafe_collection: "네이버 카페 수집",
    youtube_feed_collection: "YouTube 신규 피드 수집",
    schedule_auto_update: "자동 업데이트",
    retention_prune: "D1 데이터 보존",
    ingestion_recovery: "수집 복구",
    channel_reconcile: "채널 동기화",
    recent_reconcile: "최근 영상 동기화",
    websub_maintenance: "WebSub 정비",
    source_health: "소스 상태 점검",
  })[jobType] ?? jobType;

const statusLabel = (status: string) =>
  ({
    queued: "대기",
    running: "실행 중",
    succeeded: "성공",
    partial: "일부 실패",
    failed: "실패",
    skipped: "건너뜀",
    throttled: "제한됨",
    healthy: "정상",
    attention: "주의",
    inactive: "비활성",
    ok: "정상",
    warning: "주의",
    critical: "위험",
    success: "성공",
  })[status] ?? status;

const getRunReason = (run: OperationRun) => {
  const reason = run.summary?.reason;
  return typeof reason === "string" && reason.trim()
    ? reason.trim()
    : run.lastError?.trim() || null;
};

const isNeutralSkip = (run: OperationRun) =>
  run.status === "skipped" &&
  ((run.progress.total === 0 && !getRunReason(run)) ||
    neutralSkipReasons.has(getRunReason(run) ?? ""));

const neutralSkipLabel = (reason: string | null) =>
  ({
    no_targets: "대상 없음",
    no_eligible_targets: "대상 없음",
    all_handles_cooldown: "다음 점검 대기",
    coalesced: "동시 실행 병합",
    not_due: "아직 실행 시각 아님",
  })[reason ?? ""] ?? "대상 없음";

const statusClass = (status: string, neutral = false) =>
  cn(
    neutral
      ? "border-border bg-muted/40 text-muted-foreground"
      : status === "succeeded" ||
          status === "success" ||
          status === "ok" ||
          status === "healthy"
        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        : status === "queued" ||
            status === "running" ||
            status === "warning" ||
            status === "attention"
          ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          : status === "inactive"
            ? "border-border bg-muted/40 text-muted-foreground"
            : "border-destructive/40 bg-destructive/10 text-destructive",
  );

const progressValue = (run: OperationRun) =>
  run.progress.total === 0
    ? 0
    : Math.round(
        ((run.progress.succeeded +
          run.progress.failed +
          run.progress.skipped +
          run.progress.throttled) /
          run.progress.total) *
          100,
      );

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

function SectionHeading({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-1">
      <h2 id={id} className="text-base font-semibold">{title}</h2>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function StatusCard({
  title,
  value,
  detail,
  href,
  icon: Icon,
  tone = "neutral",
}: {
  title: string;
  value: string;
  detail: string;
  href: string;
  icon: LucideIcon;
  tone?: StatusTone;
}) {
  return (
    <Card
      className={cn(
        "group gap-0 overflow-hidden py-0 shadow-sm transition-colors hover:bg-muted/20",
        statusToneClass(tone),
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
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <Button asChild variant="ghost" size="icon-sm" className="-mr-2 -mt-2">
            <a href={href} aria-label={`${title} 상세 보기`}>
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        </div>
        <div className="mt-3 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className="text-xl font-semibold leading-none tabular-nums">{value}</p>
          <p className="text-xs leading-5 text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function IssuePanel({ issues, updatedAt }: { issues: OperationsIssue[]; updatedAt: string }) {
  if (issues.length === 0) {
    return (
      <div
        id="issues"
        role="status"
        aria-live="polite"
        className="flex items-center gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] px-4 py-3"
      >
        <CheckCircle2 className="size-5 text-emerald-600" aria-hidden="true" />
        <div>
          <h3 className="text-sm font-semibold">지금 확인할 운영 이슈가 없습니다</h3>
          <p className="text-xs text-muted-foreground">
            마지막 상태 집계 {new Date(updatedAt).toLocaleString("ko-KR")}
          </p>
        </div>
      </div>
    );
  }
  const hasCriticalIssue = issues.some((issue) => issue.severity === "critical");
  const guidanceForIssue = (issue: OperationsIssue) => {
    if (issue.code === "scheduled_d1_write_guard_blocked") {
      return {
        impact: "새 예약 작업이 Workflow와 run을 만들기 전에 억제됩니다.",
        action: "쓰기 원인 상위를 확인하고 필요하면 다음 UTC 초기화까지 기다리세요.",
      };
    }
    if (issue.code.includes("outbox") || issue.code.includes("lease") || issue.code.includes("queue")) {
      return {
        impact: "예약 작업의 시작 또는 완료 반영이 지연될 수 있습니다.",
        action: "작업별 최신 상태와 전체 이력에서 실패·재시도 항목을 확인하세요.",
      };
    }
    if (issue.code.startsWith("x_")) {
      return {
        impact: "X 신규 게시물의 피드 반영이 늦어질 수 있습니다.",
        action: "X 수집 모니터에서 최근 점검, 예산, 공급자 backoff를 확인하세요.",
      };
    }
    if (issue.code.startsWith("naver_")) {
      return {
        impact: "네이버 신규 게시물의 피드 반영이 늦어질 수 있습니다.",
        action: "네이버 수집 모니터와 관리자 킬스위치 상태를 확인하세요.",
      };
    }
    return {
      impact: "관련 예약 작업이나 관리자 반영이 지연될 수 있습니다.",
      action: "아래 작업별 최신 상태에서 판정 사유와 다음 예상 시각을 확인하세요.",
    };
  };
  return (
    <Card id="issues" role={hasCriticalIssue ? "alert" : "status"} aria-live="polite" className="border-amber-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="size-4 text-amber-600" /> 지금 확인할 것 · {issues.length}건
        </CardTitle>
        <CardDescription>
          원인과 영향을 확인한 뒤 필요한 조치를 진행하세요. 마지막 집계 {new Date(updatedAt).toLocaleString("ko-KR")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {issues.map((issue, index) => {
            const guidance = guidanceForIssue(issue);
            return (
            <li
              key={`${issue.code}-${index}`}
              className={cn(
                "rounded-md border p-3 text-sm",
                issue.severity === "critical"
                  ? "border-destructive/30 bg-destructive/[0.04]"
                  : "border-amber-500/25 bg-amber-500/[0.04]",
              )}
            >
              <div className="flex items-start gap-2">
                <Badge variant="outline" className={statusClass(issue.severity)}>
                  {statusLabel(issue.severity)}
                </Badge>
                <div>
                  <p><span className="font-medium">원인:</span> {issue.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground"><span className="font-medium text-foreground">영향:</span> {guidance.impact}</p>
                  <p className="mt-1 text-xs text-muted-foreground"><span className="font-medium text-foreground">조치:</span> {guidance.action}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">코드 {issue.code}</p>
                </div>
              </div>
            </li>
            );
          })}
        </ul>
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
    warning: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300",
    critical: "border-destructive/30 bg-destructive/5 text-destructive",
    primary: "border-primary/25 bg-primary/5 text-primary",
  }[tone];
  return (
    <div className={cn("rounded-md border px-2.5 py-2", toneClass)}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" /> {label}
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
  const barClass = percent >= 90 ? "bg-destructive" : percent >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-4 pb-2 pt-4">
        <CardTitle className="flex items-center gap-2 text-sm"><Clock3 className="size-4" /> 작업 큐</CardTitle>
        <CardDescription className="text-xs">실행 대기와 일일 Queue 사용량</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4">
        <div className="grid grid-cols-3 gap-2">
          <QueueMetric icon={Activity} label="실행 중" value={activeRunCount} tone="primary" />
          <QueueMetric icon={Inbox} label="전송 대기" value={outboxBacklog} tone={outboxBacklog > 0 ? "warning" : "neutral"} />
          <QueueMetric icon={TimerReset} label="만료 lease" value={staleLeaseCount} tone={staleLeaseCount > 0 ? "critical" : "neutral"} />
        </div>
        <div className="space-y-2 rounded-md border bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-1.5 font-medium"><Gauge className="size-3.5" /> 일일 Queue 사용량</span>
            <span className="tabular-nums text-muted-foreground">{percent}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="일일 Queue 사용량"
            aria-valuemin={0}
            aria-valuemax={limit}
            aria-valuenow={used}
            className="h-2 overflow-hidden rounded-full bg-background"
          >
            <div className={cn("h-full rounded-full transition-[width]", barClass)} style={{ width: `${percent}%` }} />
          </div>
          <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
            <span className="tabular-nums">사용 {used.toLocaleString("ko-KR")} / {limit.toLocaleString("ko-KR")}</span>
            <span className="tabular-nums">잔여 {remaining.toLocaleString("ko-KR")}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function UsageProgress({ label, value, limit, percent }: { label: string; value: number; limit: number; percent: number }) {
  const width = Math.max(0, Math.min(100, percent));
  const barClass = percent >= 95 ? "bg-destructive" : percent >= 85 ? "bg-orange-500" : percent >= 70 ? "bg-amber-500" : "bg-emerald-500";
  const severity = percent >= 95 ? "critical" : percent >= 85 ? "warning" : percent >= 70 ? "attention" : "healthy";
  const Indicator = percent >= 95 ? ShieldAlert : percent >= 70 ? AlertTriangle : CheckCircle2;
  return (
    <div className="space-y-2 rounded-lg border bg-muted/15 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-medium">{label}</p>
        <Badge variant="outline" className={cn("gap-1 text-[11px]", statusClass(severity))}><Indicator className="size-3" aria-hidden="true" /> {percent >= 95 ? "위험" : percent >= 85 ? "경고" : percent >= 70 ? "주의" : "정상"} · <span className="tabular-nums">{percent}%</span></Badge>
      </div>
      <p className="text-lg font-semibold tabular-nums">
        {value.toLocaleString("ko-KR")}
        <span className="ml-1 text-xs font-normal text-muted-foreground">/ {limit.toLocaleString("ko-KR")}</span>
      </p>
      <div
        role="progressbar"
        aria-label={`${label} · UTC 당일`}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={value}
        aria-valuetext={`${value.toLocaleString("ko-KR")} / ${limit.toLocaleString("ko-KR")}, UTC 00:00 초기화`}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div className={cn("h-full rounded-full", barClass)} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

const d1ReasonLabel = (reasonCode: D1ObservabilityResponse["reasonCode"]) =>
  ({
    token_unconfigured: "D1 토큰이 Worker secret에 설정되지 않았습니다.",
    permission_denied: "Analytics 읽기 권한을 확인해야 합니다.",
    upstream_timeout: "Cloudflare 응답 시간이 초과되었습니다.",
    upstream_error: "Cloudflare Metrics를 일시적으로 불러오지 못했습니다.",
    invalid_response: "Cloudflare 응답 형식을 확인해야 합니다.",
  })[reasonCode ?? "upstream_error"];

function D1ObservabilityCard({ data, loading }: { data: D1ObservabilityResponse | undefined; loading: boolean }) {
  if (loading) {
    return <Card className="lg:col-span-2"><CardContent className="flex min-h-64 items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /><span className="sr-only">Cloudflare D1 실계측 불러오는 중</span></CardContent></Card>;
  }
  if (!data || data.status !== "available" || !data.currentDay) {
    return (
      <Card role="status" className="lg:col-span-2">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="size-4" /> Cloudflare D1 실제 사용량</CardTitle><CardDescription>Cloudflare Metrics · UTC 당일</CardDescription></CardHeader>
        <CardContent className="rounded-lg border border-dashed p-4 text-sm"><p className="font-medium">실계측 확인 불가</p><p className="mt-1 text-muted-foreground">{d1ReasonLabel(data?.reasonCode)} 예약 작업 실행과 전체 운영 상태에는 영향을 주지 않습니다.</p></CardContent>
      </Card>
    );
  }
  const maximum = Math.max(1, ...data.daily.map((item) => item.rowsWritten));
  return (
    <Card role="status" className="lg:col-span-2">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="size-4" /> Cloudflare D1 실제 사용량</CardTitle><CardDescription className="mt-1">Cloudflare Metrics 집계 · UTC 당일 · 청구 확정값 아님</CardDescription></div>
          <Badge variant="outline" className="tabular-nums">갱신 {new Date(data.generatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}{data.cacheAgeSeconds === null ? "" : ` · 캐시 ${data.cacheAgeSeconds}초`}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <UsageProgress label="실제 Rows Written" value={data.currentDay.rowsWritten} limit={data.currentDay.rowsWrittenLimit} percent={data.currentDay.rowsWrittenPercent} />
          <UsageProgress label="실제 Rows Read" value={data.currentDay.rowsRead} limit={data.currentDay.rowsReadLimit} percent={data.currentDay.rowsReadPercent} />
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-md border px-3 py-2"><dt className="text-xs text-muted-foreground">쓰기 쿼리</dt><dd className="mt-1 font-semibold tabular-nums">{data.currentDay.writeQueries.toLocaleString("ko-KR")}회</dd></div><div className="rounded-md border px-3 py-2"><dt className="text-xs text-muted-foreground">읽기 쿼리</dt><dd className="mt-1 font-semibold tabular-nums">{data.currentDay.readQueries.toLocaleString("ko-KR")}회</dd></div></dl>
        <div>
          <h3 className="text-sm font-semibold">최근 7일 쓰기 추세</h3>
          <div className="mt-3 grid grid-cols-7 items-end gap-2" aria-label="최근 7일 D1 Rows Written">
            {data.daily.map((day) => (
              <div key={day.day} className="flex min-w-0 flex-col items-center gap-1">
                <div className="flex h-20 w-full items-end overflow-hidden rounded bg-muted/50">
                  <div className="w-full rounded bg-primary/70" style={{ height: `${Math.max(3, (day.rowsWritten / maximum) * 100)}%` }} title={`${day.day}: ${day.rowsWritten.toLocaleString("ko-KR")} rows written`} />
                </div>
                <span className="text-[10px] tabular-nums text-muted-foreground">{day.day.slice(5)}</span>
                <span className="max-w-full truncate text-[10px] tabular-nums">{day.rowsWritten.toLocaleString("ko-KR")}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">최근 24시간 쓰기 원인 상위</h3><span className="text-[11px] text-muted-foreground">상위 쿼리 집계 기준</span></div>
          <div className="mt-2 space-y-2">
            {data.topWriteWorkloads.map((workload) => (
              <div key={workload.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border px-3 py-2 text-sm">
                <div className="min-w-0"><p className="truncate font-medium">{workload.label}</p><p className="text-xs text-muted-foreground">쿼리 {workload.queryCount.toLocaleString("ko-KR")}회</p></div>
                <div className="text-right tabular-nums"><p>{workload.rowsWritten.toLocaleString("ko-KR")} rows</p><p className="text-xs text-muted-foreground">{workload.sharePercent}%</p></div>
              </div>
            ))}
            {data.topWriteWorkloads.length === 0 ? <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">최근 24시간에 기록된 쓰기 쿼리가 없습니다.</p> : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function D1WriteGuardCard({ guard }: { guard: OperationsStatusResponse["scheduledOperations"]["d1WriteGuard"] }) {
  const blocked = guard.status === "blocked";
  const unavailable = guard.status === "unavailable";
  const percent = Math.max(0, Math.min(100, guard.usedPercent));
  return (
    <Card id="d1-write-guard" role={blocked ? "alert" : "status"} className={cn(blocked ? "border-destructive/40 bg-destructive/[0.03]" : unavailable ? "border-amber-500/30" : "border-emerald-500/25")}>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldAlert className="size-4" /> 정기 작업 쓰기 예산</CardTitle><CardDescription>예약 작업 실행 허용을 위한 보수적 예상치이며 실제 Cloudflare D1 사용량과 다릅니다.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3"><Badge variant="outline" className={statusClass(blocked ? "critical" : unavailable ? "warning" : "healthy")}>{blocked ? "예약 작업 생성 차단" : unavailable ? "확인 불가" : "실행 가능"}</Badge><span className="text-sm font-semibold tabular-nums">{guard.usedPercent}%</span></div>
        <div role="progressbar" aria-label="정기 작업 일일 예상 쓰기 예산" aria-valuemin={0} aria-valuemax={guard.limit} aria-valuenow={guard.used + guard.reserved} aria-valuetext={`${(guard.used + guard.reserved).toLocaleString("ko-KR")} / ${guard.limit.toLocaleString("ko-KR")}, UTC 초기화 ${formatDateTime(guard.resetAt)}`} className="h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full", blocked ? "bg-destructive" : "bg-primary")} style={{ width: `${percent}%` }} /></div>
        <dl className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-md border p-3"><dt className="text-xs text-muted-foreground">사용 예상</dt><dd className="mt-1 font-semibold tabular-nums">{guard.used.toLocaleString("ko-KR")}</dd></div><div className="rounded-md border p-3"><dt className="text-xs text-muted-foreground">예약 중</dt><dd className="mt-1 font-semibold tabular-nums">{guard.reserved.toLocaleString("ko-KR")}</dd></div></dl>
        <p className="text-xs text-muted-foreground">내부 한도 {guard.limit.toLocaleString("ko-KR")} · UTC 초기화 {formatDateTime(guard.resetAt)}</p>
        {blocked ? <p className="rounded-md border border-destructive/30 bg-destructive/[0.04] p-3 text-sm">예약 작업은 Workflow와 run을 만들지 않는 사전 차단 상태입니다. 추가 D1 쓰기 작업을 피하고 UTC 초기화를 기다리세요.</p> : null}
      </CardContent>
    </Card>
  );
}

function RunProgress({ run }: { run: OperationRun }) {
  const terminal = terminalStatuses.has(run.status);
  const neutral = isNeutralSkip(run);
  return (
    <div className="min-w-48">
      <div className="flex items-center justify-between text-xs"><span>{run.progress.total === 0 && neutral ? neutralSkipLabel(getRunReason(run)) : `${progressValue(run)}%`}</span><span>{run.progress.succeeded + run.progress.failed + run.progress.skipped + run.progress.throttled}/{run.progress.total}</span></div>
      <div role="progressbar" aria-label={`${runLabel(run.jobType)} 진행률`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressValue(run)} className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full", run.progress.failed > 0 ? "bg-destructive" : neutral ? "bg-muted-foreground/40" : terminal ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${progressValue(run)}%` }} /></div>
      <p className="mt-1 text-xs text-muted-foreground">성공 {run.progress.succeeded} · 실패 {run.progress.failed} · 진행 {run.progress.running} · 대기 {run.progress.queued}</p>
    </div>
  );
}

function RunDetails({ run }: { run: OperationRun }) {
  const reason = getRunReason(run);
  return (
    <details><summary className="flex cursor-pointer list-none items-center gap-1 text-sm text-muted-foreground">상세 <ChevronDown className="size-3.5" /></summary><div className="mt-2 space-y-1 text-xs"><p>run ID: {run.runId}</p>{reason ? <p>사유: {reason}</p> : null}{run.lastError ? <p className="text-destructive">{run.lastError}</p> : null}{run.failures.map((failure) => <p key={failure.itemId} className="text-destructive">{failure.phase} · {failure.code ?? "오류"}: {failure.message} (재시도 {failure.attempts})</p>)}</div></details>
  );
}

function RunRow({ run }: { run: OperationRun }) {
  const terminal = terminalStatuses.has(run.status);
  const neutral = isNeutralSkip(run);
  return (
    <TableRow className={run.status === "queued" || run.status === "running" ? "bg-amber-500/[0.03]" : undefined}>
      <TableCell className="font-medium">{runLabel(run.jobType)}<p className="mt-1 text-xs text-muted-foreground">{run.source === "manual" ? "수동 실행" : "정기 실행"}</p></TableCell>
      <TableCell><Badge variant="outline" className={statusClass(run.status, neutral)}>{neutral ? neutralSkipLabel(getRunReason(run)) : statusLabel(run.status)}</Badge></TableCell>
      <TableCell><RunProgress run={run} /></TableCell>
      <TableCell>{formatDateTime(run.startedAt ?? run.acceptedAt)}<p className="mt-1 text-xs text-muted-foreground">{terminal ? `완료 ${formatDateTime(run.finishedAt)}` : `경과 ${formatDuration(run.startedAt, null)}`}</p></TableCell>
      <TableCell className="max-w-64"><RunDetails run={run} /></TableCell>
    </TableRow>
  );
}

function RunCard({ run }: { run: OperationRun }) {
  const neutral = isNeutralSkip(run);
  return (
    <article className="space-y-3 rounded-lg border p-3"><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">{runLabel(run.jobType)}</h3><p className="text-xs text-muted-foreground">{run.source === "manual" ? "수동 실행" : "정기 실행"} · {formatDateTime(run.acceptedAt)}</p></div><Badge variant="outline" className={statusClass(run.status, neutral)}>{neutral ? neutralSkipLabel(getRunReason(run)) : statusLabel(run.status)}</Badge></div><RunProgress run={run} /><RunDetails run={run} /></article>
  );
}

const jobSummaryPriority = (summary: OperationJobSummary) => {
  if (summary.health === "critical" || summary.health === "attention") return 0;
  if (["queued", "running"].includes(summary.latestRun?.status ?? "")) return 1;
  if (summary.normalSkip) return 3;
  if (summary.health === "healthy") return 2;
  return 4;
};

function JobSummaryStatus({ summary }: { summary: OperationJobSummary }) {
  return (
    <div className="space-y-1"><Badge variant="outline" className={statusClass(summary.health)}>{statusLabel(summary.health)}</Badge>{summary.latestRun ? <p className="text-xs text-muted-foreground">{summary.normalSkip ? neutralSkipLabel(summary.reasonCode) : statusLabel(summary.latestRun.status)}</p> : null}</div>
  );
}

function JobSummaryTable({ summaries }: { summaries: OperationJobSummary[] }) {
  const sorted = [...summaries].sort((left, right) => jobSummaryPriority(left) - jobSummaryPriority(right) || (right.latestCheckAt ?? 0) - (left.latestCheckAt ?? 0));
  return (
    <>
      <div className="hidden overflow-x-auto md:block"><Table><TableHeader><TableRow><TableHead>작업</TableHead><TableHead>판정</TableHead><TableHead>최근 점검</TableHead><TableHead>최근 성공</TableHead><TableHead>다음 기준</TableHead><TableHead>결과</TableHead></TableRow></TableHeader><TableBody>{sorted.map((summary) => <TableRow key={summary.jobType}><TableCell className="font-medium">{runLabel(summary.jobType)}</TableCell><TableCell><JobSummaryStatus summary={summary} /></TableCell><TableCell className="tabular-nums">{formatDateTime(summary.latestCheckAt)}</TableCell><TableCell className="tabular-nums">{formatDateTime(summary.latestSuccessAt)}</TableCell><TableCell className="tabular-nums">{formatDateTime(summary.nextExpectedAt)}</TableCell><TableCell className="max-w-72 text-sm text-muted-foreground">{summary.reasonLabel ?? (summary.latestRun ? "정상 완료" : "실행 기록 없음")}</TableCell></TableRow>)}</TableBody></Table></div>
      <div className="space-y-2 md:hidden">{sorted.map((summary) => <article key={summary.jobType} className="rounded-lg border p-3"><div className="flex items-start justify-between gap-3"><h3 className="text-sm font-semibold">{runLabel(summary.jobType)}</h3><JobSummaryStatus summary={summary} /></div><dl className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><dt className="text-muted-foreground">최근 점검</dt><dd>{formatDateTime(summary.latestCheckAt)}</dd></div><div><dt className="text-muted-foreground">최근 성공</dt><dd>{formatDateTime(summary.latestSuccessAt)}</dd></div><div className="col-span-2"><dt className="text-muted-foreground">다음 기준</dt><dd>{formatDateTime(summary.nextExpectedAt)}</dd></div></dl><p className="mt-2 text-xs text-muted-foreground">{summary.reasonLabel ?? (summary.latestRun ? "정상 완료" : "실행 기록 없음")}</p></article>)}</div>
    </>
  );
}

function RetentionPolicyTable({ policies }: { policies: DataRetentionPolicyStatus[] }) {
  return <Table><TableHeader><TableRow><TableHead>정책</TableHead><TableHead>보존</TableHead><TableHead>현재 삭제 대상</TableHead></TableRow></TableHeader><TableBody>{policies.map((policy) => <TableRow key={policy.id}><TableCell>{policy.category === "scheduled_operations" ? "정기 작업 · " : ""}{policy.label}</TableCell><TableCell>{policy.retentionDays}일</TableCell><TableCell>{policy.prunableRows.toLocaleString("ko-KR")}건</TableCell></TableRow>)}</TableBody></Table>;
}

export function OperationsDashboard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [retentionRunId, setRetentionRunId] = useState<string | null>(null);
  const [runView, setRunView] = useState<"summary" | "history">("summary");
  const statusQuery = useQuery({ queryKey: queryKeys.operations.status(WINDOW_HOURS), queryFn: () => fetchOperationsStatus(WINDOW_HOURS), refetchInterval: 30_000 });
  const jobSummariesQuery = useQuery({ queryKey: queryKeys.operations.jobSummaries(), queryFn: fetchOperationJobSummaries, refetchInterval: 60_000 });
  const d1Query = useQuery({ queryKey: queryKeys.operations.d1Observability(), queryFn: fetchD1Observability, staleTime: 5 * 60_000, refetchInterval: 5 * 60_000 });
  const runsQuery = useQuery({
    queryKey: queryKeys.operations.runs(),
    queryFn: () => fetchOperationRuns({ limit: 20 }),
    enabled: runView === "history" || retentionRunId !== null,
    refetchInterval: (query) => (query.state.data?.runs ?? []).some((run) => run.status === "queued" || run.status === "running") ? 5_000 : 30_000,
  });
  const retentionQuery = useQuery({ queryKey: queryKeys.operations.dataRetention(), queryFn: fetchDataRetentionStatus, staleTime: 30_000 });
  const invalidate = useCallback(() => Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.operations.all }), queryClient.invalidateQueries({ queryKey: queryKeys.settings.all })]), [queryClient]);
  const retentionMutation = useMutation({ mutationFn: () => runDataRetentionPrune({ dryRun: false }), onSuccess: (result) => { if ("runId" in result) { setRetentionRunId(result.runId); void invalidate(); toast({ variant: "success", description: "D1 데이터 정리가 대기열에 등록되었습니다." }); } }, onError: () => toast({ variant: "error", description: "D1 데이터 정리에 실패했습니다." }) });
  useEffect(() => { const run = runsQuery.data?.runs.find((item) => item.runId === retentionRunId); if (run && terminalStatuses.has(run.status)) { setRetentionRunId(null); void invalidate(); } }, [retentionRunId, runsQuery.data, invalidate]);
  const historyRuns = useMemo(() => [...(runsQuery.data?.runs ?? [])].sort((left, right) => Number(right.status === "queued" || right.status === "running") - Number(left.status === "queued" || left.status === "running") || right.acceptedAt - left.acceptedAt), [runsQuery.data]);
  const data = statusQuery.data;
  if (statusQuery.isLoading) return <div className="flex min-h-96 items-center justify-center"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>;
  if (!data) return <div className="mx-auto max-w-3xl"><AdminSectionHeader headingLevel={1} title="운영 대시보드" description="운영 상태를 불러오지 못했습니다." actions={<Button variant="outline" onClick={() => void statusQuery.refetch()}><RefreshCw />다시 시도</Button>} /></div>;

  const latestRetention = retentionQuery.data?.recentRuns[0];
  const queue = data.scheduledOperations.queueOperations;
  const d1WriteGuard = data.scheduledOperations.d1WriteGuard;
  const summaries = jobSummariesQuery.data?.summaries ?? [];
  const youtubeSummary = summaries.find((item) => item.jobType === "youtube_feed_collection");
  const latestStoredXRun = data.xCollection.recentRuns.find((run) => run.postsStored > 0);
  const xIssues = data.summary.issues.filter((issue) => issue.code.startsWith("x_"));
  const naverIssues = data.summary.issues.filter((issue) => issue.code.startsWith("naver_"));
  const autoIssues = data.summary.issues.filter((issue) => issue.code.startsWith("auto_") || issue.code.startsWith("pending_schedule"));
  const toneForIssues = (issues: OperationsIssue[]): StatusTone => issues.some((issue) => issue.severity === "critical") ? "critical" : issues.length > 0 ? "warning" : "success";
  const confirmPrune = () => { const count = retentionQuery.data?.totalPrunableRows ?? 0; if (window.confirm(`보존 기간이 지난 D1 데이터 ${count.toLocaleString("ko-KR")}건을 삭제합니다. 계속할까요?`)) retentionMutation.mutate(); };
  const refreshAll = () => { void statusQuery.refetch(); void jobSummariesQuery.refetch(); void d1Query.refetch(); void retentionQuery.refetch(); if (runView === "history") void runsQuery.refetch(); };
  const selectRunView = (view: "summary" | "history") => {
    setRunView(view);
    window.requestAnimationFrame(() => document.getElementById(view === "summary" ? "job-summary-tab" : "job-history-tab")?.focus());
  };
  const handleRunTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    selectRunView(event.key === "ArrowLeft" || event.key === "Home" ? "summary" : "history");
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <AdminSectionHeader headingLevel={1} title="운영 대시보드" description={`운영 상태 ${data.window.hours}시간 · D1 실계측 UTC 일자 기준`} actions={<Button variant="outline" onClick={refreshAll} disabled={statusQuery.isFetching}><RefreshCw className={cn(statusQuery.isFetching && "animate-spin")} /> 새로고침</Button>} />

      <section className="space-y-3" aria-labelledby="attention-heading">
        <SectionHeading id="attention-heading" title="지금 확인할 것" description="문제와 대기열 상태를 다른 이력보다 먼저 확인합니다." />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]"><IssuePanel issues={data.summary.issues} updatedAt={data.updatedAt} /><QueueHealthCard activeRunCount={data.scheduledOperations.activeRunCount} outboxBacklog={data.scheduledOperations.outboxBacklog} staleLeaseCount={data.scheduledOperations.staleLeaseCount} used={queue.used} limit={queue.limit} usedPercent={Math.max(0, Math.min(100, queue.usedPercent))} /></div>
      </section>

      <section className="space-y-3" aria-labelledby="collection-heading">
        <SectionHeading id="collection-heading" title="수집 상태" description="공급자별 최근 정상 점검과 실제 수집 결과를 구분합니다." />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatusCard title="자동 업데이트" value={data.autoUpdate.enabled ? statusLabel(autoIssues.length ? data.summary.status : "ok") : "비활성"} detail={`최근 정상 ${formatDateTime(data.autoUpdate.lastRun)} · 대기 ${data.autoUpdate.pending.total}건`} href="/admin/settings?tab=runs" icon={CalendarClock} tone={data.autoUpdate.enabled ? toneForIssues(autoIssues) : "neutral"} />
          <StatusCard title="X 신규 게시물" value={data.xCollection.enabled ? statusLabel(xIssues.some((issue) => issue.severity === "critical") ? "critical" : xIssues.length ? "warning" : "ok") : "비활성"} detail={`최근 점검 ${formatDateTime(data.xCollection.lastRun)} · 신규 저장 ${formatDateTime(latestStoredXRun?.finishedAt)} · UTC 예산 ${data.xCollection.usage.quota.todayBudgetUsedPercent}%`} href="/admin/member-posts?source=x#x-monitoring" icon={MessageSquareText} tone={data.xCollection.enabled ? toneForIssues(xIssues) : "neutral"} />
          <StatusCard title="네이버 카페" value={data.naverCafe.enabled ? statusLabel(naverIssues.some((issue) => issue.severity === "critical") ? "critical" : naverIssues.length ? "warning" : "ok") : "비활성"} detail={`활성 ${data.naverCafe.enabledSourceCount}/${data.naverCafe.sourceCount} · 최근 점검 ${formatDateTime(data.naverCafe.collection.lastRun)}`} href="/admin/member-posts?source=naver-cafe#naver-cafe-monitoring" icon={Coffee} tone={data.naverCafe.enabled ? toneForIssues(naverIssues) : "neutral"} />
          <StatusCard title="YouTube 신규 피드" value={youtubeSummary ? statusLabel(youtubeSummary.health) : "확인 중"} detail={`최근 점검 ${formatDateTime(youtubeSummary?.latestCheckAt)} · 최근 성공 ${formatDateTime(youtubeSummary?.latestSuccessAt)}`} href="#scheduled-jobs" icon={Youtube} tone={youtubeSummary?.health === "critical" ? "critical" : youtubeSummary?.health === "attention" ? "warning" : youtubeSummary?.health === "healthy" ? "success" : "neutral"} />
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="resources-heading">
        <SectionHeading id="resources-heading" title="자원 및 한도" description="Cloudflare 실계측과 내부 실행 허용 예상치를 혼동하지 않도록 분리합니다." />
        <div className="grid gap-4 lg:grid-cols-3"><D1ObservabilityCard data={d1Query.data} loading={d1Query.isLoading} /><D1WriteGuardCard guard={d1WriteGuard} /></div>
      </section>

      <section id="scheduled-jobs" className="space-y-3" aria-labelledby="jobs-heading">
        <SectionHeading id="jobs-heading" title="정기 작업 상태" description="기본 화면은 작업 종류별 최신 의미 있는 실행만 표시합니다." />
        <Card>
          <CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="text-base">예약·수동 작업</CardTitle><CardDescription className="mt-1">대상이 없는 정기 점검은 D1 쓰기 절감을 위해 run을 저장하지 않습니다.</CardDescription></div><div role="tablist" aria-label="작업 이력 보기" className="flex rounded-md border p-1" onKeyDown={handleRunTabKeyDown}><Button id="job-summary-tab" role="tab" tabIndex={runView === "summary" ? 0 : -1} aria-selected={runView === "summary"} aria-controls="job-summary-panel" variant={runView === "summary" ? "secondary" : "ghost"} size="sm" onClick={() => setRunView("summary")}><ListChecks /> 작업별 최신</Button><Button id="job-history-tab" role="tab" tabIndex={runView === "history" ? 0 : -1} aria-selected={runView === "history"} aria-controls="job-history-panel" variant={runView === "history" ? "secondary" : "ghost"} size="sm" onClick={() => setRunView("history")}><History /> 전체 이력</Button></div></div></CardHeader>
          <CardContent>
            {runView === "summary" ? <div id="job-summary-panel" role="tabpanel" aria-labelledby="job-summary-tab">{jobSummariesQuery.isLoading ? <div className="flex min-h-32 items-center justify-center"><Loader2 className="size-5 animate-spin" /></div> : <JobSummaryTable summaries={summaries} />}</div> : <div id="job-history-panel" role="tabpanel" aria-labelledby="job-history-tab"><div className="hidden overflow-x-auto md:block"><Table><TableHeader><TableRow><TableHead>작업</TableHead><TableHead>상태</TableHead><TableHead>진행률</TableHead><TableHead>시각</TableHead><TableHead>결과</TableHead></TableRow></TableHeader><TableBody>{historyRuns.map((run) => <RunRow key={run.runId} run={run} />)}{!runsQuery.isLoading && historyRuns.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">아직 기록된 작업이 없습니다.</TableCell></TableRow> : null}</TableBody></Table></div><div className="space-y-2 md:hidden">{historyRuns.map((run) => <RunCard key={run.runId} run={run} />)}</div></div>}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3" aria-labelledby="retention-heading">
        <SectionHeading id="retention-heading" title="보존·정리" description="저장 용량과 기간이 지난 운영 로그 정리를 확인합니다." />
        <Card>
          <CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="flex items-center gap-2 text-base"><DatabaseZap className="size-4" /> D1 데이터 보존</CardTitle><CardDescription>게시물 식별 이력과 일별 집계는 보존하고 기간이 지난 운영 원문 로그만 정리합니다.</CardDescription></div><Button variant="outline" size="sm" onClick={() => void retentionQuery.refetch()} disabled={retentionQuery.isFetching}><RefreshCw className={cn(retentionQuery.isFetching && "animate-spin")} /> 삭제 대상 다시 계산</Button></div></CardHeader>
          <CardContent className="space-y-5">
            {retentionQuery.data ? <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-lg border p-3"><p className="flex items-center gap-1.5 text-xs text-muted-foreground"><HardDrive className="size-3.5" /> 저장 용량</p><p className="mt-1 text-2xl font-semibold">{retentionQuery.data.capacity.usedPercent === null ? "-" : `${retentionQuery.data.capacity.usedPercent}%`}</p><p className="text-xs text-muted-foreground">{formatBytes(retentionQuery.data.capacity.sizeBytes)} / {formatBytes(retentionQuery.data.capacity.maxBytes)}</p><Badge variant="outline" className={statusClass(retentionQuery.data.capacity.status === "notice" ? "warning" : retentionQuery.data.capacity.status)}>{retentionQuery.data.capacity.status === "unavailable" ? "확인 불가" : retentionQuery.data.capacity.status === "ok" ? "정상" : retentionQuery.data.capacity.status === "notice" ? "60% 알림" : retentionQuery.data.capacity.status === "warning" ? "75% 경고" : "85% 위험"}</Badge></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">현재 삭제 대상</p><p className="mt-1 text-2xl font-semibold">{retentionQuery.data.totalPrunableRows.toLocaleString("ko-KR")}건</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">최근 삭제</p><p className="mt-1 text-2xl font-semibold">{latestRetention?.totalDeletedRows.toLocaleString("ko-KR") ?? "-"}건</p><p className="text-xs text-muted-foreground">{formatDateTime(latestRetention?.finishedAt)}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">최근 검증</p><p className="mt-1 font-semibold">{latestRetention?.verification === "verified" ? "삭제 후 대상 없음" : latestRetention?.verification === "remaining" ? `잔여 ${latestRetention.remainingPrunableRows?.toLocaleString("ko-KR")}건` : "기존 이력: 검증 정보 없음"}</p></div></div><RetentionPolicyTable policies={retentionQuery.data.policies} /><section><h3 className="mb-2 text-sm font-semibold">최근 정리 이력</h3><Table><TableHeader><TableRow><TableHead>완료</TableHead><TableHead>구분</TableHead><TableHead>상태</TableHead><TableHead>삭제</TableHead><TableHead>검증</TableHead></TableRow></TableHeader><TableBody>{retentionQuery.data.recentRuns.map((run) => <TableRow key={run.runId}><TableCell>{formatDateTime(run.finishedAt)}</TableCell><TableCell>{run.source === "manual" ? "수동" : "정기"}</TableCell><TableCell><Badge variant="outline" className={statusClass(run.status)}>{statusLabel(run.status)}</Badge></TableCell><TableCell>{run.totalDeletedRows.toLocaleString("ko-KR")}건</TableCell><TableCell>{run.verification === "verified" ? "정상" : run.verification === "remaining" ? `잔여 ${run.remainingPrunableRows}건` : "미확인"}</TableCell></TableRow>)}{retentionQuery.data.recentRuns.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">정리 이력이 없습니다.</TableCell></TableRow> : null}</TableBody></Table></section><details className="rounded-lg border border-dashed p-3"><summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium"><Info className="size-4 text-muted-foreground" /> 고급 작업 · 데이터 정리 <ChevronDown className="ml-auto size-4" /></summary><div className="mt-3 flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground">보존 기간이 지난 운영 로그를 영구 삭제합니다. 게시물 영구 기록은 대상이 아닙니다.</p><Button variant="destructive" size="sm" onClick={confirmPrune} disabled={retentionMutation.isPending}>{retentionMutation.isPending ? <Loader2 className="animate-spin" /> : <DatabaseZap />} 데이터 정리 실행</Button></div></details></> : <p className="text-sm text-destructive">D1 보존 상태를 불러오지 못했습니다.</p>}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
