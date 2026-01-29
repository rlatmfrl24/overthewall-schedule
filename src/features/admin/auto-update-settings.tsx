import { useState, useCallback, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import {
  Loader2,
  RefreshCw,
  Clock,
  Power,
  Play,
  CheckCircle,
  XCircle,
  Calendar,
  Trash2,
  History,
  Check,
  X,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  fetchAutoUpdateLogs,
  deleteAutoUpdateLog,
  fetchPendingSchedules,
  approvePendingSchedule,
  rejectPendingSchedule,
  approveAllPendingSchedules,
  rejectAllPendingSchedules,
  type AutoUpdateSettings,
  type AutoUpdateRunResult,
  type AutoUpdateLog,
  type PendingSchedule,
} from "@/lib/api/settings";

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

const ACTION_LABELS: Record<string, string> = {
  collected: "수집됨",
  approved: "승인됨",
  rejected: "거부됨",
  created: "새 스케줄 생성",
  updated: "스케줄 업데이트",
  updated_live: "라이브 → 방송",
  updated_vod: "VOD → 방송",
};

const ACTION_BADGE_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  collected: "outline",
  approved: "default",
  rejected: "destructive",
};

export function AutoUpdateSettingsManager() {
  const [settings, setSettings] = useState<AutoUpdateSettings | null>(null);
  const [logs, setLogs] = useState<AutoUpdateLog[]>([]);
  const [pendingList, setPendingList] = useState<PendingSchedule[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [isLoadingPending, setIsLoadingPending] = useState(false);
  const [deletingLogId, setDeletingLogId] = useState<number | null>(null);
  const [processingPendingId, setProcessingPendingId] = useState<number | null>(null);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [lastRunResult, setLastRunResult] =
    useState<AutoUpdateRunResult | null>(null);

  const loadSettings = useCallback(async () => {
    setIsFetching(true);
    try {
      const data = await fetchSettings();
      setSettings(data);
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setIsFetching(false);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setIsLoadingLogs(true);
    try {
      const data = await fetchAutoUpdateLogs(100);
      setLogs(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load logs:", error);
    } finally {
      setIsLoadingLogs(false);
    }
  }, []);

  const loadPending = useCallback(async () => {
    setIsLoadingPending(true);
    try {
      const data = await fetchPendingSchedules();
      setPendingList(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load pending schedules:", error);
    } finally {
      setIsLoadingPending(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
    void loadLogs();
    void loadPending();
  }, [loadSettings, loadLogs, loadPending]);

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
    } catch (error) {
      console.error("Failed to update settings:", error);
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
    } catch (error) {
      console.error("Failed to update settings:", error);
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
    } catch (error) {
      console.error("Failed to update settings:", error);
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
      await loadLogs();
      await loadPending();
    } catch (error) {
      console.error("Failed to run auto update:", error);
      setLastRunResult({
        success: false,
        updated: 0,
        checked: 0,
        details: [],
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleDeleteLog = async (logId: number) => {
    if (!window.confirm("이 로그를 삭제하시겠습니까?")) return;
    setDeletingLogId(logId);
    try {
      await deleteAutoUpdateLog(logId);
      setLogs((prev) => prev.filter((log) => log.id !== logId));
    } catch (error) {
      console.error("Failed to delete log:", error);
    } finally {
      setDeletingLogId(null);
    }
  };

  const handleApprovePending = async (pendingId: number) => {
    setProcessingPendingId(pendingId);
    try {
      await approvePendingSchedule(pendingId);
      setPendingList((prev) => prev.filter((p) => p.id !== pendingId));
      await loadLogs();
    } catch (error) {
      console.error("Failed to approve pending schedule:", error);
    } finally {
      setProcessingPendingId(null);
    }
  };

  const handleRejectPending = async (pendingId: number) => {
    setProcessingPendingId(pendingId);
    try {
      await rejectPendingSchedule(pendingId);
      setPendingList((prev) => prev.filter((p) => p.id !== pendingId));
      await loadLogs();
    } catch (error) {
      console.error("Failed to reject pending schedule:", error);
    } finally {
      setProcessingPendingId(null);
    }
  };

  const handleApproveAll = async () => {
    if (!window.confirm(`${pendingList.length}개의 대기 스케줄을 모두 승인하시겠습니까?`)) return;
    setIsProcessingAll(true);
    try {
      await approveAllPendingSchedules();
      setPendingList([]);
      await loadLogs();
    } catch (error) {
      console.error("Failed to approve all:", error);
    } finally {
      setIsProcessingAll(false);
    }
  };

  const handleRejectAll = async () => {
    if (!window.confirm(`${pendingList.length}개의 대기 스케줄을 모두 거부하시겠습니까?`)) return;
    setIsProcessingAll(true);
    try {
      await rejectAllPendingSchedules();
      setPendingList([]);
      await loadLogs();
    } catch (error) {
      console.error("Failed to reject all:", error);
    } finally {
      setIsProcessingAll(false);
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

  const formatLogDate = (timestamp: string | null): string => {
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

  // 로그 필터: 수집, 승인, 거부만 표시
  const filteredLogs = Array.isArray(logs)
    ? logs.filter(
      (log) =>
        log.action === "collected" ||
        log.action === "approved" ||
        log.action === "rejected"
    )
    : [];

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-semibold">스케줄 자동 업데이트</h2>
          <p className="text-sm text-muted-foreground">
            치지직 VOD 데이터를 기반으로 스케줄을 수집합니다. 수집된 스케줄은 승인 후 반영됩니다.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void loadSettings();
            void loadLogs();
            void loadPending();
          }}
          disabled={isFetching || isLoadingLogs || isLoadingPending}
        >
          {isFetching || isLoadingLogs || isLoadingPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          <span className="ml-1">새로고침</span>
        </Button>
      </div>

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
                              <Badge variant="outline" className="text-xs">
                                {ACTION_LABELS[detail.action] || detail.action}
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
          {pendingList.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  승인 대기 스케줄
                  <Badge variant="secondary" className="ml-2">
                    {pendingList.length}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  수집된 스케줄입니다. 승인하면 실제 스케줄표에 반영됩니다.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* 일괄 처리 버튼 */}
                <div className="flex gap-2 mb-4">
                  <Button
                    size="sm"
                    onClick={handleApproveAll}
                    disabled={isProcessingAll}
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
                    disabled={isProcessingAll}
                  >
                    {isProcessingAll ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-1" />
                    ) : (
                      <X className="w-4 h-4 mr-1" />
                    )}
                    전체 거부
                  </Button>
                </div>

                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
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
                      {pendingList.map((pending) => (
                        <TableRow key={pending.id}>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatLogDate(pending.created_at)}
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
                              {pending.action_type === "create" ? "신규" : "수정"}
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
                                disabled={processingPendingId === pending.id}
                                title="승인"
                              >
                                {processingPendingId === pending.id ? (
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
                                disabled={processingPendingId === pending.id}
                                title="거부"
                              >
                                {processingPendingId === pending.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <X className="w-4 h-4" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 수집/승인 기록 카드 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <History className="w-4 h-4" />
                    수집/승인 기록
                  </CardTitle>
                  <CardDescription>
                    자동 업데이트로 수집되고 처리된 스케줄 기록입니다.
                  </CardDescription>
                </div>
                <Link to="/admin/logs">
                  <Button variant="outline" size="sm">
                    전체 로그 보기
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingLogs ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  로그 불러오는 중...
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  기록이 없습니다.
                </div>
              ) : (
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">날짜</TableHead>
                        <TableHead>멤버</TableHead>
                        <TableHead className="w-[100px]">스케줄 날짜</TableHead>
                        <TableHead>상태</TableHead>
                        <TableHead>제목</TableHead>
                        <TableHead className="w-[80px] text-right">
                          작업
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatLogDate(log.created_at)}
                          </TableCell>
                          <TableCell className="font-medium">
                            {log.member_name}
                          </TableCell>
                          <TableCell className="text-sm">
                            {log.schedule_date}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={ACTION_BADGE_VARIANTS[log.action] || "outline"}
                              className="text-xs"
                            >
                              {ACTION_LABELS[log.action] || log.action}
                            </Badge>
                          </TableCell>
                          <TableCell
                            className="max-w-[200px] truncate text-sm"
                            title={log.title || ""}
                          >
                            {log.title || "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteLog(log.id)}
                              disabled={deletingLogId === log.id}
                              title="로그 삭제"
                            >
                              {deletingLogId === log.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </section>
  );
}
