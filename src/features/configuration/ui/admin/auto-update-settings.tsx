import { Textarea } from "@/shared/ui/textarea";
import { LoadingImage } from "@/shared/ui/loading-image";
import { TabsList } from "@/shared/ui/tabs-list";
import { ConsoleSearchContext, useConsoleSearch } from "@/shared/lib/admin-console-search";
import { useState, useEffect, useMemo, type ReactNode } from "react";
import { gsap } from "gsap";
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { PiSpinnerGapBold as Loader2, PiArrowsClockwiseBold as RefreshCw, PiPlayBold as Play, PiCheckCircleBold as CheckCircle, PiXCircleBold as XCircle, PiCheckBold as Check, PiXBold as X, PiWarningCircleBold as AlertCircle } from "react-icons/pi";
import { Button } from "@/shared/ui/button";
import { ButtonGroup } from "@/shared/ui/button-group";
import { Switch } from "@/shared/ui/switch";
import { Label } from "@/shared/ui/label";
import { Checkbox } from "@/shared/ui/checkbox";
import { Input } from "@/shared/ui/input";
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
} from "@/features/schedules";
import {
  fetchScheduleOperationsStatus,
  runAutoUpdateNow,
  useOperationRun,
  type OperationRunAccepted,
} from "@/features/operations";
import { useToast } from "@/shared/ui/toast";
import {
  AUTO_UPDATE_INTERVAL_HOURS,
  isAutoUpdateIntervalHours,
  normalizeAutoUpdateIntervalHours,
} from "../../model/settings-config";
import { cn } from "@/shared/lib/utils";
import { AdminSectionHeader } from "@/app/admin";
import { ConfirmActionDialog } from "@/shared/ui/confirm-action-dialog";
import { queryKeys } from "@/shared/query/query-keys";
import { QUERY_STALE_TIME_MS } from "@/shared/query/query-client";
import { ScheduleRejectionsPanel } from "./schedule-rejections-panel";
import { AutoUpdateRunHistory } from "./auto-update-run-history";
import { REJECTION_REASON_OPTIONS } from "../../model/rejection-reasons";
import { summarizePendingRejectionBatch } from "./pending-rejection-batch";
import { PendingHolidayCard } from "./pending-holiday-card";
import { PendingExistingSchedules } from "./pending-existing-schedules";
import { editPendingApprovalField, getPendingApprovalPreview, getPendingScheduleSummaryById, type PendingApprovalDraft } from "../../model/pending-approval";

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
  { value: "date_asc", label: "대상 날짜 빠른순" },
  { value: "date_desc", label: "대상 날짜 늦은순" },
] as const;

const PENDING_ACTION_FILTER_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "create", label: "신규" },
  { value: "update", label: "수정" },
  { value: "rejections", label: "거부 제외" },
] as const;

const PENDING_TARGET_MODE_OPTIONS: Array<{
  value: PendingTargetMode;
  label: string;
}> = [
  { value: "update", label: "기존 수정" },
  { value: "create", label: "새로 추가" },
];

type PendingApprovalOptionState = PendingApprovalDraft & {
  targetScheduleId: number | null;
};

type PendingSortKey = (typeof PENDING_SORT_OPTIONS)[number]["value"];
type PendingActionFilter =
  (typeof PENDING_ACTION_FILTER_OPTIONS)[number]["value"];
export type AutoUpdateTab = "review" | "rejections" | "runs";

const AUTO_UPDATE_TABS: Array<{
  value: AutoUpdateTab;
  label: string;
}> = [
  { value: "review", label: "검토 대기" },
  { value: "runs", label: "실행 기록" },
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
  if (pending.candidate_kind === "holiday_suggestion") return "휴방 추정";
  if (pending.candidate_kind === "missing_schedule") return "새 일정 추가";
  if (pending.candidate_kind === "ambiguous") return "매칭 불확실";
  if ((pending.missing_fields?.length ?? 0) === 1) {
    return pending.missing_fields?.[0] === "time"
      ? "빈 시간 보완"
      : "빈 제목 보완";
  }
  if (pending.candidate_kind === "fill_missing_fields") return "기존 일정 보완";
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
      pending.candidate_kind === "missing_schedule" || pending.candidate_kind === "holiday_suggestion"
        ? "create"
        : targetScheduleId || isV2
          ? "update"
          : "create",
    timeMode: "nearest_half_hour",
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

const formatScheduleDateTime = (date: string, time: string | null | undefined) =>
  `${date} ${time?.trim() || "--:--"}`;

const formatTargetDate = (date: string) =>
  `${date} (${new Date(`${date}T12:00:00+09:00`).toLocaleDateString("ko-KR", { weekday: "short", timeZone: "Asia/Seoul" })}) · 한국 시간`;

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
  const {selectedExistingSchedule,appliesTime,appliesTitle,appliesStatus,currentTitle,currentStartTime,currentStatus,nextTitle,nextStartTime,nextStatus} = getPendingApprovalPreview(pending, options);
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
    hasMissingTarget
      ? pending.candidate_kind === "ambiguous"
        ? "매칭 후보가 복수입니다. 승인할 기존 일정을 반드시 선택하세요."
        : "수정 대상이 선택되지 않아 승인할 수 없습니다."
      : null,
    hasMultipleSameDayTargets && !hasMissingTarget
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
  ].filter((message): message is string => message !== null);

  return {
    selectedExistingSchedule,
    changedFields,
    hasConflict,
    hasDuplicate,
    warnings,
  };
};

