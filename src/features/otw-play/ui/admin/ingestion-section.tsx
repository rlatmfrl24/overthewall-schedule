import { useEffect, useMemo, useState } from "react";
import type {
  OtwPlayAdminCatalogDto,
  OtwPlayAdminCatalogSubjectInput,
  OtwPlayIngestionCandidateItemDto,
  OtwPlayIngestionClassification,
  OtwPlayIngestionConversionResultDto,
  OtwPlayIngestionIgnoreResultDto,
  OtwPlayIngestionReviewInput,
  OtwPlayParticipantRole,
  OtwPlayParticipationType,
  OtwPlayPlaylistPreflightDto,
  OtwPlayRelationType,
} from "@contracts/otw-play";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/shared/api/client";
import { queryKeys } from "@/shared/query/query-keys";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
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
import { ExternalLink, EyeOff, Loader2, RefreshCw, Upload } from "lucide-react";
import {
  convertOtwPlayImportCandidates,
  createOtwPlayPlaylistImport,
  fetchOtwPlayImportJobItems,
  ignoreOtwPlayImportCandidates,
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
import { SubjectPicker, type SelectedSubject } from "./catalog-entry-dialog";

type ExternalParticipantDraft = SelectedSubject & {
  participantRole: OtwPlayParticipantRole;
};

type RowDraft = {
  baseVersion: number;
  baseReviewInput: OtwPlayIngestionReviewInput | null;
  baseStatus: OtwPlayIngestionCandidateItemDto["status"];
  isDirty: boolean;
  songId: string;
  songTitle: string;
  isOtwOriginal: boolean;
  originalArtists: SelectedSubject[];
  participants: Record<string, OtwPlayParticipantRole>;
  externalParticipants: ExternalParticipantDraft[];
  showExternalParticipantInput: boolean;
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
  baseVersion: item.candidateVersion,
  baseReviewInput: item.reviewInput,
  baseStatus: item.status,
  isDirty: false,
  songId: "__new",
  songTitle: item.title ?? "",
  isOtwOriginal: false,
  originalArtists: [],
  participants: {},
  externalParticipants: [],
  showExternalParticipantInput: false,
  relationType: "cover",
  releaseType: "official_video",
  participationType: "solo",
  internalNote: "",
});

