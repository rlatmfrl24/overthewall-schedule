import { useState, useCallback, useEffect, useMemo } from "react";
import {
  Loader2,
  RefreshCw,
  Clock,
  Power,
  Play,
  CheckCircle,
  XCircle,
  Calendar,
  Check,
  X,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  fetchSettings,
  updateSettings,
  runAutoUpdateNow,
  fetchPendingSchedules,
  approvePendingSchedule,
  rejectPendingSchedule,
  resetPendingScheduleProcessed,
  type AutoUpdateSettings,
  type AutoUpdateRunResult,
  type PendingApplyMode,
  type PendingApprovalOptions,
  type PendingSchedule,
  type PendingTargetMode,
  type PendingTimeMode,
} from "@/lib/api/settings";
import { useToast } from "@/components/ui/toast";
import {
  AUTO_UPDATE_INTERVAL_HOURS,
  normalizeAutoUpdateIntervalHours,
} from "@/lib/auto-update-interval";
import { roundTimeToNearestScheduleHour } from "@/lib/pending-time";
import { cn } from "@/lib/utils";
import { AdminSectionHeader } from "./components/admin-section-header";

const INTERVAL_OPTIONS = AUTO_UPDATE_INTERVAL_HOURS.map((value) => ({
  value,
  label: `${value}시간`,
}));

const RANGE_OPTIONS = [
  { value: "1", label: "1일 (오늘만)" },
  { value: "2", label: "2일" },
  { value: "3", label: "3일" },
  { value: "5", label: "5일" },
  { value: "7", label: "7일" },
] as const;

const RUN_DETAIL_LABELS: Record<string, string> = {
  auto_collected: "자동 수집",
  auto_updated: "자동 업데이트",
  existing: "기존 스케줄 있음",
};

const PENDING_SORT_OPTIONS = [
  { value: "date_asc", label: "방송일 빠른순" },
  { value: "date_desc", label: "방송일 늦은순" },
  { value: "created_desc", label: "수집일 최신순" },
  { value: "created_asc", label: "수집일 오래된순" },
  { value: "member_asc", label: "멤버명 오름차순" },
] as const;

const PENDING_ACTION_FILTER_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "create", label: "신규" },
  { value: "update", label: "수정" },
] as const;

const PENDING_PROCESS_FILTER_OPTIONS = [
  { value: "active", label: "처리 전" },
  { value: "processed", label: "처리 완료" },
  { value: "all", label: "전체" },
] as const;

const PENDING_APPLY_MODE_OPTIONS: Array<{
  value: PendingApplyMode;
  label: string;
}> = [
  { value: "all", label: "전체" },
  { value: "time", label: "방송 시간" },
  { value: "title", label: "제목" },
];

const PENDING_TARGET_MODE_OPTIONS: Array<{
  value: PendingTargetMode;
  label: string;
}> = [
  { value: "update", label: "기존 수정" },
  { value: "create", label: "새로 추가" },
];

type PendingApprovalOptionState = {
  applyMode: PendingApplyMode;
  targetMode: PendingTargetMode;
  timeMode: PendingTimeMode;
  targetScheduleId: number | null;
};

type PendingSortKey = (typeof PENDING_SORT_OPTIONS)[number]["value"];
type PendingActionFilter =
  (typeof PENDING_ACTION_FILTER_OPTIONS)[number]["value"];
type PendingProcessFilter =
  (typeof PENDING_PROCESS_FILTER_OPTIONS)[number]["value"];

const getPendingBroadcastSortValue = (pending: PendingSchedule) => {
  if (pending.vod_started_at) {
    const timestamp = new Date(pending.vod_started_at).getTime();
    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }
  }

  const fallbackTimestamp = new Date(
    `${pending.date}T${pending.start_time || "00:00"}:00+09:00`,
  ).getTime();
  return Number.isNaN(fallbackTimestamp) ? 0 : fallbackTimestamp;
};

const getDefaultTargetScheduleId = (pending: PendingSchedule) =>
  pending.existing_schedule?.id ??
  pending.empty_target_schedule?.id ??
  pending.same_day_schedules[0]?.id ??
  null;

const getPendingApprovalDefaults = (
  pending: PendingSchedule,
): PendingApprovalOptionState => {
  const targetScheduleId = getDefaultTargetScheduleId(pending);
  return {
    applyMode: "all",
    targetMode: targetScheduleId ? "update" : "create",
    timeMode: "nearest_hour",
    targetScheduleId,
  };
};

const getEffectivePendingStartTime = (
  pending: PendingSchedule,
  options: PendingApprovalOptionState,
) => {
  if (options.applyMode === "title") return null;
  return options.timeMode === "exact"
    ? pending.start_time
    : roundTimeToNearestScheduleHour(pending.start_time);
};

