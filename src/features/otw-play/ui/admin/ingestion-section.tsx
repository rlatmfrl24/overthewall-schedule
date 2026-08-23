import { useEffect, useMemo, useState } from "react";
import type {
  OtwPlayAdminCatalogDto,
  OtwPlayIngestionCandidateItemDto,
  OtwPlayIngestionClassification,
  OtwPlayIngestionConversionResultDto,
  OtwPlayIngestionReviewInput,
  OtwPlayParticipantRole,
  OtwPlayParticipationType,
  OtwPlayPlaylistPreflightDto,
  OtwPlayRelationType,
} from "@contracts/otw-play";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/shared/api/client";
import { queryKeys } from "@/shared/query/query-keys";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Checkbox } from "@/shared/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { useToast } from "@/shared/ui/toast";
import { ExternalLink, Loader2, RefreshCw, Upload } from "lucide-react";
import {
  convertOtwPlayImportCandidates,
  createOtwPlayPlaylistImport,
  fetchOtwPlayImportJobItems,
  preflightOtwPlayPlaylistImport,
  retryOtwPlayImportJob,
  updateOtwPlayImportCandidate,
} from "../../api/admin";
import {
  useOtwPlayImportJob,
  useOtwPlayImportJobItems,
} from "../../queries/use-admin-catalog";
import { chunkOtwPlayIngestionSelections } from "../../model/ingestion-selection";
import {
  ChoiceGroup,
  type ChoiceOption,
} from "./ingestion-form-controls";

type RowDraft = {
  songId: string;
  songTitle: string;
  isOtwOriginal: boolean;
  originalArtistIds: string[];
  participants: Record<string, OtwPlayParticipantRole>;
  relationType: OtwPlayRelationType;
  releaseType: "official_mv" | "official_video";
  participationType: OtwPlayParticipationType;
  internalNote: string;
};

const participantRoleLabels: Record<OtwPlayParticipantRole, string> = {
  vocal: "메인 보컬",
  featured_vocal: "피처링 보컬",
  chorus: "코러스",
  other: "기타 참여",
};

const emptyDraft = (item: OtwPlayIngestionCandidateItemDto): RowDraft => ({
  songId: "__new",
  songTitle: item.title ?? "",
  isOtwOriginal: false,
  originalArtistIds: [],
  participants: {},
  relationType: "cover",
  releaseType: "official_video",
  participationType: "solo",
  internalNote: "",
});

const draftFromItem = (
  item: OtwPlayIngestionCandidateItemDto,
  catalog: OtwPlayAdminCatalogDto,
): RowDraft => {
  const draft = emptyDraft(item);
  const input = item.reviewInput;
  if (!input) return draft;
  draft.songId = input.song.kind === "existing" ? input.song.songId : "__new";
  if (input.song.kind === "create") {
    draft.songTitle = input.song.title;
    draft.isOtwOriginal = input.song.isOtwOriginal;
    draft.originalArtistIds = input.song.originalArtists.flatMap((artist) => {
      if (artist.subject.kind === "entity") return [artist.subject.entityId];
      if (artist.subject.kind === "member") {
        const memberUid = artist.subject.memberUid;
        const entity = catalog.entities.find(
          (candidate) => candidate.memberUid === memberUid,
        );
        return entity ? [entity.id] : [];
      }
      return [];
    });
  }
  draft.participants = Object.fromEntries(
    input.participants.flatMap((participant) => {
      const subject = participant.subject;
      const entityId = subject.kind === "entity"
        ? subject.entityId
        : subject.kind === "member"
          ? catalog.entities.find(
              (entity) => entity.memberUid === subject.memberUid,
            )?.id
          : null;
      return entityId ? [[entityId, participant.participantRole]] : [];
    }),
  );
  draft.relationType = input.relationType;
  draft.releaseType = input.releaseType;
  draft.participationType = input.participationType;
  draft.internalNote = input.internalNote ?? "";
  return draft;
};