const subjectFromInput = (
  subject: OtwPlayAdminCatalogSubjectInput,
  catalog: OtwPlayAdminCatalogDto,
): SelectedSubject => {
  if (subject.kind === "new_external") {
    return {
      key: `external:${subject.clientKey}`,
      label: subject.displayName,
      detail: subject.entityKind === "group" ? "새 그룹" : "새 외부 인물",
      subject,
    };
  }
  if (subject.kind === "member") {
    const entity = catalog.entities.find(
      (candidate) => candidate.memberUid === subject.memberUid,
    );
    return {
      key: entity ? `entity:${entity.id}` : `member:${subject.memberUid}`,
      label: entity?.displayName ?? `멤버 UID ${subject.memberUid}`,
      detail: "OTW 멤버",
      subject,
    };
  }
  const entity = catalog.entities.find(
    (candidate) => candidate.id === subject.entityId,
  );
  return {
    key: `entity:${subject.entityId}`,
    label: entity?.displayName ?? subject.entityId,
    detail: entity?.memberUid !== null && entity?.memberUid !== undefined
      ? "OTW 멤버"
      : entity?.entityKind === "group"
        ? "기존 그룹"
        : "기존 외부 인물",
    subject,
  };
};

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
    draft.originalArtists = input.song.originalArtists.map((artist) =>
      subjectFromInput(artist.subject, catalog)
    );
  }
  const participantEntries = input.participants.map((participant) => ({
    ...subjectFromInput(participant.subject, catalog),
    participantRole: participant.participantRole,
  }));
  draft.participants = Object.fromEntries(participantEntries.flatMap((participant) => {
    const subject = participant.subject;
    const entity = subject.kind === "entity"
      ? catalog.entities.find((candidate) => candidate.id === subject.entityId)
      : subject.kind === "member"
        ? catalog.entities.find((candidate) => candidate.memberUid === subject.memberUid)
        : null;
    return entity?.memberUid !== null && entity?.memberUid !== undefined
      ? [[entity.id, participant.participantRole]]
      : [];
  }));
  draft.externalParticipants = participantEntries.filter((participant) => {
    const subject = participant.subject;
    if (subject.kind === "new_external") return true;
    if (subject.kind === "member") return false;
    const entity = catalog.entities.find(
      (candidate) => candidate.id === subject.entityId,
    );
    return entity?.memberUid === null || entity === undefined;
  });
  draft.showExternalParticipantInput = draft.externalParticipants.length > 0;
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
  const memberParticipants = Object.entries(draft.participants).map(
    ([entityId, participantRole], creditOrder) => ({
      subject: { kind: "entity" as const, entityId },
      participantRole,
      creditOrder,
      creditNameSnapshot:
        catalog.entities.find((entity) => entity.id === entityId)?.displayName ??
        entityId,
    }),
  );
  const participants = [
    ...memberParticipants,
    ...draft.externalParticipants.map((participant, index) => ({
      subject: participant.subject,
      participantRole: participant.participantRole,
      creditOrder: memberParticipants.length + index,
      creditNameSnapshot: participant.label,
    })),
  ];
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
        originalArtists: draft.originalArtists.map((artist, creditOrder) => ({
          subject: artist.subject,
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

function ReviewApplicationPreview({
  item,
  draft,
  catalog,
}: {
  item: OtwPlayIngestionCandidateItemDto;
  draft: RowDraft;
  catalog: OtwPlayAdminCatalogDto;
}) {
  const existingSong = draft.songId === "__new"
    ? null
    : catalog.songs.find((song) => song.id === draft.songId);
  const songTitle = draft.songId === "__new"
    ? draft.songTitle.trim()
    : existingSong?.title ?? draft.songId;
  const participants = [
    ...Object.entries(draft.participants).map(([entityId, role]) => ({
      key: `entity:${entityId}`,
      label:
        catalog.entities.find((entity) => entity.id === entityId)?.displayName ??
        entityId,
      role,
    })),
    ...draft.externalParticipants.map((participant) => ({
      key: participant.key,
      label: participant.label,
      role: participant.participantRole,
    })),
  ];
  const missingFields = [
    draft.songId === "__new" && !songTitle ? "원곡 제목" : null,
    draft.songId === "__new" && draft.originalArtists.length === 0
      ? "원곡 가수"
      : null,
    participants.length === 0 ? "가창 참여자" : null,
  ].filter((value): value is string => value !== null);

  return (
    <section
      className="min-w-64 space-y-2 rounded-lg border bg-muted/20 p-3"
      aria-label={`${item.title ?? item.videoId} 적용 미리보기`}
    >
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-xs font-semibold">적용 미리보기</h4>
        <Badge className="shrink-0" variant={missingFields.length === 0 ? "secondary" : "outline"}>
          {missingFields.length === 0 ? "저장 준비됨" : `필수값 ${missingFields.length}개`}
        </Badge>
      </div>

      <dl className="grid gap-1.5 text-xs">
        <div className="grid grid-cols-[4rem_minmax(0,1fr)] gap-2">
          <dt className="text-muted-foreground">곡</dt>
          <dd className="min-w-0 truncate font-medium">
            {draft.songId === "__new" ? "새 곡 생성" : "기존 곡 연결"}
            {songTitle ? ` · ${songTitle}` : " · 제목 입력 필요"}
          </dd>
        </div>
        <div className="grid grid-cols-[4rem_minmax(0,1fr)] gap-2">
          <dt className="text-muted-foreground">원곡 가수</dt>
          <dd className="min-w-0 truncate font-medium">
            {draft.songId === "__new"
              ? draft.originalArtists.map((artist) => artist.label).join(", ") || "입력 필요"
              : "기존 곡 정보 유지"}
          </dd>
        </div>
        <div className="grid grid-cols-[4rem_minmax(0,1fr)] gap-2">
          <dt className="text-muted-foreground">가창자</dt>
          <dd className="min-w-0 truncate font-medium">
            {participants.map((participant) =>
              `${participant.label} · ${participantRoleLabels[participant.role]}`
            ).join(", ") || "입력 필요"}
          </dd>
        </div>
        <div className="grid grid-cols-[4rem_minmax(0,1fr)] gap-2">
          <dt className="text-muted-foreground">공개 분류</dt>
          <dd className="min-w-0 truncate font-medium">
            {relationOptions.find((option) => option.value === draft.relationType)?.label}
            {" · "}
            {releaseOptions.find((option) => option.value === draft.releaseType)?.label}
            {" · "}
            {participationOptions.find((option) => option.value === draft.participationType)?.label}
          </dd>
        </div>
      </dl>

      {missingFields.length > 0 ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          저장 전 확인: {missingFields.join(", ")}
        </p>
      ) : null}
    </section>
  );
}

const bulkIgnorableAvailability = new Set<
  OtwPlayIngestionCandidateItemDto["availabilityStatus"]
>([
  "private",
  "embed_disabled",
  "deleted",
  "region_blocked",
  "unavailable",
]);

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
  const [bulkIgnoreConfirmOpen, setBulkIgnoreConfirmOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [extraItems, setExtraItems] = useState<OtwPlayIngestionCandidateItemDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const jobQuery = useOtwPlayImportJob(activeJobId);
  const serverClassification = classification === "all"
    ? undefined
    : classification;
  const itemsQuery = useOtwPlayImportJobItems(
    activeJobId,
    serverClassification,
  );
  const refetchItems = itemsQuery.refetch;
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
    if (!activeJobId || jobQuery.data?.updatedAt === undefined) return;
    void refetchItems();
  }, [activeJobId, refetchItems, jobQuery.data?.updatedAt]);

  useEffect(() => {
    setDrafts((current) => {
      if (!editingId) return current;
      const item = items.find((candidate) => candidate.candidateId === editingId);
      const existing = current[editingId];
      if (!item || existing?.isDirty) return current;
      if (
        existing?.baseVersion === item.candidateVersion &&
        existing.baseStatus === item.status &&
        JSON.stringify(existing.baseReviewInput) === JSON.stringify(item.reviewInput)
      ) {
        return current;
      }
      return { ...current, [editingId]: draftFromItem(item, catalog) };
    });
  }, [catalog, editingId, items]);

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

  const saveCandidate = async (item: OtwPlayIngestionCandidateItemDto) => {
    setBusy(`save:${item.candidateId}`);
    try {
      const draft = drafts[item.candidateId] ?? emptyDraft(item);
      const saved = await updateOtwPlayImportCandidate(item.candidateId, {
        expectedVersion: draft.baseVersion,
        expectedReviewInput: draft.baseReviewInput,
        expectedReviewStatus: draft.baseStatus,
        action: "save",
        input: buildReviewInput(draft, catalog),
      });
      setDrafts((current) => {
        const currentDraft = current[item.candidateId];
        return currentDraft
          ? {
              ...current,
              [item.candidateId]: {
                ...currentDraft,
                baseVersion: saved.version,
                baseReviewInput: saved.reviewInput,
                baseStatus: saved.status,
                isDirty: false,
              },
            }
          : current;
      });
      try {
        await refresh();
      } catch {
        toast({
          variant: "info",
          description: "검수 입력은 저장되었지만 최신 목록을 불러오지 못했습니다. 권위 상태 새로고침을 다시 실행해 주세요.",
        });
        return;
      }
      toast({ variant: "success", description: "검수 입력을 ready 상태로 저장했습니다." });
    } catch (error) {
      if (error instanceof ApiError && error.code === "PLAY_ADMIN_STALE_WRITE") {
        try {
          await refresh();
          toast({
            variant: "info",
            description: "다른 검수 변경이 먼저 저장되었습니다. 입력값은 유지한 채 최신 상태를 불러왔습니다.",
          });
        } catch {
          toast({
            variant: "error",
            description: "다른 검수 변경이 먼저 저장되었습니다. 입력값은 유지했지만 최신 상태를 불러오지 못했습니다.",
          });
        }
        return;
      }
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

  const ignoreUnavailableCandidates = async () => {
    if (!activeJobId) return;
    setBusy("ignore-unavailable");
    try {
      const loaded: OtwPlayIngestionCandidateItemDto[] = [];
      let cursor: string | null = null;
      let pageCount = 0;
      do {
        const page = await fetchOtwPlayImportJobItems(activeJobId, {
          limit: 100,
          cursor,
          status: "blocked",
        });
        loaded.push(...page.items);
        cursor = page.nextCursor;
        pageCount += 1;
      } while (cursor && pageCount < 50);
      if (cursor) throw new Error("bulk_ignore_page_limit");

      const candidates = [...new Map(
        loaded
          .filter((item) =>
            item.status === "blocked" &&
            bulkIgnorableAvailability.has(item.availabilityStatus)
          )
          .map((item) => [
            item.candidateId,
            { id: item.candidateId, expectedVersion: item.candidateVersion },
          ]),
      ).values()];
      if (candidates.length === 0) {
        toast({
          variant: "info",
          description: "일괄 제외할 숨김·삭제·재생 불가 영상이 없습니다.",
        });
        return;
      }

      const results: OtwPlayIngestionIgnoreResultDto[] = [];
      let requestFailureCount = 0;
      const reviewIds: string[] = [];
      for (const chunk of chunkOtwPlayIngestionSelections(candidates)) {
        try {
          const response = await ignoreOtwPlayImportCandidates(activeJobId, {
            candidates: chunk,
          });
          results.push(...response.results);
          reviewIds.push(...response.results
            .filter((result) => result.outcome !== "ignored")
            .map((result) => result.candidateId));
        } catch {
          requestFailureCount += chunk.length;
          reviewIds.push(...chunk.map((item) => item.id));
        }
      }
      let refreshFailed = false;
      try {
        await refresh();
      } catch {
        refreshFailed = true;
      }
      setSelected(new Set(reviewIds));
      const ignored = results.filter((result) => result.outcome === "ignored").length;
      const needsReview = results.length - ignored + requestFailureCount;
      toast({
        variant: needsReview > 0 || refreshFailed ? "info" : "success",
        description: refreshFailed
          ? `숨김·삭제·재생 불가 영상 ${ignored}건 제외, 별도 확인 ${needsReview}건입니다. 최신 목록은 다시 불러와 주세요.`
          : `숨김·삭제·재생 불가 영상 ${ignored}건 제외, 별도 확인 ${needsReview}건입니다.`,
      });
    } catch {
      toast({
        variant: "error",
        description: "숨김·삭제·재생 불가 영상을 일괄 제외하지 못했습니다.",
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
            <div className="flex flex-wrap items-center gap-2">
              <Select value={classification} onValueChange={(value) => setClassification(value as typeof classification)}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 분류</SelectItem><SelectItem value="eligible">eligible</SelectItem><SelectItem value="existing_candidate">existing candidate</SelectItem><SelectItem value="channel_review">channel review</SelectItem><SelectItem value="existing_catalog">existing catalog</SelectItem><SelectItem value="existing_proposal">existing proposal</SelectItem><SelectItem value="unavailable">unavailable</SelectItem><SelectItem value="policy_blocked">policy blocked</SelectItem><SelectItem value="scope_review">scope review</SelectItem><SelectItem value="playlist_duplicate">playlist duplicate</SelectItem></SelectContent></Select>
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setBulkIgnoreConfirmOpen(true)}>
                {busy === "ignore-unavailable" ? <Loader2 className="animate-spin" /> : <EyeOff />}
                숨김·삭제 영상 일괄 제외
              </Button>
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void selectCurrentFilter()}>{busy === "select-filter" ? <Loader2 className="animate-spin" /> : null} 현재 filter 전체 선택</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>선택 해제</Button>
              <Button className="ml-auto" disabled={selectedReady === 0 || busy !== null} onClick={() => void convertSelected()}>선택 ready {selectedReady}건 draft 변환</Button>
            </div>

            <AlertDialog open={bulkIgnoreConfirmOpen} onOpenChange={setBulkIgnoreConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>숨김·삭제 영상을 일괄 제외할까요?</AlertDialogTitle>
                  <AlertDialogDescription>
                    현재 filter와 관계없이 이 job 전체에서 private, 삭제, embed 차단,
                    지역 차단, 재생 불가로 확인된 영상만 제외합니다. 상태가 unknown이거나
                    정책 검토가 필요한 후보는 유지합니다.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void ignoreUnavailableCandidates()}>
                    일괄 제외 실행
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <div className={`grid items-start gap-4 ${editingId ? "xl:grid-cols-[minmax(0,1fr)_minmax(24rem,28rem)]" : ""}`}>
              <div className="min-w-0 space-y-3">
                <div className="hidden overflow-x-auto rounded-xl border md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">선택</TableHead>
                        <TableHead>영상</TableHead>
                        <TableHead>적용 미리보기</TableHead>
                        <TableHead>채널</TableHead>
                        <TableHead>위치·시간</TableHead>
                        <TableHead>분류</TableHead>
                        <TableHead className="text-right">작업</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((item) => {
                        const previewDraft = drafts[item.candidateId] ??
                          draftFromItem(item, catalog);
                        return (
                          <TableRow
                            key={item.originId}
                            data-state={editingId === item.candidateId ? "selected" : undefined}
                          >
                            <TableCell>
                              <Checkbox
                                checked={selected.has(item.candidateId)}
                                onCheckedChange={(checked) => setSelected((current) => {
                                  const next = new Set(current);
                                  if (checked) next.add(item.candidateId);
                                  else next.delete(item.candidateId);
                                  return next;
                                })}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex min-w-72 gap-3">
                                {item.thumbnailUrl ? (
                                  <img className="h-14 w-24 rounded object-cover" src={item.thumbnailUrl} alt="YouTube thumbnail" />
                                ) : (
                                  <div className="h-14 w-24 rounded bg-muted" />
                                )}
                                <div>
                                  <div className="line-clamp-2 font-medium">{item.title ?? item.videoId}</div>
                                  <a className="text-xs text-primary underline" href={sourceUrl(item.videoId)} target="_blank" rel="noreferrer">
                                    YouTube 원문 <ExternalLink className="inline size-3" />
                                  </a>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <ReviewApplicationPreview item={item} draft={previewDraft} catalog={catalog} />
                            </TableCell>
                            <TableCell>{item.channelTitle ?? "-"}</TableCell>
                            <TableCell>#{item.playlistPosition + 1} · {formatDuration(item.durationSeconds)}</TableCell>
                            <TableCell>
                              <Badge variant={item.status === "blocked" ? "destructive" : "secondary"}>{item.classification}</Badge>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {item.status}{item.exclusionReason ? ` · ${item.exclusionReason}` : ""}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant={editingId === item.candidateId ? "secondary" : "outline"}
                                aria-pressed={editingId === item.candidateId}
                                onClick={() => setEditingId(item.candidateId)}
                              >
                                {editingId === item.candidateId ? "편집 중" : "행별 보완"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <div className="space-y-3 md:hidden">
                  {filtered.map((item) => {
                    const previewDraft = drafts[item.candidateId] ??
                      draftFromItem(item, catalog);
                    return (
                      <div
                        key={item.originId}
                        data-state={editingId === item.candidateId ? "selected" : undefined}
                        className="space-y-3 rounded-xl border p-3 data-[state=selected]:border-primary data-[state=selected]:bg-primary/5"
                      >
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={selected.has(item.candidateId)}
                            onCheckedChange={(checked) => setSelected((current) => {
                              const next = new Set(current);
                              if (checked) next.add(item.candidateId);
                              else next.delete(item.candidateId);
                              return next;
                            })}
                          />
                          {item.thumbnailUrl ? (
                            <img className="h-14 w-24 rounded object-cover" src={item.thumbnailUrl} alt="YouTube thumbnail" />
                          ) : null}
                          <div className="min-w-0">
                            <div className="line-clamp-2 font-medium">{item.title ?? item.videoId}</div>
                            <div className="text-xs text-muted-foreground">#{item.playlistPosition + 1} · {formatDuration(item.durationSeconds)}</div>
                          </div>
                        </div>
                        <ReviewApplicationPreview item={item} draft={previewDraft} catalog={catalog} />
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary">{item.classification}</Badge>
                          <Button
                            size="sm"
                            variant={editingId === item.candidateId ? "secondary" : "outline"}
                            aria-pressed={editingId === item.candidateId}
                            onClick={() => setEditingId(item.candidateId)}
                          >
                            {editingId === item.candidateId ? "편집 중" : "행별 보완"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {nextCursor && <Button variant="outline" className="w-full" disabled={busy !== null} onClick={() => void loadMore()}>{busy === "more" ? <Loader2 className="animate-spin" /> : null} 다음 100개 불러오기</Button>}
                {itemsQuery.isLoading && <Loader2 className="mx-auto animate-spin" />}
              </div>

            {editingId && (() => {
              const item = items.find((candidate) => candidate.candidateId === editingId);
              const draft = item ? drafts[item.candidateId] : null;
              if (!item || !draft) return null;
              const updateDraft = (change: Partial<RowDraft>) => setDrafts((current) => ({
                ...current,
                [item.candidateId]: { ...draft, ...change, isDirty: true },
              }));
              return (
                <aside className="min-w-0 xl:sticky xl:top-4" aria-label="후보 행별 보완">
                <section className="overflow-hidden rounded-xl border bg-background shadow-sm xl:flex xl:max-h-[calc(100dvh-2rem)] xl:flex-col" aria-labelledby={`candidate-editor-${item.candidateId}`}>
                  <div className="flex items-start justify-between gap-3 border-b bg-muted/20 p-4 xl:shrink-0">
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

                  <div className="space-y-5 p-4 xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain">
                    <fieldset className="space-y-4 rounded-lg border bg-muted/10 p-4">
                      <legend className="px-1 text-sm font-semibold">곡 정보</legend>
                      <div className="grid gap-4">
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
                          <SubjectPicker
                            label="원곡 가수"
                            placeholder="가수명을 검색하거나 새 외부 가수로 추가"
                            helpText="기존 OTW 멤버·외부 가수를 검색해 선택하거나, 없는 가수는 새 외부 identity로 추가합니다."
                            members={[]}
                            entities={catalog.entities}
                            selected={draft.originalArtists}
                            onChange={(originalArtists) => updateDraft({ originalArtists })}
                            includeMemberEntities
                          />
                        </>
                      ) : null}
                    </fieldset>

                    <fieldset className="space-y-3 rounded-lg border bg-muted/10 p-4">
                      <legend className="px-1 text-sm font-semibold">가창 참여자와 역할</legend>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        기본 목록에는 OTW 멤버만 표시됩니다. 외부 가창자는 아래 옵션을 켠 뒤 별도로 추가합니다.
                      </p>
                      <div className="grid gap-2">
                        {catalog.entities
                          .filter(
                            (entity) =>
                              entity.archivedAt === null &&
                              entity.memberUid !== null,
                          )
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
                      <label
                        htmlFor={`external-participant-${item.candidateId}`}
                        className="flex cursor-pointer items-start gap-3 rounded-lg border bg-background p-3 hover:bg-muted/40"
                      >
                        <Checkbox
                          id={`external-participant-${item.candidateId}`}
                          checked={draft.showExternalParticipantInput}
                          onCheckedChange={(checked) => updateDraft({
                            showExternalParticipantInput: checked === true,
                            externalParticipants: checked === true
                              ? draft.externalParticipants
                              : [],
                          })}
                        />
                        <span>
                          <span className="block text-sm font-medium">외부 가창자 추가</span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                            OTW 멤버가 아닌 가창자가 실제로 참여한 경우에만 사용합니다.
                          </span>
                        </span>
                      </label>
                      {draft.showExternalParticipantInput ? (
                        <div className="space-y-3 rounded-lg border border-dashed bg-background p-3">
                          <SubjectPicker
                            label="외부 가창자"
                            placeholder="외부 인물·그룹을 검색하거나 새로 추가"
                            helpText="기존 외부 identity를 선택하거나 새 외부 인물·그룹을 추가합니다."
                            members={[]}
                            entities={catalog.entities}
                            selected={draft.externalParticipants}
                            onChange={(subjects) => {
                              const currentByKey = new Map(
                                draft.externalParticipants.map((participant) => [
                                  participant.key,
                                  participant,
                                ]),
                              );
                              updateDraft({
                                externalParticipants: subjects.map((subject) => ({
                                  ...subject,
                                  participantRole:
                                    currentByKey.get(subject.key)?.participantRole ?? "vocal",
                                })),
                              });
                            }}
                          />
                          {draft.externalParticipants.map((participant) => (
                            <Field key={participant.key} orientation="horizontal">
                              <FieldLabel className="min-w-0 flex-1 truncate">
                                {participant.label}
                              </FieldLabel>
                              <Select
                                value={participant.participantRole}
                                onValueChange={(value) => updateDraft({
                                  externalParticipants: draft.externalParticipants.map((candidate) =>
                                    candidate.key === participant.key
                                      ? {
                                          ...candidate,
                                          participantRole: value as OtwPlayParticipantRole,
                                        }
                                      : candidate
                                  ),
                                })}
                              >
                                <SelectTrigger
                                  size="sm"
                                  className="w-32"
                                  aria-label={`${participant.label} 참여 역할`}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(participantRoleLabels).map(([value, label]) => (
                                    <SelectItem key={value} value={value}>{label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </Field>
                          ))}
                        </div>
                      ) : null}
                    </fieldset>

                    <section className="space-y-5 rounded-lg border bg-muted/10 p-4" aria-labelledby={`classification-${item.candidateId}`}>
                      <div>
                        <h4 id={`classification-${item.candidateId}`} className="text-sm font-semibold">공개 분류</h4>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          카탈로그 검색과 표시에 사용되는 값을 확인합니다.
                        </p>
                      </div>
                      <div className="grid gap-5">
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

                  <div className="flex flex-wrap items-center gap-2 border-t bg-muted/20 p-4 xl:shrink-0">
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
                </aside>
              );
            })()}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
