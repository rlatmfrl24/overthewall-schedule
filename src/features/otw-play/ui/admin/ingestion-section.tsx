import { useEffect, useState } from "react";
import type { OtwPlayPlaylistPreflightDto } from "@contracts/otw-play";
import { useQueryClient } from "@tanstack/react-query";
import { useConsoleSearch } from "@/shared/lib/admin-console-search";
import { ApiError } from "@/shared/api/client";
import { queryKeys } from "@/shared/query/query-keys";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/shared/ui/alert-dialog";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { useToast } from "@/shared/ui/toast";
import { Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { deleteOtwPlayImportHistory, createOtwPlayPlaylistImport, preflightOtwPlayPlaylistImport, retryOtwPlayImportJob } from "../../api/admin";
import { useOtwPlayImportJob, useOtwPlayImportJobs } from "../../queries/use-admin-catalog";
import { ChoiceGroup, type ChoiceOption } from "@/shared/ui/choice-group";

const retentionLabel = (expiresAt: number | null) => {
  if (expiresAt === null) return "API metadata 보존 종료";
  const remainingMs = expiresAt - Date.now();
  if (remainingMs <= 0) return `보존 만료 · ${new Date(expiresAt).toLocaleString("ko-KR")}`;
  const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
  return `${new Date(expiresAt).toLocaleString("ko-KR")} 만료 · ${remainingDays}일 남음`;
};

const playlistPreflightErrorMessage = (error: unknown) => {
  if (!(error instanceof ApiError)) {
    return "로컬 Worker에 연결하지 못했습니다. 개발 서버 상태를 확인한 뒤 다시 시도하세요.";
  }
  const requestSuffix = error.requestId ? ` 요청 ID: ${error.requestId}` : "";
  switch (error.code) {
    case "AUTH_REQUIRED":
      return "관리자 로그인 세션을 확인한 뒤 페이지를 새로고침하세요.";
    case "PLAY_ADMIN_INVALID_REQUEST":
      return `지원하는 YouTube playlist URL 또는 ID인지 확인하세요.${requestSuffix}`;
    case "PLAY_ADMIN_NOT_FOUND":
      return `공개 또는 일부 공개 playlist를 찾지 못했습니다.${requestSuffix}`;
    case "PLAY_ADMIN_EXTERNAL_SERVICE_UNAVAILABLE":
      return `YouTube playlist metadata 조회에 실패했습니다${error.fields?.youtube ? `: ${error.fields.youtube}` : ". 잠시 후 다시 시도하세요."}${requestSuffix}`;
    case "PLAY_ADMIN_INTERNAL_ERROR":
      return `로컬 D1의 playlist 가져오기 상태를 확인하지 못했습니다.${requestSuffix}`;
    default:
      return `${error.message}${requestSuffix}`;
  }
};

type ImportMode = "all_new" | "recent" | "range";

const importModeOptions = [
  {
    value: "all_new",
    label: "새 항목 전체",
    description: "이전에 가져오지 않은 항목을 모두 확인합니다.",
  },
  {
    value: "recent",
    label: "최근 항목",
    description: "플레이리스트 끝에서 필요한 개수만 가져옵니다.",
  },
  {
    value: "range",
    label: "위치 범위",
    description: "시작 위치와 개수를 직접 지정합니다.",
  },
] satisfies readonly ChoiceOption<ImportMode>[];

const importStatusLabels: Record<string, string> = {
  queued: "접수 대기", running: "처리 중", completed: "수집 완료", partial: "일부 실패", failed: "실패", cancelled: "취소됨",
};
const importCountLabels: Record<string, string> = {
  discovered: "발견", metadataChecked: "영상 확인", eligible: "검토 가능", existingCatalog: "기존 카탈로그",
  existingProposal: "기존 제안", existingCandidate: "기존 후보", channelReview: "채널 승인 필요",
  unavailable: "접근 불가", policyBlocked: "정책 확인", scopeReview: "영상 분류 확인",
  playlistDuplicate: "목록 중복", retryPending: "재시도 대기", permanentError: "재시도 불가",
};

export function IngestionSection({ active = true }: { active?: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [candidateKind, setCandidateKind] = useState<"official_video" | "singing_clip">("official_video");
  const [importOpen, setImportOpen] = useState(true);
  const [deleteHistoryId, setDeleteHistoryId] = useState<string | null>(null);
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [mode, setMode] = useState<ImportMode>("all_new");
  const [recentLimit, setRecentLimit] = useState("50");
  const [rangeStart, setRangeStart] = useState("1");
  const [rangeLimit, setRangeLimit] = useState("5000");
  const [preflight, setPreflight] = useState<OtwPlayPlaylistPreflightDto | null>(null);
  const [search, updateSearch] = useConsoleSearch();
  const activeJobId = search.category ?? null;
  const setActiveJobId = (category: string | null) => updateSearch({ category: category ?? undefined, selected: undefined }, false);
  const [busy, setBusy] = useState<string | null>(null);
  const jobsQuery = useOtwPlayImportJobs();
  const jobQuery = useOtwPlayImportJob(activeJobId);
  useEffect(() => {
    if (active && !activeJobId && jobsQuery.data?.[0]) updateSearch({ category: jobsQuery.data[0].id });
  }, [active, activeJobId, jobsQuery.data, updateSearch]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.operations.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.otwPlay.importJobs() }),
      ...(activeJobId ? [queryClient.invalidateQueries({ queryKey: queryKeys.otwPlay.importJob(activeJobId) })] : []),
    ]);
  };

  const playlistImportInput = () => mode === "recent"
    ? {
        playlistUrl,
        mode: "recent" as const,
        recentLimit: Number(recentLimit),
      }
    : mode === "range"
      ? {
          playlistUrl,
          mode: "all_new" as const,
          rangeStart: Number(rangeStart) - 1,
          rangeLimit: Number(rangeLimit),
        }
      : { playlistUrl, mode: "all_new" as const };

  const runPreflight = async () => {
    setBusy("preflight");
    try {
      setPreflight(await preflightOtwPlayPlaylistImport({ ...playlistImportInput(), candidateKind }));
    } catch (error) {
      toast({
        variant: "error",
        description: playlistPreflightErrorMessage(error),
      });
    } finally {
      setBusy(null);
    }
  };

  const startImport = async () => {
    setBusy("create");
    try {
      const job = await createOtwPlayPlaylistImport({
        ...playlistImportInput(),
        candidateKind,
        idempotencyKey: crypto.randomUUID(),
      });
      setActiveJobId(job.id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.otwPlay.importJobs() });
      toast({ variant: "success", description: "수집 작업을 저장하고 수집 대기열에 등록했습니다." });
    } catch {
      toast({ variant: "error", description: "수집 작업을 시작하지 못했습니다." });
    } finally {
      setBusy(null);
    }
  };

  const refreshAuthority = async () => {
    setBusy("refresh");
    try {
      await refresh();
      toast({ variant: "success", description: "최신 권위 상태를 불러왔습니다." });
    } catch {
      toast({
        variant: "error",
        description: "최신 권위 상태를 불러오지 못했습니다. 다시 시도해 주세요.",
      });
    } finally {
      setBusy(null);
    }
  };

  const retryFailedMessages = async (jobId: string) => {
    setBusy("retry");
    try {
      await retryOtwPlayImportJob(jobId);
      await refresh();
      toast({ variant: "success", description: "실패 항목을 다시 수집 대기열에 등록했습니다." });
    } catch {
      toast({
        variant: "error",
        description: "실패 항목을 재시도하지 못했습니다.",
      });
    } finally {
      setBusy(null);
    }
  };

  const job = jobQuery.data;

  return (
    <div className="space-y-3">
      <Card id="playlist-import">
        <CardHeader className="border-b">
          <div className="flex items-start gap-3">
            <Badge variant="outline" className="mt-0.5 shrink-0">1단계</Badge>
            <div className="space-y-1">
              <CardTitle className="text-base">YouTube 플레이리스트 가져오기</CardTitle>
              <p className="text-sm leading-relaxed text-muted-foreground">
                주소와 수집 범위를 확인한 뒤에만 가져오기 작업을 시작합니다.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" aria-expanded={importOpen} aria-controls="playlist-import-form" onClick={() => setImportOpen((open) => !open)}>
            {importOpen ? "가져오기 숨기기" : "가져오기 펼치기"}
          </Button>
        </CardHeader>
        <CardContent id="playlist-import-form" hidden={!importOpen} className="space-y-3 pt-3">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">가져올 영상 종류</legend>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {([
                { value: "official_video", label: "공식 곡" },
                { value: "singing_clip", label: "노래 클립" },
              ] as const).map((option) => (
                <label key={option.value} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
                  <input
                    type="radio"
                    name="playlist-import-kind"
                    value={option.value}
                    checked={candidateKind === option.value}
                    onChange={() => { setCandidateKind(option.value); setPreflight(null); }}
                    className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
          <Field>
            <FieldLabel htmlFor="playlist-url">YouTube 플레이리스트 URL 또는 ID</FieldLabel>
            <FieldDescription>
              playlist URL과 목록이 포함된 watch URL을 모두 사용할 수 있습니다.
            </FieldDescription>
            <Input
              id="playlist-url"
              className="h-11"
              placeholder="https://www.youtube.com/playlist?list=..."
              value={playlistUrl}
              onChange={(event) => {
                setPlaylistUrl(event.target.value);
                setPreflight(null);
              }}
            />
          </Field>

          <ChoiceGroup
            label="가져오기 범위"
            description="필요한 방식 하나를 선택하면 관련 설정만 표시됩니다."
            value={mode}
            onValueChange={(value) => {
              setMode(value);
              setPreflight(null);
            }}
            options={importModeOptions}
            presentation="cards"
          />

          {mode === "recent" ? (
            <div className="rounded-lg border bg-muted/20 p-3">
              <Field className="max-w-sm">
                <FieldLabel htmlFor="recent-limit">최근 가져올 개수</FieldLabel>
                <FieldDescription>플레이리스트 끝에서부터 최대 5,000개입니다.</FieldDescription>
                <Input
                  id="recent-limit"
                  type="number"
                  min={1}
                  max={5000}
                  value={recentLimit}
                  onChange={(event) => setRecentLimit(event.target.value)}
                />
              </Field>
            </div>
          ) : null}

          {mode === "range" ? (
            <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="range-start">시작 위치</FieldLabel>
                <FieldDescription>첫 번째 영상은 1입니다.</FieldDescription>
                <Input
                  id="range-start"
                  type="number"
                  min={1}
                  value={rangeStart}
                  onChange={(event) => setRangeStart(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="range-limit">가져올 개수</FieldLabel>
                <FieldDescription>한 작업에서 최대 5,000개입니다.</FieldDescription>
                <Input
                  id="range-limit"
                  type="number"
                  min={1}
                  max={5000}
                  value={rangeLimit}
                  onChange={(event) => setRangeLimit(event.target.value)}
                />
              </Field>
            </div>
          ) : null}

          <div className="flex justify-end border-t pt-4">
            <Button
              size="lg"
              disabled={!playlistUrl.trim() || busy !== null}
              onClick={() => void runPreflight()}
            >
              {busy === "preflight" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              가져오기 전 확인
            </Button>
          </div>
          {preflight && (
            <div className="space-y-3 rounded-xl border bg-muted/20 p-3 text-sm">
              <div className="flex gap-2 font-semibold"><span>{preflight.title}</span><Badge variant="outline">{preflight.candidateKind === "singing_clip" ? "노래 클립" : "공식 곡"}</Badge></div>
              <div className="flex flex-wrap gap-2"><Badge variant="secondary">{preflight.privacyStatus}</Badge><Badge variant="outline">전체 {preflight.itemCount.toLocaleString()}개</Badge><Badge variant="outline">요청 {preflight.requestedItemCount.toLocaleString()}개</Badge><Badge variant="outline">위치 {preflight.rangeStartPosition + 1}–{preflight.rangeEndExclusive}</Badge><Badge variant="outline">page {preflight.estimatedPageCount}</Badge><Badge variant="outline">video batch {preflight.estimatedVideoBatchCount}</Badge></div>
              {preflight.requiresSplit && <p role="alert" className="text-destructive">5,000개 상한을 초과했습니다. 잘린 성공으로 처리하지 않으며 범위를 나눠야 합니다.</p>}
              <div className="flex flex-wrap gap-2">
                <Button disabled={preflight.requiresSplit || busy !== null} onClick={() => void startImport()}><Upload /> 수집 시작</Button>
                {preflight.requiresSplit && <Button variant="outline" onClick={() => { setMode("range"); setRangeStart("1"); setRangeLimit("5000"); setPreflight(null); }}>첫 5,000개 범위로 전환</Button>}
                {!preflight.requiresSplit && preflight.nextRangeStart !== null && mode === "range" && <Button variant="outline" onClick={() => { setRangeStart(String(preflight.nextRangeStart! + 1)); setPreflight(null); }}>다음 범위 준비</Button>}
                {preflight.previousImport && <Button variant="outline" onClick={() => setActiveJobId(preflight.previousImport!.jobId)}>이전 가져오기 이어보기</Button>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">가져오기 이력</CardTitle>
            <a className="text-sm underline underline-offset-4" href="#playlist-import" onClick={() => setImportOpen(true)}>새 플레이리스트 가져오기 ↑</a>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {jobsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">가져오기 이력을 불러오는 중입니다.</p>
          ) : jobsQuery.isError ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <span>가져오기 이력을 불러오지 못했습니다. 저장된 작업이 없는 것으로 간주하지 않습니다.</span>
              <Button size="sm" variant="outline" disabled={jobsQuery.isFetching} onClick={() => void jobsQuery.refetch()}>
                {jobsQuery.isFetching ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                다시 시도
              </Button>
            </div>
          ) : (jobsQuery.data?.length ?? 0) === 0 ? (
            <p className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">
              저장된 가져오기 작업이 없습니다.
            </p>
          ) : (
            <div className="divide-y">
              {jobsQuery.data?.map((historyJob) => (
                <div key={historyJob.id} className="flex items-center gap-2 py-1">
                <button
                  type="button"
                  onClick={() => setActiveJobId(historyJob.id)}
                  aria-pressed={historyJob.id === activeJobId}
                  className={`min-w-0 flex-1 rounded-md px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                    historyJob.id === activeJobId
                      ? "bg-primary/5"
                      : "hover:bg-muted/40"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="line-clamp-2 font-semibold">{historyJob.playlistTitle ?? historyJob.playlistId}</span>
                    <Badge variant={historyJob.status === "completed" ? "secondary" : "outline"}>
                      {importStatusLabels[historyJob.status] ?? historyJob.status}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {historyJob.playlistOwnerChannelTitle ?? historyJob.playlistOwnerChannelId}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(historyJob.createdAt).toLocaleString("ko-KR")} · 후보 {historyJob.counts.discovered}개
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {retentionLabel(historyJob.retentionExpiresAt)}
                  </p>
                </button>
                <Button size="icon-sm" variant="ghost" aria-label="이력 삭제" title={`${historyJob.playlistTitle ?? historyJob.playlistId} 이력 삭제`} className="text-muted-foreground hover:text-destructive" disabled={busy !== null || historyJob.counts.retryPending > 0 || !["completed", "partial", "failed"].includes(historyJob.status)} onClick={() => setDeleteHistoryId(historyJob.id)}><Trash2 aria-hidden="true" /></Button>
                </div>
              ))}
            </div>
          )}
          {activeJobId && (
            <section aria-label="수집 작업 상태" className="mt-3 space-y-2 border-t pt-3 text-sm">
              {jobQuery.isError ? (
                <div role="alert" className="flex flex-wrap items-center gap-2">
                  <span>수집 작업 상태를 불러오지 못했습니다.</span>
                  <Button size="sm" variant="outline" disabled={jobQuery.isFetching} onClick={() => void jobQuery.refetch()}>다시 시도</Button>
                </div>
              ) : job ? (
                <>
                  <p className="font-medium">수집 상태 · {job.playlistTitle ?? job.playlistId}</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{importStatusLabels[job.status] ?? job.status}</Badge>
                    {Object.entries(job.counts).filter(([key, value]) => value > 0 || key === "discovered").map(([key, value]) => <span key={key} className="text-xs text-muted-foreground">{importCountLabels[key] ?? key} {value}</span>)}
                  </div>
                  {job.lastErrorCode && <p role="alert" className="text-destructive">최근 오류: {job.lastErrorCode}</p>}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void refreshAuthority()}><RefreshCw /> 상태 새로고침</Button>
                    {job.status === "partial" && <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void retryFailedMessages(job.id)}>실패 항목 재시도</Button>}
                    <Button size="sm" onClick={() => updateSearch({ view: "inbox", source: "playlist", kind: job.candidateKind === "singing_clip" ? "broadcast" : "official", state: "pending", selected: undefined, proposal: undefined }, false)}>검수 목록으로 이동</Button>
                  </div>
                </>
              ) : <p role="status" className="text-muted-foreground">수집 작업 상태를 불러오는 중입니다.</p>}
            </section>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteHistoryId !== null} onOpenChange={(open) => { if (!open && busy !== "delete-history") setDeleteHistoryId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>가져오기 이력을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>목록에서 이력을 삭제합니다. 수록된 곡, 검수 후보와 감사 기록은 보존됩니다. 진행 중이거나 재시도 대기 중인 작업은 삭제할 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "delete-history"}>취소</AlertDialogCancel>
            <AlertDialogAction disabled={busy === "delete-history"} onClick={async (event) => {
              event.preventDefault();
              if (!deleteHistoryId) return;
              setBusy("delete-history");
              try {
                await deleteOtwPlayImportHistory(deleteHistoryId);
                queryClient.setQueryData(queryKeys.otwPlay.importJobs(), (previous: typeof jobsQuery.data) => previous?.filter((entry) => entry.id !== deleteHistoryId));
                if (activeJobId === deleteHistoryId) setActiveJobId(null);
                setPreflight(null);
                setDeleteHistoryId(null);
                await queryClient.invalidateQueries({ queryKey: queryKeys.otwPlay.importJobs() });
                toast({ variant: "success", description: "가져오기 이력을 삭제했습니다." });
              } catch {
                toast({ variant: "error", description: "이력을 삭제하지 못했습니다. 작업이 진행 중인지 확인하고 다시 시도해 주세요." });
              } finally { setBusy(null); }
            }}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