const DiffCell = ({value, secondary, tone, emptyLabel, children, label}: {
  value: string | null | undefined;
  secondary?: string | null;
  tone: "removed" | "added" | "neutral";
  emptyLabel: string;
  children?: ReactNode;
  label: string;
}) => {
  return (
    <td className={cn("min-w-0 px-3 py-3 align-top max-sm:block", tone === "removed" && "bg-rose-500/5 text-rose-800 dark:text-rose-200", tone === "added" && "bg-emerald-500/10 text-emerald-900 dark:text-emerald-200")}>
      <div className="mb-1 text-xs text-muted-foreground sm:hidden">{label}</div>
      <div className="@container">
        <div className={cn(children && "grid items-start gap-x-3 @min-[12rem]:grid-cols-[4rem_minmax(0,1fr)]")}>
          {children ?? <span className={cn("block whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]", !value?.trim() && "text-muted-foreground")}>{value?.trim() || emptyLabel}</span>}
          {secondary && <p className={cn("mt-1 text-xs leading-relaxed text-muted-foreground", children && "@min-[12rem]:col-start-2")}>{secondary}</p>}
        </div>
      </div>
    </td>
  );
};

const DiffRow = ({label, beforeValue, afterValue, afterNote, active, isNew, editor}: {
  label: string;
  beforeValue: string | null | undefined;
  afterValue: string | null | undefined;
  afterNote?: string;
  editor?: ReactNode;
  active: boolean;
  isNew: boolean;
}) => {
  const changed = active && isDiffChanged(beforeValue, afterValue);
  const stateLabel = !active ? "유지" : !changed ? "동일" : isNew ? "추가" : !beforeValue?.trim() ? "보완" : "변경";
  const result = changed ? afterValue : active ? "기존 값과 동일" : "기존 값 유지";
  return (
    <tr className="border-b last:border-b-0 max-sm:block">
      <th scope="row" className="px-3 py-3 text-left align-top max-sm:flex max-sm:items-center max-sm:justify-between">
        <span className="block text-sm font-medium">{label}</span>
        <span className={cn("inline-block text-xs font-medium sm:mt-1", changed ? "text-emerald-800 dark:text-emerald-300" : "text-muted-foreground")}>{stateLabel}</span>
      </th>
      <DiffCell label="기존 값" value={beforeValue} tone={changed && beforeValue?.trim() ? "removed" : "neutral"} emptyLabel={isNew ? "미등록" : "미입력"} />
      <DiffCell label="승인 후" value={result} secondary={afterNote} tone={changed ? "added" : "neutral"} emptyLabel="미입력">{editor}</DiffCell>
    </tr>
  );
};