const buildReviewInput = (
  draft: RowDraft,
  catalog: OtwPlayAdminCatalogDto,
): OtwPlayIngestionReviewInput => {
  const participants = Object.entries(draft.participants).map(
    ([entityId, participantRole], creditOrder) => ({
      subject: { kind: "entity" as const, entityId },
      participantRole,
      creditOrder,
      creditNameSnapshot:
        catalog.entities.find((entity) => entity.id === entityId)?.displayName ??
        entityId,
    }),
  );
  if (participants.length === 0) {
    throw new Error("참여자를 한 명 이상 선택해 주세요.");
  }
  const song = draft.songId !== "__new"
    ? { kind: "existing" as const, songId: draft.songId }
    : {
        kind: "create" as const,
        title: draft.songTitle.trim(),
        isOtwOriginal: draft.isOtwOriginal,
        originalReleaseDate: null,
        originalReleasePrecision: "unknown" as const,
        aliases: [],
        originalArtists: draft.originalArtistIds.map((entityId, creditOrder) => ({
          subject: { kind: "entity" as const, entityId },
          creditOrder,
          isPrimary: creditOrder === 0,
        })),
      };
  if (
    song.kind === "create" &&
    (!song.title || song.originalArtists.length === 0)
  ) {
    throw new Error("새 곡은 원곡 제목과 원곡 가수를 입력해 주세요.");
  }
  return {
    song,
    participants,
    relationType: draft.relationType,
    releaseType: draft.releaseType,
    participationType: draft.participationType,
    internalNote: draft.internalNote.trim() || null,
  };
};

const formatDuration = (seconds: number | null) => {
  if (seconds === null) return "-";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
};

