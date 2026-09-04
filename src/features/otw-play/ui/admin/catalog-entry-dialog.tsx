import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  OtwPlayAdminCatalogDto,
  OtwPlayAdminCatalogEntryPreflightDto,
  OtwPlayAdminCatalogSubjectInput,
  OtwPlayAdminCreateCatalogEntryRequest,
  OtwPlayAdminEntityDto,
  OtwPlayParticipationType,
} from "@contracts/otw-play";
import { ConfirmActionDialog } from "@/app/admin";
import { fetchActiveMembers, type Member } from "@/features/members";
import { ApiError } from "@/shared/api/client";
import { queryKeys } from "@/shared/query/query-keys";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import { useToast } from "@/shared/ui/toast";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Search,
  UserRoundPlus,
  UsersRound,
  X,
} from "lucide-react";
import {
  createOtwPlayCatalogEntry,
  preflightOtwPlayCatalogEntry,
} from "../../api/admin";
import { SongTagPicker } from "../song-tag-picker";
import { SongConnectionPicker } from "./song-connection-picker";

export type SelectedSubject = {
  key: string;
  label: string;
  detail?: string;
  subject: OtwPlayAdminCatalogSubjectInput;
};

type NewExternalSelectedSubject = SelectedSubject & {
  subject: Extract<OtwPlayAdminCatalogSubjectInput, { kind: "new_external" }>;
};

const normalizeSubjectName = (value: string) =>
  value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase();

const uniqueNewExternalSubjects = (
  subjects: readonly SelectedSubject[],
): NewExternalSelectedSubject[] => {
  const unique = new Map<string, NewExternalSelectedSubject>();
  for (const subject of subjects) {
    if (subject.subject.kind === "new_external") {
      unique.set(subject.key, subject as NewExternalSelectedSubject);
    }
  }
  return [...unique.values()];
};

const STEPS = ["영상 확인", "영상 유형", "참여자와 분류", "검토와 저장"];

type VideoKind = "original" | "cover" | "karaoke";

const participationLabels: Record<OtwPlayParticipationType, string> = {
  solo: "솔로",
  duet: "듀엣",
  unit: "유닛",
  group: "그룹",
  external_collab: "외부 협업",
};

const preflightErrorMessage = (error: unknown) => {
  if (!(error instanceof ApiError)) {
    return "로컬 Worker에 연결하지 못했습니다. 개발 서버 상태를 확인한 뒤 다시 시도하세요.";
  }

  const requestSuffix = error.requestId
    ? ` 요청 ID: ${error.requestId}`
    : "";
  switch (error.code) {
    case "AUTH_REQUIRED":
      return "관리자 로그인 세션을 확인한 뒤 페이지를 새로고침하세요.";
    case "PLAY_ADMIN_INVALID_REQUEST":
      return `지원하는 YouTube 영상 URL과 시작·종료 위치를 확인하세요.${requestSuffix}`;
    case "PLAY_ADMIN_EXTERNAL_SERVICE_UNAVAILABLE":
      return `YouTube metadata 조회에 실패했습니다${error.fields?.youtube ? `: ${error.fields.youtube}` : ". 잠시 후 다시 시도하세요."}${requestSuffix}`;
    case "PLAY_ADMIN_INTERNAL_ERROR":
      return `로컬 카탈로그를 확인하지 못했습니다. D1 상태를 점검하세요.${requestSuffix}`;
    default:
      return `${error.message}${error.code ? ` (${error.code})` : ""}${requestSuffix}`;
  }
};

const subjectFromMember = (member: Member): SelectedSubject => ({
  key: `member:${member.uid}`,
  label: member.name,
  detail: [member.oshi_mark, member.unit_name].filter(Boolean).join(" · "),
  subject: { kind: "member", memberUid: member.uid },
});

const subjectFromEntity = (entity: OtwPlayAdminEntityDto): SelectedSubject => ({
  key: `entity:${entity.id}`,
  label: entity.displayName,
  detail:
    entity.entityKind === "group"
      ? "기존 그룹"
      : entity.entityKind === "organization"
        ? "기존 단체"
        : "기존 외부 인물",
  subject: { kind: "entity", entityId: entity.id },
});

const reuseCreatedSubjects = (
  selections: SelectedSubject[],
  createdEntities: OtwPlayAdminEntityDto[],
): SelectedSubject[] =>
  selections.flatMap((selection) => {
    const { subject } = selection;
    if (subject.kind !== "new_external") return [selection];
    const entity = createdEntities.find(
      (candidate) =>
        candidate.memberUid === null &&
        candidate.entityKind === subject.entityKind &&
        normalizeSubjectName(candidate.displayName) ===
          normalizeSubjectName(subject.displayName),
    );
    // Never carry a creation command into the next independent segment.
    // An unresolved credit must be selected again instead of duplicated.
    return entity ? [{ ...subjectFromEntity(entity), label: selection.label }] : [];
  });

