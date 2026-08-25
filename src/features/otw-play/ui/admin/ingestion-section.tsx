import { Fragment, useEffect, useMemo, useState } from "react";
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
  OtwPlayPublicChannelRole,
  OtwPlayRelationType,
  OtwPlayUpdateIngestionCandidateRequest,
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
  useOtwPlayImportJobs,
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

type ChannelOwnershipKind = "member" | "otw_official" | "external";
type ChannelApprovalInput = Extract<
  OtwPlayUpdateIngestionCandidateRequest,
  { action: "approve_channel" }
>["channel"];

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
  channelOwnershipKind: ChannelOwnershipKind;
  channelRole: OtwPlayPublicChannelRole;
  channelOwnerEntityIds: string[];
  externalChannelApprovalConfirmed: boolean;
};

const participantRoleLabels: Record<OtwPlayParticipantRole, string> = {
  vocal: "메인 보컬",
  featured_vocal: "피처링 보컬",
  chorus: "코러스",
  other: "기타 참여",
};

const officialChannelRoleLabels: Record<OtwPlayPublicChannelRole, string> = {
  otw_official: "OTW 공식",
  unit_official: "유닛 공식",
  member_music: "멤버 노래 채널",
  member_main: "멤버 메인 채널",
  project_official: "승인 프로젝트",
};

const primaryChannelOwnershipOptions = [
  {
    value: "member",
    label: "멤버 공식 채널",
    description: "OTW 멤버의 메인 또는 노래 채널이며, 연결 주체는 멤버만 선택합니다.",
  },
  {
    value: "otw_official",
    label: "오버더월 공식 채널",
    description: "오버더월이 직접 소유·운영하는 공식 채널로 승인합니다.",
  },
] satisfies readonly ChoiceOption<ChannelOwnershipKind>[];

