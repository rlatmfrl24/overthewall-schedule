import { useMemo, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Coffee,
  Gauge,
  Loader2,
  RefreshCw,
} from "lucide-react";
import IconX from "@/assets/icon_x.svg";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { useNaverCafePosts } from "@/features/naver-cafe";
import type { OperationsStatusResponse } from "@/features/operations";
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
  if (status === "success") return "성공";
  if (status === "skipped") return "건너뜀";
  if (status === "failed") return "실패";
  return status;
};

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
  <div className="rounded-lg border bg-muted/20 p-4">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
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
  onRunNaverCafeCheck?: () => void;
  isRunningNaverCafeCheck?: boolean;
}) {
  const isX = source === "x";
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
    <Card id={`${source}-monitoring`}>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-muted-foreground" />
              {isX ? "X 수집 모니터링" : "네이버 카페 수집 모니터링"}
            </CardTitle>
            <CardDescription>
              {isX
                ? "저장된 실행 이력, 비용과 관리자 피드의 계정별 응답을 함께 확인합니다."
                : "실제 소스 점검 이력과 관리자 피드의 게시판별 응답을 함께 확인합니다."}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {statusBadge}
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
      <CardContent className="space-y-4">
        {isX ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

        {isX ? (
          <section className="min-w-0 space-y-3 rounded-lg border bg-muted/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <img src={IconX} alt="" className="h-3.5 w-3.5" />
                X 계정별 관리자 피드 응답
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={sourceEnabled ? "default" : "secondary"}>
                  {sourceEnabled ? "수집 활성" : "수집 비활성"}
                </Badge>
                <Badge variant="outline">
                  공개 {getVisibilityLabel(sourceVisibility)}
                </Badge>
                <Badge variant="outline">
                  {operationsStatus?.xCollection.feed.apiPath ??
                    "/api/member-posts?sources=x&admin=1"}
                </Badge>
              </div>
            </div>
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
              <span>계정 {membersWithXHandles.length}개</span>
              <span>·</span>
              <span>오류 {xErrorCount}개</span>
              <span>·</span>
              <span>캐시 {xStaleCount}개</span>
            </div>
          </section>
        ) : (
          <section className="min-w-0 space-y-3 rounded-lg border bg-muted/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Coffee className="h-3.5 w-3.5 text-emerald-600" />
                게시판별 소스 점검 상태
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={naverCafeEnabled ? "default" : "secondary"}>
                  {naverCafeEnabled ? "표시 활성" : "표시 비활성"}
                </Badge>
                <Badge variant="outline">
                  공개 {getVisibilityLabel(sourceVisibility)}
                </Badge>
                <Badge variant="outline">
                  {naverCafeStatus?.apiPath ??
                    "/api/member-posts?sources=naver-cafe&admin=1"}
                </Badge>
              </div>
            </div>
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
          </section>
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