export function SubjectPicker({
  label,
  placeholder = "멤버 또는 기존 외부 identity 검색",
  helpText = "기존 외부 identity 후보를 먼저 보여주며, 새 칩은 자동 병합하지 않고 별도 identity로 저장합니다.",
  members,
  entities,
  draftSubjects = [],
  selected,
  onChange,
  allowGroup = true,
  includeMemberEntities = false,
}: {
  label: string;
  placeholder?: string;
  helpText?: string;
  members: Member[];
  entities: OtwPlayAdminEntityDto[];
  draftSubjects?: SelectedSubject[];
  selected: SelectedSubject[];
  onChange: (items: SelectedSubject[]) => void;
  allowGroup?: boolean;
  includeMemberEntities?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listboxId = useId();
  const normalized = normalizeSubjectName(query);
  const selectedKeys = new Set(selected.map((item) => item.key));
  const availableDraftSubjects = uniqueNewExternalSubjects([
    ...draftSubjects,
    ...selected,
  ]);
  const memberMatches = members
    .filter(
      (member) =>
        !selectedKeys.has(`member:${member.uid}`) &&
        (!normalized ||
          normalizeSubjectName(member.name).includes(normalized) ||
          normalizeSubjectName(member.code).includes(normalized)),
    )
    .slice(0, 6);
  const entityMatches = entities
    .filter(
      (entity) =>
        entity.archivedAt === null &&
        (includeMemberEntities || entity.memberUid === null) &&
        !selectedKeys.has(`entity:${entity.id}`) &&
        (!normalized ||
          normalizeSubjectName(entity.displayName).includes(normalized)),
    )
    .slice(0, 6);
  const draftMatches = availableDraftSubjects
    .filter(
      (subject) =>
        !selectedKeys.has(subject.key) &&
        (!normalized || normalizeSubjectName(subject.label).includes(normalized)),
    )
    .slice(0, 6);
  const exactMatchExists = Boolean(normalized) && [
    ...members.map((member) => member.name),
    ...entities
      .filter(
        (entity) =>
          entity.archivedAt === null &&
          (includeMemberEntities || entity.memberUid === null),
      )
      .map((entity) => entity.displayName),
    ...availableDraftSubjects.map((subject) => subject.label),
  ].some((name) => normalizeSubjectName(name) === normalized);
  const suggestionCount =
    memberMatches.length + entityMatches.length + draftMatches.length;
  const selectSuggestion = (index: number) => {
    if (index < memberMatches.length) {
      const member = memberMatches[index];
      if (member) onChange([...selected, subjectFromMember(member)]);
    } else if (index < memberMatches.length + entityMatches.length) {
      const entity = entityMatches[index - memberMatches.length];
      if (entity) onChange([...selected, subjectFromEntity(entity)]);
    } else {
      const draft = draftMatches[
        index - memberMatches.length - entityMatches.length
      ];
      if (draft) onChange([...selected, draft]);
    }
    setQuery("");
    setActiveIndex(0);
  };
  const addNew = (entityKind: "person" | "group") => {
    const displayName = query.trim();
    if (!displayName) return;
    const clientKey = crypto.randomUUID();
    onChange([
      ...selected,
      {
        key: `external:${clientKey}`,
        label: displayName,
        detail: entityKind === "group" ? "새 그룹" : "새 외부 인물",
        subject: {
          kind: "new_external",
          clientKey,
          displayName,
          entityKind,
        },
      },
    ]);
    setQuery("");
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex min-h-10 flex-wrap gap-2 rounded-md border bg-background p-2">
        {selected.map((item) => (
          <Badge key={item.key} variant="secondary" className="gap-1 py-1">
            {item.subject.kind === "member" && item.detail
              ? `${item.label} ${item.detail}`
              : item.label}
            <button
              type="button"
              aria-label={`${item.label} 제거`}
              className="rounded-sm focus-visible:outline-none focus-visible:ring-2"
              onClick={() => onChange(selected.filter((value) => value.key !== item.key))}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {selected.length === 0 && (
          <span className="px-1 text-sm text-muted-foreground">검색해 선택하세요.</span>
        )}
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (!query.trim() || suggestionCount === 0) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((current) => (current + 1) % suggestionCount);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex(
                (current) => (current - 1 + suggestionCount) % suggestionCount,
              );
            } else if (event.key === "Enter") {
              event.preventDefault();
              selectSuggestion(activeIndex);
            }
          }}
          placeholder={placeholder}
          className="pl-9"
          aria-label={`${label} 검색`}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={Boolean(query.trim())}
          aria-controls={listboxId}
          aria-activedescendant={
            query.trim() && suggestionCount > 0
              ? `${listboxId}-option-${activeIndex}`
              : undefined
          }
        />
      </div>
      {query.trim() && (
        <div id={listboxId} role="listbox" aria-label={`${label} 후보`} className="max-h-52 overflow-y-auto rounded-md border bg-popover p-1 shadow-sm">
          {memberMatches.map((member, index) => (
            <button
              key={member.uid}
              type="button"
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={activeIndex === index}
              className={`flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none ${activeIndex === index ? "bg-accent" : ""}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectSuggestion(index)}
            >
              <span>{member.name}</span>
              <span className="text-xs text-muted-foreground">
                {[member.oshi_mark, member.unit_name].filter(Boolean).join(" · ")}
              </span>
            </button>
          ))}
          {entityMatches.map((entity, entityIndex) => {
            const index = memberMatches.length + entityIndex;
            return (
            <button
              key={entity.id}
              type="button"
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={activeIndex === index}
              className={`flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none ${activeIndex === index ? "bg-accent" : ""}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectSuggestion(index)}
            >
              <span>{entity.displayName}</span>
              <span className="text-xs text-muted-foreground">
                {entity.memberUid !== null
                  ? "OTW 멤버"
                  : entity.entityKind === "group"
                  ? "기존 그룹"
                  : entity.entityKind === "organization"
                    ? "기존 단체"
                    : "기존 외부 인물"}
              </span>
            </button>
            );
          })}
          {draftMatches.map((subject, draftIndex) => {
            const index = memberMatches.length + entityMatches.length + draftIndex;
            return (
              <button
                key={subject.key}
                type="button"
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={activeIndex === index}
                className={`flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none ${activeIndex === index ? "bg-accent" : ""}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectSuggestion(index)}
              >
                <span>{subject.label}</span>
                <span className="text-xs text-muted-foreground">
                  이번 작업에서 추가한 {subject.subject.entityKind === "group" ? "그룹" : "외부 인물"}
                </span>
              </button>
            );
          })}
          {exactMatchExists ? (
            <p className="mt-1 border-t px-3 py-2 text-xs text-muted-foreground" role="status">
              동일한 이름의 주체가 이미 있습니다. 위 후보를 선택하세요.
            </p>
          ) : (
            <div className="mt-1 grid gap-1 border-t pt-1 sm:grid-cols-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => addNew("person")}>
                <UserRoundPlus className="h-4 w-4" /> 외부 인물로 추가
              </Button>
              {allowGroup && (
                <Button type="button" variant="ghost" size="sm" onClick={() => addNew("group")}>
                  <UsersRound className="h-4 w-4" /> 그룹으로 추가
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{helpText}</p>
    </div>
  );
}

export function CatalogEntryDialog({
  open,
  onOpenChange,
  catalog,
  preselectedSongId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: OtwPlayAdminCatalogDto;
  preselectedSongId: string | null;
  onSaved: () => Promise<void>;
}) {
  const { toast } = useToast();
  const membersQuery = useQuery({
    queryKey: queryKeys.members.active(),
    queryFn: fetchActiveMembers,
    staleTime: 60_000,
    enabled: open,
  });
  const members = membersQuery.data ?? [];
  const [step, setStep] = useState(0);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [startSeconds, setStartSeconds] = useState("0");
  const [endSeconds, setEndSeconds] = useState("");
  const [preflight, setPreflight] = useState<OtwPlayAdminCatalogEntryPreflightDto | null>(null);
  const [checking, setChecking] = useState(false);
  const [channelChoice, setChannelChoice] = useState<"approved" | "pending">("pending");
  const [channelRole, setChannelRole] = useState<"member_music" | "member_main" | "project_official" | "otw_official" | "unit_official">("project_official");
  const [songId, setSongId] = useState("");
  const [songQuery, setSongQuery] = useState("");
  const [videoKind, setVideoKind] = useState<VideoKind | null>(null);
  const [registrationMode, setRegistrationMode] = useState<
    NonNullable<OtwPlayAdminCreateCatalogEntryRequest["registrationMode"]>
  >("standard");
  const [coverOriginalTitle, setCoverOriginalTitle] = useState("");
  const [coverOriginalArtists, setCoverOriginalArtists] = useState<SelectedSubject[]>([]);
  const [songTags, setSongTags] = useState<string[]>([]);
  const [performanceTags, setPerformanceTags] = useState<string[]>([]);
  const [participants, setParticipants] = useState<SelectedSubject[]>([]);
  const [channelOwners, setChannelOwners] = useState<SelectedSubject[]>([]);
  const [releaseType, setReleaseType] = useState<"official_mv" | "official_video">("official_video");
  const [participationType, setParticipationType] = useState<OtwPlayParticipationType>("solo");
  const [internalNote, setInternalNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completedMedleySegment, setCompletedMedleySegment] = useState<{
    endSeconds: number;
    durationSeconds: number;
  } | null>(null);
  const draftExternalSubjects = uniqueNewExternalSubjects([
    ...coverOriginalArtists,
    ...participants,
    ...channelOwners,
  ]);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setYoutubeUrl("");
    setStartSeconds("0");
    setEndSeconds("");
    setPreflight(null);
    setErrorMessage(null);
    setChannelChoice("pending");
    setChannelRole("project_official");
    setVideoKind(null);
    setRegistrationMode("standard");
    setSongQuery("");
    setCoverOriginalTitle("");
    setCoverOriginalArtists([]);
    setSongTags([]);
    setPerformanceTags([]);
    setParticipants([]);
    setChannelOwners([]);
    setReleaseType("official_video");
    setParticipationType("solo");
    setInternalNote("");
    setCompletedMedleySegment(null);
    if (preselectedSongId) {
      setSongId(preselectedSongId);
    } else {
      setSongId("");
    }
  }, [open, preselectedSongId]);

  const runPreflight = async () => {
    setChecking(true);
    setErrorMessage(null);
    try {
      const result = await preflightOtwPlayCatalogEntry({
        youtubeUrl,
        startSeconds: Number(startSeconds),
        endSeconds: endSeconds.trim() ? Number(endSeconds) : null,
      });
      setPreflight(result);
      if (result.video.durationSeconds === null) {
        setErrorMessage("영상 길이를 확인할 수 없어 시작·종료 구간을 등록할 수 없습니다.");
      } else if (!endSeconds.trim()) {
        setEndSeconds(String(result.video.durationSeconds));
      }
      setChannelChoice(result.channel.state === "approved" || result.channel.state === "recognized_member" ? "approved" : "pending");
      if (result.channel.channelRole === "member_music" || result.channel.channelRole === "member_main" || result.channel.channelRole === "project_official" || result.channel.channelRole === "otw_official" || result.channel.channelRole === "unit_official") {
        setChannelRole(result.channel.channelRole);
      }
    } catch (error) {
      setErrorMessage(preflightErrorMessage(error));
    } finally {
      setChecking(false);
    }
  };

  const channelCanPublish =
    preflight?.channel.state === "approved" ||
    preflight?.channel.state === "recognized_member" ||
    (preflight?.channel.state !== "revoked" && channelChoice === "approved");
  const needsChannelOwnerChoice = Boolean(
    preflight &&
      preflight.channel.state !== "approved" &&
      preflight.channel.state !== "recognized_member" &&
      !(preflight.channel.catalogChannelId && channelChoice === "pending"),
  );
  const parsedStartSeconds = Number(startSeconds);
  const parsedEndSeconds = Number(endSeconds);
  const segmentValid = Boolean(
    preflight?.video.durationSeconds !== null &&
      Number.isSafeInteger(parsedStartSeconds) &&
      parsedStartSeconds >= 0 &&
      Number.isSafeInteger(parsedEndSeconds) &&
      parsedEndSeconds > parsedStartSeconds &&
      preflight?.video.durationSeconds !== undefined &&
      parsedEndSeconds <= preflight.video.durationSeconds,
  );
  const hasExistingSong = songId !== "" && songId !== "__new";
  const hasNewSongDetails =
    Boolean(coverOriginalTitle.trim()) && coverOriginalArtists.length > 0;
  const hasExplicitSong =
    hasExistingSong || (songId === "__new" && hasNewSongDetails);
  const stepReady = [
    Boolean(
      preflight &&
        !preflight.duplicate &&
        preflight.channel.state !== "revoked" &&
        segmentValid,
    ),
    videoKind === "original" ||
      (videoKind === "cover" &&
        (registrationMode === "medley_segment"
          ? hasExplicitSong
          : hasExistingSong || hasNewSongDetails)),
    participants.length > 0 &&
      (!needsChannelOwnerChoice || channelOwners.length > 0),
    true,
  ][step];

  const buildRequest = (publicationTarget: "draft" | "published"): OtwPlayAdminCreateCatalogEntryRequest => {
    if (!preflight || (videoKind !== "original" && videoKind !== "cover")) {
      throw new Error("등록할 영상 유형을 선택해 주세요.");
    }
    const ownerSubjects = channelOwners.map((item) => item.subject);
    const channel: OtwPlayAdminCreateCatalogEntryRequest["channel"] =
      preflight.channel.state === "approved" && preflight.channel.catalogChannelId
        ? { kind: "existing", channelId: preflight.channel.catalogChannelId }
        : preflight.channel.state === "recognized_member" && preflight.channel.memberUid
          ? { kind: "recognized_member", memberUid: preflight.channel.memberUid, channelRole: channelRole === "member_main" ? "member_main" : "member_music" }
          : preflight.channel.catalogChannelId && channelChoice === "pending"
            ? { kind: "existing", channelId: preflight.channel.catalogChannelId }
            : { kind: channelChoice === "approved" ? "confirm" : "pending", channelRole, owners: ownerSubjects };
    return {
      expectedCatalogRevision: preflight.catalogRevision,
      youtubeUrl,
      startSeconds: parsedStartSeconds,
      endSeconds: parsedEndSeconds,
      registrationMode,
      song: songId && songId !== "__new"
        ? { kind: "existing", songId }
        : videoKind === "original"
          ? songTags.length > 0 ? { kind: "from_video", tags: songTags } : { kind: "from_video" }
          : {
              kind: "create",
              title: coverOriginalTitle.trim(),
              isOtwOriginal: false,
              originalReleaseDate: null,
              originalReleasePrecision: "unknown",
              aliases: [],
              originalArtists: coverOriginalArtists.map((artist, index) => ({
                subject: artist.subject,
                creditOrder: index,
                isPrimary: index === 0,
              })),
              ...(songTags.length > 0 ? { tags: songTags } : {}),
            },
      participants: participants.map((participant, index) => ({
        subject: participant.subject,
        participantRole: "vocal",
        creditOrder: index,
        creditNameSnapshot: participant.label,
      })),
      channel,
      relationType: videoKind,
      releaseType,
      participationType,
      ...(performanceTags.length > 0 ? { performanceTags } : {}),
      publicationTarget,
      internalNote: internalNote.trim() || null,
    };
  };

  const save = async (target: "draft" | "published") => {
    setSaving(true);
    setErrorMessage(null);
    try {
      const result = await createOtwPlayCatalogEntry(buildRequest(target));
      await onSaved();
      toast({ variant: "success", description: target === "published" ? "영상을 게시했습니다." : "영상을 임시 저장했습니다." });
      if (
        registrationMode === "medley_segment" &&
        preflight?.video.durationSeconds !== null &&
        preflight?.video.durationSeconds !== undefined
      ) {
        setParticipants(reuseCreatedSubjects(participants, result.data.createdEntities));
        setChannelOwners(reuseCreatedSubjects(channelOwners, result.data.createdEntities));
        setCompletedMedleySegment({
          endSeconds: parsedEndSeconds,
          durationSeconds: preflight.video.durationSeconds,
        });
      } else {
        onOpenChange(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "등록에 실패했습니다.";
      setErrorMessage(message);
      toast({ variant: "error", description: "입력값은 유지했습니다. 오류 내용을 확인하세요." });
    } finally {
      setSaving(false);
    }
  };

  const prepareNextMedleySegment = () => {
    if (!completedMedleySegment) return;
    setStep(0);
    setStartSeconds(String(completedMedleySegment.endSeconds));
    setEndSeconds(String(completedMedleySegment.durationSeconds));
    setPreflight(null);
    setVideoKind("cover");
    setRegistrationMode("medley_segment");
    setSongId("");
    setSongQuery("");
    setCoverOriginalTitle("");
    setCoverOriginalArtists([]);
    setSongTags([]);
    setInternalNote("");
    setErrorMessage(null);
    setCompletedMedleySegment(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
        <DialogContent className="h-[100dvh] max-h-[100dvh] max-w-none overflow-y-auto rounded-none sm:h-auto sm:max-h-[92vh] sm:max-w-5xl sm:rounded-xl">
          <DialogHeader>
            <DialogTitle>새 YouTube 영상 등록</DialogTitle>
            <DialogDescription>영상을 확인하고 유형·참여자·공식 채널만 선택하면 내부 곡과 가창이 함께 등록됩니다.</DialogDescription>
          </DialogHeader>
          {!completedMedleySegment && (
            <ol className="grid grid-cols-4 gap-1" aria-label="등록 단계">
              {STEPS.map((label, index) => (
                <li key={label} className={`rounded-md px-2 py-2 text-center text-xs ${index === step ? "bg-primary text-primary-foreground" : index < step ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  <span className="hidden sm:inline">{index + 1}. </span>{label}
                </li>
              ))}
            </ol>
          )}

          {!completedMedleySegment && errorMessage && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{errorMessage}</div>}

          {completedMedleySegment ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 py-8 text-center" role="status">
              <div>
                <h3 className="text-lg font-semibold">메들리 커버 구간을 임시 저장했습니다.</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  같은 영상의 다음 곡을 이어서 등록하거나 현재 작업을 마칠 수 있습니다.
                </p>
              </div>
              <Badge variant="outline">
                다음 시작 위치 {completedMedleySegment.endSeconds}초
              </Badge>
            </div>
          ) : (
          <div className="min-h-[360px] space-y-5 py-2">
            {step === 0 && (
              <>
                <div className="grid gap-3 sm:grid-cols-[1fr_120px_120px_auto] sm:items-end">
                  <div className="space-y-1.5"><Label htmlFor="catalog-youtube-url">YouTube URL</Label><Input id="catalog-youtube-url" value={youtubeUrl} onChange={(event) => { setYoutubeUrl(event.target.value); setEndSeconds(""); setPreflight(null); setVideoKind(null); setRegistrationMode("standard"); }} placeholder="https://www.youtube.com/watch?v=..." /></div>
                  <div className="space-y-1.5"><Label htmlFor="catalog-start">시작 위치(초)</Label><Input id="catalog-start" type="number" min="0" value={startSeconds} onChange={(event) => { setStartSeconds(event.target.value); setPreflight(null); }} /></div>
                  <div className="space-y-1.5"><Label htmlFor="catalog-end">종료 위치(초)</Label><Input id="catalog-end" type="number" min="1" value={endSeconds} onChange={(event) => { setEndSeconds(event.target.value); setPreflight(null); }} placeholder="확인 후 자동 입력" /></div>
                  <Button onClick={() => void runPreflight()} disabled={checking || !youtubeUrl.trim()}>{checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} 영상 확인</Button>
                </div>
                {preflight && (
                  <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 md:grid-cols-[240px_1fr]">
                    <img src={preflight.video.thumbnailUrl ?? `https://i.ytimg.com/vi/${preflight.video.videoId}/hqdefault.jpg`} alt="확인한 영상 썸네일" className="aspect-video w-full rounded-lg object-cover" />
                    <div className="space-y-3">
                      <div><div className="font-semibold">{preflight.video.title}</div><div className="text-sm text-muted-foreground">{preflight.video.channelTitle}</div></div>
                      {preflight.duplicate && <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm"><strong>이미 등록된 영상 구간입니다.</strong><div>곡 {preflight.duplicate.songId} · 가창 {preflight.duplicate.performanceId}</div><Button type="button" variant="link" className="h-auto p-0" onClick={() => onOpenChange(false)}>기존 항목 보기</Button></div>}
                      <div className="flex flex-wrap items-center gap-2"><Badge variant={preflight.channel.state === "revoked" ? "destructive" : "secondary"}>채널: {preflight.channel.state === "approved" ? "승인됨" : preflight.channel.state === "recognized_member" ? "멤버 채널 자동 인식" : preflight.channel.state === "pending" ? "검수 대기" : preflight.channel.state === "inactive" ? "비활성" : preflight.channel.state === "revoked" ? "철회됨" : "미등록"}</Badge><Badge variant="outline">구간 {startSeconds}초–{endSeconds || "?"}초</Badge><Badge variant="outline">catalog r{preflight.catalogRevision}</Badge></div>
                      {preflight.channel.state === "revoked" ? <p className="text-sm text-destructive">철회된 채널에서는 등록하거나 게시할 수 없습니다. 고급 관리에서 상태를 확인하세요.</p> : preflight.channel.state !== "approved" && preflight.channel.state !== "recognized_member" && <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label>채널 처리</Label><Select value={channelChoice} onValueChange={(value) => setChannelChoice(value as "approved" | "pending")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="approved">공식 채널로 승인</SelectItem><SelectItem value="pending">보류하고 draft만 저장</SelectItem></SelectContent></Select></div><div className="space-y-1.5"><Label>채널 역할</Label><Select value={channelRole} onValueChange={(value) => setChannelRole(value as typeof channelRole)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="otw_official">OTW 공식</SelectItem><SelectItem value="unit_official">유닛 공식</SelectItem><SelectItem value="member_music">멤버 노래 채널</SelectItem><SelectItem value="member_main">멤버 메인 채널</SelectItem><SelectItem value="project_official">승인 프로젝트</SelectItem></SelectContent></Select></div></div>}
                    </div>
                  </div>
                )}
              </>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold">이 영상은 어떤 유형인가요?</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    메들리는 별도 유형이 아니라 수록곡마다 독립적인 공식 커버곡으로 등록합니다.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label="영상 유형">
                  {([
                    ["original", "오리지널곡", "선택한 참여자를 원곡 가수로 사용합니다."],
                    ["cover", "공식 커버곡", "원곡 제목과 원곡 가수를 구분해 입력합니다."],
                    ["karaoke", "노래방송", "여러 곡과 구간 연결이 필요해 후속 단계에서 지원합니다."],
                  ] as const).map(([kind, label, description]) => (
                    <button
                      key={kind}
                      type="button"
                      aria-pressed={videoKind === kind}
                      className={`min-h-32 rounded-xl border p-4 text-left transition-colors ${
                        videoKind === kind
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted"
                      }`}
                      onClick={() => {
                        setVideoKind(kind);
                        if (kind !== "cover") {
                          setRegistrationMode("standard");
                          if (songId === "__new") setSongId("");
                        }
                      }}
                    >
                      <span className="font-semibold">{label}</span>
                      <span className="mt-2 block text-sm text-muted-foreground">
                        {description}
                      </span>
                    </button>
                  ))}
                </div>
                {videoKind === "cover" && (
                  <label className="flex items-start gap-3 rounded-xl border bg-card p-4">
                    <Checkbox
                      checked={registrationMode === "medley_segment"}
                      onCheckedChange={(checked) => {
                        setRegistrationMode(
                          checked === true ? "medley_segment" : "standard",
                        );
                        setSongQuery("");
                        if (checked === true && !preselectedSongId) {
                          setSongId("");
                          setCoverOriginalTitle("");
                          setCoverOriginalArtists([]);
                          setSongTags([]);
                        } else if (checked !== true && songId === "__new") {
                          setSongId("");
                        }
                      }}
                      aria-label="메들리의 한 곡 구간"
                    />
                    <span>
                      <span className="block font-medium">메들리의 한 곡 구간</span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        기존 곡을 명시적으로 연결하고 이 구간을 비공개 draft로 저장합니다.
                      </span>
                    </span>
                  </label>
                )}
                {songId && songId !== "__new" && registrationMode === "standard" && (
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                    `다른 가창 추가`에서 선택한 기존 곡
                    <strong className="ml-1">
                      {catalog.songs.find((song) => song.id === songId)?.title ?? songId}
                    </strong>
                    을 자동으로 재사용합니다.
                  </div>
                )}
                {videoKind === "cover" && registrationMode === "medley_segment" && (
                  <div className="rounded-xl border bg-card p-4">
                    <SongConnectionPicker
                      inputKey="catalog-medley"
                      catalog={catalog}
                      selectedSongId={songId}
                      query={songQuery}
                      onQueryChange={setSongQuery}
                      onSelectExisting={(nextSongId, title) => {
                        setSongId(nextSongId);
                        setSongQuery(title);
                        setCoverOriginalTitle("");
                        setCoverOriginalArtists([]);
                        setSongTags([]);
                      }}
                      onSelectNew={(title) => {
                        setSongId("__new");
                        setSongQuery(title);
                        setCoverOriginalTitle(title);
                        setCoverOriginalArtists([]);
                        setSongTags([]);
                      }}
                    />
                  </div>
                )}
                {videoKind === "cover" &&
                  ((registrationMode === "standard" && !songId) ||
                    (registrationMode === "medley_segment" && songId === "__new")) && (
                  <div className="space-y-4 rounded-xl border bg-card p-4">
                    <div>
                      <h4 className="font-semibold">원곡 정보</h4>
                      <p className="mt-1 text-sm text-muted-foreground">
                        YouTube 영상 제목이 아니라 실제 원곡의 제목과 가수명을 입력하세요.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cover-original-title">원곡 제목</Label>
                      <Input
                        id="cover-original-title"
                        value={coverOriginalTitle}
                        onChange={(event) => setCoverOriginalTitle(event.target.value)}
                        placeholder="예: 원곡의 정식 제목"
                        maxLength={300}
                      />
                    </div>
                    <SubjectPicker
                      label="원곡 가수"
                      placeholder="가수명을 검색하거나 새 외부 가수로 추가"
                      helpText="첫 번째 가수를 대표 원곡 가수로 저장합니다. 기존 후보는 직접 선택할 때만 재사용합니다."
                      members={members}
                      entities={catalog.entities}
                      draftSubjects={draftExternalSubjects}
                      selected={coverOriginalArtists}
                      onChange={setCoverOriginalArtists}
                    />
                  </div>
                )}
                {(videoKind === "original" && !songId) ||
                (videoKind === "cover" &&
                  ((registrationMode === "standard" && !songId) ||
                    songId === "__new")) ? (
                  <div className="rounded-xl border bg-card p-4">
                    <SongTagPicker tags={songTags} onChange={setSongTags} />
                  </div>
                ) : null}
                {videoKind === "karaoke" && (
                  <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                    노래방송 등록은 이번 흐름에서 지원하지 않습니다. 다곡·타임스탬프 연결 기능이 준비될 때까지 이 영상은 저장되지 않습니다.
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <>
                <SubjectPicker label="가창 참여자" members={members} entities={catalog.entities} draftSubjects={draftExternalSubjects} selected={participants} onChange={setParticipants} />
                {needsChannelOwnerChoice && (
                  <div className="rounded-lg border p-3">
                    <SubjectPicker
                      label="채널 소유·연결 주체"
                      members={members}
                      entities={catalog.entities}
                      draftSubjects={draftExternalSubjects}
                      selected={channelOwners}
                      onChange={setChannelOwners}
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      미등록 또는 재승인 채널은 가창 참여자와 별개로 공식 소유·연결 주체를 확인해야 합니다.
                    </p>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>영상 유형</Label>
                    <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm">
                      {videoKind === "original" ? "오리지널곡" : "공식 커버곡"}
                    </div>
                  </div>
                  <div className="space-y-1.5"><Label>공개 형태</Label><Select value={releaseType} onValueChange={(value) => setReleaseType(value as typeof releaseType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="official_video">공식 영상</SelectItem><SelectItem value="official_mv">공식 MV</SelectItem></SelectContent></Select></div>
                  <div className="space-y-1.5"><Label>참여 형태</Label><Select value={participationType} onValueChange={(value) => setParticipationType(value as OtwPlayParticipationType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(participationLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div className="rounded-xl border bg-card p-4">
                  <SongTagPicker
                    tags={performanceTags}
                    onChange={setPerformanceTags}
                    label="커버 영상 라벨"
                    placeholder="이 영상만의 라벨 입력"
                    selectedLabel="선택한 커버 영상 라벨"
                    description="이 커버 영상·가창 버전에만 적용됩니다. 곡의 장르·분류와 별도로 최대 10개까지 입력할 수 있습니다."
                    recommendedTags={registrationMode === "medley_segment" ? ["메들리 수록"] : []}
                  />
                </div>
                <div className="space-y-1.5"><Label>내부 메모 (선택)</Label><Textarea value={internalNote} onChange={(event) => setInternalNote(event.target.value)} /></div>
              </>
            )}

            {step === 3 && preflight && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border p-4">
                  <div className="mb-3 text-sm font-semibold">영상과 채널</div>
                  <img src={preflight.video.thumbnailUrl ?? `https://i.ytimg.com/vi/${preflight.video.videoId}/hqdefault.jpg`} alt="등록 영상" className="mb-3 aspect-video w-full rounded-md object-cover" />
                  <div className="font-medium">{preflight.video.title}</div>
                  <div className="text-sm text-muted-foreground">{preflight.video.channelTitle}</div>
                  <div className="mt-2 flex flex-wrap gap-2"><Badge variant="outline">{channelChoice === "approved" || preflight.channel.state === "approved" || preflight.channel.state === "recognized_member" ? "승인 채널" : "채널 검수 대기"}</Badge><Badge variant="outline">{startSeconds}초–{endSeconds}초</Badge>{registrationMode === "medley_segment" ? <Badge>메들리 구간</Badge> : null}</div>
                  {needsChannelOwnerChoice && <div className="mt-3 text-sm"><span className="font-medium">연결 주체:</span> {channelOwners.map((owner) => owner.label).join(", ")}</div>}
                </div>
                <div className="space-y-4 rounded-xl border p-4">
                  <div>
                    <div className="text-sm font-semibold">곡</div>
                    <div>
                      {songId && songId !== "__new"
                        ? catalog.songs.find((song) => song.id === songId)?.title
                        : videoKind === "cover"
                          ? coverOriginalTitle
                          : preflight.video.title}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {songId && songId !== "__new"
                        ? "기존 곡을 자동 재사용"
                        : videoKind === "original"
                          ? "영상 제목으로 자동 생성 · 참여자를 원곡 가수로 사용"
                          : `원곡 가수: ${coverOriginalArtists.map((artist) => artist.label).join(", ")}`}
                    </div>
                  </div>
                  <div><div className="text-sm font-semibold">참여자</div><div className="flex flex-wrap gap-1">{participants.map((participant) => <Badge key={participant.key} variant="secondary">{participant.label}</Badge>)}</div></div>
                  <div><div className="text-sm font-semibold">분류</div><div className="text-sm text-muted-foreground">{videoKind === "original" ? "오리지널곡" : "공식 커버곡"} · {releaseType === "official_mv" ? "공식 MV" : "공식 영상"} · {participationLabels[participationType]}</div></div>
                  {songTags.length > 0 ? <div><div className="text-sm font-semibold">곡 분류</div><div className="mt-1 flex flex-wrap gap-1">{songTags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</div></div> : null}
                  {performanceTags.length > 0 ? <div><div className="text-sm font-semibold">커버 영상 라벨</div><div className="mt-1 flex flex-wrap gap-1">{performanceTags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div></div> : null}
                  <div className="rounded-md bg-muted p-3 text-sm">{registrationMode === "medley_segment" ? "메들리의 각 커버 구간은 검토를 위해 비공개 draft로만 저장됩니다." : "임시 저장은 공개되지 않습니다. 게시는 승인·활성 채널에서만 가능하며 확인 후 즉시 공개 상태가 됩니다."}</div>
                </div>
              </div>
            )}
          </div>
          )}

          {completedMedleySegment ? (
            <DialogFooter className="border-t pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>완료</Button>
              <Button type="button" onClick={prepareNextMedleySegment}>같은 영상의 다음 커버 추가</Button>
            </DialogFooter>
          ) : (
            <DialogFooter className="border-t pt-4 sm:justify-between">
              <div><Button type="button" variant="outline" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0 || saving}><ArrowLeft className="h-4 w-4" /> 이전</Button></div>
              {step < 3 ? <Button type="button" onClick={() => setStep((value) => Math.min(3, value + 1))} disabled={!stepReady}>다음 <ArrowRight className="h-4 w-4" /></Button> : <div className="flex flex-col-reverse gap-2 sm:flex-row"><Button type="button" variant="outline" disabled={saving} onClick={() => void save("draft")}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} 임시 저장</Button>{registrationMode === "standard" ? <Button type="button" disabled={saving || !channelCanPublish} title={channelCanPublish ? undefined : "승인·활성 채널에서만 게시할 수 있습니다."} onClick={() => setConfirmPublish(true)}>게시</Button> : null}</div>}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmActionDialog open={confirmPublish} onOpenChange={setConfirmPublish} title="이 영상을 게시할까요?" description="자동 생성되는 곡과 가창 metadata가 공개 카탈로그 상태로 저장됩니다. 영상 유형과 채널 정보를 다시 확인해 주세요." confirmLabel="게시" onConfirm={() => { setConfirmPublish(false); void save("published"); }} />
    </>
  );
}