const sourceUrl = (videoId: string) =>
  `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;

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

const relationOptions = [
  { value: "cover", label: "커버" },
  { value: "original", label: "오리지널" },
] satisfies readonly ChoiceOption<OtwPlayRelationType>[];

const releaseOptions = [
  { value: "official_video", label: "공식 영상" },
  { value: "official_mv", label: "공식 MV" },
] satisfies readonly ChoiceOption<RowDraft["releaseType"]>[];

const participationOptions = [
  { value: "solo", label: "솔로" },
  { value: "duet", label: "듀엣" },
  { value: "unit", label: "유닛" },
  { value: "group", label: "단체" },
  { value: "external_collab", label: "외부 협업" },
] satisfies readonly ChoiceOption<OtwPlayParticipationType>[];

export function IngestionSection({
  catalog,
  onOpenCatalog,
}: {
  catalog: OtwPlayAdminCatalogDto;
  onOpenCatalog: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [mode, setMode] = useState<ImportMode>("all_new");
  const [recentLimit, setRecentLimit] = useState("50");
  const [rangeStart, setRangeStart] = useState("1");
  const [rangeLimit, setRangeLimit] = useState("5000");
  const [preflight, setPreflight] = useState<OtwPlayPlaylistPreflightDto | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [classification, setClassification] = useState<
    OtwPlayIngestionClassification | "all"
  >("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [extraItems, setExtraItems] = useState<OtwPlayIngestionCandidateItemDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [commonParticipantId, setCommonParticipantId] = useState("none");
  const [commonParticipantRole, setCommonParticipantRole] =
    useState<OtwPlayParticipantRole>("vocal");
  const [commonRelationType, setCommonRelationType] =
    useState<OtwPlayRelationType>("cover");
  const [commonReleaseType, setCommonReleaseType] =
    useState<"official_mv" | "official_video">("official_video");
  const [commonParticipationType, setCommonParticipationType] =
    useState<OtwPlayParticipationType>("solo");
  const jobQuery = useOtwPlayImportJob(activeJobId);
  const serverClassification = classification === "all"
    ? undefined
    : classification;
  const itemsQuery = useOtwPlayImportJobItems(
    activeJobId,
    serverClassification,
  );
  const baseItems = useMemo(
    () => itemsQuery.data?.items ?? [],
    [itemsQuery.data],
  );
  const items = useMemo(() => {
    const seen = new Set<string>();
    return [...baseItems, ...extraItems].filter((item) => {
      if (seen.has(item.originId)) return false;
      seen.add(item.originId);
      return true;
    });
  }, [baseItems, extraItems]);
  const filtered = items;

  useEffect(() => {
    setExtraItems([]);
    setNextCursor(null);
    setSelected(new Set());
    setDrafts({});
  }, [activeJobId]);

  useEffect(() => {
    setExtraItems([]);
    setNextCursor(null);
    setSelected(new Set());
    setDrafts({});
  }, [classification]);

  useEffect(() => {
    if (itemsQuery.data) setNextCursor(itemsQuery.data.nextCursor);
  }, [itemsQuery.data]);

  useEffect(() => {
    setDrafts((current) => {
      const next = { ...current };
      let changed = false;
      for (const item of items) {
        if (!next[item.candidateId]) {
          next[item.candidateId] = draftFromItem(item, catalog);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [catalog, items]);

  const refresh = async () => {
    if (!activeJobId) return;
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.otwPlay.importJob(activeJobId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.otwPlay.importJobItems(
          activeJobId,
          classification,
        ),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.otwPlay.adminCatalog(),
      }),
    ]);
    setExtraItems([]);
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
      setPreflight(await preflightOtwPlayPlaylistImport(playlistImportInput()));
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
        idempotencyKey: crypto.randomUUID(),
      });
      setActiveJobId(job.id);
      toast({ variant: "success", description: "수집 job을 저장하고 Queue에 등록했습니다." });
    } catch {
      toast({ variant: "error", description: "수집 job을 시작하지 못했습니다." });
    } finally {
      setBusy(null);
    }
  };

  const applyCommon = () => {
    setDrafts((current) => {
      const next = { ...current };
      for (const item of filtered) {
        if (!selected.has(item.candidateId)) continue;
        const previous = next[item.candidateId] ?? emptyDraft(item);
        next[item.candidateId] = {
          ...previous,
          relationType: commonRelationType,
          releaseType: commonReleaseType,
          participationType: commonParticipationType,
          participants: commonParticipantId === "none"
            ? previous.participants
            : { [commonParticipantId]: commonParticipantRole },
        };
      }
      return next;
    });
    toast({ variant: "info", description: "선택 행에 공통값을 적용했습니다. 저장 전 행별로 수정할 수 있습니다." });
  };

  const saveCandidate = async (item: OtwPlayIngestionCandidateItemDto) => {
    setBusy(`save:${item.candidateId}`);
    try {
      await updateOtwPlayImportCandidate(item.candidateId, {
        expectedVersion: item.candidateVersion,
        action: "save",
        input: buildReviewInput(drafts[item.candidateId] ?? emptyDraft(item), catalog),
      });
      await refresh();
      toast({ variant: "success", description: "검수 입력을 ready 상태로 저장했습니다." });
    } catch (error) {
      toast({
        variant: "error",
        description: error instanceof Error ? error.message : "검수 입력 저장에 실패했습니다.",
      });
    } finally {
      setBusy(null);
    }
  };

  const candidateAction = async (
    item: OtwPlayIngestionCandidateItemDto,
    action: "ignore" | "refresh_metadata",
  ) => {
    setBusy(`${action}:${item.candidateId}`);
    try {
      await updateOtwPlayImportCandidate(item.candidateId, {
        expectedVersion: item.candidateVersion,
        action,
      });
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const convertSelected = async () => {
    if (!activeJobId) return;
    const candidates = [...new Map(
      items
        .filter((item) => selected.has(item.candidateId) && item.status === "ready")
        .map((item) => [
          item.candidateId,
          { id: item.candidateId, expectedVersion: item.candidateVersion },
        ]),
    ).values()];
    if (candidates.length === 0) {
      toast({ variant: "error", description: "ready 상태 후보를 선택해 주세요." });
      return;
    }
    setBusy("convert");
    const results: OtwPlayIngestionConversionResultDto[] = [];
    let requestFailureCount = 0;
    const requestFailureIds: string[] = [];
    try {
      for (const chunk of chunkOtwPlayIngestionSelections(candidates)) {
        try {
          const response = await convertOtwPlayImportCandidates(activeJobId, {
            candidates: chunk,
          });
          results.push(...response.results);
        } catch {
          requestFailureCount += chunk.length;
          requestFailureIds.push(...chunk.map((item) => item.id));
        }
      }
      await refresh();
      setSelected(new Set(requestFailureIds));
      const created = results.filter((item) => item.outcome === "created").length;
      const failed = results.length - created + requestFailureCount;
      toast({
        variant: failed > 0 ? "info" : "success",
        description: `draft ${created}건 생성, 별도 확인 ${failed}건입니다. 공개 게시로 전환되지는 않았습니다.`,
      });
    } finally {
      setBusy(null);
    }
  };

  const selectCurrentFilter = async () => {
    if (!activeJobId) return;
    setBusy("select-filter");
    try {
      const loaded = [...items];
      let cursor = nextCursor;
      let pageCount = 0;
      while (cursor && pageCount < 50) {
        const page = await fetchOtwPlayImportJobItems(activeJobId, {
          limit: 100,
          cursor,
          ...(serverClassification
            ? { classification: serverClassification }
            : {}),
        });
        loaded.push(...page.items);
        cursor = page.nextCursor;
        pageCount += 1;
      }
      if (cursor) throw new Error("selection_page_limit");
      const byOrigin = [...new Map(
        loaded.map((item) => [item.originId, item]),
      ).values()];
      setExtraItems(byOrigin);
      setNextCursor(null);
      setSelected(new Set(byOrigin.map((item) => item.candidateId)));
    } catch {
      toast({
        variant: "error",
        description: "현재 filter의 전체 항목을 불러오지 못했습니다.",
      });
    } finally {
      setBusy(null);
    }
  };

  const loadMore = async () => {
    if (!activeJobId || !nextCursor) return;
    setBusy("more");
    try {
      const page = await fetchOtwPlayImportJobItems(activeJobId, {
        limit: 100,
        cursor: nextCursor,
        ...(serverClassification
          ? { classification: serverClassification }
          : {}),
      });
      setExtraItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } finally {
      setBusy(null);
    }
  };

  const job = jobQuery.data;
  const selectedReady = new Set(items
    .filter((item) => selected.has(item.candidateId) && item.status === "ready")
    .map((item) => item.candidateId)).size;

  return (
    <div className="space-y-5">
      <Card>
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
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
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
            <div className="rounded-lg border bg-muted/20 p-4">
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
            <div className="grid gap-4 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
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
            <div className="space-y-3 rounded-xl border bg-muted/20 p-4 text-sm">
              <div className="font-semibold">{preflight.title}</div>
              <div className="flex flex-wrap gap-2"><Badge variant="secondary">{preflight.privacyStatus}</Badge><Badge variant="outline">전체 {preflight.itemCount.toLocaleString()}개</Badge><Badge variant="outline">요청 {preflight.requestedItemCount.toLocaleString()}개</Badge><Badge variant="outline">위치 {preflight.rangeStartPosition + 1}–{preflight.rangeEndExclusive}</Badge><Badge variant="outline">page {preflight.estimatedPageCount}</Badge><Badge variant="outline">video batch {preflight.estimatedVideoBatchCount}</Badge></div>
              {preflight.requiresSplit && <p role="alert" className="text-destructive">5,000개 상한을 초과했습니다. 잘린 성공으로 처리하지 않으며 범위를 나눠야 합니다.</p>}
              <div className="flex flex-wrap gap-2">
                <Button disabled={preflight.requiresSplit || busy !== null} onClick={() => void startImport()}><Upload /> 수집 시작</Button>
                {preflight.requiresSplit && <Button variant="outline" onClick={() => { setMode("range"); setRangeStart("1"); setRangeLimit("5000"); setPreflight(null); }}>첫 5,000개 범위로 전환</Button>}
                {!preflight.requiresSplit && preflight.nextRangeStart !== null && mode === "range" && <Button variant="outline" onClick={() => { setRangeStart(String(preflight.nextRangeStart! + 1)); setPreflight(null); }}>다음 범위 준비</Button>}
                {preflight.previousImport && <Button variant="outline" onClick={() => setActiveJobId(preflight.previousImport!.jobId)}>이전 job 이어보기</Button>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {job && (
        <Card>
          <CardHeader><CardTitle className="text-base">2. 수집 진행률 · {job.playlistTitle}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2"><Badge>{job.status}</Badge>{Object.entries(job.counts).map(([key, value]) => <Badge key={key} variant="outline">{key} {value}</Badge>)}</div>
            {job.lastErrorCode && <p className="text-sm text-destructive">최근 오류: {job.lastErrorCode}</p>}
            <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void refresh()}><RefreshCw /> 권위 상태 새로고침</Button>{job.status === "partial" && <Button size="sm" variant="outline" disabled={busy !== null} onClick={async () => { setBusy("retry"); try { await retryOtwPlayImportJob(job.id); await refresh(); } finally { setBusy(null); } }}>실패 message 재시도</Button>}</div>
          </CardContent>
        </Card>
      )}

      {activeJobId && (
        <Card>
          <CardHeader><CardTitle className="text-base">3. 후보 검수 · 4. draft 변환</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <section className="overflow-hidden rounded-xl border bg-muted/15" aria-labelledby="bulk-settings-title">
              <div className="border-b bg-background/70 px-4 py-3">
                <h3 id="bulk-settings-title" className="text-sm font-semibold">선택 항목 일괄 설정</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  선택한 후보에만 적용됩니다. 적용 후에도 각 후보에서 값을 다시 조정할 수 있습니다.
                </p>
              </div>
              <div className="grid gap-6 p-4 xl:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.6fr)]">
                <div className="space-y-4 rounded-lg border bg-background p-4">
                  <div>
                    <h4 className="text-sm font-semibold">가창 참여자</h4>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      참여자를 선택하지 않으면 각 후보의 기존 참여자 값을 유지합니다.
                    </p>
                  </div>
                  <Field>
                    <FieldLabel id="common-participant-label">일괄 지정할 참여자</FieldLabel>
                    <Select value={commonParticipantId} onValueChange={setCommonParticipantId}>
                      <SelectTrigger className="w-full" aria-labelledby="common-participant-label">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">참여자 변경 안 함</SelectItem>
                        {catalog.entities
                          .filter((entity) => entity.archivedAt === null)
                          .map((entity) => (
                            <SelectItem key={entity.id} value={entity.id}>
                              {entity.displayName}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  {commonParticipantId !== "none" ? (
                    <Field>
                      <FieldLabel id="common-participant-role-label">참여 역할</FieldLabel>
                      <Select
                        value={commonParticipantRole}
                        onValueChange={(value) => setCommonParticipantRole(value as OtwPlayParticipantRole)}
                      >
                        <SelectTrigger className="w-full" aria-labelledby="common-participant-role-label">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(participantRoleLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  ) : (
                    <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                      참여자 역할은 참여자를 지정할 때 함께 선택할 수 있습니다.
                    </p>
                  )}
                </div>

                <div className="space-y-5 rounded-lg border bg-background p-4">
                  <ChoiceGroup
                    label="곡 관계"
                    value={commonRelationType}
                    onValueChange={setCommonRelationType}
                    options={relationOptions}
                  />
                  <ChoiceGroup
                    label="공개 유형"
                    value={commonReleaseType}
                    onValueChange={setCommonReleaseType}
                    options={releaseOptions}
                  />
                  <ChoiceGroup
                    label="참여 형태"
                    value={commonParticipationType}
                    onValueChange={setCommonParticipationType}
                    options={participationOptions}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2 border-t bg-background/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">현재 {selected.size.toLocaleString()}개 후보 선택됨</p>
                <Button disabled={selected.size === 0} onClick={applyCommon}>
                  선택 항목에 설정 적용
                </Button>
              </div>
            </section>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={classification} onValueChange={(value) => setClassification(value as typeof classification)}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 분류</SelectItem><SelectItem value="eligible">eligible</SelectItem><SelectItem value="existing_candidate">existing candidate</SelectItem><SelectItem value="channel_review">channel review</SelectItem><SelectItem value="existing_catalog">existing catalog</SelectItem><SelectItem value="existing_proposal">existing proposal</SelectItem><SelectItem value="unavailable">unavailable</SelectItem><SelectItem value="policy_blocked">policy blocked</SelectItem><SelectItem value="scope_review">scope review</SelectItem><SelectItem value="playlist_duplicate">playlist duplicate</SelectItem></SelectContent></Select>
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void selectCurrentFilter()}>{busy === "select-filter" ? <Loader2 className="animate-spin" /> : null} 현재 filter 전체 선택</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>선택 해제</Button>
              <Button className="ml-auto" disabled={selectedReady === 0 || busy !== null} onClick={() => void convertSelected()}>선택 ready {selectedReady}건 draft 변환</Button>
            </div>

            <div className="hidden overflow-x-auto rounded-xl border md:block">
              <Table><TableHeader><TableRow><TableHead className="w-10">선택</TableHead><TableHead>영상</TableHead><TableHead>채널</TableHead><TableHead>위치·시간</TableHead><TableHead>분류</TableHead><TableHead className="text-right">작업</TableHead></TableRow></TableHeader><TableBody>{filtered.map((item) => <TableRow key={item.originId}><TableCell><Checkbox checked={selected.has(item.candidateId)} onCheckedChange={(checked) => setSelected((current) => { const next = new Set(current); if (checked) next.add(item.candidateId); else next.delete(item.candidateId); return next; })} /></TableCell><TableCell><div className="flex min-w-72 gap-3">{item.thumbnailUrl ? <img className="h-14 w-24 rounded object-cover" src={item.thumbnailUrl} alt="YouTube thumbnail" /> : <div className="h-14 w-24 rounded bg-muted" />}<div><div className="line-clamp-2 font-medium">{item.title ?? item.videoId}</div><a className="text-xs text-primary underline" href={sourceUrl(item.videoId)} target="_blank" rel="noreferrer">YouTube 원문 <ExternalLink className="inline size-3" /></a></div></div></TableCell><TableCell>{item.channelTitle ?? "-"}</TableCell><TableCell>#{item.playlistPosition + 1} · {formatDuration(item.durationSeconds)}</TableCell><TableCell><Badge variant={item.status === "blocked" ? "destructive" : "secondary"}>{item.classification}</Badge><div className="mt-1 text-xs text-muted-foreground">{item.status}{item.exclusionReason ? ` · ${item.exclusionReason}` : ""}</div></TableCell><TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setEditingId(item.candidateId)}>행별 보완</Button></TableCell></TableRow>)}</TableBody></Table>
            </div>

            <div className="space-y-3 md:hidden">{filtered.map((item) => <div key={item.originId} className="space-y-2 rounded-xl border p-3"><div className="flex items-start gap-3"><Checkbox checked={selected.has(item.candidateId)} onCheckedChange={(checked) => setSelected((current) => { const next = new Set(current); if (checked) next.add(item.candidateId); else next.delete(item.candidateId); return next; })} />{item.thumbnailUrl ? <img className="h-14 w-24 rounded object-cover" src={item.thumbnailUrl} alt="YouTube thumbnail" /> : null}<div className="min-w-0"><div className="line-clamp-2 font-medium">{item.title ?? item.videoId}</div><div className="text-xs text-muted-foreground">#{item.playlistPosition + 1} · {formatDuration(item.durationSeconds)}</div></div></div><div className="flex items-center justify-between"><Badge variant="secondary">{item.classification}</Badge><Button size="sm" variant="outline" onClick={() => setEditingId(item.candidateId)}>행별 보완</Button></div></div>)}</div>

            {editingId && (() => {
              const item = items.find((candidate) => candidate.candidateId === editingId);
              const draft = item ? drafts[item.candidateId] : null;
              if (!item || !draft) return null;
              const updateDraft = (change: Partial<RowDraft>) => setDrafts((current) => ({ ...current, [item.candidateId]: { ...draft, ...change } }));
              return (
                <section className="overflow-hidden rounded-xl border" aria-labelledby={`candidate-editor-${item.candidateId}`}>
                  <div className="flex items-start justify-between gap-3 border-b bg-muted/20 p-4">
                    <div className="space-y-1">
                      <h3 id={`candidate-editor-${item.candidateId}`} className="font-semibold">
                        {item.title ?? item.videoId}
                      </h3>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        YouTube 제목은 참고값입니다. 카탈로그에 저장할 곡과 참여 정보를 직접 확인해 주세요.
                      </p>
                      {item.classification === "scope_review" ? (
                        <p role="alert" className="text-xs leading-relaxed text-destructive">
                          현재 공개 범위 밖 형식입니다. 영상 유형과 사용 범위를 확인한 뒤 저장하면 공식 영상 후보로 분류합니다.
                        </p>
                      ) : null}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>닫기</Button>
                  </div>

                  <div className="space-y-5 p-4">
                    <fieldset className="space-y-4 rounded-lg border bg-muted/10 p-4">
                      <legend className="px-1 text-sm font-semibold">곡 정보</legend>
                      <div className="grid gap-4 lg:grid-cols-2">
                        <Field>
                          <FieldLabel id={`song-source-${item.candidateId}`}>연결할 곡</FieldLabel>
                          <FieldDescription>기존 곡을 연결하거나 새 곡 정보를 입력합니다.</FieldDescription>
                          <Select value={draft.songId} onValueChange={(songId) => updateDraft({ songId })}>
                            <SelectTrigger className="w-full" aria-labelledby={`song-source-${item.candidateId}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__new">새 곡 입력</SelectItem>
                              {catalog.songs
                                .filter((song) => song.archivedAt === null)
                                .map((song) => (
                                  <SelectItem key={song.id} value={song.id}>{song.title}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        {draft.songId === "__new" ? (
                          <Field>
                            <FieldLabel htmlFor={`song-title-${item.candidateId}`}>원곡 제목</FieldLabel>
                            <FieldDescription>YouTube 제목과 다르면 카탈로그 기준 제목으로 수정합니다.</FieldDescription>
                            <Input
                              id={`song-title-${item.candidateId}`}
                              value={draft.songTitle}
                              onChange={(event) => updateDraft({ songTitle: event.target.value })}
                            />
                          </Field>
                        ) : null}
                      </div>

                      {draft.songId === "__new" ? (
                        <>
                          <label
                            htmlFor={`original-${item.candidateId}`}
                            className="flex cursor-pointer items-start gap-3 rounded-lg border bg-background p-3 hover:bg-muted/40"
                          >
                            <Checkbox
                              id={`original-${item.candidateId}`}
                              checked={draft.isOtwOriginal}
                              onCheckedChange={(checked) => updateDraft({ isOtwOriginal: checked === true })}
                            />
                            <span>
                              <span className="block text-sm font-medium">OTW 오리지널곡</span>
                              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                                OTW 멤버 또는 그룹의 원곡인 경우에만 선택합니다.
                              </span>
                            </span>
                          </label>
                          <div className="space-y-2">
                            <div>
                              <p className="text-sm font-semibold">원곡 가수</p>
                              <p className="mt-1 text-xs text-muted-foreground">한 명 이상 선택해 주세요.</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {catalog.entities
                                .filter((entity) => entity.archivedAt === null)
                                .map((entity) => {
                                  const checkboxId = `artist-${item.candidateId}-${entity.id}`;
                                  return (
                                    <label
                                      key={entity.id}
                                      htmlFor={checkboxId}
                                      className="inline-flex cursor-pointer items-center gap-2 rounded-full border bg-background px-3 py-2 text-sm hover:bg-muted/50"
                                    >
                                      <Checkbox
                                        id={checkboxId}
                                        checked={draft.originalArtistIds.includes(entity.id)}
                                        onCheckedChange={(checked) => updateDraft({
                                          originalArtistIds: checked
                                            ? [...draft.originalArtistIds, entity.id]
                                            : draft.originalArtistIds.filter((id) => id !== entity.id),
                                        })}
                                      />
                                      {entity.displayName}
                                    </label>
                                  );
                                })}
                            </div>
                          </div>
                        </>
                      ) : null}
                    </fieldset>

                    <fieldset className="space-y-3 rounded-lg border bg-muted/10 p-4">
                      <legend className="px-1 text-sm font-semibold">가창 참여자와 역할</legend>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        실제 가창 참여자를 선택하고 각 참여자의 역할을 지정합니다.
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {catalog.entities
                          .filter((entity) => entity.archivedAt === null)
                          .map((entity) => {
                            const role = draft.participants[entity.id];
                            const checkboxId = `participant-${item.candidateId}-${entity.id}`;
                            return (
                              <div
                                key={entity.id}
                                className="flex min-h-12 items-center gap-2 rounded-lg border bg-background p-2.5"
                              >
                                <Checkbox
                                  id={checkboxId}
                                  checked={Boolean(role)}
                                  onCheckedChange={(checked) => {
                                    const participants = { ...draft.participants };
                                    if (checked) participants[entity.id] = "vocal";
                                    else delete participants[entity.id];
                                    updateDraft({ participants });
                                  }}
                                />
                                <label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer truncate text-sm font-medium">
                                  {entity.displayName}
                                </label>
                                {role ? (
                                  <Select
                                    value={role}
                                    onValueChange={(value) => updateDraft({
                                      participants: {
                                        ...draft.participants,
                                        [entity.id]: value as OtwPlayParticipantRole,
                                      },
                                    })}
                                  >
                                    <SelectTrigger
                                      size="sm"
                                      className="w-32"
                                      aria-label={`${entity.displayName} 참여 역할`}
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(participantRoleLabels).map(([value, label]) => (
                                        <SelectItem key={value} value={value}>{label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : null}
                              </div>
                            );
                          })}
                      </div>
                    </fieldset>

                    <section className="space-y-5 rounded-lg border bg-muted/10 p-4" aria-labelledby={`classification-${item.candidateId}`}>
                      <div>
                        <h4 id={`classification-${item.candidateId}`} className="text-sm font-semibold">공개 분류</h4>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          카탈로그 검색과 표시에 사용되는 값을 확인합니다.
                        </p>
                      </div>
                      <div className="grid gap-5 xl:grid-cols-3">
                        <ChoiceGroup
                          label="곡 관계"
                          value={draft.relationType}
                          onValueChange={(relationType) => updateDraft({ relationType })}
                          options={relationOptions}
                        />
                        <ChoiceGroup
                          label="공개 유형"
                          value={draft.releaseType}
                          onValueChange={(releaseType) => updateDraft({ releaseType })}
                          options={releaseOptions}
                        />
                        <ChoiceGroup
                          label="참여 형태"
                          value={draft.participationType}
                          onValueChange={(participationType) => updateDraft({ participationType })}
                          options={participationOptions}
                        />
                      </div>
                      <Field>
                        <FieldLabel htmlFor={`internal-note-${item.candidateId}`}>내부 메모</FieldLabel>
                        <FieldDescription>관리자 검수에 필요한 정보만 기록합니다.</FieldDescription>
                        <Input
                          id={`internal-note-${item.candidateId}`}
                          value={draft.internalNote}
                          onChange={(event) => updateDraft({ internalNote: event.target.value })}
                        />
                      </Field>
                    </section>
                  </div>

                  <div className="flex flex-col gap-3 border-t bg-muted/20 p-4 sm:flex-row sm:items-center">
                    <Button
                      disabled={busy !== null || !["eligible", "existing_candidate", "scope_review"].includes(item.classification)}
                      onClick={() => void saveCandidate(item)}
                    >
                      ready로 저장
                    </Button>
                    <Button variant="outline" disabled={busy !== null} onClick={() => void candidateAction(item, "refresh_metadata")}>
                      metadata 새로고침
                    </Button>
                    <Button variant="outline" disabled={busy !== null || item.status === "converted"} onClick={() => void candidateAction(item, "ignore")}>
                      제외
                    </Button>
                    {item.linkedPerformanceId ? (
                      <Button variant="outline" onClick={onOpenCatalog}>생성 draft 확인</Button>
                    ) : null}
                    {item.lastConversionOutcome ? (
                      <div role="status" className="text-sm sm:ml-auto">
                        최근 변환: <Badge variant={item.lastConversionOutcome === "created" ? "secondary" : "outline"}>{item.lastConversionOutcome}</Badge>
                        {item.lastConversionErrorCode ? ` · ${item.lastConversionErrorCode}` : ""}
                      </div>
                    ) : null}
                  </div>
                </section>
              );
            })()}
            {nextCursor && <Button variant="outline" className="w-full" disabled={busy !== null} onClick={() => void loadMore()}>{busy === "more" ? <Loader2 className="animate-spin" /> : null} 다음 100개 불러오기</Button>}
            {itemsQuery.isLoading && <Loader2 className="mx-auto animate-spin" />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
