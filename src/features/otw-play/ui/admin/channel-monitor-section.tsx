import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { EyeOff, Loader2, Pause, Play, Radar, RefreshCw, Trash2 } from "lucide-react";
import { ConfirmActionDialog } from "@/app/admin";
import { queryKeys } from "@/shared/query/query-keys";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { useToast } from "@/shared/ui/toast";
import {
  createOtwPlayChannelMonitor,
  deleteOtwPlayChannelMonitor,
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
const YOUTUBE_CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;

export function ChannelMonitorSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const monitorsQuery = useOtwPlayChannelMonitors();
  const [selectedMonitorId, setSelectedMonitorId] = useState<string | null>(null);
  const [newChannelId, setNewChannelId] = useState("");
  const [editChannelId, setEditChannelId] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const candidatesQuery = useOtwPlayChannelMonitorCandidates(selectedMonitorId);
  const monitors = useMemo(() => monitorsQuery.data ?? [], [monitorsQuery.data]);
  const normalizedNewChannelId = newChannelId.trim();
  const newChannelAlreadyMonitored = monitors.some(
    (monitor) => monitor.externalChannelId === normalizedNewChannelId,
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

  useEffect(() => {
    setEditChannelId(selectedMonitor?.externalChannelId ?? "");
  }, [selectedMonitor?.externalChannelId, selectedMonitor?.id]);

  const refresh = async (monitorId = selectedMonitorId) => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.otwPlay.channelMonitors() });
    if (monitorId) {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.otwPlay.channelMonitorCandidates(monitorId),
      });
    }
  };

  const createMonitor = async () => {
    const externalChannelId = normalizedNewChannelId;
    if (
      !YOUTUBE_CHANNEL_ID_PATTERN.test(externalChannelId) ||
      newChannelAlreadyMonitored
    ) return;
    setBusy("create");
    try {
      const monitor = await createOtwPlayChannelMonitor({ externalChannelId });
      setSelectedMonitorId(monitor.id);
      setNewChannelId("");
      await refresh(monitor.id);
      toast({
        variant: "success",
        description: "현재 최신 영상을 기준점으로 저장했습니다. 이후 업로드부터 검수 제안에 추가합니다.",
      });
    } catch {
      toast({
        variant: "error",
        description: "수집 대상을 추가하지 못했습니다. 승인·활성 상태인 YouTube 채널 ID인지 확인해 주세요.",
      });
    } finally {
      setBusy(null);
    }
  };

  const updateTarget = async () => {
    const externalChannelId = editChannelId.trim();
    if (
      !selectedMonitor ||
      !YOUTUBE_CHANNEL_ID_PATTERN.test(externalChannelId) ||
      externalChannelId === selectedMonitor.externalChannelId
    ) return;
    setBusy("target");
    try {
      await updateOtwPlayChannelMonitor(selectedMonitor.id, {
        expectedVersion: selectedMonitor.version,
        externalChannelId,
      });
      await refresh();
      toast({
        variant: "success",
        description: "수집 대상 채널을 변경하고 새 채널의 최신 영상을 기준점으로 저장했습니다.",
      });
    } catch {
      toast({
        variant: "error",
        description: "채널 ID를 수정하지 못했습니다. 승인 상태와 최신 버전을 확인해 주세요.",
      });
    } finally {
      setBusy(null);
    }
  };

  const removeMonitor = async () => {
    if (!selectedMonitor) return;
    setBusy("delete");
    try {
      await deleteOtwPlayChannelMonitor(selectedMonitor.id, {
        expectedVersion: selectedMonitor.version,
      });
      setDeleteOpen(false);
      setSelectedMonitorId(null);
      await refresh(null);
      toast({ variant: "success", description: "수집 대상 채널을 삭제했습니다." });
    } catch {
      toast({
        variant: "error",
        description: "수집 대상을 삭제하지 못했습니다. 최신 상태를 다시 확인해 주세요.",
      });
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
              승인된 YouTube 채널을 6시간마다 확인합니다. 등록 이전 영상은 소급하지 않고,
              새 영상은 singing clip 검수함에만 보관하며 자동 공개하지 않습니다.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 md:grid-cols-[minmax(260px,1fr)_auto] md:items-end">
          <Field>
            <FieldLabel htmlFor="new-monitor-channel-id">수집 대상 채널 ID</FieldLabel>
            <FieldDescription>
              UC로 시작하는 24자리 YouTube 채널 ID를 입력하세요. 채널 관리에서 승인·활성화된 채널만 추가됩니다.
            </FieldDescription>
            <Input
              id="new-monitor-channel-id"
              className="h-11 font-mono"
              value={newChannelId}
              onChange={(event) => setNewChannelId(event.target.value)}
              placeholder="UCxxxxxxxxxxxxxxxxxxxxxx"
              aria-invalid={Boolean(newChannelId) && !YOUTUBE_CHANNEL_ID_PATTERN.test(newChannelId.trim())}
            />
            {newChannelAlreadyMonitored ? (
              <p className="text-sm text-destructive">이미 수집 대상으로 등록된 채널입니다.</p>
            ) : null}
          </Field>
          <Button
            className="h-11"
            disabled={
              !YOUTUBE_CHANNEL_ID_PATTERN.test(normalizedNewChannelId) ||
              newChannelAlreadyMonitored ||
              busy !== null
            }
            onClick={() => void createMonitor()}
          >
            {busy === "create" ? <Loader2 className="animate-spin" /> : <Radar />}
            채널 추가
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
                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                    {monitor.externalChannelId}
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
                  <div className="space-y-4 border-b p-4">
                    <div className="flex flex-wrap items-center gap-2">
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
                    <Field>
                      <FieldLabel htmlFor="edit-monitor-channel-id">채널 ID 수정</FieldLabel>
                      <FieldDescription>
                        변경하면 이전 채널의 제안 연결을 이 대상에서 분리하고 새 채널의 최신 영상부터 확인합니다.
                      </FieldDescription>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          id="edit-monitor-channel-id"
                          className="h-10 font-mono"
                          value={editChannelId}
                          onChange={(event) => setEditChannelId(event.target.value)}
                          aria-invalid={!YOUTUBE_CHANNEL_ID_PATTERN.test(editChannelId.trim())}
                        />
                        <Button
                          variant="outline"
                          disabled={
                            busy !== null ||
                            !YOUTUBE_CHANNEL_ID_PATTERN.test(editChannelId.trim()) ||
                            editChannelId.trim() === selectedMonitor.externalChannelId
                          }
                          onClick={() => void updateTarget()}
                        >
                          {busy === "target" ? <Loader2 className="animate-spin" /> : null}
                          변경 저장
                        </Button>
                        <Button
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          disabled={busy !== null}
                          onClick={() => setDeleteOpen(true)}
                        >
                          <Trash2 /> 삭제
                        </Button>
                      </div>
                    </Field>
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
      <ConfirmActionDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="수집 대상 채널을 삭제할까요?"
        description="자동 확인을 중단하고 이 채널과 연결된 자동 제안 이력을 대상 목록에서 분리합니다. 이미 생성된 영상 후보 자체는 삭제하지 않습니다."
        confirmLabel="수집 대상 삭제"
        destructive
        isProcessing={busy === "delete"}
        onConfirm={() => void removeMonitor()}
      />
    </Card>
  );
}
