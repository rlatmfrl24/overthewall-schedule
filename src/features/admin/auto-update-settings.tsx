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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  fetchSettings,
  updateSettings,
  runAutoUpdateNow,
  fetchPendingSchedules,
  approvePendingSchedule,
  rejectPendingSchedule,
  approveAllPendingSchedules,
  rejectAllPendingSchedules,
  type AutoUpdateSettings,
  type AutoUpdateRunResult,
  type PendingSchedule,
} from "@/lib/api/settings";
import { useToast } from "@/components/ui/toast";
import { ConfirmActionDialog } from "./components/confirm-action-dialog";
import { AdminSectionHeader } from "./components/admin-section-header";

const INTERVAL_OPTIONS = [
  { value: "1", label: "1시간" },
  { value: "2", label: "2시간" },
  { value: "4", label: "4시간" },
] as const;

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

type PendingSortKey = (typeof PENDING_SORT_OPTIONS)[number]["value"];

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
  const [processingSelectedIds, setProcessingSelectedIds] = useState<number[]>([]);
  const [selectedPendingIds, setSelectedPendingIds] = useState<number[]>([]);
  const [pendingSort, setPendingSort] = useState<PendingSortKey>("date_asc");
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [isProcessingSelected, setIsProcessingSelected] = useState(false);
  const [confirmBulkAction, setConfirmBulkAction] = useState<
    "approveAll" | "rejectAll" | "approveSelected" | "rejectSelected" | null
  >(null);
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

  const sortedPendingList = useMemo(() => {
    const list = [...pendingList];
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
      if (a.date !== b.date) {
        return pendingSort === "date_desc"
          ? b.date.localeCompare(a.date)
          : a.date.localeCompare(b.date);
      }
      return (a.start_time || "").localeCompare(b.start_time || "");
    });
  }, [pendingList, pendingSort]);

  useEffect(() => {
    const validIds = new Set(pendingList.map((item) => item.id));
    setSelectedPendingIds((prev) => prev.filter((id) => validIds.has(id)));
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

  const handleApprovePending = async (pendingId: number) => {
    if (isProcessingAll || isProcessingSelected) return;
    setProcessingPendingId(pendingId);
    try {
      await approvePendingSchedule(pendingId);
      setPendingList((prev) => prev.filter((p) => p.id !== pendingId));
      setSelectedPendingIds((prev) => prev.filter((id) => id !== pendingId));
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
    if (isProcessingAll || isProcessingSelected) return;
    setProcessingPendingId(pendingId);
    try {
      await rejectPendingSchedule(pendingId);
      setPendingList((prev) => prev.filter((p) => p.id !== pendingId));
      setSelectedPendingIds((prev) => prev.filter((id) => id !== pendingId));
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

  const handleApproveSelected = () => {
    if (selectedPendingIds.length === 0 || isProcessingAll || isProcessingSelected)
      return;
    setConfirmBulkAction("approveSelected");
  };

  const handleRejectSelected = () => {
    if (selectedPendingIds.length === 0 || isProcessingAll || isProcessingSelected)
      return;
    setConfirmBulkAction("rejectSelected");
  };

  const handleApproveAll = () => {
    if (sortedPendingList.length === 0 || isProcessingAll || isProcessingSelected)
      return;
    setConfirmBulkAction("approveAll");
  };

  const handleRejectAll = () => {
    if (sortedPendingList.length === 0 || isProcessingAll || isProcessingSelected)
      return;
    setConfirmBulkAction("rejectAll");
  };

  const handleProcessSelected = async (mode: "approve" | "reject") => {
    const targetIds = [...selectedPendingIds];
    if (targetIds.length === 0) return;

    setIsProcessingSelected(true);
    setProcessingSelectedIds(targetIds);
    const succeededIds: number[] = [];
    let failedCount = 0;

    for (const pendingId of targetIds) {
      try {
        if (mode === "approve") {
          await approvePendingSchedule(pendingId);
        } else {
          await rejectPendingSchedule(pendingId);
        }
        succeededIds.push(pendingId);
      } catch (error) {
        console.error(`Failed to ${mode} pending schedule ${pendingId}:`, error);
        failedCount += 1;
      }
    }

    if (succeededIds.length > 0) {
      const successSet = new Set(succeededIds);
      setPendingList((prev) => prev.filter((item) => !successSet.has(item.id)));
      setSelectedPendingIds((prev) => prev.filter((id) => !successSet.has(id)));
    }

    if (failedCount === 0) {
      toast({
        variant: "success",
        description:
          mode === "approve"
            ? `${succeededIds.length}개의 선택 항목을 승인했습니다.`
            : `${succeededIds.length}개의 선택 항목을 거부했습니다.`,
      });
    } else {
      toast({
        variant: failedCount === targetIds.length ? "error" : "success",
        description:
          mode === "approve"
            ? `선택 승인 완료: ${succeededIds.length}건 성공, ${failedCount}건 실패`
            : `선택 거부 완료: ${succeededIds.length}건 성공, ${failedCount}건 실패`,
      });
    }

    setIsProcessingSelected(false);
    setProcessingSelectedIds([]);
  };

  const handleConfirmBulkAction = async () => {
    if (!confirmBulkAction) return;

    if (confirmBulkAction === "approveSelected") {
      await handleProcessSelected("approve");
      setConfirmBulkAction(null);
      return;
    }

    if (confirmBulkAction === "rejectSelected") {
      await handleProcessSelected("reject");
      setConfirmBulkAction(null);
      return;
    }

    setIsProcessingAll(true);
    try {
      if (confirmBulkAction === "approveAll") {
        await approveAllPendingSchedules();
        toast({
          variant: "success",
          description: `${sortedPendingList.length}개의 대기 스케줄을 전체 승인했습니다.`,
        });
      } else {
        await rejectAllPendingSchedules();
        toast({
          variant: "success",
          description: `${sortedPendingList.length}개의 대기 스케줄을 전체 거부했습니다.`,
        });
      }
      setPendingList([]);
    } catch (error) {
      console.error("Failed to process all pending schedules:", error);
      toast({
        variant: "error",
        description:
          confirmBulkAction === "approveAll"
            ? "전체 승인 처리에 실패했습니다."
            : "전체 거부 처리에 실패했습니다.",
      });
    } finally {
      setIsProcessingAll(false);
      setSelectedPendingIds([]);
      setConfirmBulkAction(null);
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

  const isEnabled = settings?.auto_update_enabled === "true";
  const intervalHours = settings?.auto_update_interval_hours || "2";
  const rangeDays = settings?.auto_update_range_days || "3";
  const selectedPendingSet = useMemo(
    () => new Set(selectedPendingIds),
    [selectedPendingIds],
  );
  const processingSelectedSet = useMemo(
    () => new Set(processingSelectedIds),
    [processingSelectedIds],
  );
  const selectedCount = selectedPendingIds.length;
  const allSelected =
    sortedPendingList.length > 0 && selectedCount === sortedPendingList.length;
  const isIndeterminate =
    selectedCount > 0 && selectedCount < sortedPendingList.length;
  const isBulkProcessing = isProcessingAll || isProcessingSelected;

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedPendingIds(sortedPendingList.map((item) => item.id));
      return;
    }
    setSelectedPendingIds([]);
  };

  const togglePendingSelection = (pendingId: number, checked: boolean) => {
    setSelectedPendingIds((prev) => {
      if (checked) {
        if (prev.includes(pendingId)) return prev;
        return [...prev, pendingId];
      }
      return prev.filter((id) => id !== pendingId);
    });
  };

  return (
    <section className="space-y-6">
      <AdminSectionHeader
        title="스케줄 자동 업데이트"
        description="치지직 VOD 기반 스케줄 수집/승인 워크플로우를 관리합니다."
        count={sortedPendingList.length}
        actions={
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
        }
      />

      {isFetching && !settings ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          설정 불러오는 중...
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* 활성화 설정 카드 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Power className="w-4 h-4" />
                  자동 업데이트 활성화
                </CardTitle>
                <CardDescription>
                  Cron 트리거를 통해 주기적으로 스케줄을 자동 수집합니다.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-update-enabled" className="text-sm">
                    {isEnabled ? (
                      <Badge variant="default" className="bg-green-600">
                        활성화됨
                      </Badge>
                    ) : (
                      <Badge variant="secondary">비활성화됨</Badge>
                    )}
                  </Label>
                  <Switch
                    id="auto-update-enabled"
                    checked={isEnabled}
                    onCheckedChange={handleToggleEnabled}
                    disabled={isSaving}
                  />
                </div>
              </CardContent>
            </Card>

            {/* 주기 설정 카드 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  업데이트 주기
                </CardTitle>
                <CardDescription>
                  자동 수집이 실행되는 간격을 설정합니다.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Select
                  value={intervalHours}
                  onValueChange={handleIntervalChange}
                  disabled={isSaving}
                >
                  <SelectTrigger className="w-full">
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
              </CardContent>
            </Card>

            {/* 날짜 범위 설정 카드 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  검색 범위
                </CardTitle>
                <CardDescription>
                  오늘 기준 며칠 전까지의 스케줄을 검색할지 설정합니다.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Select
                  value={rangeDays}
                  onValueChange={handleRangeChange}
                  disabled={isSaving}
                >
                  <SelectTrigger className="w-full">
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
              </CardContent>
            </Card>
          </div>

          {/* 수동 실행 카드 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Play className="w-4 h-4" />
                수동 실행
              </CardTitle>
              <CardDescription>
                VOD 수집을 즉시 실행합니다. 마지막 실행:{" "}
                <span className="font-medium">
                  {formatLastRun(settings?.auto_update_last_run ?? null)}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={handleRunNow}
                disabled={isRunning}
                className="w-full sm:w-auto"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    실행 중...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    지금 실행
                  </>
                )}
              </Button>

              {/* 실행 결과 표시 */}
              {lastRunResult && (
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    {lastRunResult.success ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )}
                    <span className="font-medium">
                      {lastRunResult.success ? "수집 완료" : "수집 실패"}
                    </span>
                  </div>

                  {lastRunResult.success && (
                    <>
                      <div className="text-sm text-muted-foreground">
                        검사된 VOD: {lastRunResult.checked}개 / 수집됨:{" "}
                        {lastRunResult.updated}개
                      </div>

                      {lastRunResult.details.length > 0 && (
                        <div className="text-xs space-y-1">
                          <div className="font-medium text-sm mb-2">
                            수집된 스케줄:
                          </div>
                          {lastRunResult.details.map((detail, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-2 text-muted-foreground"
                            >
                              <span className="font-medium text-foreground">
                                {detail.memberName}
                              </span>
                              <span className="text-muted-foreground">
                                ({detail.scheduleDate})
                              </span>
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
                                {RUN_DETAIL_LABELS[detail.action] ||
                                  detail.action}
                              </Badge>
                              {detail.title && (
                                <span
                                  className="truncate max-w-[200px]"
                                  title={detail.title}
                                >
                                  {detail.title}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 승인 대기 스케줄 카드 (아이템 있을 때만 표시) */}
          {sortedPendingList.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  승인 대기 스케줄
                  <Badge variant="secondary" className="ml-2">
                    {sortedPendingList.length}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  수집된 스케줄입니다. 승인하면 실제 스케줄표에 반영됩니다.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      onClick={handleApproveSelected}
                      disabled={selectedCount === 0 || isBulkProcessing}
                    >
                      {isProcessingSelected ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-1" />
                      ) : (
                        <Check className="w-4 h-4 mr-1" />
                      )}
                      선택 승인 ({selectedCount})
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleRejectSelected}
                      disabled={selectedCount === 0 || isBulkProcessing}
                    >
                      {isProcessingSelected ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-1" />
                      ) : (
                        <X className="w-4 h-4 mr-1" />
                      )}
                      선택 거부 ({selectedCount})
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleApproveAll}
                      disabled={sortedPendingList.length === 0 || isBulkProcessing}
                    >
                      {isProcessingAll ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-1" />
                      ) : (
                        <Check className="w-4 h-4 mr-1" />
                      )}
                      전체 승인
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleRejectAll}
                      disabled={sortedPendingList.length === 0 || isBulkProcessing}
                    >
                      {isProcessingAll ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-1" />
                      ) : (
                        <X className="w-4 h-4 mr-1" />
                      )}
                      전체 거부
                    </Button>
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

                <div className="rounded-md border overflow-hidden">
                  <Table className="min-w-[860px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[48px]">
                          <div className="flex items-center justify-center">
                            <Checkbox
                              aria-label="전체 선택"
                              checked={
                                allSelected ? true : isIndeterminate ? "indeterminate" : false
                              }
                              onCheckedChange={(checked) =>
                                toggleSelectAll(checked === true)
                              }
                              disabled={sortedPendingList.length === 0 || isBulkProcessing}
                            />
                          </div>
                        </TableHead>
                        <TableHead className="w-[100px]">수집일</TableHead>
                        <TableHead>멤버</TableHead>
                        <TableHead className="w-[100px]">스케줄 날짜</TableHead>
                        <TableHead className="w-[80px]">시간</TableHead>
                        <TableHead className="w-[80px]">유형</TableHead>
                        <TableHead>제목</TableHead>
                        <TableHead className="w-[100px] text-right">
                          작업
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedPendingList.map((pending) => {
                        const isRowProcessing =
                          processingPendingId === pending.id ||
                          processingSelectedSet.has(pending.id);
                        return (
                          <TableRow key={pending.id}>
                            <TableCell>
                              <div className="flex items-center justify-center">
                                <Checkbox
                                  aria-label={`${pending.member_name} ${pending.date} 선택`}
                                  checked={selectedPendingSet.has(pending.id)}
                                  onCheckedChange={(checked) =>
                                    togglePendingSelection(pending.id, checked === true)
                                  }
                                  disabled={isBulkProcessing || isRowProcessing}
                                />
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {formatPendingDate(pending.created_at)}
                            </TableCell>
                            <TableCell className="font-medium">
                              {pending.member_name}
                            </TableCell>
                            <TableCell className="text-sm">
                              {pending.date}
                            </TableCell>
                            <TableCell className="text-sm">
                              {pending.start_time || "-"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  pending.action_type === "create"
                                    ? "default"
                                    : "secondary"
                                }
                                className="text-xs"
                              >
                                {pending.action_type === "create"
                                  ? "신규"
                                  : "수정"}
                              </Badge>
                            </TableCell>
                            <TableCell
                              className="max-w-[200px] truncate text-sm"
                              title={pending.title || ""}
                            >
                              {pending.title || "-"}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex gap-1 justify-end">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                                  onClick={() => handleApprovePending(pending.id)}
                                  disabled={isBulkProcessing || isRowProcessing}
                                  title="승인"
                                >
                                  {isRowProcessing ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Check className="w-4 h-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => handleRejectPending(pending.id)}
                                  disabled={isBulkProcessing || isRowProcessing}
                                  title="거부"
                                >
                                  {isRowProcessing ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <X className="w-4 h-4" />
                                  )}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <ConfirmActionDialog
        open={confirmBulkAction !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmBulkAction(null);
        }}
        title={
          confirmBulkAction === "approveAll"
            ? "전체 승인 확인"
            : confirmBulkAction === "rejectAll"
              ? "전체 거부 확인"
              : confirmBulkAction === "approveSelected"
                ? "선택 승인 확인"
                : "선택 거부 확인"
        }
        description={
          confirmBulkAction === "approveAll"
            ? `${sortedPendingList.length}개의 대기 스케줄을 모두 승인하시겠습니까?`
            : confirmBulkAction === "rejectAll"
              ? `${sortedPendingList.length}개의 대기 스케줄을 모두 거부하시겠습니까?`
              : confirmBulkAction === "approveSelected"
                ? `${selectedCount}개의 선택 항목을 승인하시겠습니까?`
                : `${selectedCount}개의 선택 항목을 거부하시겠습니까?`
        }
        confirmLabel={
          confirmBulkAction === "approveAll"
            ? "전체 승인"
            : confirmBulkAction === "rejectAll"
              ? "전체 거부"
              : confirmBulkAction === "approveSelected"
                ? "선택 승인"
                : "선택 거부"
        }
        destructive={
          confirmBulkAction === "rejectAll" ||
          confirmBulkAction === "rejectSelected"
        }
        isProcessing={isProcessingAll || isProcessingSelected}
        onConfirm={() => {
          void handleConfirmBulkAction();
        }}
      />
    </section>
  );
}
