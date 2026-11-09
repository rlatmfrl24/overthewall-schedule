import type { ReactNode } from "react";
import { XCollectionBudget, XCollectionMemberCounts, XCollectionRuns } from "./x-collection-monitoring";
import { XCollectionManager } from "./x-collection-manager";
import { XActivityManager } from "./x-activity-manager";
import { useQuery } from "@tanstack/react-query";
import { PiCheckCircleBold as CheckCircle2, PiClockBold as Clock3, PiSpinnerGapBold as Loader2, PiPlayBold as Play, PiArrowsClockwiseBold as RefreshCw } from "react-icons/pi";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { QueryReadback } from "@/shared/ui/query-readback";
import { NaverCafeSourceManager } from "@/features/naver-cafe";
import {
  fetchOperationRuns,
  type OperationsStatusResponse,
} from "@/features/operations";
import { queryKeys } from "@/shared/query/query-keys";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import type { NaverCafePostsVisibility } from "@contracts/naver-cafe";

export type MemberPostSource = "x" | "naver-cafe";

const formatMonitorUpdatedAt = (
  value: string | number | null | undefined,
) => {
  if (!value) return "아직 없음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "확인 불가";

  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (diffMinutes < 1) return "방금 전";
  if (diffMinutes < 60) return `${diffMinutes}분 전`;

  return date.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  });
};

const getVisibilityLabel = (visibility: NaverCafePostsVisibility) => {
  if (visibility === "public") return "모두 공개";
  if (visibility === "private") return "비공개";
  return "회원 전용";
};

const getRunStatusLabel = (status: string) => {
  if (status === "succeeded") return "성공";
  if (status === "running") return "실행 중";
  if (status === "queued") return "대기";
  if (status === "partial") return "일부 실패";
  if (status === "throttled") return "제한됨";
  if (status === "success") return "성공";
  if (status === "skipped") return "건너뜀";
  if (status === "failed") return "실패";
  return status;
};

const getRunStatusVariant = (status: string) =>
  status === "succeeded" || status === "success"
    ? "default" as const
    : status === "queued" || status === "running" || status === "skipped"
      ? "secondary" as const
      : "destructive" as const;

const MetricTile = ({
  label,
  value,
  detail,
  children,
}: {
  label: string;
  value: string;
  detail?: string;
  children?: ReactNode;
}) => (
  <div className="min-w-0 p-3">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
      {value}
    </p>
    {detail ? (
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    ) : null}
    {children}
  </div>
);

