import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Coffee,
  Gauge,
  Loader2,
  Play,
  RefreshCw,
} from "lucide-react";
import IconX from "@/assets/icon_x.svg";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { useNaverCafePosts } from "@/features/naver-cafe";
import {
  fetchOperationRuns,
  type OperationsStatusResponse,
} from "@/features/operations";
import { queryKeys } from "@/shared/query/query-keys";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { useScheduleData } from "@/features/schedule-board";
import { getMembersWithXHandles, useXPosts } from "@/features/x-posts";
import type {
  NaverCafePostsVisibility,
  NaverCafeSourceStatusDto,
} from "@contracts/naver-cafe";
import type { XPostsVisibility } from "@contracts/x-posts";

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
  });
};

const formatCost = (micros: number) =>
  `$${(Math.max(0, micros) / 1_000_000).toFixed(4)}`;

const getNaverCafeSourceStatusLabel = (
  status: NaverCafeSourceStatusDto["status"],
) => {
  if (status === "ok") return "정상";
  if (status === "stale") return "확인 지연";
  if (status === "private") return "비공개";
  if (status === "invalid_response") return "응답 오류";
  if (status === "disabled") return "비활성";
  return "오류";
};

const getNaverCafeSourceStatusVariant = (
  status: NaverCafeSourceStatusDto["status"],
) => {
  if (status === "ok") return "default" as const;
  if (status === "stale" || status === "disabled") return "secondary" as const;
  return "destructive" as const;
};