const getPendingScheduleSummaryById = (
  pending: PendingSchedule,
  scheduleId: number | null,
) => {
  if (!scheduleId) return null;
  return (
    pending.same_day_schedules.find((schedule) => schedule.id === scheduleId) ||
    (pending.existing_schedule?.id === scheduleId
      ? pending.existing_schedule
      : null) ||
    (pending.empty_target_schedule?.id === scheduleId
      ? pending.empty_target_schedule
      : null)
  );
};

const formatScheduleDateTime = (date: string, time: string | null | undefined) =>
  `${date} ${time?.trim() || "--:--"}`;

const normalizeDiffValue = (value: string | null | undefined) =>
  value?.trim() || "-";

const isDiffChanged = (
  beforeValue: string | null | undefined,
  afterValue: string | null | undefined,
) => normalizeDiffValue(beforeValue) !== normalizeDiffValue(afterValue);

const getProcessedLabel = (pending: PendingSchedule) => {
  if (pending.processed_decision === "approved") return "이미 승인됨";
  if (pending.processed_decision === "rejected") return "이미 거부됨";
  return "처리 전";
};

const DiffCell = ({
  label,
  value,
  secondary,
  changed,
  active,
}: {
  label: string;
  value: string | null | undefined;
  secondary?: string | null;
  changed: boolean;
  active: boolean;
}) => (
  <div
    className={cn(
      "min-h-[66px] rounded-md border bg-card px-3 py-2.5 text-card-foreground",
      active && changed && "border-l-4",
      active && changed && label === "현재" && "border-l-rose-500",
      active && changed && label === "적용 후" && "border-l-emerald-500",
      !active && "border-dashed bg-muted/20 text-muted-foreground",
      active && !changed && "bg-muted/25",
    )}
  >
    <div className="mb-1 text-[11px] font-semibold text-muted-foreground">
      {label}
    </div>
    <div className="break-words text-sm font-medium leading-snug">
      {normalizeDiffValue(value)}
    </div>
    {secondary ? (
      <div className="mt-1 truncate text-[11px] text-muted-foreground">
        {secondary}
      </div>
    ) : null}
  </div>
);

const DiffRow = ({
  label,
  beforeValue,
  afterValue,
  sourceValue,
  active,
}: {
  label: string;
  beforeValue: string | null | undefined;
  afterValue: string | null | undefined;
  sourceValue?: string | null;
  active: boolean;
}) => {
  const changed = isDiffChanged(beforeValue, afterValue);
  const stateLabel = !active ? "유지" : changed ? "변경" : "동일";
  const sourceLabel =
    sourceValue && normalizeDiffValue(sourceValue) !== normalizeDiffValue(afterValue)
      ? `수집값: ${sourceValue}`
      : null;

  return (
    <div className="grid gap-2 md:grid-cols-[112px_minmax(0,1fr)_minmax(0,1fr)] md:items-stretch">
      <div className="flex min-h-[66px] items-center justify-between gap-2 rounded-md bg-muted/20 px-3 text-xs font-semibold text-foreground md:flex-col md:items-start md:justify-center">
        <span>{label}</span>
        <Badge
          variant="outline"
          className={cn(
            "text-[11px]",
            !active && "border-muted-foreground/30 text-muted-foreground",
            active &&
              changed &&
              "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
            active &&
              !changed &&
              "border-border bg-muted/40 text-muted-foreground",
          )}
        >
          {stateLabel}
        </Badge>
      </div>
      <DiffCell
        label="현재"
        value={beforeValue}
        changed={changed}
        active={active}
      />
      <DiffCell
        label="적용 후"
        value={afterValue}
        secondary={sourceLabel}
        changed={changed}
        active={active}
      />
    </div>
  );
};