export function MemberPostFeedMonitor({
  source,
  xCollectionEnabled,
  naverCafeEnabled,
  naverCafeVisibility,
  operationsStatus,
  operationsLoading,
  operationsError,
  operationsUpdatedAt,
  onReloadOperations,
  children,
  onRunXCollection,
  isRunningXCollection = false,
  onRunNaverCafeCheck,
  isRunningNaverCafeCheck = false,
}: {
  source: MemberPostSource;
  xCollectionEnabled: boolean;
  naverCafeEnabled: boolean;
  naverCafeVisibility: NaverCafePostsVisibility;
  operationsStatus: OperationsStatusResponse | null;
  operationsLoading: boolean;
  operationsError: boolean;
  operationsUpdatedAt: number;
  onReloadOperations: () => Promise<unknown>;
  children?: ReactNode;
  onRunXCollection?: () => void;
  isRunningXCollection?: boolean;
  onRunNaverCafeCheck?: () => void;
  isRunningNaverCafeCheck?: boolean;
}) {
  const isX = source === "x";
  const operationRunsQuery = useQuery({
    queryKey: [...queryKeys.operations.runs(), source, "monitoring"],
    queryFn: () => fetchOperationRuns({
      jobType: isX ? "x_collection" : "naver_cafe_collection",
      limit: 10,
    }),
    staleTime: 10_000,
    refetchInterval: (query) => query.state.data?.runs.some((run) =>
      run.status === "queued" || run.status === "running"
    ) ? 5_000 : 30_000,
  });
  const naverCafeStatus = operationsStatus?.naverCafe;
  const loading = operationsLoading;
  const hasError = operationsError;
  const sourceEnabled = Boolean(naverCafeStatus?.enabled && naverCafeStatus.enabledSourceCount > 0);

  const statusBadge = loading ? (
    <Badge variant="secondary" className="gap-1">
      <Loader2 className="h-3 w-3 animate-spin" />
      확인 중
    </Badge>
  ) : hasError ? (
    <Badge variant="destructive">확인 필요</Badge>
  ) : !sourceEnabled ? (
    <Badge variant="secondary" className="gap-1">
      <Clock3 className="h-3 w-3" />
      운영 중지
    </Badge>
  ) : (naverCafeStatus?.failingSourceCount ?? 0) > 0 ? (
    <Badge variant="destructive">오류 있음</Badge>
  ) : (naverCafeStatus?.staleSourceCount ?? 0) > 0 ? (
    <Badge variant="secondary">점검 지연</Badge>
  ) : (
    <Badge variant="default" className="gap-1 bg-emerald-600">
      <CheckCircle2 className="h-3 w-3" />
      정상
    </Badge>
  );

  const reloadDisabled = loading || (!isX && isRunningNaverCafeCheck);

  return (
    <section id={`${source}-monitoring`} className="admin-dense-panel min-w-0 space-y-3 text-[13px] tabular-nums">
      <header className="space-y-1">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{isX ? "X(트위터) 수집" : "네이버 카페 수집"}</h1>
            {!isX ? statusBadge : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isX && onRunXCollection ? (
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                onClick={onRunXCollection}
                disabled={loading || isRunningXCollection}
              >
                {isRunningXCollection ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                기본 수집원으로 실행
              </Button>
            ) : null}
            {!isX && onRunNaverCafeCheck ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={onRunNaverCafeCheck}
                disabled={loading || isRunningNaverCafeCheck}
              >
                {isRunningNaverCafeCheck ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                지금 점검
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => void onReloadOperations()}
              disabled={reloadDisabled}
            >
              <RefreshCw className="h-4 w-4" />
              상태 새로고침
            </Button>
          </div>
        </div>
        <QueryReadback updatedAt={operationsUpdatedAt} fetching={operationsLoading} error={operationsError} className="my-0" />
      </header>
      <div className="space-y-3">
        {isX ? (
          <>
            <XCollectionBudget />
            <XCollectionMemberCounts />
            <XCollectionManager enabled={xCollectionEnabled} />
          </>
        ) : (
          <Card className="grid grid-cols-2 gap-0 py-0 shadow-none lg:grid-cols-4">
            <MetricTile
              label="최근 실제 수집"
              value={formatMonitorUpdatedAt(
                naverCafeStatus?.collection.lastRun,
              )}
              detail="소스 점검 저장 이력 · KST"
            />
            <MetricTile
              label="다음 수집 가능"
              value={formatMonitorUpdatedAt(
                naverCafeStatus?.collection.nextEligibleAt,
              )}
              detail={`${naverCafeStatus?.collection.intervalHours ?? "-"}시간 고정 주기 · ${sourceEnabled ? "수집 활성" : "수집 중지"}`}
            />
            <MetricTile
              label="활성 게시판"
              value={naverCafeStatus ? `${naverCafeStatus.enabledSourceCount}/${naverCafeStatus.sourceCount}개` : "미확인"}
              detail={`비활성 ${naverCafeStatus ? naverCafeStatus.disabledSourceCount + "개" : "미확인"} · 공개 ${getVisibilityLabel(naverCafeVisibility)}`}
            />
            <MetricTile
              label="주의 게시판"
              value={naverCafeStatus ? `${naverCafeStatus.sources.filter((item) => item.enabled && (item.failing || item.stale)).length}개` : "미확인"}
              detail={naverCafeStatus ? `오류 ${naverCafeStatus.failingSourceCount} · 지연 ${naverCafeStatus.staleSourceCount}` : "운영 지표 조회 필요"}
            />
          </Card>
        )}

        {hasError ? (
          <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
            {operationsError ? (
              <p>실제 수집 이력과 운영 지표를 불러오지 못했습니다.</p>
            ) : null}
          </div>
        ) : null}



        {!isX && (
        <>
          <NaverCafeSourceManager checks={{
            sources: naverCafeStatus?.sources ?? [],
            loading: operationsLoading,
            error: operationsError,
            updatedAt: operationsUpdatedAt,
          }} />
          {children && <section aria-labelledby="cafe-settings-heading" className="space-y-3">
            <h2 id="cafe-settings-heading" className="text-sm font-semibold">수집·공개 설정</h2>
            {children}
          </section>}
          <section className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">최근 실행</h2>
              <p className="text-xs text-muted-foreground">
                작업 묶음 진행률과 오류를 기준으로 표시합니다.
              </p>
            </div>
            <div className="max-h-72 overflow-auto rounded-md border">
            <Table className="min-w-[680px]">
              <TableHeader><TableRow><TableHead>시작 · KST</TableHead><TableHead>구분</TableHead><TableHead>상태</TableHead><TableHead>완료·건너뜀 / 작업</TableHead><TableHead>오류</TableHead></TableRow></TableHeader>
              <TableBody>
                {(operationRunsQuery.data?.runs ?? []).map((run) => (
                  <TableRow key={run.runId}>
                    <TableCell>{formatMonitorUpdatedAt(run.startedAt ?? run.acceptedAt)}</TableCell>
                    <TableCell>{run.source === "manual" ? "수동" : "정기"}</TableCell>
                    <TableCell><Badge variant={getRunStatusVariant(run.status)}>{getRunStatusLabel(run.status)}</Badge></TableCell>
                    <TableCell>{run.progress.succeeded + run.progress.skipped}/{run.progress.total}</TableCell>
                    <TableCell className="max-w-56 truncate">{run.failures[0]?.message ?? run.lastError ?? "-"}</TableCell>
                  </TableRow>
                ))}
                {operationRunsQuery.isLoading && <TableRow><TableCell colSpan={5} className="py-4 text-muted-foreground">실행 이력 확인 중</TableCell></TableRow>}
                {operationRunsQuery.isError && <TableRow><TableCell colSpan={5} className="whitespace-normal text-destructive">실행 이력 조회 실패{operationRunsQuery.data ? " · 이전 조회 결과" : ""}</TableCell></TableRow>}
                {!operationRunsQuery.isLoading && !operationRunsQuery.isError && (operationRunsQuery.data?.runs.length ?? 0) === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-muted-foreground">작업 이력이 없습니다.</TableCell></TableRow>
                ) : null}
              </TableBody>
            </Table>
            </div>
          </section>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{`피드 ${naverCafeEnabled ? "표시" : "숨김"} · 현재 게시판 상태 · 점검 이력 기준`} · 시각 KST</span>
            <Button variant="ghost" size="sm" asChild><a href="/admin/history?tab=runs&source=naver_cafe_collection">전체 실행 이력</a></Button>
          </div>
        </>
        )}
        {isX && children}
        {isX && <>
          <XActivityManager />
          <XCollectionRuns
            runs={operationRunsQuery.data?.runs ?? []} loading={operationRunsQuery.isLoading}
            error={operationRunsQuery.isError} updatedAt={operationRunsQuery.dataUpdatedAt}
          />
        </>}
      </div>
    </section>
  );
}
