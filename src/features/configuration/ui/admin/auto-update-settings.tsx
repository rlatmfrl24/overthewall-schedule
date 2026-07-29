import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Radio,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { ButtonGroup } from "@/shared/ui/button-group";
import { Switch } from "@/shared/ui/switch";
import { Label } from "@/shared/ui/label";
import { Checkbox } from "@/shared/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import {
  fetchSettings,
  updateSettings,
} from "../../api/settings";
import {
  approvePendingSchedule,
  approveSelectedPendingSchedules,
  fetchPendingSchedules,
  rejectPendingSchedule,
  rejectSelectedPendingSchedules,
  type PendingApplyMode,
  type PendingApprovalOptions,
  type PendingRejectionReasonCode,
  type PendingSchedule,
  type PendingTargetMode,
  type PendingTimeMode,
} from "@/features/schedules";
import {
  fetchOperationsStatus,
  runAutoUpdateNow,
  type AutoUpdateRunResult,
} from "@/features/operations";
import { useToast } from "@/shared/ui/toast";
import {
  AUTO_UPDATE_INTERVAL_HOURS,
  isAutoUpdateIntervalHours,
  normalizeAutoUpdateIntervalHours,
} from "../../model/settings-config";
import { roundTimeToNearestScheduleHour } from "@/features/schedules";
import { cn } from "@/shared/lib/utils";
import {
  AdminSectionHeader,
  ConfirmActionDialog,
} from "@/app/admin";
import { queryKeys } from "@/shared/query/query-keys";
import { ScheduleRejectionsPanel } from "./schedule-rejections-panel";
import { AutoUpdateRunHistory } from "./auto-update-run-history";
import { REJECTION_REASON_OPTIONS } from "../../model/rejection-reasons";

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
  fill_missing_fields: "빈 필드 보완",
  ambiguous: "매칭 불확실",
  short_suppressed: "단기 방송 억제",
  holiday_suppressed: "휴방일 억제",
};

const MATCH_REASON_LABELS: Record<string, string> = {
  time_window: "예정 시각 근접",
  title_similarity: "제목 유사",
  single_gap_fallback: "단일 빈 일정",
  missing_schedule: "기존 일정 없음",
  ambiguous: "대상 선택 필요",
};