const getVisibilityLabel = (
  visibility: XPostsVisibility | NaverCafePostsVisibility,
) => {
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
    <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
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
  xPostsVisibility,
  naverCafeEnabled,
  naverCafeVisibility,
  operationsStatus,
  operationsLoading,
  operationsError,
  onReloadOperations,
  children,
  onRunXCollection,
  isRunningXCollection = false,
  onRunNaverCafeCheck,
  isRunningNaverCafeCheck = false,
}: {
  source: MemberPostSource;
  xCollectionEnabled: boolean;
  xPostsVisibility: XPostsVisibility;
  naverCafeEnabled: boolean;
  naverCafeVisibility: NaverCafePostsVisibility;
  operationsStatus: OperationsStatusResponse | null;
  operationsLoading: boolean;
  operationsError: boolean;
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
  const {
    members,
    loading: membersLoading,
    hasLoaded: membersLoaded,
    reloadMembers,
  } = useScheduleData();
  const membersWithXHandles = useMemo(
    () => getMembersWithXHandles(members),
    [members],
  );
  const membersWithX = useMemo(
    () => membersWithXHandles.map(({ member }) => member),
    [membersWithXHandles],
  );
  const xState = useXPosts(membersWithX, {
    enabled: isX && membersWithX.length > 0,
    maxResults: 10,
    admin: true,
  });
  const cafeState = useNaverCafePosts({
    enabled: !isX,
    size: 10,
    admin: true,
  });

  const xByHandle = useMemo(
    () =>
      new Map(
        xState.byHandle.map((item) => [item.handle.toLowerCase(), item]),
      ),
    [xState.byHandle],
  );
  const xHandleRows = useMemo(
    () =>
      membersWithXHandles.map(({ member, handle }) => {
        const result = xByHandle.get(handle.toLowerCase());
        const status = !result
          ? "대기"
          : result.error
            ? "오류"
            : result.stale
              ? "캐시"
              : "정상";
        return {
          memberName: member.name,
          handle,
          status,
          postCount: result?.posts.length ?? 0,
          error: result?.errorDetail ?? result?.error ?? null,
        };
      }),
    [membersWithXHandles, xByHandle],
  );
  const xErrorCount = xHandleRows.filter((row) => row.status === "오류").length;
  const xStaleCount = xHandleRows.filter((row) => row.status === "캐시").length;
  const xLatestRun = operationsStatus?.xCollection.latestRun ?? null;
  const xUsage = operationsStatus?.xCollection.usage;
  const budgetPercent = Math.max(
    0,
    Math.min(100, xUsage?.quota.todayBudgetUsedPercent ?? 0),
  );

  const naverCafeStatus = operationsStatus?.naverCafe;
  const operationalCafeSources = naverCafeStatus?.sources ?? [];
  const cafeRows = operationalCafeSources.length
    ? operationalCafeSources.map((item) => ({
        id: item.sourceId,
        name: item.sourceName,
        cafeId: item.cafeId,
        menuId: item.menuId,
        enabled: item.enabled,
        status: (item.enabled
          ? item.latestCheck?.status ?? "stale"
          : "disabled") as NaverCafeSourceStatusDto["status"],
        postCount: item.latestCheck?.postCount ?? 0,
        error: item.disabledReason ?? item.latestError,
        lastSuccessAt: item.lastSuccessAt,
      }))
    : cafeState.sources.map((item) => ({
        ...item,
        lastSuccessAt: null,
      }));

  const sourceError = isX ? xState.error : cafeState.error;
  const sourceStale = isX ? xState.stale : cafeState.stale;
  const sourceLoading = isX
    ? membersLoading || xState.loading
    : cafeState.loading;
  const loading = sourceLoading || operationsLoading;
  const hasError = Boolean(sourceError || operationsError);
  const sourceEnabled = isX
    ? xCollectionEnabled
    : naverCafeStatus
      ? naverCafeStatus.enabledSourceCount > 0
      : cafeRows.some((item) => item.enabled);
  const sourceVisibility = isX ? xPostsVisibility : naverCafeVisibility;

  const reloadMonitor = async () => {
    if (isX) {
      await Promise.all([
        reloadMembers(),
        membersWithX.length > 0 ? xState.reload() : Promise.resolve(),
        onReloadOperations(),
      ]);
      return;
    }
    await Promise.all([cafeState.reload(), onReloadOperations()]);
  };

  const statusBadge = loading ? (
    <Badge variant="secondary" className="gap-1">
      <Loader2 className="h-3 w-3 animate-spin" />
      확인 중
    </Badge>
  ) : !sourceEnabled ? (
    <Badge variant="secondary" className="gap-1">
      <Clock3 className="h-3 w-3" />
      운영 중지
    </Badge>
  ) : hasError ? (
    <Badge variant="destructive" className="gap-1">
      <AlertTriangle className="h-3 w-3" />
      확인 필요
    </Badge>
  ) : sourceStale ? (
    <Badge variant="secondary" className="gap-1">
      <Clock3 className="h-3 w-3" />
      캐시 포함
    </Badge>
  ) : (
    <Badge variant="default" className="gap-1 bg-emerald-600">
      <CheckCircle2 className="h-3 w-3" />
      정상
    </Badge>
  );

  const reloadDisabled = isX
    ? loading || !membersLoaded
    : loading || isRunningNaverCafeCheck;

  return (
    <Card id={`${source}-monitoring`} className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b px-4 py-2.5 [.border-b]:pb-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex size-7 items-center justify-center rounded-md border bg-muted/30">
                {isX ? (
                  <img src={IconX} alt="" className="h-3.5 w-3.5" />
                ) : (
                  <Coffee className="h-3.5 w-3.5 text-emerald-600" />
                )}
              </span>
              {isX ? "X 게시글 운영" : "네이버 카페 운영"}
            </CardTitle>
            {statusBadge}
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
                지금 수집
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
                  <Coffee className="h-4 w-4" />
                )}
                지금 점검
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => void reloadMonitor()}
              disabled={reloadDisabled}
            >
              <RefreshCw className="h-4 w-4" />
              상태 새로고침
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        {isX ? (
          <div className="grid divide-y overflow-hidden rounded-lg border bg-muted/10 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
            <MetricTile
              label="최근 실제 수집"
              value={formatMonitorUpdatedAt(
                operationsStatus?.xCollection.lastRun,
              )}
              detail={
                xLatestRun
                  ? `${xLatestRun.source === "manual" ? "수동" : "예약"} · ${getRunStatusLabel(xLatestRun.status)} · 저장 ${xLatestRun.postsStored}건`
                  : "저장된 수집 실행 이력이 없습니다."
              }
            />
            <MetricTile
              label="다음 수집 가능"
              value={formatMonitorUpdatedAt(
                operationsStatus?.xCollection.nextEligibleAt,
              )}
              detail={`${operationsStatus?.xCollection.intervalHours ?? "-"}시간 주기 · ${sourceEnabled ? "자동 수집 활성" : "자동 수집 중지"}`}
            />
            <MetricTile
              label="최근 24시간 API"
              value={`${xUsage?.apiCalls ?? 0}회`}
              detail={`실패 ${xUsage?.failureCount ?? 0}회 · rate-limit ${xUsage?.rateLimitCount ?? 0}회 · 응답 ${xState.posts.length}건`}
            />
            <MetricTile
              label="오늘 예산 사용"
              value={`${budgetPercent}%`}
              detail={`${formatCost(xUsage?.quota.todayUsedMicros ?? 0)} 사용 · ${formatCost(xUsage?.quota.todayRemainingMicros ?? 0)} 남음`}
            >
              <div
                className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label="오늘 X API 예산 사용률"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={budgetPercent}
              >
                <div
                  className={`h-full rounded-full ${
                    budgetPercent >= 100
                      ? "bg-destructive"
                      : budgetPercent >= 80
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                  }`}
                  style={{ width: `${budgetPercent}%` }}
                />
              </div>
            </MetricTile>
          </div>
        ) : (
          <div className="grid divide-y overflow-hidden rounded-lg border bg-muted/10 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
            <MetricTile
              label="최근 실제 수집"
              value={formatMonitorUpdatedAt(
                naverCafeStatus?.collection.lastRun,
              )}
              detail="피드 조회 시각이 아닌 소스 점검 저장 이력 기준"
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
              value={`${naverCafeStatus?.enabledSourceCount ?? cafeRows.filter((item) => item.enabled).length}/${naverCafeStatus?.sourceCount ?? cafeRows.length}개`}
              detail={`비활성 ${naverCafeStatus?.disabledSourceCount ?? cafeRows.filter((item) => !item.enabled).length}개 · 공개 ${getVisibilityLabel(sourceVisibility)}`}
            />
            <MetricTile
              label="주의 게시판"
              value={`${(naverCafeStatus?.failingSourceCount ?? 0) + (naverCafeStatus?.staleSourceCount ?? 0)}개`}
              detail={`오류 ${naverCafeStatus?.failingSourceCount ?? 0}개 · 확인 지연 ${naverCafeStatus?.staleSourceCount ?? 0}개 · 응답 ${cafeState.posts.length}건`}
            />
          </div>
        )}

        {hasError ? (
          <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
            {sourceError ? <p>{sourceError}</p> : null}
            {operationsError ? (
              <p>실제 수집 이력과 운영 지표를 불러오지 못했습니다.</p>
            ) : null}
          </div>
        ) : null}

        {children ? <section className="border-t pt-4">{children}</section> : null}

        <section className="space-y-2 border-t pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">최근 정기·수동 작업 로그</h3>
            <p className="text-xs text-muted-foreground">
              실제 작업 진행률과 오류를 기준으로 표시합니다.
            </p>
          </div>
          <div className="max-h-72 overflow-auto rounded-md border">
          <Table className="min-w-[680px]">
            <TableHeader><TableRow><TableHead>시작</TableHead><TableHead>구분</TableHead><TableHead>상태</TableHead><TableHead>진행</TableHead><TableHead>오류</TableHead></TableRow></TableHeader>
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
              {!operationRunsQuery.isLoading && (operationRunsQuery.data?.runs.length ?? 0) === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">작업 이력이 없습니다.</TableCell></TableRow>
              ) : null}
            </TableBody>
          </Table>
          </div>
        </section>

        {isX ? (
          <details className="rounded-lg border bg-muted/10">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 text-sm font-medium marker:hidden">
              <span>X API 사용량</span>
              <Badge variant="outline">최근 24시간 {xUsage?.apiCalls ?? 0}회</Badge>
            </summary>
            <div className="grid border-t lg:grid-cols-3">
              <MetricTile label="일별 API 사용" value={`${xUsage?.daily.reduce((total, day) => total + day.apiCalls, 0) ?? 0}회`} detail={(xUsage?.daily ?? []).slice(0, 3).map((day) => `${day.day} ${day.apiCalls}회`).join(" · ") || "기록 없음"} />
              <MetricTile label="작업별 API 사용" value={`${xUsage?.byOperation.length ?? 0}개 작업`} detail={(xUsage?.byOperation ?? []).slice(0, 3).map((item) => `${item.operation} ${item.apiCalls}회`).join(" · ") || "기록 없음"} />
              <MetricTile label="강제 새로고침 경로" value={`${xUsage?.forceRefreshPaths.length ?? 0}개`} detail={(xUsage?.forceRefreshPaths ?? []).slice(0, 2).map((item) => `${item.label} ${item.apiCalls}회`).join(" · ") || "기록 없음"} />
            </div>
          </details>
        ) : null}

        {isX ? (
          <details className="min-w-0 rounded-lg border bg-muted/10">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 marker:hidden">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <img src={IconX} alt="" className="h-3.5 w-3.5" />
                X 계정별 관리자 피드 응답
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">계정 {membersWithXHandles.length}개</Badge>
                <Badge variant={xErrorCount > 0 ? "destructive" : "secondary"}>오류 {xErrorCount}개</Badge>
                <Badge variant="outline">캐시 {xStaleCount}개</Badge>
              </div>
            </summary>
            <div className="space-y-3 border-t p-3">
            <div className="grid gap-2 lg:grid-cols-2">
              {xHandleRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  등록된 X 계정이 없습니다.
                </p>
              ) : (
                xHandleRows.map((row) => (
                  <div
                    key={row.handle}
                    className="grid gap-2 rounded-md border bg-background p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {row.memberName} · @{row.handle}
                      </p>
                      {row.error ? (
                        <p className="mt-1 truncate text-xs text-destructive">
                          {row.error}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          row.status === "오류"
                            ? "destructive"
                            : row.status === "캐시"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {row.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {row.postCount}건
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>{sourceEnabled ? "수집 활성" : "수집 비활성"}</span>
              <span>·</span>
              <span>공개 {getVisibilityLabel(sourceVisibility)}</span>
              <span>·</span>
              <span>{operationsStatus?.xCollection.feed.apiPath ?? "/api/member-posts?sources=x&admin=1"}</span>
            </div>
            </div>
          </details>
        ) : (
          <details className="min-w-0 rounded-lg border bg-muted/10">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 marker:hidden">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Coffee className="h-3.5 w-3.5 text-emerald-600" />
                게시판별 소스 점검 상태
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">전체 {cafeRows.length}개</Badge>
                <Badge variant={(naverCafeStatus?.failingSourceCount ?? 0) > 0 ? "destructive" : "secondary"}>오류 {naverCafeStatus?.failingSourceCount ?? 0}개</Badge>
                <Badge variant="outline">지연 {naverCafeStatus?.staleSourceCount ?? 0}개</Badge>
              </div>
            </summary>
            <div className="space-y-3 border-t p-3">
            <div className="grid gap-2 lg:grid-cols-2">
              {cafeRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  등록된 카페 게시판이 없습니다.
                </p>
              ) : (
                cafeRows.map((item) => (
                  <div
                    key={item.id}
                    className="grid gap-2 rounded-md border bg-background p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {item.name}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        cafe {item.cafeId} · menu {item.menuId}
                        {item.lastSuccessAt
                          ? ` · 마지막 성공 ${formatMonitorUpdatedAt(item.lastSuccessAt)}`
                          : ""}
                      </p>
                      {item.error ? (
                        <p className="mt-1 truncate text-xs text-destructive">
                          {item.error}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={getNaverCafeSourceStatusVariant(item.status)}
                      >
                        {getNaverCafeSourceStatusLabel(item.status)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {item.postCount}건
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>{naverCafeEnabled ? "표시 활성" : "표시 비활성"}</span>
              <span>·</span>
              <span>공개 {getVisibilityLabel(sourceVisibility)}</span>
              <span>·</span>
              <span>{naverCafeStatus?.apiPath ?? "/api/member-posts?sources=naver-cafe&admin=1"}</span>
            </div>
            </div>
          </details>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Gauge className="h-3.5 w-3.5" />
          운영 지표는 최근 {operationsStatus?.window.hours ?? 24}시간 기준이며,
          관리자 피드 응답과 실제 예약 수집 이력을 구분해 표시합니다.
        </div>
      </CardContent>
    </Card>
  );
}