const channelOwnershipLabels: Record<ChannelOwnershipKind, string> = {
  member: "멤버 공식",
  otw_official: "오버더월 공식",
  external: "외부 채널 별도 승인",
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
  channelOwnershipKind: "member",
  channelRole: "member_music",
  channelOwnerEntityIds: [],
  externalChannelApprovalConfirmed: false,
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
  const channel = catalog.channels.find(
    (candidate) => candidate.externalChannelId === item.channelId,
  );
  if (channel && channel.channelRole in officialChannelRoleLabels) {
    draft.channelRole = channel.channelRole as OtwPlayPublicChannelRole;
    draft.channelOwnerEntityIds = channel.entityIds;
    draft.channelOwnershipKind = channel.channelRole === "otw_official"
      ? "otw_official"
      : channel.channelRole === "member_music" || channel.channelRole === "member_main"
        ? "member"
        : "external";
    draft.externalChannelApprovalConfirmed =
      draft.channelOwnershipKind === "external" &&
      channel.verificationStatus === "approved";
  }
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

const candidateStatusPresentations: Record<
  OtwPlayIngestionCandidateItemDto["status"],
  { label: string; description: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  discovered: {
    label: "검수 시작 전",
    description: "가져온 뒤 아직 검수값을 저장하지 않았습니다.",
    variant: "outline",
  },
  needs_input: {
    label: "입력 보완 필요",
    description: "필수 정보 또는 채널 승인을 완료해야 합니다.",
    variant: "secondary",
  },
  ready: {
    label: "저장 준비 완료",
    description: "검수가 끝나 일괄 저장할 수 있습니다.",
    variant: "default",
  },
  converted: {
    label: "카탈로그 임시 저장 완료",
    description: "카탈로그 draft로 변환되었습니다.",
    variant: "secondary",
  },
  ignored: {
    label: "검수 목록에서 제외",
    description: "관리자가 이 후보를 제외했습니다.",
    variant: "outline",
  },
  blocked: {
    label: "처리 중단",
    description: "오류 또는 정책 사유를 먼저 해결해야 합니다.",
    variant: "destructive",
  },
};

const candidateClassificationLabels: Record<
  OtwPlayIngestionClassification,
  string
> = {
  pending_metadata: "YouTube 정보 확인 중",
  eligible: "카탈로그 등록 가능",
  existing_catalog: "이미 카탈로그에 등록됨",
  existing_proposal: "회원 제안에서 검수 중",
  existing_candidate: "기존 후보를 다시 발견함",
  channel_review: "공식 채널 승인 필요",
  policy_blocked: "채널 정책 확인 필요",
  unavailable: "재생할 수 없는 영상",
  scope_review: "공개 범위 확인 필요",
  playlist_duplicate: "같은 플레이리스트 안의 중복 영상",
};

const candidateNextAction = (item: OtwPlayIngestionCandidateItemDto) => {
  if (item.status === "ready") return "ready 완료 항목 일괄 저장";
  if (item.status === "converted" || item.status === "ignored") return "추가 조치 없음";
  if (item.candidateClassification === "channel_review") return "행별 보완에서 공식 채널 승인";
  if (item.candidateClassification === "pending_metadata") return "YouTube 정보 갱신 대기";
  if (item.candidateClassification === "existing_catalog") return "기존 카탈로그 항목 확인";
  if (item.candidateClassification === "existing_proposal") return "회원 제안 검수에서 처리";
  if (item.candidateClassification === "unavailable") return "영상 제외 또는 metadata 재확인";
  if (item.candidateClassification === "policy_blocked") return "채널 정책 검토";
  if (item.candidateClassification === "scope_review") return "영상 범위 확인 후 행별 보완";
  if (item.status === "blocked") return "오류 사유 확인 후 metadata 갱신";
  return "행별 보완 후 ready로 저장";
};

function CandidateStateSummary({ item }: { item: OtwPlayIngestionCandidateItemDto }) {
  const status = candidateStatusPresentations[item.status];
  const classification = candidateClassificationLabels[item.candidateClassification];
  const importedAs = candidateClassificationLabels[item.classification];

  return (
    <div
      className="space-y-1.5 whitespace-normal"
      aria-label={`${item.title ?? item.videoId} 현재 상태`}
      title={`${item.status} / ${item.candidateClassification}`}
    >
      <Badge variant={status.variant}>{status.label}</Badge>
      <p className="text-xs leading-relaxed">
        <span className="font-medium text-foreground">현재 판단</span>
        <span className="text-muted-foreground"> · {classification}</span>
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">{status.description}</p>
      <p className="text-xs leading-relaxed">
        <span className="font-medium text-foreground">다음 조치</span>
        <span className="text-muted-foreground"> · {candidateNextAction(item)}</span>
      </p>
      {item.classification !== item.candidateClassification ? (
        <p className="border-t pt-1 text-[11px] leading-relaxed text-muted-foreground">
          가져오기 기록 · {importedAs}
        </p>
      ) : null}
      {item.exclusionReason ? (
        <p className="text-[11px] leading-relaxed text-destructive">
          제외 사유 · {item.exclusionReason}
        </p>
      ) : null}
    </div>
  );
}

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
    !item.catalogChannelId ? "공식 채널 승인" : null,
  ].filter((value): value is string => value !== null);
  const channel = catalog.channels.find(
    (candidate) => candidate.externalChannelId === item.channelId,
  );

  return (
    <section
      className="space-y-3 rounded-lg border bg-muted/20 p-3"
      aria-label={`${item.title ?? item.videoId} 변경 예정 항목`}
    >
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-xs font-semibold">변경 예정</h4>
        <Badge className="shrink-0" variant={missingFields.length === 0 ? "secondary" : "outline"}>
          {missingFields.length === 0 ? "저장 준비됨" : `필수값 ${missingFields.length}개`}
        </Badge>
      </div>

      <dl className="grid gap-2 text-xs sm:grid-cols-2 2xl:grid-cols-5">
        <div className="min-w-0 rounded-md border bg-background p-2.5">
          <dt className="mb-1 text-muted-foreground">곡</dt>
          <dd className="line-clamp-2 font-medium">
            {draft.songId === "__new" ? "새 곡 생성" : "기존 곡 연결"}
            {songTitle ? ` · ${songTitle}` : " · 제목 입력 필요"}
          </dd>
        </div>
        <div className="min-w-0 rounded-md border bg-background p-2.5">
          <dt className="mb-1 text-muted-foreground">원곡 가수</dt>
          <dd className="line-clamp-2 font-medium">
            {draft.songId === "__new"
              ? draft.originalArtists.map((artist) => artist.label).join(", ") || "입력 필요"
              : "기존 곡 정보 유지"}
          </dd>
        </div>
        <div className="min-w-0 rounded-md border bg-background p-2.5">
          <dt className="mb-1 text-muted-foreground">가창자</dt>
          <dd className="line-clamp-2 font-medium">
            {participants.map((participant) =>
              `${participant.label} · ${participantRoleLabels[participant.role]}`
            ).join(", ") || "입력 필요"}
          </dd>
        </div>
        <div className="min-w-0 rounded-md border bg-background p-2.5">
          <dt className="mb-1 text-muted-foreground">공개 분류</dt>
          <dd className="line-clamp-2 font-medium">
            {relationOptions.find((option) => option.value === draft.relationType)?.label}
            {" · "}
            {releaseOptions.find((option) => option.value === draft.releaseType)?.label}
            {" · "}
            {participationOptions.find((option) => option.value === draft.participationType)?.label}
          </dd>
        </div>
        <div className="min-w-0 rounded-md border bg-background p-2.5 sm:col-span-2 2xl:col-span-1">
          <dt className="mb-1 text-muted-foreground">공식 채널</dt>
          <dd className="line-clamp-2 font-medium">
            {item.catalogChannelId
              ? `승인 · ${item.channelTitle ?? item.channelId}`
              : channel
                ? `${channel.verificationStatus} · ${officialChannelRoleLabels[draft.channelRole]}`
                : `${channelOwnershipLabels[draft.channelOwnershipKind]} · 승인 필요`}
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

const candidateReviewBlockedReason = (
  item: OtwPlayIngestionCandidateItemDto,
) => {
  if (item.status === "converted") {
    return "이미 catalog draft로 변환된 후보입니다.";
  }
  if (item.status === "ignored") {
    return "이미 제외된 후보입니다.";
  }
  if (item.candidateClassification === "existing_catalog") {
    return "이미 카탈로그에 등록된 영상이므로 후보 검수값을 저장하지 않습니다.";
  }
  if (item.candidateClassification === "existing_proposal") {
    return "검수 대기 중인 회원 제안이 있어 후보 검수값을 저장하지 않습니다.";
  }
  if (
    item.candidateClassification === "unavailable" ||
    item.candidateClassification === "policy_blocked"
  ) {
    return "재생 가능 여부 또는 채널 정책을 먼저 확인해야 합니다.";
  }
  if (item.candidateClassification === "pending_metadata") {
    return "YouTube metadata 수집이 끝난 뒤 ready로 저장할 수 있습니다.";
  }
  if (item.candidateClassification === "channel_review" || !item.catalogChannelId) {
    return "아래에서 공식 채널을 승인하면 ready 검수를 이어갈 수 있습니다.";
  }
  return ["eligible", "scope_review"].includes(item.candidateClassification)
    ? null
    : "현재 후보 상태에서는 ready로 저장할 수 없습니다.";
};

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
  const [classification, setClassification] = useState<
    OtwPlayIngestionClassification | "all"
  >("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bulkIgnoreConfirmOpen, setBulkIgnoreConfirmOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [extraItems, setExtraItems] = useState<OtwPlayIngestionCandidateItemDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const jobsQuery = useOtwPlayImportJobs();
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
  const filtered = items.filter(
    (item) => item.status !== "converted" && item.status !== "ignored",
  );

  useEffect(() => {
    if (!activeJobId && jobsQuery.data?.[0]) setActiveJobId(jobsQuery.data[0].id);
  }, [activeJobId, jobsQuery.data]);

  useEffect(() => {
    setExtraItems([]);
    setNextCursor(null);
    setDrafts({});
  }, [activeJobId]);

  useEffect(() => {
    setExtraItems([]);
    setNextCursor(null);
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
      queryClient.invalidateQueries({
        queryKey: queryKeys.otwPlay.importJobs(),
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.otwPlay.importJobs() });
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
      if (error instanceof ApiError && error.code === "PLAY_ADMIN_VALIDATION_FAILED") {
        toast({
          variant: "info",
          description: candidateReviewBlockedReason(item) ??
            "후보의 최신 분류 또는 채널 상태를 확인한 뒤 다시 시도해 주세요.",
        });
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
    } catch (error) {
      if (error instanceof ApiError && error.code === "PLAY_ADMIN_STALE_WRITE") {
        try {
          await refresh();
          toast({
            variant: "info",
            description: "후보 상태가 먼저 변경되었습니다. 최신 상태를 불러왔으니 다시 시도해 주세요.",
          });
        } catch {
          toast({
            variant: "error",
            description: "후보 상태가 먼저 변경되었고 최신 목록도 불러오지 못했습니다. 권위 상태 새로고침을 다시 실행해 주세요.",
          });
        }
        return;
      }
      toast({
        variant: "error",
        description: action === "ignore"
          ? "후보를 제외하지 못했습니다."
          : "영상 metadata를 새로고침하지 못했습니다.",
      });
    } finally {
      setBusy(null);
    }
  };

  const approveCandidateChannel = async (
    item: OtwPlayIngestionCandidateItemDto,
  ) => {
    const draft = drafts[item.candidateId] ?? emptyDraft(item);
    if (
      draft.channelOwnershipKind !== "otw_official" &&
      draft.channelOwnerEntityIds.length === 0
    ) {
      toast({
        variant: "error",
        description: "공식 채널의 소유·연결 주체를 한 명 이상 선택해 주세요.",
      });
      return;
    }
    if (
      draft.channelOwnershipKind === "external" &&
      !draft.externalChannelApprovalConfirmed
    ) {
      toast({
        variant: "error",
        description: "외부 채널 추가·승인 확인 항목을 선택해 주세요.",
      });
      return;
    }
    const channel: ChannelApprovalInput = draft.channelOwnershipKind === "otw_official"
      ? {
          ownershipKind: "otw_official",
          channelRole: "otw_official",
          entityIds: [],
        }
      : draft.channelOwnershipKind === "external"
        ? {
            ownershipKind: "external",
            channelRole: "project_official",
            entityIds: draft.channelOwnerEntityIds,
            externalApprovalConfirmed: true,
          }
        : {
            ownershipKind: "member",
            channelRole: draft.channelRole === "member_main"
              ? "member_main"
              : "member_music",
            entityIds: draft.channelOwnerEntityIds,
          };
    setBusy(`approve-channel:${item.candidateId}`);
    try {
      const saved = await updateOtwPlayImportCandidate(item.candidateId, {
        expectedVersion: item.candidateVersion,
        action: "approve_channel",
        channel,
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
              },
            }
          : current;
      });
      await refresh();
      toast({
        variant: "success",
        description: "공식 채널을 승인하고 후보 상태를 갱신했습니다.",
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === "PLAY_ADMIN_STALE_WRITE") {
        try {
          await refresh();
          toast({
            variant: "info",
            description: "후보 또는 채널 상태가 먼저 변경되었습니다. 최신 상태를 확인해 주세요.",
          });
        } catch {
          toast({
            variant: "error",
            description: "후보 또는 채널 상태가 먼저 변경되었고 최신 목록도 불러오지 못했습니다.",
          });
        }
        return;
      }
      toast({
        variant: "error",
        description: error instanceof Error
          ? error.message
          : "공식 채널 승인에 실패했습니다.",
      });
    } finally {
      setBusy(null);
    }
  };

  const convertReadyCandidates = async () => {
    if (!activeJobId) return;
    setBusy("convert-ready");
    try {
      const loaded: OtwPlayIngestionCandidateItemDto[] = [];
      let cursor: string | null = null;
      let pageCount = 0;
      do {
        const page = await fetchOtwPlayImportJobItems(activeJobId, {
          limit: 100,
          cursor,
          status: "ready",
        });
        loaded.push(...page.items);
        cursor = page.nextCursor;
        pageCount += 1;
      } while (cursor && pageCount < 50);
      if (cursor) throw new Error("bulk_conversion_page_limit");
      const candidates = [...new Map(
        loaded.map((item) => [
          item.candidateId,
          { id: item.candidateId, expectedVersion: item.candidateVersion },
        ]),
      ).values()];
      if (candidates.length === 0) {
        toast({
          variant: "info",
          description: "일괄 저장할 ready 완료 항목이 없습니다.",
        });
        return;
      }

      const results: OtwPlayIngestionConversionResultDto[] = [];
      let requestFailureCount = 0;
      for (const chunk of chunkOtwPlayIngestionSelections(candidates)) {
        try {
          const response = await convertOtwPlayImportCandidates(activeJobId, {
            candidates: chunk,
          });
          results.push(...response.results);
        } catch {
          requestFailureCount += chunk.length;
        }
      }
      await refresh();
      const completed = results.filter((item) =>
        item.outcome === "created" || item.outcome === "duplicate"
      ).length;
      const failed = results.length - completed + requestFailureCount;
      toast({
        variant: failed > 0 ? "info" : "success",
        description: `catalog draft ${completed}건 저장, 별도 확인 ${failed}건입니다. 완료 항목은 후보 목록에서 제외되며 공개 게시로 전환되지는 않았습니다.`,
      });
    } catch {
      toast({
        variant: "error",
        description: "ready 완료 항목을 일괄 저장하지 못했습니다.",
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
      for (const chunk of chunkOtwPlayIngestionSelections(candidates)) {
        try {
          const response = await ignoreOtwPlayImportCandidates(activeJobId, {
            candidates: chunk,
          });
          results.push(...response.results);
        } catch {
          requestFailureCount += chunk.length;
        }
      }
      let refreshFailed = false;
      try {
        await refresh();
      } catch {
        refreshFailed = true;
      }
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
    } catch {
      toast({
        variant: "error",
        description: "다음 후보 목록을 불러오지 못했습니다. 다시 시도해 주세요.",
      });
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
      toast({ variant: "success", description: "실패 message를 다시 Queue에 등록했습니다." });
    } catch {
      toast({
        variant: "error",
        description: "실패 message를 재시도하지 못했습니다.",
      });
    } finally {
      setBusy(null);
    }
  };

  const job = jobQuery.data;

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

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">가져오기 이력</CardTitle>
          <p className="text-sm text-muted-foreground">
            이전에 가져온 플레이리스트 작업을 계속 열어 검수할 수 있습니다.
          </p>
        </CardHeader>
        <CardContent className="pt-4">
          {jobsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">가져오기 이력을 불러오는 중입니다.</p>
          ) : (jobsQuery.data?.length ?? 0) === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              저장된 가져오기 작업이 없습니다.
            </p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {jobsQuery.data?.map((historyJob) => (
                <button
                  type="button"
                  key={historyJob.id}
                  onClick={() => setActiveJobId(historyJob.id)}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    historyJob.id === activeJobId
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="line-clamp-2 font-semibold">{historyJob.playlistTitle}</span>
                    <Badge variant={historyJob.status === "completed" ? "secondary" : "outline"}>
                      {historyJob.status}
                    </Badge>
                  </div>
                  <p className="mt-2 truncate text-xs text-muted-foreground">
                    {historyJob.playlistOwnerChannelTitle}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(historyJob.createdAt).toLocaleString("ko-KR")} · 후보 {historyJob.counts.discovered}개
                  </p>
                </button>
              ))}
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
            <div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void refreshAuthority()}><RefreshCw /> 권위 상태 새로고침</Button>{job.status === "partial" && <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void retryFailedMessages(job.id)}>실패 message 재시도</Button>}</div>
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
              <Button className="ml-auto" disabled={busy !== null} onClick={() => void convertReadyCandidates()}>
                {busy === "convert-ready" ? <Loader2 className="animate-spin" /> : null}
                ready 완료 항목 일괄 저장
              </Button>
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

            <div className={`grid items-start gap-4 ${editingId ? "xl:grid-cols-[minmax(0,1fr)_minmax(28rem,32rem)] 2xl:grid-cols-[minmax(0,1fr)_36rem]" : ""}`}>
              <div className="min-w-0 space-y-3">
                <div className="hidden overflow-hidden rounded-xl border md:block">
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[38%]">영상</TableHead>
                        <TableHead className="w-[20%]">채널</TableHead>
                        <TableHead className="w-[12%]">위치·시간</TableHead>
                        <TableHead className="w-[20%]">상태</TableHead>
                        <TableHead className="w-[10%] text-right">작업</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((item) => {
                        const previewDraft = drafts[item.candidateId] ??
                          draftFromItem(item, catalog);
                        return (
                          <Fragment key={item.originId}>
                            <TableRow
                              data-state={editingId === item.candidateId ? "selected" : undefined}
                            >
                            <TableCell className="min-w-0 whitespace-normal">
                              <div className="flex min-w-0 gap-3">
                                {item.thumbnailUrl ? (
                                  <img className="h-14 w-24 shrink-0 rounded object-cover" src={item.thumbnailUrl} alt="YouTube thumbnail" />
                                ) : (
                                  <div className="h-14 w-24 shrink-0 rounded bg-muted" />
                                )}
                                <div className="min-w-0">
                                  <div className="line-clamp-2 font-medium">{item.title ?? item.videoId}</div>
                                  <a className="text-xs text-primary underline" href={sourceUrl(item.videoId)} target="_blank" rel="noreferrer">
                                    YouTube 원문 <ExternalLink className="inline size-3" />
                                  </a>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="min-w-0">
                              <div className="truncate" title={item.channelTitle ?? undefined}>
                                {item.channelTitle ?? "-"}
                              </div>
                            </TableCell>
                            <TableCell>#{item.playlistPosition + 1} · {formatDuration(item.durationSeconds)}</TableCell>
                            <TableCell>
                              <CandidateStateSummary item={item} />
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
                            <TableRow className="bg-muted/5 hover:bg-muted/5">
                              <TableCell colSpan={5} className="whitespace-normal px-3 pb-3 pt-0">
                                <ReviewApplicationPreview item={item} draft={previewDraft} catalog={catalog} />
                              </TableCell>
                            </TableRow>
                          </Fragment>
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
                          <CandidateStateSummary item={item} />
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
              const reviewBlockedReason = candidateReviewBlockedReason(item);
              const catalogChannel = catalog.channels.find(
                (channel) => channel.externalChannelId === item.channelId,
              );
              const channelOwnerCandidates = catalog.entities.filter((entity) =>
                entity.archivedAt === null &&
                (
                  draft.channelOwnershipKind === "member"
                    ? entity.memberUid !== null
                    : draft.channelOwnershipKind === "external"
                      ? entity.memberUid === null
                      : false
                )
              );
              const channelOwnerRequired = draft.channelOwnershipKind !== "otw_official";
              const channelApprovalBlocked = !item.channelId
                ? "YouTube 채널 metadata를 먼저 갱신해 주세요."
                : catalogChannel?.verificationStatus === "revoked"
                  ? "철회된 채널은 공식 채널 관리에서 별도로 재검수해야 합니다."
                  : null;
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
                      {reviewBlockedReason ? (
                        <p role="alert" className="text-xs leading-relaxed text-destructive">
                          {reviewBlockedReason}
                        </p>
                      ) : null}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>닫기</Button>
                  </div>

                  <div className="space-y-5 p-4 xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain">
                    {!item.catalogChannelId ? (
                      <fieldset className="space-y-4 rounded-lg border border-amber-300/70 bg-amber-50/40 p-4 dark:border-amber-800 dark:bg-amber-950/10">
                        <legend className="px-1 text-sm font-semibold">공식 채널 승인</legend>
                        <div className="space-y-1">
                          <div className="font-medium">{item.channelTitle ?? "채널 이름 확인 필요"}</div>
                          <div className="break-all text-xs text-muted-foreground">
                            {item.channelId ?? "채널 ID 없음"}
                          </div>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            영상의 실제 채널, 공식 역할과 소유 주체를 확인한 뒤 승인합니다. 승인 후 후보 metadata와 분류가 즉시 갱신됩니다.
                          </p>
                        </div>
                        <ChoiceGroup
                          label="기본 소유 유형"
                          description="일반 검수에서는 멤버 또는 오버더월 공식 채널만 승인합니다."
                          value={draft.channelOwnershipKind}
                          onValueChange={(channelOwnershipKind) => updateDraft({
                            channelOwnershipKind,
                            channelRole: channelOwnershipKind === "otw_official"
                              ? "otw_official"
                              : "member_music",
                            channelOwnerEntityIds: [],
                            externalChannelApprovalConfirmed: false,
                          })}
                          options={primaryChannelOwnershipOptions}
                          presentation="cards"
                          cardColumns={2}
                        />

                        {draft.channelOwnershipKind === "member" ? (
                          <Field>
                            <FieldLabel id={`channel-role-${item.candidateId}`}>멤버 채널 역할</FieldLabel>
                            <Select
                              value={draft.channelRole === "member_main" ? "member_main" : "member_music"}
                              onValueChange={(channelRole) => updateDraft({
                                channelRole: channelRole as "member_music" | "member_main",
                              })}
                            >
                              <SelectTrigger aria-labelledby={`channel-role-${item.candidateId}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="member_music">멤버 노래 채널</SelectItem>
                                <SelectItem value="member_main">멤버 메인 채널</SelectItem>
                              </SelectContent>
                            </Select>
                          </Field>
                        ) : null}

                        {draft.channelOwnershipKind === "otw_official" ? (
                          <div className="rounded-lg border bg-background p-3 text-sm">
                            <div className="font-medium">오버더월 공식 소유</div>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                              채널 역할 자체가 오버더월 공식 소유를 나타내므로 별도의 연결 주체를 선택하지 않습니다.
                            </p>
                          </div>
                        ) : null}

                        <label
                          htmlFor={`external-channel-${item.candidateId}`}
                          className="flex cursor-pointer items-start gap-3 rounded-lg border border-dashed bg-background p-3 hover:bg-muted/40"
                        >
                          <Checkbox
                            id={`external-channel-${item.candidateId}`}
                            checked={draft.channelOwnershipKind === "external"}
                            onCheckedChange={(checked) => updateDraft({
                              channelOwnershipKind: checked === true ? "external" : "member",
                              channelRole: checked === true ? "project_official" : "member_music",
                              channelOwnerEntityIds: [],
                              externalChannelApprovalConfirmed: false,
                            })}
                          />
                          <span>
                            <span className="block text-sm font-medium">외부 채널 추가·승인</span>
                            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                              OTW 또는 멤버 소유가 아닌 공식 협업·프로젝트 채널일 때만 사용합니다.
                            </span>
                          </span>
                        </label>

                        {channelOwnerRequired ? (
                          <Field>
                            <FieldLabel>소유·연결 주체</FieldLabel>
                            <FieldDescription>
                              {draft.channelOwnershipKind === "member"
                                ? "카탈로그에 연결되고 archive되지 않은 OTW 멤버만 표시합니다."
                                : "외부 채널과 실제로 연결할 기존 외부 인물·그룹·조직을 선택합니다."}
                            </FieldDescription>
                            <div
                              className="grid gap-1 rounded-md border bg-background p-2 sm:grid-cols-2"
                              aria-label={draft.channelOwnershipKind === "member"
                                ? "OTW 멤버 전체 목록"
                                : "외부 연결 주체 목록"}
                            >
                              {channelOwnerCandidates.length > 0 ? channelOwnerCandidates.map((entity) => {
                                const checkboxId = `channel-owner-${item.candidateId}-${entity.id}`;
                                return (
                                  <label
                                    key={entity.id}
                                    htmlFor={checkboxId}
                                    className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted"
                                  >
                                    <Checkbox
                                      id={checkboxId}
                                      checked={draft.channelOwnerEntityIds.includes(entity.id)}
                                      onCheckedChange={(checked) => updateDraft({
                                        channelOwnerEntityIds: checked === true
                                          ? [...draft.channelOwnerEntityIds, entity.id]
                                          : draft.channelOwnerEntityIds.filter((id) => id !== entity.id),
                                      })}
                                    />
                                    <span className="min-w-0 truncate">{entity.displayName}</span>
                                  </label>
                                );
                              }) : (
                                <p className="px-2 py-3 text-xs leading-relaxed text-muted-foreground">
                                  선택할 수 있는 {draft.channelOwnershipKind === "member" ? "OTW 멤버" : "외부 주체"}가 없습니다.
                                </p>
                              )}
                            </div>
                            {draft.channelOwnershipKind === "external" ? (
                              <Button type="button" size="sm" variant="outline" onClick={onOpenCatalog}>
                                카탈로그에서 외부 주체 추가
                              </Button>
                            ) : null}
                          </Field>
                        ) : null}

                        {draft.channelOwnershipKind === "external" ? (
                          <label
                            htmlFor={`external-channel-confirm-${item.candidateId}`}
                            className="flex cursor-pointer items-start gap-3 rounded-lg border border-amber-400/60 bg-amber-100/50 p-3 dark:bg-amber-950/20"
                          >
                            <Checkbox
                              id={`external-channel-confirm-${item.candidateId}`}
                              checked={draft.externalChannelApprovalConfirmed}
                              onCheckedChange={(checked) => updateDraft({
                                externalChannelApprovalConfirmed: checked === true,
                              })}
                            />
                            <span>
                              <span className="block text-sm font-medium">외부 공식 소스로 추가·승인함을 확인</span>
                              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                                선택한 외부 주체와 채널의 공식 관계를 확인했으며 승인 이력이 기록됩니다.
                              </span>
                            </span>
                          </label>
                        ) : null}
                        {channelApprovalBlocked ? (
                          <p role="alert" className="text-xs text-destructive">{channelApprovalBlocked}</p>
                        ) : null}
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={
                            busy !== null ||
                            channelApprovalBlocked !== null ||
                            (channelOwnerRequired && draft.channelOwnerEntityIds.length === 0) ||
                            (
                              draft.channelOwnershipKind === "external" &&
                              !draft.externalChannelApprovalConfirmed
                            )
                          }
                          onClick={() => void approveCandidateChannel(item)}
                        >
                          {busy === `approve-channel:${item.candidateId}` ? <Loader2 className="animate-spin" /> : null}
                          {draft.channelOwnershipKind === "external"
                            ? "외부 채널 추가·승인 후 후보 갱신"
                            : "공식 채널 승인 후 후보 갱신"}
                        </Button>
                      </fieldset>
                    ) : null}

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
                      disabled={busy !== null || reviewBlockedReason !== null}
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
