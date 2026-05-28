import { useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Coffee,
  Loader2,
  RefreshCw,
} from "lucide-react";
import IconX from "@/assets/icon_x.svg";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useNaverCafePosts } from "@/hooks/use-naver-cafe-posts";
import { useScheduleData } from "@/hooks/use-schedule-data";
import { useXPosts } from "@/hooks/use-x-posts";
import { getMembersWithXHandles } from "@/lib/api/x";
import type { NaverCafeSourceStatus } from "@/lib/types";

const formatMonitorUpdatedAt = (value: string | null) => {
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

const getLatestUpdatedAt = (...values: Array<string | null>) => {
  const timestamps = values
    .map((value) => (value ? new Date(value).getTime() : Number.NaN))
    .filter(Number.isFinite);

  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps)).toISOString();
};

const getNaverCafeSourceStatusLabel = (
  status: NaverCafeSourceStatus["status"],
) => {
  if (status === "ok") return "정상";
  if (status === "stale") return "캐시";
  if (status === "private") return "비공개";
  if (status === "invalid_response") return "응답 오류";
  if (status === "disabled") return "비활성";
  return "오류";
};

const getNaverCafeSourceStatusVariant = (
  status: NaverCafeSourceStatus["status"],
) => {
  if (status === "ok") return "default" as const;
  if (status === "stale" || status === "disabled") return "secondary" as const;
  return "destructive" as const;
};

const MetricTile = ({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) => (
  <div className="rounded-md border bg-muted/20 p-3">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
  </div>
);

export function MemberPostFeedMonitor({
  xCollectionEnabled,
  naverCafeEnabled,
}: {
  xCollectionEnabled: boolean;
  naverCafeEnabled: boolean;
}) {
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
    enabled: membersWithX.length > 0,
    maxResults: 10,
    admin: true,
  });
  const cafeState = useNaverCafePosts({
    enabled: naverCafeEnabled,
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
  const cafeEnabledSources = cafeState.sources.filter(
    (source) => source.enabled,
  );
  const cafeStatusCounts = cafeState.sources.reduce(
    (counts, source) => {
      counts[source.status] = (counts[source.status] ?? 0) + 1;
      return counts;
    },
    {} as Record<NaverCafeSourceStatus["status"], number>,
  );
  const hasError = Boolean(xState.error || cafeState.error);
  const hasStaleData = xState.stale || cafeState.stale;
  const loading = membersLoading || xState.loading || cafeState.loading;
  const latestUpdatedAt = getLatestUpdatedAt(
    xState.updatedAt,
    cafeState.updatedAt,
  );

  const reloadMonitor = async () => {
    await Promise.all([
      reloadMembers(),
      membersWithX.length > 0 ? xState.reload() : Promise.resolve(),
      naverCafeEnabled ? cafeState.reload() : Promise.resolve(),
    ]);
  };

  const statusBadge = loading ? (
    <Badge variant="secondary" className="gap-1">
      <Loader2 className="h-3 w-3 animate-spin" />
      확인 중
    </Badge>
  ) : hasError ? (
    <Badge variant="destructive" className="gap-1">
      <AlertTriangle className="h-3 w-3" />
      오류
    </Badge>
  ) : hasStaleData ? (
    <Badge variant="secondary" className="gap-1">
      <Clock3 className="h-3 w-3" />
      캐시 포함
    </Badge>
  ) : (
    <Badge variant="default" className="gap-1 bg-green-600">
      <CheckCircle2 className="h-3 w-3" />
      정상
    </Badge>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-muted-foreground" />
              피드 모니터링
            </CardTitle>
            <CardDescription>
              사용자 피드에 표시하지 않는 수집 상태와 응답 데이터를 관리자용으로 확인합니다.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {statusBadge}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => void reloadMonitor()}
              disabled={loading || !membersLoaded}
            >
              <RefreshCw className="h-4 w-4" />
              모니터링 새로고침
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            label="마지막 응답"
            value={formatMonitorUpdatedAt(latestUpdatedAt)}
            detail="X와 카페 응답 중 최신 시각"
          />
          <MetricTile
            label="조회 응답 게시글"
            value={`${xState.posts.length + cafeState.posts.length}건`}
            detail={`X ${xState.posts.length}건 · 카페 ${cafeState.posts.length}건`}
          />
          <MetricTile
            label="X 계정 상태"
            value={`${membersWithXHandles.length}개`}
            detail={`오류 ${xErrorCount}개 · 캐시 ${xStaleCount}개 · 수집 ${
              xCollectionEnabled ? "활성" : "비활성"
            }`}
          />
          <MetricTile
            label="카페 게시판 상태"
            value={`${cafeEnabledSources.length}개`}
            detail={`정상 ${cafeStatusCounts.ok ?? 0}개 · 오류 ${
              (cafeStatusCounts.error ?? 0) +
              (cafeStatusCounts.private ?? 0) +
              (cafeStatusCounts.invalid_response ?? 0)
            }개 · 표시 ${naverCafeEnabled ? "활성" : "비활성"}`}
          />
        </div>

        {(xState.error || cafeState.error) && (
          <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
            {xState.error ? <p>X: {xState.error}</p> : null}
            {cafeState.error ? <p>카페: {cafeState.error}</p> : null}
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="min-w-0 space-y-3 rounded-md border bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <img src={IconX} alt="" className="h-3.5 w-3.5" />
                X 계정별 응답
              </h3>
              <Badge variant={xCollectionEnabled ? "default" : "secondary"}>
                {xCollectionEnabled ? "수집 활성" : "수집 비활성"}
              </Badge>
            </div>
            <div className="space-y-2">
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
          </section>

          <section className="min-w-0 space-y-3 rounded-md border bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Coffee className="h-3.5 w-3.5 text-emerald-600" />
                카페 게시판별 응답
              </h3>
              <Badge variant={naverCafeEnabled ? "default" : "secondary"}>
                {naverCafeEnabled ? "표시 활성" : "표시 비활성"}
              </Badge>
            </div>
            <div className="space-y-2">
              {!naverCafeEnabled ? (
                <p className="text-sm text-muted-foreground">
                  카페 최신글 표시가 비활성화되어 응답 상태를 조회하지 않습니다.
                </p>
              ) : cafeState.sources.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  등록된 카페 게시판이 없습니다.
                </p>
              ) : (
                cafeState.sources.map((source) => (
                  <div
                    key={source.id}
                    className="grid gap-2 rounded-md border bg-background p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {source.name}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        cafe {source.cafeId} · menu {source.menuId}
                      </p>
                      {source.error ? (
                        <p className="mt-1 truncate text-xs text-destructive">
                          {source.error}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={getNaverCafeSourceStatusVariant(source.status)}>
                        {getNaverCafeSourceStatusLabel(source.status)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {source.postCount}건
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </CardContent>
    </Card>
  );
}