export function AutoUpdateSettingsManager() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<AutoUpdateSettings | null>(null);
  const [pendingList, setPendingList] = useState<PendingSchedule[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoadingPending, setIsLoadingPending] = useState(false);
  const [processingPendingId, setProcessingPendingId] = useState<number | null>(
    null,
  );
  const [pendingSort, setPendingSort] = useState<PendingSortKey>("date_asc");
  const [pendingActionFilter, setPendingActionFilter] =
    useState<PendingActionFilter>("all");
  const [pendingProcessFilter, setPendingProcessFilter] =
    useState<PendingProcessFilter>("active");
  const [pendingApprovalOptions, setPendingApprovalOptions] = useState<
    Record<number, Partial<PendingApprovalOptionState>>
  >({});
  const [lastRunResult, setLastRunResult] =
    useState<AutoUpdateRunResult | null>(null);

  const loadSettings = useCallback(async () => {
    setIsFetching(true);
    try {
      const data = await fetchSettings();
      setSettings(data);
    } catch (error) {
      console.error("Failed to load settings:", error);
      toast({
        variant: "error",
        description: "설정을 불러오지 못했습니다.",
      });
    } finally {
      setIsFetching(false);
    }
  }, [toast]);

  const loadPending = useCallback(async () => {
    setIsLoadingPending(true);
    try {
      const data = await fetchPendingSchedules();
      setPendingList(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load pending schedules:", error);
      toast({
        variant: "error",
        description: "승인 대기 스케줄을 불러오지 못했습니다.",
      });
    } finally {
      setIsLoadingPending(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadSettings();
    void loadPending();
  }, [loadSettings, loadPending]);

  const activePendingCount = useMemo(
    () => pendingList.filter((item) => !item.is_processed).length,
    [pendingList],
  );

  const processFilteredPendingList = useMemo(() => {
    if (pendingProcessFilter === "active") {
      return pendingList.filter((item) => !item.is_processed);
    }
    if (pendingProcessFilter === "processed") {
      return pendingList.filter((item) => item.is_processed);
    }
    return pendingList;
  }, [pendingList, pendingProcessFilter]);

  const pendingProcessCounts = useMemo(
    () => ({
      active: pendingList.filter((item) => !item.is_processed).length,
      processed: pendingList.filter((item) => item.is_processed).length,
      all: pendingList.length,
    }),
    [pendingList],
  );

  const pendingActionCounts = useMemo(
    () => ({
      all: processFilteredPendingList.length,
      create: processFilteredPendingList.filter(
        (item) => item.action_type === "create",
      ).length,
      update: processFilteredPendingList.filter(
        (item) => item.action_type === "update",
      ).length,
    }),
    [processFilteredPendingList],
  );

  const filteredPendingList = useMemo(() => {
    if (pendingActionFilter === "all") {
      return processFilteredPendingList;
    }
    return processFilteredPendingList.filter(
      (item) => item.action_type === pendingActionFilter,
    );
  }, [pendingActionFilter, processFilteredPendingList]);

  const sortedPendingList = useMemo(() => {
    const list = [...filteredPendingList];
    if (pendingSort === "member_asc") {
      return list.sort((a, b) => a.member_name.localeCompare(b.member_name));
    }

    if (pendingSort === "created_desc" || pendingSort === "created_asc") {
      return list.sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return pendingSort === "created_desc" ? bTime - aTime : aTime - bTime;
      });
    }

    return list.sort((a, b) => {
      const aTime = getPendingBroadcastSortValue(a);
      const bTime = getPendingBroadcastSortValue(b);
      return pendingSort === "date_desc" ? bTime - aTime : aTime - bTime;
    });
  }, [filteredPendingList, pendingSort]);

  useEffect(() => {
    const validIds = new Set(pendingList.map((item) => item.id));
    setPendingApprovalOptions((prev) => {
      const next = Object.fromEntries(
        Object.entries(prev).filter(([id]) => validIds.has(Number(id))),
      );
      return next;
    });
  }, [pendingList]);

  const handleToggleEnabled = async (enabled: boolean) => {
    if (!settings) return;
    setIsSaving(true);
    try {
      await updateSettings({
        auto_update_enabled: enabled ? "true" : "false",
      });
      setSettings({
        ...settings,
        auto_update_enabled: enabled ? "true" : "false",
      });
      toast({
        variant: "success",
        description: enabled ? "자동 업데이트를 활성화했습니다." : "자동 업데이트를 비활성화했습니다.",
      });
    } catch (error) {
      console.error("Failed to update settings:", error);
      toast({
        variant: "error",
        description: "자동 업데이트 활성화 설정 변경에 실패했습니다.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleIntervalChange = async (interval: string) => {
    if (!settings) return;
    setIsSaving(true);
    try {
      await updateSettings({ auto_update_interval_hours: interval });
      setSettings({ ...settings, auto_update_interval_hours: interval });
      toast({
        variant: "success",
        description: `업데이트 주기를 ${interval}시간으로 변경했습니다.`,
      });
    } catch (error) {
      console.error("Failed to update settings:", error);
      toast({
        variant: "error",
        description: "업데이트 주기 변경에 실패했습니다.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRangeChange = async (range: string) => {
    if (!settings) return;
    setIsSaving(true);
    try {
      await updateSettings({ auto_update_range_days: range });
      setSettings({ ...settings, auto_update_range_days: range });
      toast({
        variant: "success",
        description: `검색 범위를 ${range}일로 변경했습니다.`,
      });
    } catch (error) {
      console.error("Failed to update settings:", error);
      toast({
        variant: "error",
        description: "검색 범위 변경에 실패했습니다.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRunNow = async () => {
    setIsRunning(true);
    setLastRunResult(null);
    try {
      const result = await runAutoUpdateNow();
      setLastRunResult(result);
      await loadSettings();
      await loadPending();
      toast({
        variant: result.success ? "success" : "error",
        description: result.success
          ? `자동 업데이트 실행 완료 (${result.updated}건 수집)`
          : "자동 업데이트 실행에 실패했습니다.",
      });
    } catch (error) {
      console.error("Failed to run auto update:", error);
      setLastRunResult({
        success: false,
        updated: 0,
        checked: 0,
        details: [],
      });
      toast({
        variant: "error",
        description: "자동 업데이트 실행에 실패했습니다.",
      });
    } finally {
      setIsRunning(false);
    }
  };

  const getPendingApprovalOptions = (
    pending: PendingSchedule,
  ): PendingApprovalOptionState => {
    const defaults = getPendingApprovalDefaults(pending);
    const options = pendingApprovalOptions[pending.id];
    return {
      ...defaults,
      ...options,
      targetScheduleId:
        options?.targetScheduleId !== undefined
          ? options.targetScheduleId
          : defaults.targetScheduleId,
    };
  };

  const updatePendingApprovalOptions = (
    pending: PendingSchedule,
    nextOptions: Partial<PendingApprovalOptionState>,
  ) => {
    setPendingApprovalOptions((prev) => {
      const current = {
        ...getPendingApprovalDefaults(pending),
        ...prev[pending.id],
      };
      return {
        ...prev,
        [pending.id]: {
          ...current,
          ...nextOptions,
        },
      };
    });
  };

  const buildPendingApprovalPayload = (
    pending: PendingSchedule,
  ): PendingApprovalOptions => {
    const options = getPendingApprovalOptions(pending);
    return {
      applyMode: options.applyMode,
      targetMode: options.targetMode,
      timeMode: options.timeMode,
      targetScheduleId:
        options.targetMode === "update" ? options.targetScheduleId : null,
    };
  };

  const handleApprovePending = async (pending: PendingSchedule) => {
    const pendingId = pending.id;
    setProcessingPendingId(pendingId);
    try {
      await approvePendingSchedule(pendingId, buildPendingApprovalPayload(pending));
      setPendingList((prev) => prev.filter((p) => p.id !== pendingId));
      setPendingApprovalOptions((prev) => {
        const next = { ...prev };
        delete next[pendingId];
        return next;
      });
      toast({
        variant: "success",
        description: "대기 스케줄을 승인했습니다.",
      });
    } catch (error) {
      console.error("Failed to approve pending schedule:", error);
      toast({
        variant: "error",
        description: "대기 스케줄 승인에 실패했습니다.",
      });
    } finally {
      setProcessingPendingId(null);
    }
  };

  const handleRejectPending = async (pendingId: number) => {
    setProcessingPendingId(pendingId);
    try {
      await rejectPendingSchedule(pendingId);
      setPendingList((prev) => prev.filter((p) => p.id !== pendingId));
      setPendingApprovalOptions((prev) => {
        const next = { ...prev };
        delete next[pendingId];
        return next;
      });
      toast({
        variant: "success",
        description: "대기 스케줄을 거부했습니다.",
      });
    } catch (error) {
      console.error("Failed to reject pending schedule:", error);
      toast({
        variant: "error",
        description: "대기 스케줄 거부에 실패했습니다.",
      });
    } finally {
      setProcessingPendingId(null);
    }
  };

  const handleResetProcessed = async (pendingId: number) => {
    setProcessingPendingId(pendingId);
    try {
      const result = await resetPendingScheduleProcessed(pendingId);
      setPendingList((prev) =>
        prev.map((item) =>
          item.id === pendingId
            ? {
                ...item,
                is_processed: false,
                processed_decision: null,
                processed_at: null,
                processed_actor_name: null,
                processed_reset_at: result.resetAt,
              }
            : item,
        ),
      );
      toast({
        variant: "success",
        description: "처리 완료 표시를 리셋했습니다.",
      });
    } catch (error) {
      console.error("Failed to reset pending processed state:", error);
      toast({
        variant: "error",
        description: "처리 완료 표시 리셋에 실패했습니다.",
      });
    } finally {
      setProcessingPendingId(null);
    }
  };

  const formatLastRun = (timestamp: string | null): string => {
    if (!timestamp) return "실행 기록 없음";
    const date = new Date(parseInt(timestamp, 10));
    return date.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const formatPendingDate = (timestamp: string | null): string => {
    if (!timestamp) return "-";
    const date = new Date(timestamp);
    return date.toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (seconds: number | null): string => {
    if (seconds === null || !Number.isFinite(seconds)) return "-";
    const totalSeconds = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  const getThumbnailUrl = (url: string | null): string => {
    if (!url || url === "vod_thumbnail_url") return "";
    return url.replace("{type}", "480");
  };

  const getBroadcastStartDate = (pending: PendingSchedule): string => {
    if (pending.vod_started_at) {
      const date = new Date(pending.vod_started_at);
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleDateString("ko-KR", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          timeZone: "Asia/Seoul",
        });
      }
    }
    return pending.date;
  };

  const getBroadcastStartTime = (pending: PendingSchedule): string => {
    if (pending.vod_started_at) {
      const date = new Date(pending.vod_started_at);
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Seoul",
        });
      }
    }
    return pending.start_time || "--:--";
  };

  const isEnabled = settings?.auto_update_enabled === "true";
  const intervalHours = normalizeAutoUpdateIntervalHours(
    settings?.auto_update_interval_hours,
  );
  const rangeDays = settings?.auto_update_range_days || "3";

  return (
    <section className="space-y-6">
      <AdminSectionHeader
        title="스케줄 자동 업데이트"
        description={`치지직 VOD 기반 수집/승인 워크플로우를 관리합니다. 마지막 실행: ${formatLastRun(
          settings?.auto_update_last_run ?? null,
        )}`}
        count={activePendingCount}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={handleRunNow} disabled={isRunning}>
              {isRunning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              <span className="ml-1">{isRunning ? "수집 중" : "수집"}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void loadSettings();
                void loadPending();
              }}
              disabled={isFetching || isLoadingPending}
            >
              {isFetching || isLoadingPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span className="ml-1">새로고침</span>
            </Button>
          </div>
        }
      />

      {isFetching && !settings ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          설정 불러오는 중...
        </div>
      ) : (
        <>
          <div className="grid auto-rows-fr gap-2 rounded-lg border bg-card p-2 md:grid-cols-[minmax(180px,1fr)_minmax(160px,220px)_minmax(160px,220px)] md:items-stretch">
            <div className="flex h-full min-h-12 items-center justify-between gap-3 rounded-md bg-muted/35 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <Power className="h-4 w-4 text-muted-foreground" />
                <Label
                  htmlFor="auto-update-enabled"
                  className="whitespace-nowrap text-sm font-medium"
                >
                  자동 수집
                </Label>
                {isEnabled ? (
                  <Badge variant="default" className="bg-green-600">
                    활성화
                  </Badge>
                ) : (
                  <Badge variant="secondary">비활성</Badge>
                )}
              </div>
              <Switch
                id="auto-update-enabled"
                checked={isEnabled}
                onCheckedChange={handleToggleEnabled}
                disabled={isSaving}
              />
            </div>

            <div className="flex h-full min-h-12 items-center gap-2 rounded-md bg-muted/35 px-3 py-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Label className="whitespace-nowrap text-sm font-medium">
                주기
              </Label>
              <Select
                value={intervalHours}
                onValueChange={handleIntervalChange}
                disabled={isSaving}
              >
                <SelectTrigger className="h-8 flex-1">
                  <SelectValue placeholder="주기 선택" />
                </SelectTrigger>
                <SelectContent>
                  {INTERVAL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}마다
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex h-full min-h-12 items-center gap-2 rounded-md bg-muted/35 px-3 py-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Label className="whitespace-nowrap text-sm font-medium">
                범위
              </Label>
              <Select
                value={rangeDays}
                onValueChange={handleRangeChange}
                disabled={isSaving}
              >
                <SelectTrigger className="h-8 flex-1">
                  <SelectValue placeholder="범위 선택" />
                </SelectTrigger>
                <SelectContent>
                  {RANGE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {pendingList.length > 0 && (
            <section className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-base font-semibold">승인 대기 스케줄</h3>
                    <Badge variant="secondary">
                      {sortedPendingList.length}/{processFilteredPendingList.length}
                    </Badge>
                    {pendingProcessCounts.processed > 0 ? (
                      <Badge
                        variant="outline"
                        className="border-amber-300 bg-amber-50 text-amber-800"
                      >
                        처리 완료 {pendingProcessCounts.processed}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    기존 스케줄과 수집된 스케줄을 비교하고 반영 범위를 선택합니다.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">상태</Label>
                    <ButtonGroup>
                      {PENDING_PROCESS_FILTER_OPTIONS.map((option) => (
                        <Button
                          key={option.value}
                          type="button"
                          size="sm"
                          variant={
                            pendingProcessFilter === option.value
                              ? "default"
                              : "outline"
                          }
                          className="h-8 px-3"
                          onClick={() => setPendingProcessFilter(option.value)}
                        >
                          {option.label}
                          <span className="ml-1 text-xs opacity-70">
                            {pendingProcessCounts[option.value]}
                          </span>
                        </Button>
                      ))}
                    </ButtonGroup>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">유형</Label>
                    <ButtonGroup>
                      {PENDING_ACTION_FILTER_OPTIONS.map((option) => (
                        <Button
                          key={option.value}
                          type="button"
                          size="sm"
                          variant={
                            pendingActionFilter === option.value
                              ? "default"
                              : "outline"
                          }
                          className="h-8 px-3"
                          onClick={() => setPendingActionFilter(option.value)}
                        >
                          {option.label}
                          <span className="ml-1 text-xs opacity-70">
                            {pendingActionCounts[option.value]}
                          </span>
                        </Button>
                      ))}
                    </ButtonGroup>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="pending-sort" className="text-xs text-muted-foreground">
                      정렬
                    </Label>
                    <Select
                      value={pendingSort}
                      onValueChange={(value) => setPendingSort(value as PendingSortKey)}
                    >
                      <SelectTrigger id="pending-sort" className="h-8 w-[170px]">
                        <SelectValue placeholder="정렬 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {PENDING_SORT_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {sortedPendingList.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
                  선택한 유형에 해당하는 승인 대기 스케줄이 없습니다.
                </div>
              ) : (
                <div className="space-y-4">
                  {sortedPendingList.map((pending) => {
                    const options = getPendingApprovalOptions(pending);
                    const isRowProcessing = processingPendingId === pending.id;
                    const thumbnailUrl = getThumbnailUrl(pending.vod_thumbnail_url);
                    const selectedExistingSchedule =
                      options.targetMode === "update" && options.targetScheduleId
                        ? getPendingScheduleSummaryById(
                            pending,
                            options.targetScheduleId,
                          )
                        : null;
                    const appliesTime =
                      options.applyMode === "all" || options.applyMode === "time";
                    const appliesTitle =
                      options.applyMode === "all" || options.applyMode === "title";
                    const effectiveStartTime = getEffectivePendingStartTime(
                      pending,
                      options,
                    );
                    const currentTitle = selectedExistingSchedule?.title ?? null;
                    const currentStartTime =
                      selectedExistingSchedule?.start_time ?? null;
                    const currentStatus = selectedExistingSchedule?.status ?? null;
                    const nextTitle = appliesTitle ? pending.title : currentTitle;
                    const nextStartTime = appliesTime
                      ? effectiveStartTime
                      : currentStartTime;
                    const appliesStatus =
                      options.targetMode === "create" ||
                      options.applyMode === "all";
                    const nextStatus = appliesStatus ? pending.status : currentStatus;
                    const existingDateTime = selectedExistingSchedule
                      ? formatScheduleDateTime(pending.date, currentStartTime)
                      : null;
                    const nextDateTime = appliesTime
                      ? nextStartTime
                        ? formatScheduleDateTime(pending.date, nextStartTime)
                        : null
                      : existingDateTime;
                    const collectedDateTime = formatScheduleDateTime(
                      pending.date,
                      pending.start_time,
                    );
                    const vodDateTime = `${getBroadcastStartDate(
                      pending,
                    )} ${getBroadcastStartTime(pending)}`;
                    const isProcessed = pending.is_processed;
                    const canApprove =
                      !isProcessed &&
                      (options.targetMode === "create" ||
                        Boolean(selectedExistingSchedule));

                    return (
                      <div
                        key={pending.id}
                        className="rounded-lg border bg-background p-4 shadow-sm"
                      >
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <Badge
                              variant={
                                pending.action_type === "create"
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {pending.action_type === "create" ? "신규" : "수정"}
                            </Badge>
                            <span className="font-semibold">{pending.member_name}</span>
                            <span className="text-sm text-muted-foreground">
                              수집 {formatPendingDate(pending.created_at)}
                            </span>
                            {isProcessed ? (
                              <Badge
                                variant="outline"
                                className={cn(
                                  pending.processed_decision === "approved"
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                    : "border-rose-300 bg-rose-50 text-rose-800",
                                )}
                              >
                                {getProcessedLabel(pending)}
                              </Badge>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="tabular-nums">
                              방송 길이 {formatDuration(pending.vod_duration_seconds)}
                            </Badge>
                            {pending.processed_at ? (
                              <Badge variant="secondary">
                                처리 {formatPendingDate(pending.processed_at)}
                              </Badge>
                            ) : null}
                          </div>
                        </div>

                        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
                          <div className="space-y-3">
                            <div className="rounded-lg border bg-card p-4">
                              <div className="mb-3 grid gap-2 text-xs font-semibold text-muted-foreground md:grid-cols-[112px_minmax(0,1fr)_minmax(0,1fr)]">
                                <div />
                                <div className="hidden rounded-md bg-muted/25 px-3 py-2 md:block">
                                  현재 값
                                </div>
                                <div className="hidden rounded-md bg-muted/25 px-3 py-2 md:block">
                                  적용 후
                                </div>
                              </div>
                              <div className="space-y-2">
                                <DiffRow
                                  label="제목"
                                  beforeValue={currentTitle}
                                  afterValue={nextTitle}
                                  sourceValue={pending.title}
                                  active={appliesTitle}
                                />
                                <DiffRow
                                  label="방송 시간"
                                  beforeValue={existingDateTime}
                                  afterValue={nextDateTime}
                                  sourceValue={collectedDateTime}
                                  active={appliesTime}
                                />
                                <DiffRow
                                  label="상태"
                                  beforeValue={currentStatus}
                                  afterValue={nextStatus}
                                  sourceValue={pending.status}
                                  active={appliesStatus}
                                />
                              </div>
                            </div>

                            <div className="grid gap-3 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground md:grid-cols-[96px_1fr]">
                              <div className="relative h-14 w-24 overflow-hidden rounded-md bg-muted">
                                {thumbnailUrl ? (
                                  <img
                                    src={thumbnailUrl}
                                    alt={`${pending.title || pending.member_name} 썸네일`}
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center">
                                    <Play className="h-5 w-5 text-muted-foreground/60" />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 space-y-1">
                                {selectedExistingSchedule ? (
                                  <div>
                                    기존 ID #{selectedExistingSchedule.id} · 동일 날짜{" "}
                                    {pending.same_day_schedule_count}건
                                  </div>
                                ) : pending.same_day_schedules.length > 0 ? (
                                  <div className="space-y-1">
                                    <div>
                                      동일 날짜 기존 스케줄{" "}
                                      {pending.same_day_schedule_count}건
                                    </div>
                                    {pending.same_day_schedules.map((schedule) => (
                                      <div key={schedule.id} className="truncate">
                                        #{schedule.id} {schedule.start_time || "--:--"}{" "}
                                        {schedule.title || "제목 없음"} ·{" "}
                                        {schedule.status}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div>동일 날짜 기존 스케줄 0건</div>
                                )}
                                <div>
                                  방송 시작: {vodDateTime}
                                </div>
                                <div>
                                  방송 길이:{" "}
                                  {formatDuration(pending.vod_duration_seconds)}
                                </div>
                                <div className="truncate" title={pending.vod_id || ""}>
                                  VOD ID: {pending.vod_id || "-"}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-lg border bg-card p-4">
                            <div className="space-y-4">
                              {isProcessed ? (
                                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                  <div className="font-medium">
                                    {getProcessedLabel(pending)}
                                  </div>
                                  <div className="mt-1 text-xs">
                                    {pending.processed_actor_name ||
                                      "처리자 미기록"}{" "}
                                    ·{" "}
                                    {formatPendingDate(pending.processed_at)}
                                  </div>
                                </div>
                              ) : null}

                              <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">
                                  반영 범위
                                </Label>
                                <ButtonGroup orientation="vertical" className="w-full">
                                  {PENDING_APPLY_MODE_OPTIONS.map((option) => (
                                    <Button
                                      key={option.value}
                                      type="button"
                                      size="sm"
                                      variant={
                                        options.applyMode === option.value
                                          ? "default"
                                          : "outline"
                                      }
                                      className="w-full justify-start"
                                      disabled={isProcessed}
                                      onClick={() =>
                                        updatePendingApprovalOptions(pending, {
                                          applyMode: option.value,
                                        })
                                      }
                                    >
                                      {option.label}
                                    </Button>
                                  ))}
                                </ButtonGroup>
                              </div>

                              <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">
                                  반영 방식
                                </Label>
                                <ButtonGroup orientation="vertical" className="w-full">
                                  {PENDING_TARGET_MODE_OPTIONS.map((option) => (
                                    <Button
                                      key={option.value}
                                      type="button"
                                      size="sm"
                                      variant={
                                        options.targetMode === option.value
                                          ? "default"
                                          : "outline"
                                      }
                                      className="w-full justify-start"
                                      disabled={
                                        isProcessed ||
                                        (option.value === "update" &&
                                          pending.same_day_schedules.length === 0)
                                      }
                                      onClick={() =>
                                        updatePendingApprovalOptions(pending, {
                                          targetMode: option.value,
                                          targetScheduleId:
                                            option.value === "update"
                                              ? getDefaultTargetScheduleId(pending)
                                              : null,
                                        })
                                      }
                                    >
                                      {option.label}
                                    </Button>
                                  ))}
                                </ButtonGroup>
                                {options.targetMode === "update" && (
                                  <Select
                                    value={String(options.targetScheduleId ?? "none")}
                                    onValueChange={(value) =>
                                      updatePendingApprovalOptions(pending, {
                                        targetScheduleId:
                                          value === "none" ? null : Number(value),
                                      })
                                    }
                                    disabled={
                                      isProcessed ||
                                      pending.same_day_schedules.length === 0
                                    }
                                  >
                                    <SelectTrigger className="h-8 w-full">
                                      <SelectValue placeholder="수정 대상" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">대상 없음</SelectItem>
                                      {pending.same_day_schedules.map((schedule) => (
                                        <SelectItem
                                          key={schedule.id}
                                          value={String(schedule.id)}
                                        >
                                          #{schedule.id} {schedule.start_time || "--:--"}{" "}
                                          {schedule.title || "제목 없음"}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                              </div>

                              {appliesTime && (
                                <div className="flex items-start gap-2 rounded-md bg-muted/40 p-3">
                                  <Checkbox
                                    id={`round-time-${pending.id}`}
                                    checked={options.timeMode === "nearest_hour"}
                                    disabled={isProcessed}
                                    onCheckedChange={(checked) =>
                                      updatePendingApprovalOptions(pending, {
                                        timeMode:
                                          checked === true ? "nearest_hour" : "exact",
                                      })
                                    }
                                  />
                                  <Label
                                    htmlFor={`round-time-${pending.id}`}
                                    className="text-xs leading-snug text-muted-foreground"
                                  >
                                    가장 가까운 정각 적용
                                    <span className="ml-1 font-medium text-foreground tabular-nums">
                                      {effectiveStartTime || "--:--"}
                                    </span>
                                  </Label>
                                </div>
                              )}

                              <div className="grid gap-2">
                                {isProcessed ? (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => handleResetProcessed(pending.id)}
                                    disabled={isRowProcessing}
                                  >
                                    {isRowProcessing ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <RefreshCw className="h-4 w-4" />
                                    )}
                                    <span className="ml-1">처리 표시 리셋</span>
                                  </Button>
                                ) : null}
                                <Button
                                  size="sm"
                                  onClick={() => handleApprovePending(pending)}
                                  disabled={!canApprove || isRowProcessing}
                                >
                                  {isRowProcessing ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Check className="h-4 w-4" />
                                  )}
                                  <span className="ml-1">승인</span>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleRejectPending(pending.id)}
                                  disabled={isProcessed || isRowProcessing}
                                >
                                  {isRowProcessing ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <X className="h-4 w-4" />
                                  )}
                                  <span className="ml-1">거부</span>
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {lastRunResult && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  {lastRunResult.success ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                  최근 수집 결과
                </CardTitle>
                <CardDescription>
                  상단 수집 버튼으로 실행한 최근 VOD 수집 로그입니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge
                    variant={lastRunResult.success ? "default" : "destructive"}
                  >
                    {lastRunResult.success ? "수집 완료" : "수집 실패"}
                  </Badge>
                  <span className="text-muted-foreground">
                    검사된 VOD {lastRunResult.checked}개
                  </span>
                  <span className="text-muted-foreground">
                    수집/갱신 {lastRunResult.updated}개
                  </span>
                </div>

                {lastRunResult.success && lastRunResult.details.length > 0 && (
                  <div className="space-y-1 text-xs">
                    {lastRunResult.details.map((detail, idx) => (
                      <div
                        key={`${detail.memberUid}-${detail.scheduleDate}-${idx}`}
                        className="flex min-w-0 flex-wrap items-center gap-2 text-muted-foreground"
                      >
                        <span className="font-medium text-foreground">
                          {detail.memberName}
                        </span>
                        <span>{detail.scheduleDate}</span>
                        <Badge
                          variant={
                            detail.action === "auto_updated"
                              ? "secondary"
                              : detail.action === "existing"
                                ? "secondary"
                                : "outline"
                          }
                          className={
                            detail.action === "existing"
                              ? "text-xs bg-muted text-muted-foreground hover:bg-muted"
                              : "text-xs"
                          }
                        >
                          {RUN_DETAIL_LABELS[detail.action] || detail.action}
                        </Badge>
                        {detail.title && (
                          <span
                            className="min-w-0 max-w-[360px] truncate"
                            title={detail.title}
                          >
                            {detail.title}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

    </section>
  );
}