export function AutoUpdateSettingsManager({
  activeTab: controlledActiveTab,
  onActiveTabChange,
}: {
  activeTab?: AutoUpdateTab;
  onActiveTabChange?: (tab: AutoUpdateTab) => void;
} = {}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [processingPendingId, setProcessingPendingId] = useState<number | null>(
    null,
  );
  const [uncontrolledActiveTab, setUncontrolledActiveTab] = useState<AutoUpdateTab>("review");
  const activeTab = controlledActiveTab ?? uncontrolledActiveTab;
  const isReviewSurface = activeTab !== "runs";
  const setActiveTab = (tab: AutoUpdateTab) => {
    setUncontrolledActiveTab(tab);
    onActiveTabChange?.(tab);
  };
  const [search, updateSearch] = useConsoleSearch();
  const pendingSort = PENDING_SORT_OPTIONS.find((item) => item.value === search.sort)?.value ?? "date_asc";
  const [holidayApproval, setHolidayApproval] = useState<PendingSchedule | null>(null);
  const setPendingSort = (sort: PendingSortKey) => updateSearch({sort});
  const pendingActionFilter: PendingActionFilter = PENDING_ACTION_FILTER_OPTIONS.some(option=>option.value === search.state)
    ? search.state as PendingActionFilter : activeTab === "rejections" ? "rejections" : "all";
  const setPendingActionFilter = (state: PendingActionFilter) => updateSearch({state});
  const [pendingApprovalOptions, setPendingApprovalOptions] = useState<
    Record<number, Partial<PendingApprovalOptionState>>
  >({});
  const [batchApproval, setBatchApproval] = useState<{
    ids: number[];
    optionsById: Record<string, PendingApprovalOptions>;
  } | null>(null);
  const [pendingRejectIds, setPendingRejectIds] = useState<number[] | null>(
    null,
  );
  const [rejectionReasonCode, setRejectionReasonCode] = useState<
    PendingRejectionReasonCode | ""
  >("");
  const [rejectionReasonNote, setRejectionReasonNote] = useState("");
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [lastRunResult, setLastRunResult] =
    useState<OperationRunAccepted | null>(null);
  const lastRunQuery = useOperationRun(lastRunResult);

  const settingsQuery = useQuery({
    queryKey: queryKeys.settings.detail(),
    queryFn: fetchSettings,
    enabled: isReviewSurface,
  });
  const pendingQuery = useQuery({
    queryKey: queryKeys.settings.pending(),
    queryFn: fetchPendingSchedules,
    enabled: isReviewSurface && pendingActionFilter !== "rejections",
    staleTime: QUERY_STALE_TIME_MS,
  });
  const operationsQuery = useQuery({
    queryKey: queryKeys.operations.scheduleStatus(),
    queryFn: fetchScheduleOperationsStatus,
    retry: false,
  });
  const rejectionsFetching = useIsFetching({queryKey:queryKeys.settings.pendingRejectionsRoot()}) > 0;
  const settings = settingsQuery.data ?? null;
  const pendingList = Array.isArray(pendingQuery.data)
    ? pendingQuery.data
    : EMPTY_PENDING_SCHEDULES;
  const isFetching = settingsQuery.isFetching;
  const isLoadingPending = pendingQuery.isFetching;


  const loadSettings = settingsQuery.refetch;
  const loadPending = pendingQuery.refetch;
  const refreshApprovedSchedules = () => Promise.all([
    queryClient.invalidateQueries({queryKey:queryKeys.schedules.all}),
    queryClient.invalidateQueries({queryKey:queryKeys.settings.pending()}),
  ]);
  const refreshCollectionSettings = () => Promise.all([
    queryClient.invalidateQueries({queryKey:queryKeys.settings.detail()}),
    queryClient.invalidateQueries({queryKey:queryKeys.operations.statusRoot()}),
  ]);

  useEffect(() => {
    const run = lastRunQuery.data;
    if (!run || !["succeeded", "partial", "failed", "skipped", "throttled"].includes(run.status)) {
      return;
    }
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.detail() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.pending() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.operations.statusRoot() }),
    ]);
  }, [lastRunQuery.data, queryClient]);

  const pendingActionCounts = useMemo(
    () => ({
      all: pendingQuery.data ? pendingList.length : null,
      create: pendingQuery.data ? pendingList.filter(
        (item) => item.action_type === "create",
      ).length : null,
      update: pendingQuery.data ? pendingList.filter(
        (item) => item.action_type === "update",
      ).length : null,
      rejections: operationsQuery.data?.autoUpdate.rejectionCount ?? null,
    }),
    [pendingList,pendingQuery.data,operationsQuery.data?.autoUpdate.rejectionCount],
  );

  const filteredPendingList = useMemo(() => {
    if (pendingActionFilter === "all") {
      return pendingList;
    }
    return pendingList.filter(
      (item) => item.action_type === pendingActionFilter,
    );
  }, [pendingActionFilter, pendingList]);

  const sortedPendingList = useMemo(() => {
    const list = [...filteredPendingList];
    return list.sort((a, b) => {
      const dateOrder = a.date.localeCompare(b.date);
      return (pendingSort === "date_desc" ? -dateOrder : dateOrder) ||
        a.member_name.localeCompare(b.member_name, "ko") ||
        a.member_uid - b.member_uid ||
        getPendingBroadcastSortValue(a) - getPendingBroadcastSortValue(b);
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
      await refreshCollectionSettings();
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
      await refreshCollectionSettings();
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
      await refreshCollectionSettings();
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
      await queryClient.invalidateQueries({queryKey:queryKeys.settings.detail()});
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
      const accepted = await runAutoUpdateNow();
      setLastRunResult(accepted);
      toast({
        variant: "success",
        description: "자동 업데이트가 대기열에 등록되었습니다.",
      });
    } catch (error) {
      console.error("Failed to run auto update:", error);
      setLastRunResult(null);
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
      const next = {...current,...nextOptions};
      if (("targetScheduleId" in nextOptions || "targetMode" in nextOptions) && next.changes !== undefined) {
        const target = next.targetMode === "update" ? getPendingScheduleSummaryById(pending,next.targetScheduleId) : null;
        next.expectedTarget = target ? {title:target.title ?? null,startTime:target.start_time ?? null,status:target.status} : undefined;
      }
      return {
        ...prev,
        [pending.id]: next,
      };
    });
  };

  const buildPendingApprovalPayload = (
    pending: PendingSchedule,
  ): PendingApprovalOptions => {
    const options = getPendingApprovalOptions(pending);
    const {changes, expectedTarget} = getPendingApprovalPreview(pending, options);
    return {
      applyMode: changes ? changes.startTime !== undefined ? changes.title !== undefined ? "all" : "time" : "title" : options.applyMode,
      targetMode: options.targetMode,
      timeMode: options.timeMode,
      targetScheduleId:
        options.targetMode === "update" ? options.targetScheduleId : null,
      ...(changes !== undefined ? {changes,...(expectedTarget ? {expectedTarget} : {})} : {}),
    };
  };

  const batchPendingList = useMemo(() => sortedPendingList.filter(item => item.content_access !== "admin_archive" && !item.is_processed), [sortedPendingList]);
  const batchHolidays = batchPendingList.filter(item => item.candidate_kind === "holiday_suggestion");

  const pendingBatchSummary = useMemo(() => {
    return batchPendingList.reduce(
      (summary, pending) => {
        const options = resolvePendingApprovalOptions(pending, pendingApprovalOptions[pending.id]);
        const risk = getPendingReviewRisk(pending, options);
        return {
          total: summary.total + 1,
          createCount:
            summary.createCount + (options.targetMode === "create" ? 1 : 0),
          updateCount:
            summary.updateCount + (options.targetMode === "update" ? 1 : 0),
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
  const hasInvalidBatchApproval = (batchApproval !== null && batchApproval.ids.length !== batchPendingList.length) ||
    batchPendingList.some(pending => {
      const confirmedOptions = batchApproval?.optionsById[pending.id];
      if (batchApproval && !confirmedOptions) return true;
      if (pending.candidate_kind === "holiday_suggestion") return false;
      const options = confirmedOptions ?? getPendingApprovalOptions(pending);
      const preview = getPendingApprovalPreview(pending, options);
      return Boolean(preview.error || (options.targetMode === "update" && !preview.selectedExistingSchedule));
    });

  const openPendingBatchApproval = () => setBatchApproval({
    ids: batchPendingList.map(pending => pending.id),
    optionsById: Object.fromEntries(batchPendingList.map(pending => [pending.id, buildPendingApprovalPayload(pending)])),
  });

  const handlePendingBatchAction = async () => {
    if (!batchApproval || batchApproval.ids.length === 0 || hasInvalidBatchApproval) return;
    setIsBatchProcessing(true);
    try {
      const result = await approveSelectedPendingSchedules(batchApproval.ids, batchApproval.optionsById);
      await refreshApprovedSchedules();
      setPendingApprovalOptions((prev) => {
        const next = { ...prev };
        for (const id of result.results.filter(item => item.success).map(item => item.id)) {
          delete next[id];
        }
        return next;
      });
      setBatchApproval(null);
      const failures = result.results.filter(item => !item.success)
        .map(item => item.message || item.error).filter(Boolean).slice(0, 3).join(" · ");
      toast({
        variant: result.failedCount > 0 ? "info" : "success",
        description: `일괄 승인 완료: 성공 ${result.successCount}건, 실패 ${result.failedCount}건${failures ? ` · ${failures}` : ""}`,
      });
    } catch (error) {
      console.error("Failed to process pending schedules in batch:", error);
      toast({
        variant: "error",
        description: "승인 대기 일괄 승인에 실패했습니다.",
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
      await refreshApprovedSchedules();
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
        description: error instanceof Error ? error.message : "대기 스케줄 승인에 실패했습니다.",
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
      let successfulIds = targetIds;
      let toastVariant: "success" | "info" | "error" = "success";
      let toastDescription = `${targetIds.length}건을 거부 제외로 등록했습니다.`;
      if (targetIds.length === 1) {
        await rejectPendingSchedule(targetIds[0], options);
      } else {
        const result = await rejectSelectedPendingSchedules(
          targetIds,
          options,
        );
        const summary = summarizePendingRejectionBatch(result);
        successfulIds = summary.successfulIds;
        toastVariant = summary.variant;
        toastDescription = summary.description;
      }
      await Promise.all([
        queryClient.invalidateQueries({queryKey:queryKeys.settings.pending()}),
        queryClient.invalidateQueries({queryKey:queryKeys.settings.pendingRejectionsRoot()}),
        queryClient.invalidateQueries({queryKey:queryKeys.operations.statusRoot()}),
      ]);
      setPendingApprovalOptions((prev) => {
        const next = { ...prev };
        for (const id of successfulIds) delete next[id];
        return next;
      });
      setPendingRejectIds(null);
      toast({
        variant: toastVariant,
        description: toastDescription,
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

  const formatPendingDate = (timestamp: string | null): string => {
    if (!timestamp) return "-";
    const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestamp) ? timestamp : `${timestamp.replace(" ", "T")}Z`);
    return date.toLocaleString("ko-KR", {
      year: "numeric",
      timeZone: "Asia/Seoul",
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

  const collectionActions = (
    <div role="group" aria-label="수집 작업" className="flex flex-wrap items-center gap-2">
      {isReviewSurface ? <Button size="sm" className="min-h-11" onClick={handleRunNow} disabled={!settings || settingsQuery.isError || isRunning}>
        {isRunning ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Play className="w-4 h-4" />
        )}
        <span className="ml-1">{isRunning ? "수집 중" : "지금 수집"}</span>
      </Button> : <Button asChild size="sm" variant="outline"><a href="/admin/review?tab=schedule">수집·검수</a></Button>}
      <Button
        variant="outline"
        size="sm"
        className="min-h-11"
        onClick={() => {
          if (isReviewSurface) {
            void loadSettings();
            if (pendingActionFilter === "rejections") void queryClient.invalidateQueries({queryKey:queryKeys.settings.pendingRejectionsRoot()});
            else void loadPending();
          }
          void operationsQuery.refetch();
        }}
        disabled={isFetching || isLoadingPending || operationsQuery.isFetching || rejectionsFetching}
      >
        {isFetching || isLoadingPending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <RefreshCw className="w-4 h-4" />
        )}
        <span className="ml-1">상태 새로고침</span>
      </Button>
    </div>
  );

  return (
    <ConsoleSearchContext.Provider value={[search,updateSearch]}><section className="space-y-6">
      <AdminSectionHeader
        title={isReviewSurface ? "일정 검수" : "일정 수집 실행 기록"}
        description={isReviewSurface ? "수집된 방송을 기존 일정과 비교하고 승인합니다." : "일정 수집 작업의 실행 결과를 확인합니다."}
        actions={isReviewSurface ? undefined : collectionActions}
      />

      {!controlledActiveTab && <TabsList value={activeTab} onValueChange={setActiveTab} label="자동 일정 업데이트 관리"
        items={AUTO_UPDATE_TABS.map((tab) => ({ ...tab, id: `auto-update-tab-${tab.value}`, panelId: `auto-update-panel-${tab.value}` }))} />}

      {isFetching && !settings ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          설정 불러오는 중...
        </div>
      ) : (
        <>
          {isReviewSurface ? (
          <section
            id="auto-update-panel-settings"
            role="region"
            aria-label="일정 수집 설정"
            className="space-y-3 rounded-lg border bg-card p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">수집 설정</h2>
              {collectionActions}
            </div>
            <div className="grid items-center gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,1fr)]">
              <Label htmlFor="auto-update-enabled" className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
                <span>
                  <span id="auto-update-enabled-label" className="text-sm font-medium">자동 수집</span>
                  <span id="auto-update-enabled-help" className="sr-only">방송 기록에서 일정 후보를 수집합니다.</span>
                </span>
                <Switch id="auto-update-enabled" aria-labelledby="auto-update-enabled-label" aria-describedby="auto-update-enabled-help" className="shrink-0" checked={isEnabled} onCheckedChange={handleToggleEnabled} disabled={isSaving} />
              </Label>
              <Label htmlFor="live-schedule-auto-fill-enabled" className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
                <span>
                  <span id="live-schedule-auto-fill-label" className="text-sm font-medium">라이브 자동 입력</span>
                  <span id="live-schedule-auto-fill-help" className="sr-only">라이브 시작 정보로 일정을 자동 입력합니다.</span>
                </span>
                <Switch id="live-schedule-auto-fill-enabled" aria-labelledby="live-schedule-auto-fill-label" aria-describedby="live-schedule-auto-fill-help" className="shrink-0" checked={isLiveScheduleAutoFillEnabled} onCheckedChange={handleLiveScheduleAutoFillToggle} disabled={isSaving} />
              </Label>
              <div className="flex min-h-11 min-w-0 items-center gap-3">
                <Label htmlFor="auto-update-interval" className="shrink-0 text-sm font-medium">수집 주기</Label>
                <Select value={intervalHours} onValueChange={handleIntervalChange} disabled={isSaving}>
                  <SelectTrigger id="auto-update-interval" aria-label="자동 업데이트 주기" className="min-h-11 min-w-0 flex-1"><SelectValue placeholder="주기 선택" /></SelectTrigger>
                  <SelectContent>{INTERVAL_OPTIONS.map(option=><SelectItem key={option.value} value={option.value}>{option.label}마다</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex min-h-11 min-w-0 items-center gap-3">
                <Label htmlFor="auto-update-range" className="shrink-0 text-sm font-medium">조회 범위</Label>
                <Select value={rangeDays} onValueChange={handleRangeChange} disabled={isSaving}>
                  <SelectTrigger id="auto-update-range" aria-label="일정 수집 범위" className="min-h-11 min-w-0 flex-1"><SelectValue placeholder="범위 선택" /></SelectTrigger>
                  <SelectContent>{RANGE_OPTIONS.map(option=><SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <span>최근 실행 {formatOperationTime(autoUpdateStatus?.lastRun)}</span>
              <span>다음 가능 {formatOperationTime(autoUpdateStatus?.nextEligibleAt)}</span>
              <span title="다시 수집하지 않는 후보">활성 제외 {autoUpdateStatus ? autoUpdateStatus.rejectionCount + "건" : "미확인"}</span>
              <span title="최근 실행에서 거부 이력으로 제외된 후보">최근 제외 {autoUpdateStatus?.latestRun ? autoUpdateStatus.latestRun.rejectedSuppressedCount + "건" : "미확인"}</span>
            </div>
            {operationsQuery.isError && <p role="alert" className="text-sm text-destructive">수집 상태를 불러오지 못했습니다. {operationsQuery.data ? "이전 정보를 표시합니다. " : ""}상태 새로고침으로 다시 확인해 주세요.</p>}
          </section>
          ) : null}

          {lastRunResult ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  {lastRunQuery.data?.status === "succeeded" ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : lastRunQuery.data && ["partial", "failed", "throttled"].includes(lastRunQuery.data.status) ? (
                    <XCircle className="w-4 h-4 text-red-500" />
                  ) : (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  최근 비동기 수집
                </CardTitle>
                <CardDescription>
                  실행 ID {lastRunResult.runId}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {lastRunQuery.data ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge>{lastRunQuery.data.status}</Badge>
                    <span className="text-muted-foreground">
                      완료 {lastRunQuery.data.progress.succeeded}/
                      {lastRunQuery.data.progress.total}
                    </span>
                    <span className="text-muted-foreground">
                      실패 {lastRunQuery.data.progress.failed}
                    </span>
                    <span className="text-muted-foreground">
                      대기 {lastRunQuery.data.progress.queued}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    작업 상태를 확인하고 있습니다.
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {isReviewSurface ? (
            <section
              id="auto-update-panel-review"
              role={controlledActiveTab ? "region" : "tabpanel"}
              aria-label={controlledActiveTab ? "일정 승인" : undefined}
              aria-labelledby={controlledActiveTab ? undefined : "auto-update-tab-review"}
              className="space-y-4"
            >
              <header className="space-y-4">
                <h2 className="max-w-full text-lg font-semibold">승인 대기 스케줄</h2>
                <div role="group" aria-label="후보 목록 조작" className="flex flex-wrap items-end gap-3">
                  <TabsList value={pendingActionFilter} onValueChange={setPendingActionFilter} label="후보 유형"
                    className="gap-0 border-0 bg-transparent p-0 [&_button]:min-h-11"
                    items={PENDING_ACTION_FILTER_OPTIONS.map(option=>({value:option.value,label:<>{option.label} <span className="ml-1 tabular-nums">{pendingActionCounts[option.value] ?? "—"}</span></>,id:`pending-filter-${option.value}`,panelId:option.value === "rejections" ? "auto-update-panel-rejections" : "pending-candidates-panel"}))} />
                  {pendingActionFilter !== "rejections" && <><div role="group" aria-label="목록 일괄 처리" className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" className="min-h-11" onClick={openPendingBatchApproval}
                      disabled={pendingBatchSummary.total === 0 || isBatchProcessing || processingPendingId !== null || hasInvalidBatchApproval}>
                      <Check className="h-4 w-4" />전체 승인
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="min-h-11"
                      onClick={() => openPendingRejectDialog(batchPendingList.map(item => item.id))}
                      disabled={pendingBatchSummary.total === 0 || isBatchProcessing || processingPendingId !== null}>
                      <X className="h-4 w-4" />전체 거부
                    </Button>
                  </div>
                  <div className="w-full space-y-2 sm:ml-auto sm:w-52">
                    <Label htmlFor="pending-sort" className="sr-only">정렬</Label>
                    <Select value={pendingSort} onValueChange={value => setPendingSort(value as PendingSortKey)}>
                      <SelectTrigger id="pending-sort" className="min-h-11 w-full"><SelectValue placeholder="정렬 선택" /></SelectTrigger>
                      <SelectContent>{PENDING_SORT_OPTIONS.map(option => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}</SelectContent>
                    </Select>
                  </div>
                  </>}
                </div>
                {pendingActionFilter !== "rejections" && (sortedPendingList.length !== pendingList.length || pendingBatchSummary.total !== sortedPendingList.length || pendingBatchSummary.conflictCount > 0 || pendingBatchSummary.duplicateCount > 0) && (
                  <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs" role="status">
                    {sortedPendingList.length !== pendingList.length && <span className="text-muted-foreground">표시 {sortedPendingList.length} / 전체 {pendingList.length}건</span>}
                    {pendingBatchSummary.total !== sortedPendingList.length && <span className="text-muted-foreground">처리 가능 {pendingBatchSummary.total}건</span>}
                    {pendingBatchSummary.conflictCount > 0 && <span className="font-medium text-amber-700 dark:text-amber-300">충돌 후보 {pendingBatchSummary.conflictCount}건</span>}
                    {pendingBatchSummary.duplicateCount > 0 && <span className="font-medium text-destructive">중복 가능 {pendingBatchSummary.duplicateCount}건</span>}
                  </div>
                )}
              </header>

              {pendingActionFilter === "rejections" ? <ScheduleRejectionsPanel embedded /> : <div id="pending-candidates-panel" role="tabpanel" aria-labelledby={`pending-filter-${pendingActionFilter}`}>
              {sortedPendingList.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
                  선택한 유형에 해당하는 승인 대기 스케줄이 없습니다.
                </div>
              ) : (
                <div className="space-y-4">
                  {sortedPendingList.map((pending) => {
                    if (pending.candidate_kind === "holiday_suggestion") return (
                      <PendingHolidayCard key={pending.id} pending={pending} dateLabel={formatTargetDate(pending.date)}
                        createdLabel={formatPendingDate(pending.created_at)}
                        busy={processingPendingId !== null || isBatchProcessing}
                        onApprove={() => setHolidayApproval(pending)}
                        onReject={() => openPendingRejectDialog([pending.id])} />
                    );
                    const options = getPendingApprovalOptions(pending);
                    const isV2 = isV2Pending(pending);
                    const isRowProcessing = processingPendingId === pending.id;
                    const thumbnailUrl = getThumbnailUrl(pending.vod_thumbnail_url);
                    const preview = getPendingApprovalPreview(pending, options);
                    const {selectedExistingSchedule,appliesTime,appliesTitle,appliesStatus,currentTitle,currentStartTime,currentStatus,nextTitle,nextStartTime,nextStatus} = preview;
                    const vodDateTime = `${getBroadcastStartDate(
                      pending,
                    )} ${getBroadcastStartTime(pending)}`;
                    const isArchived = pending.content_access === "admin_archive";
                    const isProcessed = pending.is_processed;
                    const canApprove =
                      !isArchived && !isProcessed && !preview.error &&
                      (options.targetMode === "create" ||
                        Boolean(selectedExistingSchedule));
                    const reviewRisk = getPendingReviewRisk(pending, options);
                    const editField = (field: "title" | "startTime", value: string | null) =>
                      updatePendingApprovalOptions(pending,editPendingApprovalField(pending,options,field,value));
                    const editBlocked = processingPendingId !== null || isBatchProcessing;
                    const editable = !isArchived && !isProcessed;

                    return (
                      <article
                        key={pending.id}
                        aria-label={`${pending.member_name} 일정 후보`}
                        className="@container space-y-4 rounded-lg border bg-card p-4 sm:p-5"
                      >
                        <header className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 space-y-2">
                            <h3 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-semibold">
                              <span>{pending.member_name}</span>{" "}
                              <span className="text-sm font-medium text-muted-foreground">{formatTargetDate(pending.date)}</span>
                            </h3>
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
                            </div>
                          </div>
                          {editable && options.changes !== undefined && <Button type="button" size="sm" variant="ghost" className="min-h-11" disabled={editBlocked} onClick={()=>updatePendingApprovalOptions(pending,{changes:undefined,expectedTarget:undefined,draftValues:undefined})}>편집 초기화</Button>}
                        </header>

                        <section aria-label="수집 원본" className="grid min-w-0 gap-x-4 gap-y-1 rounded-md border bg-muted/35 px-3 py-2.5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-baseline">
                          <h4 className="text-xs font-semibold text-muted-foreground">수집 원본</h4>
                          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                            <span className="font-semibold tabular-nums">{pending.start_time?.trim() || "시각 확인 필요"}</span>
                            <span className="whitespace-pre-wrap font-medium [overflow-wrap:anywhere]">{pending.title?.trim() || "제목 없음"}</span>
                            <span className="text-xs text-muted-foreground">{pending.status}</span>
                          </div>
                        </section>

                        {!isV2 && (
                          <fieldset className="max-w-sm space-y-2" disabled={!editable || editBlocked}>
                            <legend className="text-xs text-muted-foreground">반영 방식</legend>
                            <ButtonGroup orientation="horizontal" className="w-full">
                              {PENDING_TARGET_MODE_OPTIONS.map(option => (
                                <Button
                                  key={option.value}
                                  type="button"
                                  size="sm"
                                  variant={options.targetMode === option.value ? "default" : "outline"}
                                  aria-pressed={options.targetMode === option.value}
                                  className="min-h-11 w-full justify-center"
                                  disabled={option.value === "update" && pending.same_day_schedules.length === 0}
                                  onClick={() => updatePendingApprovalOptions(pending, {
                                    targetMode: option.value,
                                    targetScheduleId: option.value === "update" ? getDefaultTargetScheduleId(pending) : null,
                                  })}
                                >
                                  {option.label}
                                </Button>
                              ))}
                            </ButtonGroup>
                          </fieldset>
                        )}

                        <div className="space-y-3">
                          <div className="space-y-3">
                            {!isProcessed && reviewRisk.warnings.length > 0 ? (
                              <div
                                className={cn(
                                  "rounded-md px-3 py-2 text-sm",
                                  reviewRisk.hasDuplicate
                                    ? "bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
                                    : "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
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
                            <div className={cn("grid grid-flow-dense items-start gap-4", pending.same_day_schedules.length > 0 && "@min-[52rem]:grid-cols-[minmax(0,5fr)_minmax(0,9fr)]")}>
                              {pending.same_day_schedules.length > 0 && (
                                <PendingExistingSchedules
                                  pending={pending}
                                  selectedScheduleId={selectedExistingSchedule?.id ?? null}
                                  onSelectSchedule={editable && options.targetMode === "update"
                                    ? targetScheduleId => updatePendingApprovalOptions(pending, { targetScheduleId })
                                    : undefined}
                                  disabled={editBlocked}
                                />
                              )}
                              <section className="min-w-0" aria-label="승인 시 변경 내용">
                                <div className="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 pb-2">
                                  <h4 className="text-sm font-semibold">승인 시 변경 내용</h4>
                                  {editable && isV2 && options.targetMode === "update" && options.changes === undefined && selectedExistingSchedule && (appliesTitle || appliesTime) && (
                                    <span className="text-xs text-muted-foreground">기본값 · 수집된 항목 선택</span>
                                  )}
                                </div>
                                {options.targetMode === "update" && !selectedExistingSchedule ? (
                                  <p role="status" className="rounded-md border border-dashed bg-muted/25 p-4 text-sm text-muted-foreground">{!editable || pending.same_day_schedules.length === 0 ? "수정할 기존 일정이 없어 변경 내용을 비교할 수 없습니다." : "수정 대상을 선택하면 변경 내용을 비교할 수 있습니다."}</p>
                                ) : (
                                  <div className="overflow-hidden rounded-md border">
                                    <table className="w-full table-fixed border-collapse text-left max-sm:block" aria-label={pending.member_name + " " + pending.date + " 변경 비교"}>
                                      <thead className="border-b bg-muted/30 max-sm:sr-only">
                                        <tr>
                                          <th scope="col" className="w-20 px-3 py-3 text-xs font-medium text-muted-foreground">항목</th>
                                          <th scope="col" className="w-[30%] px-3 py-3 text-sm font-semibold">기존 값</th>
                                          <th scope="col" className="px-3 py-3 text-sm font-semibold">승인 후</th>
                                        </tr>
                                      </thead>
                                      <tbody className="max-sm:block">
                                        <DiffRow label="제목" beforeValue={currentTitle} afterValue={nextTitle} active={appliesTitle} isNew={options.targetMode === "create"} editor={editable ? <>
                                          <Label htmlFor={`pending-title-${pending.id}`} className="min-h-11 w-fit min-w-16 cursor-pointer">
                                            <Checkbox id={`pending-title-${pending.id}`} aria-label="제목 반영" className="min-h-4!" checked={appliesTitle} disabled={editBlocked} onCheckedChange={checked=>editField("title",checked === true ? preview.titleInput : null)} />
                                            반영
                                          </Label>
                                          {appliesTitle && <Textarea rows={1} aria-label="승인할 제목" className="min-h-11 min-w-0 resize-y bg-background" value={preview.titleInput} disabled={editBlocked} onChange={event=>editField("title",event.target.value)} />}
                                        </> : undefined} />
                                        <DiffRow label="방송 시간" beforeValue={currentStartTime} afterValue={nextStartTime} afterNote={appliesTime ? `승인 시각 ${nextStartTime ?? "미입력"} · 가장 가까운 30분 단위로 적용` : undefined} active={appliesTime} isNew={options.targetMode === "create"} editor={editable ? <>
                                          <Label htmlFor={`pending-time-${pending.id}`} className="min-h-11 w-fit min-w-16 cursor-pointer">
                                            <Checkbox id={`pending-time-${pending.id}`} aria-label="방송 시간 반영" className="min-h-4!" checked={appliesTime} disabled={editBlocked} onCheckedChange={checked=>editField("startTime",checked === true ? preview.timeInput : null)} />
                                            반영
                                          </Label>
                                          {appliesTime && <Input type="time" step="60" aria-label="승인할 방송 시간" className="min-h-11 min-w-0 bg-background" value={preview.timeInput} disabled={editBlocked} onChange={event=>editField("startTime",event.target.value)} />}
                                        </> : undefined} />
                                        <DiffRow label="상태" beforeValue={currentStatus} afterValue={nextStatus} active={appliesStatus} isNew={options.targetMode === "create"} />
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                                {editable && (options.targetMode === "create" || selectedExistingSchedule) && preview.error && (
                                  <p role="alert" className="mt-2 text-sm text-destructive">{preview.error}</p>
                                )}
                              </section>
                            </div>
                          </div>

                          <fieldset disabled={isArchived || editBlocked} className="min-w-0 space-y-4 border-t pt-3">
                            {isArchived && <Badge variant="outline">관리자 보관 · 읽기 전용</Badge>}
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
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                            <details className="min-w-0 flex-1" onToggle={({currentTarget}) => {
                              if (!currentTarget.open || !window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;
                              const preview = currentTarget.querySelector("[data-vod-preview]");
                              if (preview) gsap.fromTo(preview, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.2, overwrite: true, clearProps: "opacity,transform" });
                            }}>
                              <summary className="min-h-11 cursor-pointer py-3 text-xs font-medium text-muted-foreground">수집 근거 · 방송 {formatDuration(pending.vod_duration_seconds)} · VOD {pending.vod_segment_count ?? 1}개{(pending.vod_segment_count ?? 1) > 1 && " (중단·재개 병합)"}</summary>
                              <div className="grid gap-3 py-2 text-xs text-muted-foreground md:grid-cols-[96px_minmax(0,1fr)]">
                              <div data-vod-preview className="relative h-14 w-24 overflow-hidden rounded-md bg-muted">
                                {thumbnailUrl ? (
                                  <LoadingImage
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
                                <p>추천 생성 {formatPendingDate(pending.created_at)}</p>
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
                                <div
                                  className="break-all"
                                  title={(pending.source_vod_ids ?? []).join(", ")}
                                >
                                  원본 VOD:{" "}
                                  {(pending.source_vod_ids?.length ?? 0) > 0
                                    ? pending.source_vod_ids?.join(", ")
                                    : pending.vod_id || "-"}
                                </div>
                              </div>
                              </div>
                            </details>
                              <div className="grid grid-cols-2 gap-2 sm:ml-auto sm:w-64">
                                <Button
                                  size="sm"
                                  className="min-h-11"
                                  onClick={() => handleApprovePending(pending)}
                                  disabled={!canApprove || editBlocked}
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
                                  className="min-h-11"
                                  variant="outline"
                                  onClick={() =>
                                    openPendingRejectDialog([pending.id])
                                  }
                                  disabled={isProcessed || editBlocked}
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
                          </fieldset>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
              </div>}
            </section>
          ) : null}

          {activeTab === "runs" ? (
            <AutoUpdateRunHistory standalone={Boolean(controlledActiveTab)} status={operationsQuery.data} />
          ) : null}

        </>
      )}

      <ConfirmActionDialog
        open={holidayApproval !== null}
        onOpenChange={(open) => { if (!open) setHolidayApproval(null); }}
        title="휴방 추정 승인"
        description={holidayApproval ? `${formatTargetDate(holidayApproval.date)} · ${holidayApproval.member_name} 휴방 1건을 등록합니다. 방송 기록이 없는지 확인하셨나요?` : ""}
        confirmLabel="휴방 1건 승인"
        isProcessing={processingPendingId !== null}
        onConfirm={() => { if (holidayApproval) void handleApprovePending(holidayApproval).then(() => setHolidayApproval(null)); }}
      />
      <ConfirmActionDialog
        open={batchApproval !== null}
        onOpenChange={(open) => {
          if (!open && !isBatchProcessing) {
            setBatchApproval(null);
          }
        }}
        title="승인 대기 전체 승인"
        description={
          <div className="space-y-3">
            <p>
              현재 목록의 처리 전 항목 {pendingBatchSummary.total}건을 모두 승인합니다.
              선택한 반영 항목과 편집값을 그대로 적용합니다.
            </p>
            {hasInvalidBatchApproval && <p role="alert" className="text-destructive">대상이나 입력이 변경되었습니다. 확인창을 닫고 Diff를 다시 확인해 주세요.</p>}
            {batchHolidays.length > 0 && <p className="font-medium">
              휴방 추정 {batchHolidays.length}건 · 대상: {[...new Set(batchHolidays.map(item => formatTargetDate(item.date)))].join(", ")}
            </p>}
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
            {(pendingBatchSummary.conflictCount > 0 ||
              pendingBatchSummary.duplicateCount > 0) ? (
              <p className="text-xs font-medium text-amber-700">
                충돌/중복 후보가 포함되어 있습니다. 승인 전 각 항목의 수정 대상과
                적용 후 값을 확인하세요.
              </p>
            ) : null}
          </div>
        }
        confirmLabel="전체 승인"
        onConfirm={() => {
          void handlePendingBatchAction();
        }}
        isProcessing={isBatchProcessing}
        confirmDisabled={hasInvalidBatchApproval || batchPendingList.length === 0}
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
              <Textarea
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

    </section></ConsoleSearchContext.Provider>
  );
}
