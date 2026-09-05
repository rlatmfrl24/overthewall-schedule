import { useConsoleSearch } from "@/shared/lib/admin-console-search";
import { useUnsavedChanges } from "@/shared/lib/unsaved-changes";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  OtwPlayAdminCatalogDto,
  OtwPlayChannelMonitorCandidateDto,
} from "@contracts/otw-play";
import { Bell, BellOff, ClipboardCheck, EyeOff, Loader2, Pause, Play, Radar, RefreshCw, Trash2 } from "lucide-react";
import { ConfirmActionDialog } from "@/app/admin";
import { queryKeys } from "@/shared/query/query-keys";
import { ApiError } from "@/shared/api/client";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { useToast } from "@/shared/ui/toast";
import {
  createOtwPlayChannelMonitor,
  backfillOtwPlayChannelMonitor,
  deleteOtwPlayChannelMonitor,
  reconcileOtwPlayChannelMonitor,
  renewOtwPlayChannelMonitor,
  subscribeOtwPlayChannelMonitor,
  unsubscribeOtwPlayChannelMonitor,
  updateOtwPlayChannelMonitor,
  updateOtwPlayImportCandidate,
} from "../../api/admin";
import {
  useOtwPlayChannelMonitorCandidates,
  useOtwPlayChannelMonitors,
  useOtwPlayPreviousGenerationCandidates,
} from "../../queries/use-admin-catalog";
import { SingingClipReviewDialog } from "./singing-clip-review-dialog";

const formatAt = (value: number | null) =>
  value === null ? "아직 확인하지 않음" : new Date(value).toLocaleString("ko-KR");
const formatRetention = (value: number) => {
  const remainingDays = Math.ceil((value - Date.now()) / (24 * 60 * 60 * 1000));
  return remainingDays > 0
    ? `${remainingDays}일 남음`
    : `만료됨 · ${new Date(value).toLocaleString("ko-KR")}`;
};
const YOUTUBE_CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;
const candidateStatusLabels = {
  discovered: "검수 대기",
  needs_input: "정보 입력 필요",
  ready: "검수 완료",
  converted: "저장 완료",
  ignored: "제외됨",
  blocked: "확인 차단",
} as const;
const classificationLabels = {
  pending_metadata: "메타데이터 확인 중",
  eligible: "검수 가능",
  existing_catalog: "기존 카탈로그",
  existing_proposal: "기존 제안",
  existing_candidate: "기존 후보",
  channel_review: "채널 승인 필요",
  policy_blocked: "정책 확인 필요",
  unavailable: "재생 불가",
  scope_review: "노래 영상 여부 확인",
  playlist_duplicate: "플레이리스트 중복",
} as const;
const availabilityLabels = {
  unknown: "가용성 미확인",
  playable: "재생 가능",
  private: "비공개",
  embed_disabled: "외부 재생 제한",
  deleted: "삭제됨",
  region_blocked: "지역 제한",
  unavailable: "재생 불가",
} as const;
const monitorErrorLabel = (errorCode: string) =>
  errorCode === "gap_suspected"
    ? "기준 영상 확인 필요 · 안전을 위해 감시 중단"
    : "마지막 업로드 확인 실패";
const subscriptionStatusLabels = {
  pending: "구독 확인 대기",
  active: "구독 활성",
  renewing: "갱신 확인 대기",
  unsubscribing: "구독 해제 확인 대기",
  unsubscribed: "구독 해제됨",
  denied: "hub 요청 거부",
  failed: "구독 요청 실패",
} as const;
const subscriptionErrorLabel = (errorCode: string) => ({
  hub_request_failed: "hub 요청에 실패했습니다.",
  hub_timeout: "hub 응답 시간이 초과되었습니다.",
  hub_network: "hub 네트워크 요청에 실패했습니다.",
  hub_denied: "hub가 구독 요청을 거부했습니다.",
}[errorCode] ?? (errorCode.startsWith("hub_http_")
  ? `hub가 HTTP ${errorCode.slice("hub_http_".length)}로 응답했습니다.`
  : "구독 상태를 확인하고 다시 시도해 주세요."));

