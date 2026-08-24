import { useEffect, useMemo, useState } from "react";
import type { OtwPlayAdminCatalogDto } from "@contracts/otw-play";
import { useQueryClient } from "@tanstack/react-query";
import { EyeOff, Loader2, Pause, Play, Radar, RefreshCw } from "lucide-react";
import { queryKeys } from "@/shared/query/query-keys";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/shared/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { useToast } from "@/shared/ui/toast";
import {
  createOtwPlayChannelMonitor,
  reconcileOtwPlayChannelMonitor,
  updateOtwPlayChannelMonitor,
  updateOtwPlayImportCandidate,
} from "../../api/admin";
import {
  useOtwPlayChannelMonitorCandidates,
  useOtwPlayChannelMonitors,
} from "../../queries/use-admin-catalog";

const formatAt = (value: number | null) =>
  value === null ? "아직 확인하지 않음" : new Date(value).toLocaleString("ko-KR");

export function ChannelMonitorSection({ catalog }: { catalog: OtwPlayAdminCatalogDto }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const monitorsQuery = useOtwPlayChannelMonitors();
  const [selectedMonitorId, setSelectedMonitorId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const candidatesQuery = useOtwPlayChannelMonitorCandidates(selectedMonitorId);
  const monitors = useMemo(() => monitorsQuery.data ?? [], [monitorsQuery.data]);
  const monitoredChannelIds = useMemo(
    () => new Set(monitors.map((monitor) => monitor.channelId)),
    [monitors],
  );
  const availableChannels = catalog.channels.filter((channel) =>
    channel.channelRole === "approved_kirinuki" &&
    channel.verificationStatus === "approved" &&
    channel.active &&
    !monitoredChannelIds.has(channel.id)
  );
  const selectedMonitor = monitors.find((monitor) => monitor.id === selectedMonitorId) ?? null;
  const candidates = (candidatesQuery.data ?? []).filter(
    (candidate) => candidate.status !== "ignored" && candidate.status !== "converted",
  );

  useEffect(() => {
    if (!selectedMonitorId && monitors[0]) setSelectedMonitorId(monitors[0].id);
    if (selectedMonitorId && !monitors.some((monitor) => monitor.id === selectedMonitorId)) {
      setSelectedMonitorId(monitors[0]?.id ?? null);
    }
  }, [monitors, selectedMonitorId]);

  const refresh = async (monitorId = selectedMonitorId) => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.otwPlay.channelMonitors() });
    if (monitorId) {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.otwPlay.channelMonitorCandidates(monitorId),
      });
    }
  };

  const createMonitor = async () => {
    if (!selectedChannelId) return;
    setBusy("create");
    try {
      const monitor = await createOtwPlayChannelMonitor({ channelId: selectedChannelId });
      setSelectedMonitorId(monitor.id);
      setSelectedChannelId("");
      await refresh(monitor.id);
      toast({
        variant: "success",
        description: "현재 최신 영상을 기준점으로 저장했습니다. 이후 업로드부터 검수 제안에 추가합니다.",
      });
    } catch {
      toast({ variant: "error", description: "채널 감시를 등록하지 못했습니다." });
    } finally {
      setBusy(null);
    }
  };

  const toggleMonitor = async () => {
    if (!selectedMonitor) return;
    setBusy("toggle");
    try {
      await updateOtwPlayChannelMonitor(selectedMonitor.id, {
        expectedVersion: selectedMonitor.version,
        status: selectedMonitor.status === "active" ? "paused" : "active",
      });
      await refresh();
    } catch {
      toast({ variant: "error", description: "감시 상태를 변경하지 못했습니다. 최신 상태를 다시 확인해 주세요." });
    } finally {
      setBusy(null);
    }
  };

  const reconcile = async () => {
    if (!selectedMonitor) return;
    setBusy("reconcile");
    try {
      const result = await reconcileOtwPlayChannelMonitor(selectedMonitor.id);
      await refresh();
      toast({
        variant: result.capped ? "info" : "success",
        description: result.capped
          ? `최근 250개를 확인해 ${result.discoveredCount}개를 추가했습니다. 기준점을 찾지 못해 다음 대조가 필요합니다.`
          : `${result.checkedVideoCount}개를 확인해 신규 검수 제안 ${result.discoveredCount}개를 추가했습니다.`,
      });
    } catch {
      toast({ variant: "error", description: "채널 업로드를 대조하지 못했습니다." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-start gap-3">
          <Radar className="mt-0.5 size-5 text-primary" />
          <div className="space-y-1">
            <CardTitle className="text-base">신규 업로드 자동 검수 제안</CardTitle>
            <p className="text-sm leading-relaxed text-muted-foreground">
              승인된 클립 채널을 6시간마다 확인합니다. 등록 이전 영상은 소급하지 않고,
              새 영상은 singing clip 검수함에만 보관하며 자동 공개하지 않습니다.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 md:grid-cols-[minmax(260px,1fr)_auto] md:items-end">
          <Field>
            <FieldLabel>감시할 승인 클립 채널</FieldLabel>
            <FieldDescription>
              채널 관리에서 active · approved · approved_kirinuki로 승인된 채널만 표시됩니다.
            </FieldDescription>
            <Select value={selectedChannelId} onValueChange={setSelectedChannelId}>
              <SelectTrigger className="h-11 w-full"><SelectValue placeholder="채널 선택" /></SelectTrigger>
              <SelectContent>
                {availableChannels.map((channel) => (
                  <SelectItem key={channel.id} value={channel.id}>{channel.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Button className="h-11" disabled={!selectedChannelId || busy !== null} onClick={() => void createMonitor()}>
            {busy === "create" ? <Loader2 className="animate-spin" /> : <Radar />}
            감시 시작
          </Button>
        </div>

        {monitors.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            등록된 채널 감시가 없습니다.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,2.2fr)]">
            <div className="space-y-2">
              {monitors.map((monitor) => (
                <button
                  type="button"
                  key={monitor.id}
                  onClick={() => setSelectedMonitorId(monitor.id)}
                  className={`w-full rounded-xl border p-4 text-left transition-colors ${
                    monitor.id === selectedMonitorId ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{monitor.channelDisplayName}</span>
                    <Badge variant={monitor.status === "active" ? "default" : "secondary"}>
                      {monitor.status === "active" ? "감시 중" : "일시 정지"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    마지막 확인 {formatAt(monitor.lastCheckedAt)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    미처리 {monitor.pendingCandidateCount}개 · 누적 {monitor.candidateCount}개
                  </p>
                  {monitor.lastErrorCode ? (
                    <p className="mt-2 text-xs text-destructive">오류 · {monitor.lastErrorCode}</p>
                  ) : null}
                </button>
              ))}
            </div>

            <div className="min-w-0 rounded-xl border">
              {selectedMonitor ? (
                <>
                  <div className="flex flex-wrap items-center gap-2 border-b p-4">
                    <div className="mr-auto min-w-0">
                      <p className="truncate font-semibold">{selectedMonitor.channelDisplayName}</p>
                      <p className="text-xs text-muted-foreground">
                        다음 확인 {formatAt(selectedMonitor.nextCheckAt)}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void toggleMonitor()}>
                      {selectedMonitor.status === "active" ? <Pause /> : <Play />}
                      {selectedMonitor.status === "active" ? "일시 정지" : "감시 재개"}
                    </Button>
                    <Button size="sm" disabled={busy !== null || selectedMonitor.status !== "active"} onClick={() => void reconcile()}>
                      {busy === "reconcile" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                      지금 대조
                    </Button>
                  </div>
                  <div className="divide-y">
                    {candidates.length === 0 ? (
                      <p className="p-8 text-center text-sm text-muted-foreground">대기 중인 신규 영상이 없습니다.</p>
                    ) : candidates.map((candidate) => (
                      <div key={candidate.candidateId} className="flex min-w-0 gap-4 p-4">
                        {candidate.thumbnailUrl ? (
                          <img className="h-20 w-36 shrink-0 rounded-lg object-cover" src={candidate.thumbnailUrl} alt="" />
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <a
                            className="line-clamp-2 font-medium hover:underline"
                            href={`https://www.youtube.com/watch?v=${candidate.videoId}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {candidate.title ?? candidate.videoId}
                          </a>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge variant="outline">노래 클립 검수</Badge>
                            <Badge variant="secondary">{candidate.status}</Badge>
                            <Badge variant="outline">{candidate.classification}</Badge>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            업로드 {formatAt(candidate.publishedAt)} · 자동 공개/변환 안 함
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy !== null}
                          onClick={async () => {
                            setBusy(`ignore:${candidate.candidateId}`);
                            try {
                              await updateOtwPlayImportCandidate(candidate.candidateId, {
                                expectedVersion: candidate.candidateVersion,
                                action: "ignore",
                              });
                              await refresh();
                            } catch {
                              toast({
                                variant: "error",
                                description: "검수 제안을 제외하지 못했습니다. 최신 상태를 다시 확인해 주세요.",
                              });
                            } finally {
                              setBusy(null);
                            }
                          }}
                        >
                          <EyeOff /> 제외
                        </Button>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
