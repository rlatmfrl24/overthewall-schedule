import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ChevronDown,
  CircleAlert,
  DatabaseZap,
  Loader2,
  Play,
  RefreshCw,
  Youtube,
} from "lucide-react";
import { AdminSectionHeader } from "@/app/admin";
import {
  fetchSettings,
  MAX_YOUTUBE_WARMUP_DAILY_QUOTA_UNITS,
  MIN_YOUTUBE_WARMUP_DAILY_QUOTA_UNITS,
  updateSettings,
} from "@/features/configuration";
import { ApiError } from "@/shared/api/client";
import { queryKeys } from "@/shared/query/query-keys";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
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
  fetchYouTubeCacheStatus,
  refreshYouTubeCache,
  type YouTubeCacheStatus,
  type YouTubeWarmupRunStatus,
  type YouTubeWarmupRunSummary,
} from "../../api/youtube-cache";

const WINDOW_OPTIONS = [24, 72, 168] as const;
type YouTubeSettingsPatch = Parameters<typeof updateSettings>[0];

const formatTimestamp = (value: number | string | null | undefined) => {
  if (!value) return "없음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "확인 불가";
  return date.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDuration = (value: number) =>
  value < 1000 ? `${value}ms` : `${(value / 1000).toFixed(1)}초`;
const formatRate = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "-"
    : `${(value * 100).toFixed(1)}%`;

const getCacheStatusLabel = (status: YouTubeCacheStatus) => {
  if (status === "fresh") return "Fresh";
  if (status === "stale") return "Stale";
  return "Expired";
};

const getCacheStatusVariant = (status: YouTubeCacheStatus) => {
  if (status === "fresh") return "default";
  if (status === "stale") return "secondary";
  return "destructive";
};

const getRunStatusLabel = (status: YouTubeWarmupRunStatus) => {
  if (status === "success") return "완료";
  if (status === "partial") return "부분 완료";
  if (status === "skipped") return "건너뜀";
  return "실패";
};

const getRunStatusVariant = (status: YouTubeWarmupRunStatus) => {
  if (status === "success") return "default";
  if (status === "partial" || status === "skipped") return "secondary";
  return "destructive";
};

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <Card className="gap-3 py-5">
      <CardHeader className="flex flex-row items-center justify-between gap-3 px-5 pb-0">
        <CardDescription>{label}</CardDescription>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="px-5">
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        {detail ? (
          <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

type SourceStates = {
  total: number;
  fresh: number;
  stale: number;
  expired: number;
  missing: number;
};

function SourceStateCard({
  title,
  description,
  states,
}: {
  title: string;
  description: string;
  states: SourceStates | undefined;
}) {
  const values = states ?? {
    total: 0,
    fresh: 0,
    stale: 0,
    expired: 0,
    missing: 0,
  };
  const items = [
    ["Fresh", values.fresh],
    ["Stale", values.stale],
    ["Expired", values.expired],
    ["Missing", values.missing],
  ] as const;

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">{title}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {description}
          </div>
        </div>
        <Badge variant="outline">{values.total}개</Badge>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-md bg-muted/50 px-3 py-2">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-1 text-lg font-semibold">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RunTable({
  runs,
  emptyMessage,
}: {
  runs: YouTubeWarmupRunSummary[];
  emptyMessage: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>상태</TableHead>
          <TableHead>갱신/대상</TableHead>
          <TableHead>변경/동일</TableHead>
          <TableHead>API</TableHead>
          <TableHead>소요</TableHead>
          <TableHead>완료</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={6}
              className="h-24 text-center text-muted-foreground"
            >
              {emptyMessage}
            </TableCell>
          </TableRow>
        ) : (
          runs.map((run) => (
            <TableRow key={`${run.id ?? run.startedAt}-${run.source}`}>
              <TableCell>
                <Badge variant={getRunStatusVariant(run.status)}>
                  {getRunStatusLabel(run.status)}
                </Badge>
              </TableCell>
              <TableCell>
                {run.refreshedCount}/{run.targetCount}
              </TableCell>
              <TableCell>
                {run.changedCount}/{run.unchangedCount}
              </TableCell>
              <TableCell>
                {run.apiCalls} · {run.quotaUnits}u
              </TableCell>
              <TableCell>{formatDuration(run.durationMs)}</TableCell>
              <TableCell>{formatTimestamp(run.finishedAt)}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

export function YouTubeCacheManager() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [windowHours, setWindowHours] =
    useState<(typeof WINDOW_OPTIONS)[number]>(168);
  const [quotaDraft, setQuotaDraft] = useState("1000");
  const [refreshConfirmOpen, setRefreshConfirmOpen] = useState(false);

  const settingsQuery = useQuery({
    queryKey: queryKeys.settings.detail(),
    queryFn: fetchSettings,
  });
  const statusQuery = useQuery({
    queryKey: queryKeys.youtubeCache.status(windowHours),
    queryFn: () => fetchYouTubeCacheStatus(windowHours),
  });
  const settings = settingsQuery.data;
  const status = statusQuery.data;
  const isLoading = settingsQuery.isFetching || statusQuery.isFetching;

  useEffect(() => {
    if (settings) {
      setQuotaDraft(settings.youtube_api_daily_quota_units ?? "1000");
    }
  }, [settings]);

  useEffect(() => {
    const error = settingsQuery.error ?? statusQuery.error;
    if (!error) return;
    console.error("Failed to load YouTube cache status:", error);
    toast({
      variant: "error",
      description: "YouTube 캐시 상태를 불러오지 못했습니다.",
    });
  }, [settingsQuery.error, statusQuery.error, toast]);

  const channelRows = useMemo(
    () =>
      (status?.channels ?? [])
        .filter((item) => item.type === "channel_videos")
        .slice()
        .sort((a, b) => {
          const statusOrder = { expired: 0, stale: 1, fresh: 2 };
          return (
            statusOrder[a.status] - statusOrder[b.status] ||
            a.channelId.localeCompare(b.channelId)
          );
        }),
    [status],
  );

  const manualRuns = useMemo(
    () =>
      (status?.warmup?.recentRuns ?? []).filter(
        (run): run is YouTubeWarmupRunSummary => run.source === "manual",
      ),
    [status?.warmup?.recentRuns],
  );

  const settingsMutation = useMutation({
    mutationFn: ({ patch }: { patch: YouTubeSettingsPatch }) =>
      updateSettings(patch),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.settings.detail(),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.youtubeCache.all }),
      ]);
      toast({
        variant: "success",
        description: "YouTube API 일일 쿼터 상한을 변경했습니다.",
      });
    },
    onError: (error) => {
      console.error("Failed to update YouTube cache settings:", error);
      toast({
        variant: "error",
        description: "YouTube 캐시 설정 변경에 실패했습니다.",
      });
    },
  });

  const refreshMutation = useMutation({
    mutationFn: refreshYouTubeCache,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.youtubeCache.all,
      });
      const descriptions = {
        success: "YouTube 캐시를 새로고침했습니다.",
        partial: "YouTube 캐시를 부분적으로 새로고침했습니다.",
        skipped: "쿼터 상태에 따라 새로고침을 건너뛰었습니다.",
        failed: "YouTube 캐시 새로고침에 실패했습니다.",
      } as const;
      toast({
        variant: result.status === "failed" ? "error" : "success",
        description: descriptions[result.status],
      });
    },
    onError: (error) => {
      console.error("Failed to refresh YouTube cache:", error);
      const inProgress =
        error instanceof ApiError &&
        (error.status === 409 ||
          error.code === "youtube_cache_refresh_in_progress");
      toast({
        variant: inProgress ? "info" : "error",
        description: inProgress
          ? "다른 전체 새로고침이 진행 중입니다. 완료 후 다시 시도해 주세요."
          : "YouTube 캐시 새로고침에 실패했습니다.",
      });
    },
  });

  const saveQuota = async () => {
    const parsed = Number.parseInt(quotaDraft, 10);
    if (
      !Number.isFinite(parsed) ||
      parsed < MIN_YOUTUBE_WARMUP_DAILY_QUOTA_UNITS ||
      parsed > MAX_YOUTUBE_WARMUP_DAILY_QUOTA_UNITS
    ) {
      toast({
        variant: "error",
        description: "일일 쿼터 상한은 1~10000 사이의 정수여야 합니다.",
      });
      return;
    }
    await settingsMutation
      .mutateAsync({
        patch: { youtube_api_daily_quota_units: String(parsed) },
      })
      .catch(() => undefined);
  };

  const refetchData = async () => {
    await Promise.all([settingsQuery.refetch(), statusQuery.refetch()]);
  };

  const demandUsage = status?.usage.byOrigin.find(
    (item) => item.origin === "demand",
  );
  const manualUsage = status?.usage.byOrigin.find(
    (item) => item.origin === "manual",
  );
  const analytics = status?.analytics;
  const effectiveness = status?.effectiveness;
  const targetStates = status?.targetStates;
  const totalTargets =
    (targetStates?.official.total ?? 0) +
    (targetStates?.kirinuki.total ?? 0);
  const availableTargets =
    (targetStates?.official.fresh ?? 0) +
    (targetStates?.official.stale ?? 0) +
    (targetStates?.kirinuki.fresh ?? 0) +
    (targetStates?.kirinuki.stale ?? 0);
  const attentionCount =
    (targetStates?.official.expired ?? 0) +
    (targetStates?.official.missing ?? 0) +
    (targetStates?.kirinuki.expired ?? 0) +
    (targetStates?.kirinuki.missing ?? 0);
  const activeApiCalls =
    (demandUsage?.apiCalls ?? 0) + (manualUsage?.apiCalls ?? 0);
  const activeQuotaUnits =
    (demandUsage?.quotaUnits ?? 0) + (manualUsage?.quotaUnits ?? 0);
  const activeFailures =
    (demandUsage?.failureCount ?? 0) +
    (manualUsage?.failureCount ?? 0);
  const refreshResult = refreshMutation.data;
  const latestError =
    channelRows.find((row) => row.lastError)?.lastError ??
    refreshResult?.error ??
    null;
  const coverageHours = analytics?.coverageHours;
  const coverageDetail =
    analytics?.status === "unconfigured"
      ? "Analytics 읽기 설정이 필요합니다."
      : !analytics || analytics.status === "unavailable"
        ? "Analytics 지표를 일시적으로 조회할 수 없습니다."
        : analytics.observedSince === null
          ? "선택 기간 내 관측 이벤트 없음"
          : coverageHours === null || coverageHours === undefined
            ? "관측 범위 확인 불가"
            : `${formatTimestamp(analytics.observedSince)} 이후 최소 ${coverageHours.toFixed(1)}시간 관측`;
  const isSaving = settingsMutation.isPending;
  const isRunning = refreshMutation.isPending;
  const windowLabel = windowHours === 168 ? "최근 7일" : `최근 ${windowHours}시간`;

  return (
    <div className="space-y-5">
      <AdminSectionHeader
        title="YouTube 캐시 관리"
        description="저장된 콘텐츠를 우선 제공하고 필요한 채널만 요청 시 갱신합니다."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="h-9 px-3">
              수요 기반 SWR · 예약 예열 없음
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetchData()}
              disabled={isLoading || isRunning}
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              상태 새로고침
            </Button>
            <Button
              size="sm"
              onClick={() => setRefreshConfirmOpen(true)}
              disabled={isRunning || !status || totalTargets === 0}
            >
              {isRunning ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              전체 새로고침
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          icon={DatabaseZap}
          label="캐시 가용성"
          value={`${availableTargets}/${totalTargets}`}
          detail={`Fresh + 즉시 제공 가능한 Stale · 공식 ${
            (targetStates?.official.fresh ?? 0) +
            (targetStates?.official.stale ?? 0)
          } / 키리누키 ${
            (targetStates?.kirinuki.fresh ?? 0) +
            (targetStates?.kirinuki.stale ?? 0)
          }`}
        />
        <MetricCard
          icon={Activity}
          label={`${windowLabel} 활성 API 사용량`}
          value={`${activeApiCalls} calls`}
          detail={`${activeQuotaUnits} quota · 실패 ${activeFailures} · Demand/Manual만 집계`}
        />
        <MetricCard
          icon={CircleAlert}
          label="확인 필요"
          value={attentionCount === 0 ? "정상" : `${attentionCount}건`}
          detail={
            latestError
              ? `최근 오류: ${latestError}`
              : `Expired + Missing · 수동 실행 ${
                  refreshResult ? getRunStatusLabel(refreshResult.status) : "기록 없음"
                }`
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Youtube className="size-4 text-red-500" />
            현재 운영 상태
          </CardTitle>
          <CardDescription>
            공식 채널과 키리누키 채널은 서로 다른 freshness 정책으로 관리됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 xl:grid-cols-2">
          <SourceStateCard
            title="공식 채널"
            description="채널당 20개 · Fresh 12시간 · Stale 제공 7일"
            states={status?.targetStates.official}
          />
          <SourceStateCard
            title="키리누키 채널"
            description="채널당 40개 · Fresh 6시간 · Stale 제공 7일"
            states={status?.targetStates.kirinuki}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>운영 제어</CardTitle>
          <CardDescription>
            일일 사용 상한과 최근 수동 전체 새로고침 결과를 관리합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
          <div className="space-y-2">
              <Label htmlFor="youtube-api-quota">
                YouTube API 일일 쿼터 상한
              </Label>
              <div className="flex gap-2">
                <Input
                  id="youtube-api-quota"
                  inputMode="numeric"
                  value={quotaDraft}
                  disabled={isSaving}
                  onChange={(event) => setQuotaDraft(event.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void saveQuota()}
                  disabled={isSaving}
                >
                  저장
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                최근 {status?.warmup?.quota.windowHours ?? windowHours}시간
                사용량{" "}
                {status?.warmup?.quota.used ?? status?.usage.quotaUnits ?? 0} /{" "}
                {status?.warmup?.quota.limit ?? quotaDraft} units
              </div>
          </div>
          <div className="rounded-md border bg-muted/30 p-4 text-sm">
            {refreshResult ? (
              <div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">이번 실행 결과</span>
                  <Badge variant={getRunStatusVariant(refreshResult.status)}>
                    {getRunStatusLabel(refreshResult.status)}
                  </Badge>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    갱신 {refreshResult.refreshedCount}/
                    {refreshResult.targetCount}
                  </div>
                  <div>변경 {refreshResult.changedCount}</div>
                  <div>동일 {refreshResult.unchangedCount}</div>
                  <div>실패 {refreshResult.failedCount}</div>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-20 items-center text-muted-foreground">
                이 화면에서 실행한 수동 전체 새로고침 결과가 없습니다.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <details className="group overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium [&::-webkit-details-marker]:hidden">
          <span>
            운영 상세 보기
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              채널 캐시 · API · Analytics · 실행 이력
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-7 border-t p-5">
          <section className="space-y-3" aria-labelledby="youtube-window-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 id="youtube-window-title" className="font-medium">
                  조회 기간
                </h3>
                <p className="text-xs text-muted-foreground">
                  활성 Demand/Manual 사용량과 보조 진단 기간을 선택합니다.
                </p>
              </div>
              <Select
                value={String(windowHours)}
                onValueChange={(value) =>
                  setWindowHours(
                    Number.parseInt(value, 10) as (typeof WINDOW_OPTIONS)[number],
                  )
                }
              >
                <SelectTrigger className="h-9 w-[116px]" aria-label="조회 기간">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WINDOW_OPTIONS.map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {value === 168 ? "최근 7일" : `${value}시간`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          <section className="space-y-3" aria-labelledby="youtube-cache-detail-title">
            <div>
              <h3 id="youtube-cache-detail-title" className="font-medium">
                채널 캐시 상세
              </h3>
              <p className="text-xs text-muted-foreground">
                canonical channel_videos 캐시를 만료 우선순으로 표시합니다.
              </p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>상태</TableHead>
                    <TableHead>채널</TableHead>
                    <TableHead>maxResults</TableHead>
                    <TableHead>갱신</TableHead>
                    <TableHead>Fresh 만료</TableHead>
                    <TableHead>최근 오류</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {channelRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        캐시 항목이 없습니다.
                      </TableCell>
                    </TableRow>
                  ) : (
                    channelRows.map((row) => (
                      <TableRow key={row.cacheKey}>
                        <TableCell>
                          <Badge variant={getCacheStatusVariant(row.status)}>
                            {getCacheStatusLabel(row.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate font-mono text-xs">
                          {row.channelId}
                        </TableCell>
                        <TableCell>{row.maxResults ?? "-"}</TableCell>
                        <TableCell>{formatTimestamp(row.fetchedAt)}</TableCell>
                        <TableCell>{formatTimestamp(row.expiresAt)}</TableCell>
                        <TableCell className="max-w-[240px] truncate">
                          {row.lastError ?? "-"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="space-y-3" aria-labelledby="youtube-usage-title">
            <div>
              <h3 id="youtube-usage-title" className="font-medium">API 사용량</h3>
              <p className="text-xs text-muted-foreground">
                운영 중인 Demand와 Manual 호출만 구분해 표시합니다.
              </p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>호출 구분</TableHead>
                    <TableHead>calls</TableHead>
                    <TableHead>quota</TableHead>
                    <TableHead>failures</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>Demand</TableCell>
                    <TableCell>{demandUsage?.apiCalls ?? 0}</TableCell>
                    <TableCell>{demandUsage?.quotaUnits ?? 0}</TableCell>
                    <TableCell>{demandUsage?.failureCount ?? 0}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Manual</TableCell>
                    <TableCell>{manualUsage?.apiCalls ?? 0}</TableCell>
                    <TableCell>{manualUsage?.quotaUnits ?? 0}</TableCell>
                    <TableCell>{manualUsage?.failureCount ?? 0}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="space-y-3" aria-labelledby="youtube-analytics-title">
            <div>
              <h3 id="youtube-analytics-title" className="font-medium">
                Analytics 보조 진단
              </h3>
              <p className="text-xs text-muted-foreground">
                표본 기반 참고 지표이며 운영 상태 판정의 주 지표로 사용하지 않습니다.
              </p>
            </div>
            <div className="rounded-md border bg-muted/30 p-4">
              <p className="text-xs text-muted-foreground">{coverageDetail}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <div className="text-xs text-muted-foreground">비차단 제공률</div>
                  <div className="mt-1 font-semibold">
                    {analytics?.status === "available"
                      ? formatRate(effectiveness?.nonBlockingServeRate)
                      : "-"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">콘텐츠 변경률</div>
                  <div className="mt-1 font-semibold">
                    {analytics?.status === "available"
                      ? formatRate(effectiveness?.changeRate)
                      : "-"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">변경당 quota</div>
                  <div className="mt-1 font-semibold">
                    {analytics?.status === "available"
                      ? effectiveness?.quotaPerChange?.toFixed(1) ?? "-"
                      : "-"}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3" aria-labelledby="youtube-manual-runs-title">
            <div>
              <h3 id="youtube-manual-runs-title" className="font-medium">
                수동 전체 새로고침 이력
              </h3>
            </div>
            <div className="overflow-x-auto">
              <RunTable runs={manualRuns} emptyMessage="수동 새로고침 이력이 없습니다." />
            </div>
          </section>

          <section className="space-y-3" aria-labelledby="youtube-legacy-runs-title">
            <div>
              <h3 id="youtube-legacy-runs-title" className="font-medium">
                이전 자동 예열 기록 · 읽기 전용
              </h3>
              <p className="text-xs text-muted-foreground">
                과거 scheduled warmup 기록이며 현재 실행 정책에는 영향을 주지 않습니다.
              </p>
            </div>
            <div className="overflow-x-auto">
              <RunTable
                runs={status?.legacyScheduledRuns ?? []}
                emptyMessage="이전 자동 예열 기록이 없습니다."
              />
            </div>
          </section>
        </div>
      </details>

      <AlertDialog open={refreshConfirmOpen} onOpenChange={setRefreshConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>전체 YouTube 캐시를 새로고침할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              활성 공식·키리누키 채널 {totalTargets}개를 대상으로 외부 API를 호출합니다.
              현재 남은 일일 쿼터는 {status?.warmup?.quota.remaining ?? "확인 불가"} units이며,
              실행은 최대 30초 동안 동기 처리됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRunning}>취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={isRunning}
              onClick={() => void refreshMutation.mutateAsync().catch(() => undefined)}
            >
              {isRunning ? <Loader2 className="size-4 animate-spin" /> : null}
              전체 갱신 실행
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