export function ChannelMonitorSection({
  mode,
  catalog,
  catalogLoading = false,
}: {
  mode?: "review" | "sources";
  catalog: OtwPlayAdminCatalogDto | null;
  catalogLoading?: boolean;
  onOpenCatalog: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const monitorsQuery = useOtwPlayChannelMonitors();
  const [search, updateSearch] = useConsoleSearch();
  const selectedMonitorId = search.category ?? null;
  const setSelectedMonitorId = (id: string | null) => updateSearch({category: id ?? undefined, selected: undefined}, false);
  const [newChannelId, setNewChannelId] = useState("");
  const [backfillCount, setBackfillCount] = useState("1");
  const [editChannelId, setEditChannelId] = useState("");
  const [editChannelDirty, setEditChannelDirty] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const setReviewCandidate = (candidate: OtwPlayChannelMonitorCandidateDto | null) => updateSearch({selected: candidate?.candidateId}, false);
  const [busy, setBusy] = useState<string | null>(null);
  useUnsavedChanges(editChannelDirty || newChannelId.length > 0);
  const candidatesQuery = useOtwPlayChannelMonitorCandidates(mode === "sources" ? null : selectedMonitorId);
  const previousCandidatesQuery = useOtwPlayPreviousGenerationCandidates(
    mode === "sources" ? null : selectedMonitorId,
  );
  const monitors = useMemo(() => monitorsQuery.data ?? [], [monitorsQuery.data]);
  const normalizedNewChannelId = newChannelId.trim();
  const newChannelAlreadyMonitored = monitors.some(
    (monitor) => monitor.externalChannelId === normalizedNewChannelId,
  );
  const selectedMonitor = monitors.find((monitor) => monitor.id === selectedMonitorId) ?? null;
  const verifiedSubscriptionActive =
    selectedMonitor?.subscription?.effectiveActive === true;
  const transportReleased = !selectedMonitor?.subscription ||
    ["unsubscribed", "denied", "failed"].includes(selectedMonitor.subscription.status) ||
    (selectedMonitor.subscription.status === "active" && !verifiedSubscriptionActive);
  const canRequestSubscription = !selectedMonitor?.subscription ||
    ["unsubscribed", "denied", "failed"].includes(selectedMonitor.subscription.status) ||
    (selectedMonitor.subscription.status === "active" && !verifiedSubscriptionActive);
  const canRequestUnsubscribe = Boolean(
    selectedMonitor?.subscription &&
    (["pending", "renewing", "unsubscribing"].includes(selectedMonitor.subscription.status) ||
      verifiedSubscriptionActive),
  );
  const candidates = useMemo(
    () => candidatesQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [candidatesQuery.data],
  );
  const previousCandidates = useMemo(
    () => previousCandidatesQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [previousCandidatesQuery.data],
  );

  const reviewCandidate = [...candidates, ...previousCandidates].find((item) => item.candidateId === search.selected) ?? null;

  useEffect(() => {
    if (!monitorsQuery.data) return;
    if (!selectedMonitorId && monitors[0]) updateSearch({category: monitors[0].id});
    if (selectedMonitorId && !monitors.some((monitor) => monitor.id === selectedMonitorId)) {
      updateSearch({category: monitors[0]?.id});
    }
  }, [monitors, monitorsQuery.data, selectedMonitorId, updateSearch]);

  useEffect(() => {
    if (!editChannelDirty) {
      setEditChannelId(selectedMonitor?.externalChannelId ?? "");
    }
  }, [editChannelDirty, selectedMonitor?.externalChannelId, selectedMonitor?.id]);

  const refresh = async (monitorId = selectedMonitorId) => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.operations.all });
    await queryClient.invalidateQueries({ queryKey: queryKeys.otwPlay.channelMonitors() });
    if (monitorId) {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.otwPlay.channelMonitorCandidates(monitorId, "current"),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.otwPlay.channelMonitorCandidates(monitorId, "previous"),
      });
    }
  };

  const handleMutationError = async (error: unknown, fallback: string) => {
    if (error instanceof ApiError && error.code === "PLAY_ADMIN_STALE_WRITE") {
      await refresh();
      toast({
        variant: "error",
        description: `다른 작업이 먼저 반영되어 최신 상태를 다시 불러왔습니다. 입력은 유지했습니다. (요청 ${error.fields?.expectedVersion ?? "?"}, 현재 ${error.fields?.actualVersion ?? "?"})`,
      });
      return;
    }
    toast({ variant: "error", description: fallback });
  };

  const createMonitor = async () => {
    const externalChannelId = normalizedNewChannelId;
    if (
      !YOUTUBE_CHANNEL_ID_PATTERN.test(externalChannelId) ||
      newChannelAlreadyMonitored
    ) return;
    setBusy("create");
    try {
      const monitor = await createOtwPlayChannelMonitor({
        externalChannelId,
      });
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
        description: "수집 대상을 추가하지 못했습니다. 채널 관리에 등록된 활성 노래 클립 채널인지 확인해 주세요.",
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
      setEditChannelDirty(false);
      await refresh();
      toast({
        variant: "success",
        description: "수집 대상 채널을 변경하고 새 채널의 최신 영상을 기준점으로 저장했습니다.",
      });
    } catch (error) {
      await handleMutationError(
        error,
        "채널 ID를 수정하지 못했습니다. 승인 상태와 최신 버전을 확인해 주세요.",
      );
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
    } catch (error) {
      await handleMutationError(
        error,
        "수집 대상을 삭제하지 못했습니다. 최신 상태를 다시 확인해 주세요.",
      );
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
    } catch (error) {
      await handleMutationError(
        error,
        "감시 상태를 변경하지 못했습니다. 최신 상태를 다시 확인해 주세요.",
      );
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
        variant: result.gapSuspected ? "info" : "success",
        description: result.gapSuspected
          ? `기존 기준 영상을 찾지 못해 과거 영상은 추가하지 않았습니다. 현재 최신 영상으로 기준점을 재설정한 뒤 감시를 재개해 주세요.`
          : `${result.checkedVideoCount}개를 확인해 신규 검수 제안 ${result.discoveredCount}개를 추가했습니다.`,
      });
    } catch {
      toast({ variant: "error", description: "채널 업로드를 대조하지 못했습니다." });
    } finally {
      setBusy(null);
    }
  };

  const resetWatermark = async () => {
    if (!selectedMonitor) return;
    setBusy("reset-watermark");
    try {
      await updateOtwPlayChannelMonitor(selectedMonitor.id, {
        expectedVersion: selectedMonitor.version,
        resetWatermark: true,
      });
      await refresh();
      toast({
        variant: "success",
        description: "현재 최신 영상을 새 기준점으로 저장하고 감시를 재개했습니다.",
      });
    } catch (error) {
      await handleMutationError(
        error,
        "기준점을 재설정하지 못했습니다. 채널 승인과 최신 상태를 확인해 주세요.",
      );
    } finally {
      setBusy(null);
    }
  };

  const runTransportAction = async (
    action: "subscribe" | "renew" | "unsubscribe",
  ) => {
    if (!selectedMonitor) return;
    setBusy(action);
    try {
      if (action === "subscribe") await subscribeOtwPlayChannelMonitor(selectedMonitor.id);
      else if (action === "renew") await renewOtwPlayChannelMonitor(selectedMonitor.id);
      else await unsubscribeOtwPlayChannelMonitor(selectedMonitor.id);
      await refresh();
      toast({
        variant: "success",
        description: action === "unsubscribe"
          ? "구독 해제 요청을 보냈습니다. hub 확인 상태를 기다립니다."
          : "WebSub 요청을 보냈습니다. hub callback 확인 상태를 기다립니다.",
      });
    } catch {
      toast({
        variant: "error",
        description: "WebSub 요청을 처리하지 못했습니다. secret·공개 origin과 구독 상태를 확인해 주세요.",
      });
    } finally {
      setBusy(null);
    }
  };

  const backfill = async () => {
    if (!selectedMonitor) return;
    const count = Number(backfillCount);
    if (!Number.isSafeInteger(count) || count < 1 || count > 20) return;
    setBusy("backfill");
    try {
      const result = await backfillOtwPlayChannelMonitor(selectedMonitor.id, { count });
      await refresh();
      toast({
        variant: "success",
        description: `최근 ${result.checkedVideoCount}개를 확인해 신규 검수 제안 ${result.discoveredCount}개를 추가했습니다.`,
      });
    } catch {
      toast({ variant: "error", description: "명시적 최근 영상 가져오기에 실패했습니다." });
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
              등록한 노래 클립 YouTube 채널은 WebSub 알림을 우선 사용하고 6시간 polling을 fallback으로 유지합니다.
              등록 이전 영상은 자동 소급하지 않습니다. 새 영상은 singing clip 후보로 보관하고,
              관리자 검수·등록 뒤 비공개 draft로 만들 수 있으며 자동 공개하지 않습니다.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        {!catalog ? (
          <div
            role="status"
            className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm"
          >
            {catalogLoading
              ? "카탈로그를 불러오는 동안 검수·등록만 잠시 기다려 주세요. 채널 감시와 WebSub 작업은 계속 사용할 수 있습니다."
              : "카탈로그를 불러오지 못해 검수·등록만 일시 중단했습니다. 채널 감시, WebSub, 대조와 제외 작업은 계속 사용할 수 있습니다."}
          </div>
        ) : null}
        {mode !== "review" && (<>
        <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <Field>
            <FieldLabel htmlFor="new-monitor-channel-id">수집 대상 채널 ID</FieldLabel>
            <FieldDescription>
              UC로 시작하는 24자리 YouTube 채널 ID를 입력하세요. 추가 시 현재 최신 영상을 기준점으로 저장합니다.
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
            className="h-11 sm:justify-self-end"
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

        </>)}
        {monitorsQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-sm text-muted-foreground">
            <Loader2 className="animate-spin" /> 수집 대상 채널을 불러오는 중입니다.
          </div>
        ) : monitorsQuery.isError ? (
          <div className="space-y-3 rounded-xl border border-destructive/40 p-6 text-center">
            <p className="text-sm text-destructive">수집 대상 채널을 불러오지 못했습니다.</p>
            <Button variant="outline" size="sm" onClick={() => void monitorsQuery.refetch()}>
              <RefreshCw /> 다시 불러오기
            </Button>
          </div>
        ) : monitors.length === 0 ? (
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
                  onClick={() => {
                    setEditChannelDirty(false);
                    setSelectedMonitorId(monitor.id);
                  }}
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
                  {monitor.previousGenerationPendingCount > 0 ? (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                      이전 generation 미처리 {monitor.previousGenerationPendingCount}개
                    </p>
                  ) : null}
                  {monitor.lastErrorCode ? (
                    <p className="mt-2 text-xs text-destructive">
                      {monitorErrorLabel(monitor.lastErrorCode)}
                    </p>
                  ) : null}
                </button>
              ))}
            </div>

            <div className="min-w-0 rounded-xl border">
              {selectedMonitor ? (
                <>
                  {mode !== "review" ? (<>
                  <div className="space-y-4 border-b p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="mr-auto min-w-0">
                        <p className="truncate font-semibold">{selectedMonitor.channelDisplayName}</p>
                        <p className="text-xs text-muted-foreground">
                          다음 확인 {formatAt(selectedMonitor.nextCheckAt)}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy !== null || selectedMonitor.lastErrorCode === "gap_suspected"}
                        onClick={() => void toggleMonitor()}
                      >
                        {selectedMonitor.status === "active" ? <Pause /> : <Play />}
                        {selectedMonitor.status === "active" ? "일시 정지" : "감시 재개"}
                      </Button>
                      <Button size="sm" disabled={busy !== null || selectedMonitor.status !== "active"} onClick={() => void reconcile()}>
                        {busy === "reconcile" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                        지금 대조
                      </Button>
                      {canRequestSubscription ? (
                        <Button
                          size="sm"
                          disabled={busy !== null || selectedMonitor.status !== "active" || selectedMonitor.automationApproval?.status !== "approved"}
                          onClick={() => void runTransportAction("subscribe")}
                        >
                          {busy === "subscribe" ? <Loader2 className="animate-spin" /> : <Bell />}
                          구독
                        </Button>
                      ) : null}
                      {verifiedSubscriptionActive ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy !== null}
                          onClick={() => void runTransportAction("renew")}
                        >
                          {busy === "renew" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                          갱신
                        </Button>
                      ) : null}
                      {canRequestUnsubscribe ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy !== null || selectedMonitor.subscription?.status === "unsubscribing"}
                          onClick={() => void runTransportAction("unsubscribe")}
                        >
                          {busy === "unsubscribe" ? <Loader2 className="animate-spin" /> : <BellOff />}
                          구독 해제
                        </Button>
                      ) : null}
                      {selectedMonitor.lastErrorCode === "gap_suspected" ? (
                        <Button
                          size="sm"
                          disabled={busy !== null}
                          onClick={() => void resetWatermark()}
                        >
                          {busy === "reset-watermark" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                          기준점 재설정
                        </Button>
                      ) : null}
                    </div>
                    <div className="grid gap-2 rounded-lg bg-muted/30 p-3 text-sm sm:grid-cols-2">
                      <p>
                        구독 상태 <strong>{selectedMonitor.subscription
                          ? selectedMonitor.subscription.status === "active" &&
                              !verifiedSubscriptionActive
                            ? "구독 상태 복구 필요"
                            : subscriptionStatusLabels[selectedMonitor.subscription.status]
                          : "미구독"}</strong>
                      </p>
                      <p>lease 만료 <strong>{formatAt(selectedMonitor.subscription?.leaseExpiresAt ?? null)}</strong></p>
                      <p>마지막 알림 <strong>{formatAt(selectedMonitor.subscription?.lastNotificationAt ?? null)}</strong></p>
                      <p>최근 50개 대조 <strong>{formatAt(selectedMonitor.lastRecentReconciledAt)}</strong></p>
                      <p>delivery 대기 <strong>{selectedMonitor.deliveryHealth.pendingCount}</strong></p>
                      <p>delivery 실패 / DLQ <strong>{selectedMonitor.deliveryHealth.failedCount} / {selectedMonitor.deliveryHealth.deadLetterCount}</strong></p>
                      <p>마지막 수신 <strong>{formatAt(selectedMonitor.deliveryHealth.lastReceivedAt)}</strong></p>
                      <p>마지막 처리 <strong>{formatAt(selectedMonitor.deliveryHealth.lastProcessedAt)}</strong></p>
                      {selectedMonitor.subscription?.recoveryReason ? (
                        <p className="text-destructive sm:col-span-2">
                          구독 복구 사유: {selectedMonitor.subscription.recoveryReason}
                        </p>
                      ) : null}
                      {selectedMonitor.deliveryHealth.lastErrorCode ? (
                        <p className="text-destructive sm:col-span-2">
                          delivery 오류: {selectedMonitor.deliveryHealth.lastErrorCode} · {formatAt(selectedMonitor.deliveryHealth.lastFailedAt)}
                        </p>
                      ) : null}
                      {selectedMonitor.subscription?.lastErrorCode ? (
                        <p className="text-destructive sm:col-span-2">
                          최근 기록된 구독 오류: {subscriptionErrorLabel(selectedMonitor.subscription.lastErrorCode)}
                        </p>
                      ) : null}
                    </div>
                    <Field>
                      <FieldLabel htmlFor="monitor-backfill-count">명시적 최근 영상 가져오기</FieldLabel>
                      <FieldDescription>이 채널의 최근 1~20개 영상을 검수 후보로 확인합니다.</FieldDescription>
                      <div className="flex gap-2">
                        <Input
                          id="monitor-backfill-count"
                          type="number"
                          min={1}
                          max={20}
                          value={backfillCount}
                          onChange={(event) => setBackfillCount(event.target.value)}
                        />
                        <Button
                          variant="outline"
                          disabled={busy !== null || selectedMonitor.status !== "active" || Number(backfillCount) < 1 || Number(backfillCount) > 20}
                          onClick={() => void backfill()}
                        >
                          {busy === "backfill" ? <Loader2 className="animate-spin" /> : null}
                          가져오기
                        </Button>
                      </div>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="edit-monitor-channel-id">채널 ID 수정</FieldLabel>
                      <FieldDescription>
                        구독 해제가 끝나고 채널 관리에 등록된 활성 노래 클립 채널로만 변경할 수 있습니다.
                        새 채널은 현재 대상을 삭제한 뒤 위에서 등록하세요.
                      </FieldDescription>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          id="edit-monitor-channel-id"
                          className="h-10 font-mono"
                          value={editChannelId}
                          onChange={(event) => {
                            setEditChannelDirty(true);
                            setEditChannelId(event.target.value);
                          }}
                          aria-invalid={!YOUTUBE_CHANNEL_ID_PATTERN.test(editChannelId.trim())}
                        />
                        <Button
                          variant="outline"
                          disabled={
                            busy !== null ||
                            !transportReleased ||
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
                          disabled={busy !== null || !transportReleased}
                          onClick={() => setDeleteOpen(true)}
                        >
                          <Trash2 /> 삭제
                        </Button>
                      </div>
                      {!transportReleased ? (
                        <FieldDescription>
                          구독 해제 확인이 완료된 뒤 채널 변경 또는 대상 삭제를 진행할 수 있습니다.
                        </FieldDescription>
                      ) : null}
                    </Field>
                  </div>
                  </>) : <a className="block border-b p-3 text-sm underline" href="/admin/otw-play?tab=play-monitor">채널 감시·구독 설정 확인 →</a>}
                  {mode !== "sources" ? (<>
                  <div className="divide-y">
                    {candidatesQuery.isLoading ? (
                      <p className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                        <Loader2 className="animate-spin" /> 신규 영상을 불러오는 중입니다.
                      </p>
                    ) : candidatesQuery.isError ? (
                      <div className="space-y-3 p-8 text-center">
                        <p className="text-sm text-destructive">신규 영상 목록을 불러오지 못했습니다.</p>
                        <Button variant="outline" size="sm" onClick={() => void candidatesQuery.refetch()}>
                          <RefreshCw /> 다시 불러오기
                        </Button>
                      </div>
                    ) : candidates.length === 0 ? (
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
                            <Badge variant="secondary">{candidateStatusLabels[candidate.status]}</Badge>
                            <Badge variant="outline">{classificationLabels[candidate.classification]}</Badge>
                            <Badge variant="outline">{availabilityLabels[candidate.availabilityStatus]}</Badge>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            업로드 {formatAt(candidate.publishedAt)} · 관리자 검수 후 비공개 draft 생성
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            API metadata 보존 {formatRetention(candidate.retentionExpiresAt)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col gap-2">
                          <Button
                            size="sm"
                            disabled={
                              catalog === null ||
                              busy !== null ||
                              candidate.availabilityStatus !== "playable" ||
                              candidate.catalogChannelId === null ||
                              !["eligible", "scope_review"].includes(candidate.classification)
                            }
                            onClick={() => setReviewCandidate(candidate)}
                          >
                            <ClipboardCheck /> 검수·등록
                          </Button>
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
                      </div>
                    ))}
                    {candidatesQuery.hasNextPage ? (
                      <div className="p-4 text-center">
                        <Button
                          variant="outline"
                          disabled={candidatesQuery.isFetchingNextPage || busy !== null}
                          onClick={() => void candidatesQuery.fetchNextPage()}
                        >
                          {candidatesQuery.isFetchingNextPage ? <Loader2 className="animate-spin" /> : null}
                          이전 미처리 영상 더 보기
                        </Button>
                      </div>
                    ) : null}
                    {selectedMonitor.previousGenerationPendingCount > 0 ||
                    previousCandidatesQuery.isLoading ||
                    previousCandidatesQuery.isError ? (
                      <section
                        aria-label="이전 generation 미처리 후보"
                        className="space-y-3 border-t bg-amber-50/40 p-4 dark:bg-amber-950/10"
                      >
                        <div>
                          <h3 className="font-semibold">
                            이전 generation 미처리 {selectedMonitor.previousGenerationPendingCount}개
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            현재 generation inbox와 분리된 운영 목록입니다. 전환 시 재삽입하지 않습니다.
                          </p>
                        </div>
                        {previousCandidatesQuery.isLoading ? (
                          <p className="text-sm text-muted-foreground">이전 후보를 불러오는 중입니다.</p>
                        ) : previousCandidatesQuery.isError ? (
                          <div className="flex items-center gap-2 text-sm text-destructive">
                            이전 후보를 불러오지 못했습니다.
                            <Button size="sm" variant="outline" onClick={() => void previousCandidatesQuery.refetch()}>
                              다시 불러오기
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {previousCandidates.map((candidate) => (
                              <div key={`${candidate.monitorGeneration}:${candidate.candidateId}`} className="flex items-center gap-3 rounded-lg border bg-background p-3">
                                <div className="min-w-0 flex-1">
                                  <a className="line-clamp-1 font-medium hover:underline" href={`https://www.youtube.com/watch?v=${candidate.videoId}`} target="_blank" rel="noreferrer">
                                    {candidate.title ?? candidate.videoId}
                                  </a>
                                  <p className="text-xs text-muted-foreground">generation {candidate.monitorGeneration} · 발견 {formatAt(candidate.discoveredAt)}</p>
                                  <p className="text-xs text-muted-foreground">API metadata 보존 {formatRetention(candidate.retentionExpiresAt)}</p>
                                </div>
                                <Button size="sm" variant="outline" disabled={catalog === null || busy !== null} onClick={() => setReviewCandidate(candidate)}>
                                  <ClipboardCheck /> 검수
                                </Button>
                              </div>
                            ))}
                            {previousCandidatesQuery.hasNextPage ? (
                              <Button size="sm" variant="outline" disabled={previousCandidatesQuery.isFetchingNextPage} onClick={() => void previousCandidatesQuery.fetchNextPage()}>
                                이전 generation 더 보기
                              </Button>
                            ) : null}
                          </div>
                        )}
                      </section>
                    ) : null}
                  </div>                  </>) : <a className="block p-3 text-sm underline" href="/admin/otw-play?tab=automatic-review">자동 영상 후보 검토 →</a>}

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
        description="구독 해제가 완료된 수집 대상만 삭제할 수 있습니다. 자동 확인을 중단하고 연결된 자동 제안 이력을 대상 목록에서 분리하며, 구독·후보·감사 기록은 삭제하지 않습니다."
        confirmLabel="수집 대상 삭제"
        destructive
        isProcessing={busy === "delete"}
        onConfirm={() => void removeMonitor()}
      />
      {catalog ? (
        <SingingClipReviewDialog
          candidate={reviewCandidate}
          catalog={catalog}
          onOpenChange={(open) => !open && setReviewCandidate(null)}
          onConverted={async () => {
            await Promise.all([
              refresh(),
              queryClient.invalidateQueries({ queryKey: queryKeys.otwPlay.adminCatalog() }),
            ]);
            setReviewCandidate(candidates[candidates.findIndex((item) => item.candidateId === reviewCandidate?.candidateId) + 1] ?? null);
          }}
          onReviewStateChanged={() => refresh()}
        />
      ) : null}
    </Card>
  );
}