const MATCH_CONFIDENCE_LABELS: Record<string, string> = {
  high: "높음",
  medium: "보통",
  low: "낮음",
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
type PendingBatchAction = "approve" | "reject";
type AutoUpdateTab = "review" | "rejections" | "runs" | "settings";

const AUTO_UPDATE_TABS: Array<{
  value: AutoUpdateTab;
  label: string;
}> = [
  { value: "review", label: "검토 대기" },
  { value: "rejections", label: "거부 제외" },
  { value: "runs", label: "실행 기록" },
  { value: "settings", label: "설정" },
];
const EMPTY_PENDING_SCHEDULES: PendingSchedule[] = [];

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

const isV2Pending = (pending: PendingSchedule) =>
  pending.candidate_kind != null;

const getCandidateKindLabel = (pending: PendingSchedule) => {
  if (pending.candidate_kind === "missing_schedule") return "새 일정";
  if (pending.candidate_kind === "ambiguous") return "매칭 불확실";
  if ((pending.missing_fields?.length ?? 0) === 1) {
    return pending.missing_fields?.[0] === "time"
      ? "빈 시간 보완"
      : "빈 제목 보완";
  }
  if (pending.candidate_kind === "fill_missing_fields") return "빈 필드 보완";
  return pending.action_type === "create" ? "신규" : "수정";
};

const getDefaultTargetScheduleId = (pending: PendingSchedule) => {
  if (pending.candidate_kind === "ambiguous") return null;
  return (
    pending.existing_schedule?.id ??
    pending.empty_target_schedule?.id ??
    pending.ranked_schedules?.[0]?.id ??
    (isV2Pending(pending) ? null : pending.same_day_schedules[0]?.id) ??
    null
  );
};

const getV2ApplyMode = (pending: PendingSchedule): PendingApplyMode => {
  if ((pending.missing_fields?.length ?? 0) !== 1) return "all";
  return pending.missing_fields?.[0] === "time" ? "time" : "title";
};

const getPendingApprovalDefaults = (
  pending: PendingSchedule,
): PendingApprovalOptionState => {
  const targetScheduleId = getDefaultTargetScheduleId(pending);
  const isV2 = isV2Pending(pending);
  return {
    applyMode: isV2 ? getV2ApplyMode(pending) : "all",
    targetMode:
      pending.candidate_kind === "missing_schedule"
        ? "create"
        : targetScheduleId || isV2
          ? "update"
          : "create",
    timeMode: isV2 ? "exact" : "nearest_hour",
    targetScheduleId,
  };
};

const resolvePendingApprovalOptions = (
  pending: PendingSchedule,
  options: Partial<PendingApprovalOptionState> | undefined,
): PendingApprovalOptionState => {
  const defaults = getPendingApprovalDefaults(pending);
  return {
    ...defaults,
    ...options,
    targetScheduleId:
      options?.targetScheduleId !== undefined
        ? options.targetScheduleId
        : defaults.targetScheduleId,
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

const getPendingReviewRisk = (
  pending: PendingSchedule,
  options: PendingApprovalOptionState,
) => {
  const isV2 = isV2Pending(pending);
  const selectedExistingSchedule =
    options.targetMode === "update" && options.targetScheduleId
      ? getPendingScheduleSummaryById(pending, options.targetScheduleId)
      : null;
  const appliesTime = isV2
    ? options.targetMode === "create" ||
      selectedExistingSchedule?.start_time?.trim() === "" ||
      selectedExistingSchedule?.start_time == null
    : options.applyMode === "all" || options.applyMode === "time";
  const appliesTitle = isV2
    ? options.targetMode === "create" ||
      selectedExistingSchedule?.title?.trim() === "" ||
      selectedExistingSchedule?.title == null
    : options.applyMode === "all" || options.applyMode === "title";
  const effectiveStartTime = getEffectivePendingStartTime(pending, options);
  const currentTitle = selectedExistingSchedule?.title ?? null;
  const currentStartTime = selectedExistingSchedule?.start_time ?? null;
  const currentStatus = selectedExistingSchedule?.status ?? null;
  const nextTitle = appliesTitle ? pending.title : currentTitle;
  const nextStartTime = appliesTime ? effectiveStartTime : currentStartTime;
  const appliesStatus =
    options.targetMode === "create" || (!isV2 && options.applyMode === "all");
  const nextStatus = appliesStatus
    ? isV2
      ? "방송"
      : pending.status
    : currentStatus;
  const existingDateTime = selectedExistingSchedule
    ? formatScheduleDateTime(pending.date, currentStartTime)
    : null;
  const nextDateTime = appliesTime
    ? nextStartTime
      ? formatScheduleDateTime(pending.date, nextStartTime)
      : null
    : existingDateTime;
  const changedFields = [
    appliesTitle && isDiffChanged(currentTitle, nextTitle) ? "제목" : null,
    appliesTime && isDiffChanged(existingDateTime, nextDateTime)
      ? "방송 시간"
      : null,
    appliesStatus && isDiffChanged(currentStatus, nextStatus) ? "상태" : null,
  ].filter((field): field is string => field !== null);
  const hasMissingTarget =
    options.targetMode === "update" && selectedExistingSchedule === null;
  const hasMultipleSameDayTargets =
    options.targetMode === "update" &&
    pending.same_day_schedule_count > 1 &&
    (!isV2 || pending.candidate_kind === "ambiguous");
  const hasOriginalTargetMissing =
    !isV2 &&
    pending.action_type === "update" &&
    pending.existing_schedule === null;
  const hasConflict =
    hasMissingTarget || hasMultipleSameDayTargets || hasOriginalTargetMissing;
  const hasCreateDuplicateCandidate =
    !isV2 &&
    pending.action_type === "create" &&
    pending.same_day_schedule_count > 0;
  const hasDuplicate =
    hasCreateDuplicateCandidate ||
    (!isV2 &&
      options.targetMode === "create" &&
      pending.same_day_schedule_count > 0);
  const warnings = [
    hasMissingTarget ? "수정 대상이 선택되지 않아 승인할 수 없습니다." : null,
    pending.candidate_kind === "ambiguous" && !options.targetScheduleId
      ? "매칭 후보가 복수입니다. 승인할 기존 일정을 반드시 선택하세요."
      : null,
    hasMultipleSameDayTargets
      ? `동일 날짜 기존 스케줄이 ${pending.same_day_schedule_count}건입니다. 수정 대상을 확인하세요.`
      : null,
    hasOriginalTargetMissing
      ? "수집 시점의 수정 대상이 현재 스케줄에서 확인되지 않습니다."
      : null,
    options.targetMode === "create" && pending.same_day_schedule_count > 0
      ? `새로 추가하면 동일 날짜에 ${pending.same_day_schedule_count}건의 기존 스케줄과 중복될 수 있습니다.`
      : null,
    hasCreateDuplicateCandidate && options.targetMode !== "create"
      ? "신규 수집 후보지만 동일 날짜 기존 스케줄이 있어 수정 대상으로 검토 중입니다."
      : null,
    changedFields.length > 0
      ? `적용 시 ${changedFields.join(", ")} 값이 변경됩니다.`
      : null,
    isV2 && options.targetMode === "update"
      ? "현재 입력된 값과 일정 상태는 유지하고 비어 있는 필드만 채웁니다."
      : null,
  ].filter((message): message is string => message !== null);

  return {
    selectedExistingSchedule,
    changedFields,
    hasConflict,
    hasDuplicate,
    warnings,
  };
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
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [processingPendingId, setProcessingPendingId] = useState<number | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<AutoUpdateTab>("review");
  const [pendingSort, setPendingSort] = useState<PendingSortKey>("date_asc");
  const [pendingActionFilter, setPendingActionFilter] =
    useState<PendingActionFilter>("all");
  const [pendingApprovalOptions, setPendingApprovalOptions] = useState<
    Record<number, Partial<PendingApprovalOptionState>>
  >({});
  const [pendingBatchAction, setPendingBatchAction] =
    useState<PendingBatchAction | null>(null);
  const [pendingRejectIds, setPendingRejectIds] = useState<number[] | null>(
    null,
  );
  const [rejectionReasonCode, setRejectionReasonCode] = useState<
    PendingRejectionReasonCode | ""
  >("");
  const [rejectionReasonNote, setRejectionReasonNote] = useState("");
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [lastRunResult, setLastRunResult] =
    useState<AutoUpdateRunResult | null>(null);

  const settingsQuery = useQuery({
    queryKey: queryKeys.settings.detail(),
    queryFn: fetchSettings,
  });
  const pendingQuery = useQuery({
    queryKey: queryKeys.settings.pending(),
    queryFn: fetchPendingSchedules,
  });
  const operationsQuery = useQuery({
    queryKey: queryKeys.operations.status(168),
    queryFn: () => fetchOperationsStatus(168),
  });
  const settings = settingsQuery.data ?? null;
  const pendingList = Array.isArray(pendingQuery.data)
    ? pendingQuery.data
    : EMPTY_PENDING_SCHEDULES;
  const isFetching = settingsQuery.isFetching;
  const isLoadingPending = pendingQuery.isFetching;

  const loadSettings = useCallback(async () => {
    await settingsQuery.refetch();
  }, [settingsQuery]);

  const loadPending = useCallback(async () => {
    await pendingQuery.refetch();
  }, [pendingQuery]);

  const activePendingCount = pendingList.length;

  const processFilteredPendingList = pendingList;

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
      await queryClient.invalidateQueries({
        queryKey: queryKeys.settings.detail(),
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
    if (!isAutoUpdateIntervalHours(interval)) {
      toast({
        variant: "error",
        description: "지원하지 않는 업데이트 주기입니다.",
      });
      return;
    }
    setIsSaving(true);
    try {
      await updateSettings({ auto_update_interval_hours: interval });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.settings.detail(),
      });
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
      await queryClient.invalidateQueries({
        queryKey: queryKeys.settings.detail(),
      });
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

  const handleLiveScheduleAutoFillToggle = async (enabled: boolean) => {
    if (!settings) return;
    setIsSaving(true);
    try {
      await updateSettings({
        live_schedule_auto_fill_enabled: enabled ? "true" : "false",
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.settings.detail(),
      });
      toast({
        variant: "success",
        description: enabled
          ? "라이브 자동 입력을 활성화했습니다."
          : "라이브 자동 입력을 비활성화했습니다.",
      });
    } catch (error) {
      console.error("Failed to update live schedule auto-fill setting:", error);
      toast({
        variant: "error",
        description: "라이브 자동 입력 설정 변경에 실패했습니다.",
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
      await Promise.all([
        loadSettings(),
        loadPending(),
        queryClient.invalidateQueries({
          queryKey: queryKeys.operations.all,
        }),
      ]);
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
        segmentCount: 0,
        sessionCount: 0,
        resumeMergedCount: 0,
        rejectedSuppressed: 0,
        duplicatePending: 0,
        shortSuppressed: 0,
        holidaySuppressed: 0,
        ambiguous: 0,
        obsoletePending: 0,
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
    return resolvePendingApprovalOptions(
      pending,
      pendingApprovalOptions[pending.id],
    );
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

  const batchPendingList = sortedPendingList;

  const pendingBatchSummary = useMemo(() => {
    return batchPendingList.reduce(
      (summary, pending) => {
        const risk = getPendingReviewRisk(
          pending,
          resolvePendingApprovalOptions(
            pending,
            pendingApprovalOptions[pending.id],
          ),
        );
        return {
          total: summary.total + 1,
          createCount:
            summary.createCount + (pending.action_type === "create" ? 1 : 0),
          updateCount:
            summary.updateCount + (pending.action_type === "update" ? 1 : 0),
          conflictCount: summary.conflictCount + (risk.hasConflict ? 1 : 0),
          duplicateCount: summary.duplicateCount + (risk.hasDuplicate ? 1 : 0),
          changedCount:
            summary.changedCount + (risk.changedFields.length > 0 ? 1 : 0),
        };
      },
      {
        total: 0,
        createCount: 0,
        updateCount: 0,
        conflictCount: 0,
        duplicateCount: 0,
        changedCount: 0,
      },
    );
  }, [batchPendingList, pendingApprovalOptions]);

  const handlePendingBatchAction = async () => {
    if (!pendingBatchAction || batchPendingList.length === 0) return;
    const action = pendingBatchAction;
    const targetIds = batchPendingList.map((item) => item.id);
    setIsBatchProcessing(true);
    try {
      const result =
        action === "approve"
          ? await approveSelectedPendingSchedules(targetIds)
          : await rejectSelectedPendingSchedules(targetIds);
      if (action === "approve") {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.schedules.all,
        });
      }
      await loadPending();
      setPendingApprovalOptions((prev) => {
        const next = { ...prev };
        for (const id of targetIds) {
          delete next[id];
        }
        return next;
      });
      setPendingBatchAction(null);
      toast({
        variant: result.failedCount > 0 ? "info" : "success",
        description:
          action === "approve"
            ? `일괄 승인 완료: 성공 ${result.successCount}건, 실패 ${result.failedCount}건`
            : `일괄 거부 완료: 성공 ${result.successCount}건, 실패 ${result.failedCount}건`,
      });
    } catch (error) {
      console.error("Failed to process pending schedules in batch:", error);
      toast({
        variant: "error",
        description:
          action === "approve"
            ? "승인 대기 일괄 승인에 실패했습니다."
            : "승인 대기 일괄 거부에 실패했습니다.",
      });
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const handleApprovePending = async (pending: PendingSchedule) => {
    const pendingId = pending.id;
    setProcessingPendingId(pendingId);
    try {
      await approvePendingSchedule(pendingId, buildPendingApprovalPayload(pending));
      await queryClient.invalidateQueries({
        queryKey: queryKeys.schedules.all,
      });
      await loadPending();
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

  const openPendingRejectDialog = (ids: number[]) => {
    setRejectionReasonCode("");
    setRejectionReasonNote("");
    setPendingRejectIds(ids);
  };

  const handleRejectPending = async () => {
    if (!pendingRejectIds || !rejectionReasonCode) return;
    const targetIds = pendingRejectIds;
    setIsBatchProcessing(true);
    if (targetIds.length === 1) setProcessingPendingId(targetIds[0]);
    try {
      const options = {
        reasonCode: rejectionReasonCode,
        reasonNote: rejectionReasonNote.trim() || null,
      };
      if (targetIds.length === 1) {
        await rejectPendingSchedule(targetIds[0], options);
      } else {
        await rejectSelectedPendingSchedules(targetIds, options);
      }
      await Promise.all([
        loadPending(),
        queryClient.invalidateQueries({
          queryKey: queryKeys.settings.all,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.operations.all,
        }),
      ]);
      setPendingApprovalOptions((prev) => {
        const next = { ...prev };
        for (const id of targetIds) delete next[id];
        return next;
      });
      setPendingRejectIds(null);
      toast({
        variant: "success",
        description: `${targetIds.length}건을 거부 제외로 등록했습니다.`,
      });
    } catch (error) {
      console.error("Failed to reject pending schedule:", error);
      toast({
        variant: "error",
        description: "대기 스케줄 거부에 실패했습니다.",
      });
    } finally {
      setProcessingPendingId(null);
      setIsBatchProcessing(false);
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
  const isLiveScheduleAutoFillEnabled =
    settings?.live_schedule_auto_fill_enabled !== "false";
  const intervalHours = normalizeAutoUpdateIntervalHours(
    settings?.auto_update_interval_hours,
  );
  const rangeDays = settings?.auto_update_range_days || "3";
  const autoUpdateStatus = operationsQuery.data?.autoUpdate;
  const formatOperationTime = (timestamp: number | null | undefined) =>
    timestamp
      ? new Date(timestamp).toLocaleString("ko-KR", {
          timeZone: "Asia/Seoul",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "-";

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

      <div
        role="tablist"
        aria-label="자동 일정 업데이트 관리"
        className="flex overflow-x-auto rounded-lg border bg-muted/25 p-1"
      >
        {AUTO_UPDATE_TABS.map((tab) => (
          <Button
            key={tab.value}
            id={`auto-update-tab-${tab.value}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.value}
            aria-controls={`auto-update-panel-${tab.value}`}
            variant={activeTab === tab.value ? "default" : "ghost"}
            className="shrink-0"
            onClick={() => setActiveTab(tab.value)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">처리 전 후보</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {activePendingCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">활성 제외</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {autoUpdateStatus?.rejectionCount ?? 0}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">정보 지표</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">최근 실행 거부 억제</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {autoUpdateStatus?.latestRun?.rejectedSuppressedCount ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">마지막 · 다음 실행</p>
            <p className="mt-1 text-sm font-medium">
              {formatOperationTime(autoUpdateStatus?.lastRun)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              다음 {formatOperationTime(autoUpdateStatus?.nextEligibleAt)}
            </p>
          </CardContent>
        </Card>
      </div>

      {isFetching && !settings ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          설정 불러오는 중...
        </div>
      ) : (
        <>
          {activeTab === "settings" ? (
          <div
            id="auto-update-panel-settings"
            role="tabpanel"
            aria-labelledby="auto-update-tab-settings"
            className="grid auto-rows-fr gap-2 rounded-lg border bg-card p-2 md:grid-cols-2 md:items-stretch xl:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_minmax(160px,220px)_minmax(160px,220px)]"
          >
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

            <div className="flex h-full min-h-12 items-center justify-between gap-3 rounded-md bg-muted/35 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <Radio className="h-4 w-4 text-muted-foreground" />
                <Label
                  htmlFor="live-schedule-auto-fill-enabled"
                  className="whitespace-nowrap text-sm font-medium"
                >
                  라이브 자동 입력
                </Label>
                {isLiveScheduleAutoFillEnabled ? (
                  <Badge variant="default" className="bg-green-600">
                    활성화
                  </Badge>
                ) : (
                  <Badge variant="secondary">비활성</Badge>
                )}
              </div>
              <Switch
                id="live-schedule-auto-fill-enabled"
                checked={isLiveScheduleAutoFillEnabled}
                onCheckedChange={handleLiveScheduleAutoFillToggle}
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
          ) : null}

          {activeTab === "review" ? (
            <section
              id="auto-update-panel-review"
              role="tabpanel"
              aria-labelledby="auto-update-tab-review"
              className="space-y-4"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-base font-semibold">승인 대기 스케줄</h3>
                    <Badge variant="secondary">
                      {sortedPendingList.length}/{processFilteredPendingList.length}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    기존 스케줄과 수집된 스케줄을 비교하고 반영 범위를 선택합니다.
                  </p>
                  {pendingBatchSummary.total > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline">
                        처리 전 {pendingBatchSummary.total}건
                      </Badge>
                      <Badge variant="outline">
                        신규 {pendingBatchSummary.createCount}건
                      </Badge>
                      <Badge variant="outline">
                        수정 {pendingBatchSummary.updateCount}건
                      </Badge>
                      {pendingBatchSummary.conflictCount > 0 ? (
                        <Badge
                          variant="outline"
                          className="border-amber-400 bg-amber-50 text-amber-800"
                        >
                          충돌 후보 {pendingBatchSummary.conflictCount}건
                        </Badge>
                      ) : null}
                      {pendingBatchSummary.duplicateCount > 0 ? (
                        <Badge
                          variant="outline"
                          className="border-rose-300 bg-rose-50 text-rose-800"
                        >
                          중복 가능 {pendingBatchSummary.duplicateCount}건
                        </Badge>
                      ) : null}
                      {pendingBatchSummary.changedCount > 0 ? (
                        <Badge
                          variant="outline"
                          className="border-sky-300 bg-sky-50 text-sky-800"
                        >
                          변경 포함 {pendingBatchSummary.changedCount}건
                        </Badge>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setPendingBatchAction("approve")}
                      disabled={
                        pendingBatchSummary.total === 0 || isBatchProcessing
                      }
                    >
                      <Check className="h-4 w-4" />
                      전체 승인
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        openPendingRejectDialog(
                          batchPendingList.map((item) => item.id),
                        )
                      }
                      disabled={
                        pendingBatchSummary.total === 0 || isBatchProcessing
                      }
                    >
                      <X className="h-4 w-4" />
                      전체 거부
                    </Button>
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
                    const isV2 = isV2Pending(pending);
                    const isRowProcessing = processingPendingId === pending.id;
                    const thumbnailUrl = getThumbnailUrl(pending.vod_thumbnail_url);
                    const selectedExistingSchedule =
                      options.targetMode === "update" && options.targetScheduleId
                        ? getPendingScheduleSummaryById(
                            pending,
                            options.targetScheduleId,
                          )
                        : null;
                    const appliesTime = isV2
                      ? options.targetMode === "create" ||
                        selectedExistingSchedule?.start_time?.trim() === "" ||
                        selectedExistingSchedule?.start_time == null
                      : options.applyMode === "all" ||
                        options.applyMode === "time";
                    const appliesTitle = isV2
                      ? options.targetMode === "create" ||
                        selectedExistingSchedule?.title?.trim() === "" ||
                        selectedExistingSchedule?.title == null
                      : options.applyMode === "all" ||
                        options.applyMode === "title";
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
                      (!isV2 && options.applyMode === "all");
                    const nextStatus = appliesStatus
                      ? isV2
                        ? "방송"
                        : pending.status
                      : currentStatus;
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
                    const reviewRisk = getPendingReviewRisk(pending, options);

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
                              {getCandidateKindLabel(pending)}
                            </Badge>
                            {pending.match_reason ? (
                              <Badge variant="outline">
                                {MATCH_REASON_LABELS[pending.match_reason] ??
                                  pending.match_reason}
                                {pending.match_confidence
                                  ? ` · ${
                                      MATCH_CONFIDENCE_LABELS[
                                        pending.match_confidence
                                      ] ?? pending.match_confidence
                                    }`
                                  : ""}
                              </Badge>
                            ) : null}
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
                            {!isProcessed && reviewRisk.hasConflict ? (
                              <Badge
                                variant="outline"
                                className="border-amber-400 bg-amber-50 text-amber-800"
                              >
                                충돌 후보
                              </Badge>
                            ) : null}
                            {!isProcessed && reviewRisk.hasDuplicate ? (
                              <Badge
                                variant="outline"
                                className="border-rose-300 bg-rose-50 text-rose-800"
                              >
                                중복 가능
                              </Badge>
                            ) : null}
                            {!isProcessed &&
                            reviewRisk.changedFields.length > 0 ? (
                              <Badge
                                variant="outline"
                                className="border-sky-300 bg-sky-50 text-sky-800"
                              >
                                변경 {reviewRisk.changedFields.length}개
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
                            {!isProcessed && reviewRisk.warnings.length > 0 ? (
                              <div
                                className={cn(
                                  "rounded-md border px-3 py-2 text-sm",
                                  reviewRisk.hasDuplicate
                                    ? "border-rose-200 bg-rose-50 text-rose-900"
                                    : "border-amber-200 bg-amber-50 text-amber-900",
                                )}
                              >
                                <div className="flex items-center gap-2 font-medium">
                                  <AlertCircle className="h-4 w-4" />
                                  검토 필요
                                </div>
                                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs leading-relaxed">
                                  {reviewRisk.warnings.map((warning) => (
                                    <li key={warning}>{warning}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
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
                                {pending.same_day_schedules.length > 0 ? (
                                  <div className="space-y-1">
                                    <div>
                                      동일 날짜 기존 스케줄{" "}
                                      {pending.same_day_schedule_count}건
                                    </div>
                                    {pending.same_day_schedules.map((schedule) => {
                                      const isSelectedTarget =
                                        selectedExistingSchedule?.id === schedule.id;
                                      const rankIndex =
                                        (pending.ranked_schedules ?? []).findIndex(
                                          (ranked) => ranked.id === schedule.id,
                                        );
                                      const ranked =
                                        rankIndex >= 0
                                          ? pending.ranked_schedules?.[rankIndex]
                                          : null;
                                      return (
                                        <div
                                          key={schedule.id}
                                          className={cn(
                                            "flex min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5",
                                            isSelectedTarget
                                              ? "bg-primary/10 text-foreground"
                                              : "bg-background/50",
                                          )}
                                        >
                                          <span className="truncate">
                                            #{schedule.id}{" "}
                                            {schedule.start_time || "--:--"}{" "}
                                            {schedule.title || "제목 없음"} ·{" "}
                                            {schedule.status}
                                          </span>
                                          <Badge
                                            variant="outline"
                                            className={cn(
                                              "shrink-0 text-[10px]",
                                              isSelectedTarget
                                                ? "border-primary/40 text-primary"
                                                : "border-amber-300 text-amber-700",
                                            )}
                                          >
                                            {isSelectedTarget
                                              ? "수정 대상"
                                              : ranked
                                                ? `후보 ${rankIndex + 1}`
                                                : isV2
                                                  ? "동일 날짜"
                                                  : "중복 후보"}
                                          </Badge>
                                          {ranked ? (
                                            <span className="shrink-0 text-[10px] text-muted-foreground">
                                              {MATCH_REASON_LABELS[ranked.reason]}
                                              {ranked.time_difference_minutes !== null
                                                ? ` ${ranked.time_difference_minutes}분`
                                                : ` ${(ranked.title_similarity * 100).toFixed(0)}%`}
                                            </span>
                                          ) : null}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div>동일 날짜 기존 스케줄 0건</div>
                                )}
                                <div>
                                  세션:{" "}
                                  {pending.session_started_at
                                    ? formatPendingDate(
                                        pending.session_started_at,
                                      )
                                    : vodDateTime}
                                  {pending.session_ended_at
                                    ? ` ~ ${formatPendingDate(
                                        pending.session_ended_at,
                                      )}`
                                    : ""}
                                </div>
                                <div>
                                  VOD 조각: {pending.vod_segment_count ?? 1}개
                                  {(pending.vod_segment_count ?? 1) > 1
                                    ? " (중단·재개 병합)"
                                    : ""}
                                </div>
                                <div
                                  className="truncate"
                                  title={(pending.source_vod_ids ?? []).join(", ")}
                                >
                                  원본 VOD:{" "}
                                  {(pending.source_vod_ids?.length ?? 0) > 0
                                    ? pending.source_vod_ids?.join(", ")
                                    : pending.vod_id || "-"}
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
                                      disabled={isProcessed || isV2}
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
                                        isV2 ||
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
                                      <SelectItem value="none">
                                        {pending.candidate_kind === "ambiguous"
                                          ? "대상을 선택하세요"
                                          : "대상 없음"}
                                      </SelectItem>
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
                                    disabled={isProcessed || isV2}
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
                                    {isV2
                                      ? "세션 시작 시각 그대로 적용"
                                      : "가장 가까운 정각 적용"}
                                    <span className="ml-1 font-medium text-foreground tabular-nums">
                                      {effectiveStartTime || "--:--"}
                                    </span>
                                  </Label>
                                </div>
                              )}

                              <div className="grid gap-2">
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
                                  onClick={() =>
                                    openPendingRejectDialog([pending.id])
                                  }
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
          ) : null}

          {activeTab === "rejections" ? (
            <ScheduleRejectionsPanel />
          ) : null}

          {activeTab === "runs" ? (
            <AutoUpdateRunHistory status={operationsQuery.data} />
          ) : null}

          {activeTab === "runs" && lastRunResult ? (
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
                    확인한 VOD {lastRunResult.segmentCount}개
                  </span>
                  <span className="text-muted-foreground">
                    방송 세션 {lastRunResult.sessionCount}개
                  </span>
                  <span className="text-muted-foreground">
                    재개 병합 {lastRunResult.resumeMergedCount}개
                  </span>
                  <span className="text-muted-foreground">
                    후보 생성 {lastRunResult.updated}개
                  </span>
                  <span className="text-muted-foreground">
                    거부 억제 {lastRunResult.rejectedSuppressed}개
                  </span>
                  <span className="text-muted-foreground">
                    pending 중복 {lastRunResult.duplicatePending}개
                  </span>
                  <span className="text-muted-foreground">
                    단기 억제 {lastRunResult.shortSuppressed}개
                  </span>
                  <span className="text-muted-foreground">
                    휴방 억제 {lastRunResult.holidaySuppressed}개
                  </span>
                  <span className="text-muted-foreground">
                    매칭 불확실 {lastRunResult.ambiguous}개
                  </span>
                  <span className="text-muted-foreground">
                    만료 후보 정리 {lastRunResult.obsoletePending}개
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
          ) : null}
        </>
      )}

      <ConfirmActionDialog
        open={pendingBatchAction !== null}
        onOpenChange={(open) => {
          if (!open && !isBatchProcessing) {
            setPendingBatchAction(null);
          }
        }}
        title={
          pendingBatchAction === "approve"
            ? "승인 대기 전체 승인"
            : "승인 대기 전체 거부"
        }
        description={
          <div className="space-y-3">
            <p>
              현재 목록의 처리 전 항목 {pendingBatchSummary.total}건을 모두{" "}
              {pendingBatchAction === "approve" ? "승인" : "거부"}합니다.
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              <div className="rounded-md border bg-background px-2 py-1.5">
                신규 {pendingBatchSummary.createCount}건
              </div>
              <div className="rounded-md border bg-background px-2 py-1.5">
                수정 {pendingBatchSummary.updateCount}건
              </div>
              <div className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1.5 text-sky-900">
                변경 포함 {pendingBatchSummary.changedCount}건
              </div>
              <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-900">
                충돌 후보 {pendingBatchSummary.conflictCount}건
              </div>
              <div className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-rose-900">
                중복 가능 {pendingBatchSummary.duplicateCount}건
              </div>
            </div>
            {pendingBatchAction === "approve" &&
            (pendingBatchSummary.conflictCount > 0 ||
              pendingBatchSummary.duplicateCount > 0) ? (
              <p className="text-xs font-medium text-amber-700">
                충돌/중복 후보가 포함되어 있습니다. 승인 전 각 항목의 수정 대상과
                적용 후 값을 확인하세요.
              </p>
            ) : null}
            {pendingBatchAction === "reject" ? (
              <p className="text-xs font-medium text-destructive">
                거부하면 선택 대상의 pending 항목이 승인 대기 목록에서 제거됩니다.
              </p>
            ) : null}
          </div>
        }
        confirmLabel={
          pendingBatchAction === "approve" ? "전체 승인" : "전체 거부"
        }
        onConfirm={() => {
          void handlePendingBatchAction();
        }}
        isProcessing={isBatchProcessing}
        destructive={pendingBatchAction === "reject"}
      />

      <ConfirmActionDialog
        open={pendingRejectIds !== null}
        onOpenChange={(open) => {
          if (!open && !isBatchProcessing) {
            setPendingRejectIds(null);
          }
        }}
        title="후보 영구 제외"
        description={
          <div className="space-y-4">
            <p>
              선택한 후보 {pendingRejectIds?.length ?? 0}건을 거부합니다. 동일
              VOD ID는 제목이나 시간이 바뀌어도 이후 수집에서 계속 제외되며,
              다시 노출하려면 거부 제외 탭에서 재검토를 허용해야 합니다.
            </p>
            <div className="space-y-2">
              <Label htmlFor="pending-rejection-reason">거부 사유</Label>
              <Select
                value={rejectionReasonCode}
                onValueChange={(value) =>
                  setRejectionReasonCode(
                    value as PendingRejectionReasonCode,
                  )
                }
              >
                <SelectTrigger id="pending-rejection-reason">
                  <SelectValue placeholder="사유를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {REJECTION_REASON_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="pending-rejection-note">메모 (선택)</Label>
                <span className="text-xs text-muted-foreground">
                  {rejectionReasonNote.length}/500
                </span>
              </div>
              <textarea
                id="pending-rejection-note"
                value={rejectionReasonNote}
                maxLength={500}
                rows={3}
                onChange={(event) =>
                  setRejectionReasonNote(event.target.value)
                }
                className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-[3px]"
                placeholder="판단 근거를 입력할 수 있습니다."
              />
            </div>
          </div>
        }
        confirmLabel="거부하고 제외"
        onConfirm={() => {
          void handleRejectPending();
        }}
        isProcessing={isBatchProcessing}
        confirmDisabled={!rejectionReasonCode}
        destructive
      />

    </section>
  );
}
