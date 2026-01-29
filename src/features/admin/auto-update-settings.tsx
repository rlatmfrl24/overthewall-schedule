import { useState, useCallback, useEffect } from "react";
import {
  Loader2,
  RefreshCw,
  Clock,
  Power,
  Play,
  CheckCircle,
  XCircle,
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
  fetchSettings,
  updateSettings,
  runAutoUpdateNow,
  type AutoUpdateSettings,
  type AutoUpdateRunResult,
} from "@/lib/api/settings";

const INTERVAL_OPTIONS = [
  { value: "1", label: "1시간" },
  { value: "2", label: "2시간" },
  { value: "4", label: "4시간" },
] as const;

export function AutoUpdateSettingsManager() {
  const [settings, setSettings] = useState<AutoUpdateSettings | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [lastRunResult, setLastRunResult] = useState<AutoUpdateRunResult | null>(null);

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

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleToggleEnabled = async (enabled: boolean) => {
    if (!settings) return;
    setIsSaving(true);
    try {
      await updateSettings({ auto_update_enabled: enabled ? "true" : "false" });
      setSettings({ ...settings, auto_update_enabled: enabled ? "true" : "false" });
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

  const handleRunNow = async () => {
    setIsRunning(true);
    setLastRunResult(null);
    try {
      const result = await runAutoUpdateNow();
      setLastRunResult(result);
      // 마지막 실행 시간 새로고침
      await loadSettings();
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

  const isEnabled = settings?.auto_update_enabled === "true";
  const intervalHours = settings?.auto_update_interval_hours || "2";

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-semibold">스케줄 자동 업데이트</h2>
          <p className="text-sm text-muted-foreground">
            미정/휴방/게릴라 상태의 스케줄을 치지직 라이브 및 VOD 상태로 자동 업데이트합니다.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadSettings}
          disabled={isFetching}
        >
          {isFetching ? (
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
        <div className="grid gap-4 md:grid-cols-2">
          {/* 활성화 설정 카드 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Power className="w-4 h-4" />
                자동 업데이트 활성화
              </CardTitle>
              <CardDescription>
                Cron 트리거를 통해 주기적으로 스케줄을 자동 업데이트합니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <Label htmlFor="auto-update-enabled" className="text-sm">
                  {isEnabled ? (
                    <Badge variant="default" className="bg-green-600">활성화됨</Badge>
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
                자동 업데이트가 실행되는 간격을 설정합니다.
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

          {/* 수동 실행 카드 */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Play className="w-4 h-4" />
                수동 실행
              </CardTitle>
              <CardDescription>
                자동 업데이트를 즉시 실행합니다. 마지막 실행:{" "}
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
                      {lastRunResult.success ? "실행 완료" : "실행 실패"}
                    </span>
                  </div>

                  {lastRunResult.success && (
                    <>
                      <div className="text-sm text-muted-foreground">
                        검사된 스케줄: {lastRunResult.checked}개 / 업데이트됨: {lastRunResult.updated}개
                      </div>

                      {lastRunResult.details.length > 0 && (
                        <div className="text-xs space-y-1">
                          <div className="font-medium text-sm mb-2">상세 결과:</div>
                          {lastRunResult.details.map((detail, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-muted-foreground">
                              <span className="font-mono">멤버 {detail.memberUid}:</span>
                              <Badge variant="outline" className="text-xs">
                                {detail.action === "updated_live" && "라이브 → 방송"}
                                {detail.action === "updated_vod" && "VOD → 방송"}
                                {detail.action === "no_vod" && "VOD 없음"}
                                {detail.action === "no_today_vod" && "오늘 VOD 없음"}
                                {detail.action === "skipped_no_channel" && "채널 없음"}
                              </Badge>
                              {detail.title && (
                                <span className="truncate max-w-[200px]" title={detail.title}>
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
        </div>
      )}
    </section>
  );
}
