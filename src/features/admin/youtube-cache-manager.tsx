import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Clock3,
  DatabaseZap,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Youtube,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import {
  fetchSettings,
  updateSettings,
  type AutoUpdateSettings,
} from "@/lib/api/settings";
import {
  fetchYouTubeCacheStatus,
  runYouTubeWarmupNow,
  type YouTubeCacheStatus,
  type YouTubeCacheStatusResponse,
  type YouTubeWarmupRunStatus,
  type YouTubeWarmupRunSummary,
} from "@/lib/api/youtube-cache";
import {
  normalizeYouTubeWarmupIntervalHours,
  YOUTUBE_WARMUP_INTERVAL_HOURS,
} from "@/lib/auto-update-interval";
import {
  MAX_YOUTUBE_WARMUP_DAILY_QUOTA_UNITS,
  MIN_YOUTUBE_WARMUP_DAILY_QUOTA_UNITS,
} from "@/lib/youtube-warmup-settings";
import { queryKeys } from "@/lib/query-keys";
import { AdminSectionHeader } from "./components/admin-section-header";

const WINDOW_OPTIONS = [24, 72, 168] as const;
type YouTubeWarmupSettingsPatch = Parameters<typeof updateSettings>[0];

const formatTimestamp = (value: number | null | undefined) => {
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

const formatDuration = (value: number) => {
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(1)}초`;
};

const getCacheStatusLabel = (status: YouTubeCacheStatus) => {
  if (status === "fresh") return "fresh";
  if (status === "stale") return "stale";
  return "expired";
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

const getRunSourceLabel = (source: YouTubeWarmupRunSummary["source"]) =>
  source === "manual" ? "수동" : "예약";

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

export function YouTubeCacheManager() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [settings, setSettings] = useState<AutoUpdateSettings | null>(null);
  const [status, setStatus] = useState<YouTubeCacheStatusResponse | null>(null);
  const [windowHours, setWindowHours] = useState<(typeof WINDOW_OPTIONS)[number]>(
    24,
  );
  const [quotaDraft, setQuotaDraft] = useState("1000");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<YouTubeWarmupRunSummary | null>(
    null,
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [settingsData, statusData] = await Promise.all([
        queryClient.fetchQuery({
          queryKey: queryKeys.settings.detail(),
          queryFn: fetchSettings,
          staleTime: 0,
        }),
        queryClient.fetchQuery({
          queryKey: queryKeys.youtubeCache.status(windowHours),
          queryFn: () => fetchYouTubeCacheStatus(windowHours),
          staleTime: 0,
        }),
      ]);
      setSettings(settingsData);
      setStatus(statusData);
      setQuotaDraft(settingsData.youtube_warmup_daily_quota_units ?? "1000");
    } catch (error) {
      console.error("Failed to load YouTube cache status:", error);
      toast({
        variant: "error",
        description: "YouTube 캐시 상태를 불러오지 못했습니다.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [queryClient, toast, windowHours]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const warmup = status?.warmup;
  const isWarmupEnabled = settings?.youtube_warmup_enabled !== "false";
  const isOfficialEnabled =
    settings?.youtube_warmup_official_enabled !== "false";
  const isKirinukiEnabled =
    settings?.youtube_warmup_kirinuki_enabled !== "false";
  const warmupInterval = normalizeYouTubeWarmupIntervalHours(
    settings?.youtube_warmup_interval_hours,
  );

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

  const saveSettings = async (
    patch: YouTubeWarmupSettingsPatch,
    successMessage: string,
  ) => {
    if (!settings) return;
    setIsSaving(true);
    try {
      await updateSettings(patch);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.detail() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.youtubeCache.all }),
      ]);
      setSettings({ ...settings, ...patch });
      toast({ variant: "success", description: successMessage });
    } catch (error) {
      console.error("Failed to update YouTube warmup settings:", error);
      toast({
        variant: "error",
        description: "YouTube 예열 설정 변경에 실패했습니다.",
      });
    } finally {
      setIsSaving(false);
    }
  };

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
    await saveSettings(
      { youtube_warmup_daily_quota_units: String(parsed) },
      "YouTube 예열 쿼터 상한을 변경했습니다.",
    );
  };

  const handleRunNow = async () => {
    setIsRunning(true);
    try {
      const result = await runYouTubeWarmupNow();
      setRunResult(result);
      await queryClient.invalidateQueries({ queryKey: queryKeys.youtubeCache.all });
      await loadData();
      toast({
        variant: result.status === "failed" ? "error" : "success",
        description:
          result.status === "failed"
            ? "YouTube 캐시 예열에 실패했습니다."
            : "YouTube 캐시 예열을 실행했습니다.",
      });
    } catch (error) {
      console.error("Failed to run YouTube warmup:", error);
      toast({
        variant: "error",
        description: "YouTube 캐시 예열 실행에 실패했습니다.",
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-5">
      <AdminSectionHeader
        title="YouTube 캐시 관리"
        description="D1 캐시 상태, 외부 API 사용량, 백그라운드 예열 정책을 확인합니다."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={String(windowHours)}
              onValueChange={(value) =>
                setWindowHours(
                  Number.parseInt(value, 10) as (typeof WINDOW_OPTIONS)[number],
                )
              }
            >
              <SelectTrigger className="h-9 w-[116px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WINDOW_OPTIONS.map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value}시간
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadData()}
              disabled={isLoading || isRunning}
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              새로고침
            </Button>
            <Button size="sm" onClick={handleRunNow} disabled={isRunning}>
              {isRunning ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              지금 예열
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={DatabaseZap}
          label="D1 캐시"
          value={status?.cache.total ?? 0}
          detail={`fresh ${status?.cache.fresh ?? 0} / stale ${
            status?.cache.stale ?? 0
          } / expired ${status?.cache.expired ?? 0}`}
        />
        <MetricCard
          icon={Activity}
          label={`${windowHours}시간 API 호출`}
          value={status?.usage.apiCalls ?? 0}
          detail={`쿼터 ${status?.usage.quotaUnits ?? 0} units`}
        />
        <MetricCard
          icon={ShieldCheck}
          label="예열 대상"
          value={warmup?.targets.total ?? 0}
          detail={`공식 ${warmup?.targets.official ?? 0} / 키리누키 ${
            warmup?.targets.kirinuki ?? 0
          }`}
        />
        <MetricCard
          icon={Clock3}
          label="최근 예열"
          value={
            warmup?.latestRun
              ? getRunStatusLabel(warmup.latestRun.status)
              : "없음"
          }
          detail={
            warmup?.latestRun
              ? `${formatTimestamp(warmup.latestRun.finishedAt)} · ${formatDuration(
                  warmup.latestRun.durationMs,
                )}`
              : "실행 이력이 없습니다."
          }
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Youtube className="size-4 text-red-500" />
              예열 정책
            </CardTitle>
            <CardDescription>
              scheduled cron은 이 설정값을 기준으로 실제 실행 여부를 결정합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="youtube-warmup-enabled">백그라운드 예열</Label>
                <div className="text-xs text-muted-foreground">
                  캐시 만료 전에 YouTube 데이터를 갱신합니다.
                </div>
              </div>
              <Switch
                id="youtube-warmup-enabled"
                checked={isWarmupEnabled}
                disabled={isSaving}
                onCheckedChange={(checked) =>
                  void saveSettings(
                    { youtube_warmup_enabled: checked ? "true" : "false" },
                    checked
                      ? "YouTube 예열을 활성화했습니다."
                      : "YouTube 예열을 비활성화했습니다.",
                  )
                }
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="space-y-2">
                <Label>실행 간격</Label>
                <Select
                  value={warmupInterval}
                  disabled={isSaving}
                  onValueChange={(value) =>
                    void saveSettings(
                      { youtube_warmup_interval_hours: value },
                      "YouTube 예열 간격을 변경했습니다.",
                    )
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {YOUTUBE_WARMUP_INTERVAL_HOURS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}시간마다
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="youtube-warmup-quota">일일 쿼터 상한</Label>
                <div className="flex gap-2">
                  <Input
                    id="youtube-warmup-quota"
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
                  최근 {warmup?.quota.windowHours ?? 24}시간 사용량{" "}
                  {warmup?.quota.used ?? 0} / {warmup?.quota.limit ?? 0} units
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <div className="text-sm font-medium">공식 채널</div>
                  <div className="text-xs text-muted-foreground">
                    멤버 YouTube 채널 캐시
                  </div>
                </div>
                <Switch
                  checked={isOfficialEnabled}
                  disabled={isSaving}
                  onCheckedChange={(checked) =>
                    void saveSettings(
                      {
                        youtube_warmup_official_enabled: checked
                          ? "true"
                          : "false",
                      },
                      "공식 채널 예열 정책을 변경했습니다.",
                    )
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <div className="text-sm font-medium">키리누키 채널</div>
                  <div className="text-xs text-muted-foreground">
                    등록된 키리누키 채널 캐시
                  </div>
                </div>
                <Switch
                  checked={isKirinukiEnabled}
                  disabled={isSaving}
                  onCheckedChange={(checked) =>
                    void saveSettings(
                      {
                        youtube_warmup_kirinuki_enabled: checked
                          ? "true"
                          : "false",
                      },
                      "키리누키 채널 예열 정책을 변경했습니다.",
                    )
                  }
                />
              </div>
            </div>

            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">마지막 정책 실행</span>
                <span className="font-medium">
                  {formatTimestamp(warmup?.settings.lastRun)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-muted-foreground">남은 쿼터</span>
                <span className="font-medium">
                  {warmup?.quota.remaining ?? 0} units
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>캐시 상태</CardTitle>
            <CardDescription>
              `channel_videos` 캐시를 만료 우선순으로 표시합니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>상태</TableHead>
                  <TableHead>채널</TableHead>
                  <TableHead>maxResults</TableHead>
                  <TableHead>갱신</TableHead>
                  <TableHead>fresh 만료</TableHead>
                  <TableHead>최근 오류</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {channelRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-muted-foreground"
                    >
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
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>API 사용량</CardTitle>
            <CardDescription>
              실제 YouTube API 호출 이벤트만 집계합니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">성공 / 실패</div>
                <div className="mt-1 text-lg font-semibold">
                  {status?.usage.successCount ?? 0} /{" "}
                  {status?.usage.failureCount ?? 0}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">
                  rate limit / quota
                </div>
                <div className="mt-1 text-lg font-semibold">
                  {status?.usage.rateLimitCount ?? 0} /{" "}
                  {status?.usage.quotaErrorCount ?? 0}
                </div>
              </div>
            </div>
            <Table className="mt-4">
              <TableHeader>
                <TableRow>
                  <TableHead>operation</TableHead>
                  <TableHead>calls</TableHead>
                  <TableHead>quota</TableHead>
                  <TableHead>failures</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(status?.usage.byOperation ?? []).map((item) => (
                  <TableRow key={item.operation}>
                    <TableCell className="font-mono text-xs">
                      {item.operation}
                    </TableCell>
                    <TableCell>{item.apiCalls}</TableCell>
                    <TableCell>{item.quotaUnits}</TableCell>
                    <TableCell>{item.failureCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>예열 실행 이력</CardTitle>
            <CardDescription>
              최근 실행 결과와 수동 실행 결과를 함께 확인합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {runResult ? (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">이번 수동 실행</span>
                  <Badge variant={getRunStatusVariant(runResult.status)}>
                    {getRunStatusLabel(runResult.status)}
                  </Badge>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <div>갱신 {runResult.refreshedCount}</div>
                  <div>fresh 유지 {runResult.skippedFreshCount}</div>
                  <div>실패 {runResult.failedCount}</div>
                </div>
              </div>
            ) : null}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>상태</TableHead>
                  <TableHead>구분</TableHead>
                  <TableHead>대상</TableHead>
                  <TableHead>API</TableHead>
                  <TableHead>소요</TableHead>
                  <TableHead>완료</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(warmup?.recentRuns ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-muted-foreground"
                    >
                      예열 실행 이력이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  warmup?.recentRuns.map((run) => (
                    <TableRow key={`${run.id ?? run.startedAt}-${run.source}`}>
                      <TableCell>
                        <Badge variant={getRunStatusVariant(run.status)}>
                          {getRunStatusLabel(run.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>{getRunSourceLabel(run.source)}</TableCell>
                      <TableCell>
                        {run.refreshedCount}/{run.targetCount}
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
