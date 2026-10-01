import { BroadcastFields, EMPTY_BROADCAST } from "./broadcast-fields";
import type { AiReviewFields, AiReviewField } from "@contracts/otw-play-ai-review";
import type { OtwPlayParticipantRole } from "@contracts/otw-play";
import { AiReviewPanel } from "./ai-review-panel";
import { useAiReviewSession } from "./use-ai-review-session";
import { preservesRegistrationVisit, type RegistrationChannelVisit, type RegistrationChannelTarget } from "./registration-channel";
import { aiPersonSelection, useAiReviewForm } from "./ai-review-form";
import { useUnsavedChanges } from "@/shared/lib/unsaved-changes";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  OtwPlayAdminCatalogDto,
  OtwPlayAdminCatalogEntryPreflightDto,
  OtwPlayAdminCatalogSubjectInput,
  OtwPlayAdminCreateCatalogEntryRequest,
  OtwPlayAdminEntityDto,
  OtwPlayParticipationType,
} from "@contracts/otw-play";
import { ConfirmActionDialog } from "@/shared/ui/confirm-action-dialog";
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
import { SelectField } from "@/shared/ui/select-field";
import { Textarea } from "@/shared/ui/textarea";
import { useToast } from "@/shared/ui/toast";
import { PiArrowLeftBold as ArrowLeft, PiArrowRightBold as ArrowRight, PiSpinnerGapBold as Loader2, PiMagnifyingGlassBold as Search, PiUserPlusBold as UserRoundPlus, PiUsersBold as UsersRound, PiXBold as X } from "react-icons/pi";
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

const STEPS = ["영상", "곡", "가창", "저장"];

const participantRoleLabels: Record<OtwPlayParticipantRole, string> = {
  vocal: "메인 보컬", featured_vocal: "피처링 보컬", chorus: "코러스", other: "기타",
};

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
  placeholder = "멤버 또는 인물·그룹 검색",
  helpText = "기존 인물·그룹을 검색해 선택하세요. 찾는 대상이 없으면 새로 등록할 수 있습니다.",
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
      <Label htmlFor={`${listboxId}-search`}>{label}</Label>
      {selected.length > 0 && <div className="flex flex-wrap gap-2">
        {selected.map((item) => (
          <Badge key={item.key} variant="secondary" className="max-w-full gap-1 py-1">
            <span className="min-w-0 whitespace-normal break-words">{item.subject.kind === "member" && item.detail
              ? `${item.label} ${item.detail}`
              : item.label}</span>
            <button
              type="button"
              aria-label={`${item.label} 제거`}
              className="shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-2"
              onClick={() => onChange(selected.filter((value) => value.key !== item.key))}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={`${listboxId}-search`}
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
            <div className="mt-1 grid grid-cols-2 gap-1 border-t pt-1">
              <Button type="button" variant="ghost" size="sm" className="h-auto min-h-11 whitespace-normal px-2" onClick={() => addNew("person")}>
                <UserRoundPlus className="h-4 w-4" /> 외부 인물로 추가
              </Button>
              {allowGroup && (
                <Button type="button" variant="ghost" size="sm" className="h-auto min-h-11 whitespace-normal px-2" onClick={() => addNew("group")}>
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
  clip: initialClip = false,
  onSaved,
  suspended = false,
  channelVisit = null,
  onManageChannel,
  refreshCatalog,
}: {
  clip?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: OtwPlayAdminCatalogDto;
  preselectedSongId: string | null;
  onSaved: (scope: "official" | "broadcast") => Promise<void>;
  suspended?: boolean;
  channelVisit?: RegistrationChannelVisit | null;
  onManageChannel?: (target: RegistrationChannelTarget) => void;
  refreshCatalog?: () => Promise<void>;
}) {
  const { toast } = useToast();
  const membersQuery = useQuery({
    queryKey: queryKeys.members.active(),
    queryFn: fetchActiveMembers,
    staleTime: 60_000,
    enabled: open,
  });
  const members = membersQuery.data ?? [];
  const [broadcast, setBroadcast] = useState(EMPTY_BROADCAST);
  const [step, setStep] = useState(0);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [startSeconds, setStartSeconds] = useState("0");
  const [endSeconds, setEndSeconds] = useState("");
  const [segmentEnabled, setSegmentEnabled] = useState(false);
  const [preflight, setPreflight] = useState<OtwPlayAdminCatalogEntryPreflightDto | null>(null);
  const [checking, setChecking] = useState(false);
  const [channelChoice, setChannelChoice] = useState<"approved" | "pending">("pending");
  const [channelRole, setChannelRole] = useState<"member_music" | "member_main" | "project_official" | "otw_official" | "unit_official">("project_official");
  const [songId, setSongId] = useState("");
  const [songQuery, setSongQuery] = useState("");
  const [videoKind, setVideoKind] = useState<VideoKind | null>(null);
  const clip = initialClip || videoKind === "karaoke";
  const [registrationMode, setRegistrationMode] = useState<
    NonNullable<OtwPlayAdminCreateCatalogEntryRequest["registrationMode"]>
  >("standard");
  const [coverOriginalTitle, setCoverOriginalTitle] = useState("");
  const [coverOriginalArtists, setCoverOriginalArtists] = useState<SelectedSubject[]>([]);
  const [songTags, setSongTags] = useState<string[]>([]);
  const [performanceTags, setPerformanceTags] = useState<string[]>([]);
  const [participants, setParticipants] = useState<(SelectedSubject & { participantRole?: OtwPlayParticipantRole })[]>([]);
  const [channelOwners, setChannelOwners] = useState<SelectedSubject[]>([]);
  const [releaseType, setReleaseType] = useState<"official_mv" | "official_video">("official_video");
  const [participationType, setParticipationType] = useState<OtwPlayParticipationType>("solo");
  const [internalNote, setInternalNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completedSegment, setCompletedSegment] = useState<{
    endSeconds: number;
    durationSeconds: number;
  } | null>(null);
  const preservedNavigation = useMemo(() => channelVisit ? preservesRegistrationVisit(channelVisit) : undefined, [channelVisit]);
  const hasDraftInput = Boolean((songId && songId !== preselectedSongId) || coverOriginalTitle.trim() || coverOriginalArtists.length ||
    participants.length || channelOwners.length || songTags.length || performanceTags.length ||
    internalNote.trim() || segmentEnabled || broadcast.performedOn || broadcast.dateEvidence ||
    broadcast.originalUrl || broadcast.extent);
  const canDiscard = useUnsavedChanges(open && !completedSegment && hasDraftInput, preservedNavigation);
  const aiSession = useAiReviewSession(`${open}:${youtubeUrl}:${clip}`);
  const channelCardRef = useRef<HTMLElement>(null);
  const formBodyRef = useRef<HTMLDivElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (formBodyRef.current) formBodyRef.current.scrollTop = 0;
    stepHeadingRef.current?.focus();
  }, [step]);
  const wasSuspended = useRef(false);
  const recheckGeneration = useRef(0);
  const [channelRecheck, setChannelRecheck] = useState<"idle" | "checking" | "failed" | "done">("idle");
  const close = async (next: boolean) => { if (next || await canDiscard()) onOpenChange(next); };
  const draftExternalSubjects = uniqueNewExternalSubjects([
    ...coverOriginalArtists,
    ...participants,
    ...channelOwners,
  ]);

  const ai = useAiReviewForm(`${open}:${youtubeUrl}:${clip}`, {
    song:[songId,coverOriginalTitle,coverOriginalArtists,songTags,songQuery],participants,
    classification:[videoKind,releaseType],participationType,performanceTags,segment:[startSeconds,endSeconds,segmentEnabled],
    broadcastDate:[broadcast.performedOn,broadcast.dateEvidence],originalUrl:broadcast.originalUrl,extent:broadcast.extent,
  },(field,value)=>{
    switch(field){
      case "song": {const v=value as AiReviewFields["song"];setSongId(v.existingSongId??"__new");setSongQuery(v.title);setCoverOriginalTitle(v.title);setCoverOriginalArtists(v.existingSongId ? [] : v.originalArtists.map(aiPersonSelection));setSongTags(v.existingSongId?[]:v.tags);break;}
      case "participants":setParticipants((value as AiReviewFields["participants"]).map(p=>({...aiPersonSelection(p),participantRole:p.role})));break;
      case "classification": {const v=value as AiReviewFields["classification"];if(!clip && v.releaseType!=="broadcast" && v.relationType!=="singing_clip"){setVideoKind(v.relationType);setReleaseType(v.releaseType);}break;}
      case "participationType":setParticipationType(value as OtwPlayParticipationType);break;
      case "performanceTags":setPerformanceTags(value as string[]);break;
      case "segment":{const v=value as AiReviewFields["segment"];setStartSeconds(String(v.startSeconds));setEndSeconds(String(v.endSeconds));break;}
      case "broadcastDate":setBroadcast(old=>({...old,...value as AiReviewFields["broadcastDate"]}));break;
      case "originalUrl":setBroadcast(old=>({...old,originalUrl:value as string}));break;
      case "extent":setBroadcast(old=>({...old,extent:value as "full"|"partial"}));break;
    }
  },(field,value)=>{
    switch(field){
      case "song":{const v=value as [string,string,SelectedSubject[],string[],string];setSongId(v[0]);setCoverOriginalTitle(v[1]);setCoverOriginalArtists(v[2]);setSongTags(v[3]);setSongQuery(v[4]);break;}
      case "participants":setParticipants(value as typeof participants);break;
      case "classification":{const v=value as [VideoKind|null,typeof releaseType];setVideoKind(v[0]);setReleaseType(v[1]);break;}
      case "participationType":setParticipationType(value as OtwPlayParticipationType);break;
      case "performanceTags":setPerformanceTags(value as string[]);break;
      case "segment":{const v=value as [string,string,boolean];setStartSeconds(v[0]);setEndSeconds(v[1]);setSegmentEnabled(v[2]);break;}
      case "broadcastDate":{const v=value as [string|null,string|null];setBroadcast(old=>({...old,performedOn:v[0],dateEvidence:v[1]}));break;}
      case "originalUrl":setBroadcast(old=>({...old,originalUrl:value as string|null}));break;
      case "extent":setBroadcast(old=>({...old,extent:value as "full"|"partial"|null}));break;
    }
  }, preselectedSongId ? ["song"] as AiReviewField[] : []);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setBroadcast(EMPTY_BROADCAST);
    setYoutubeUrl("");
    setSegmentEnabled(false);
    setStartSeconds("0");
    setEndSeconds("");
    setPreflight(null);
    setChecking(false);
    setErrorMessage(null);
    setChannelRecheck("idle");
    setChannelChoice("pending");
    setChannelRole("project_official");
    setVideoKind(initialClip ? "karaoke" : null);
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
    setCompletedSegment(null);
    if (preselectedSongId) {
      setSongId(preselectedSongId);
    } else {
      setSongId("");
    }
  }, [open, preselectedSongId, initialClip]);

  const runPreflight = async () => {
    const generation = ++recheckGeneration.current;
    setChecking(true);
    setErrorMessage(null);
    try {
      const result = await preflightOtwPlayCatalogEntry({
        youtubeUrl,
        startSeconds: segmentEnabled ? Number(startSeconds) : 0,
        endSeconds: segmentEnabled && endSeconds.trim() ? Number(endSeconds) : null,
      });
      if (generation !== recheckGeneration.current) return;
      setPreflight(result);
      if (videoKind === "original" && !songId && !coverOriginalTitle.trim()) setCoverOriginalTitle(result.video.title);
      setChannelRecheck("idle");
      if (result.video.durationSeconds === null) {
        setErrorMessage("영상 길이를 확인할 수 없어 시작·종료 구간을 등록할 수 없습니다.");
      } else if (!segmentEnabled || !endSeconds.trim()) {
        setEndSeconds(String(result.video.durationSeconds));
      }
      setChannelChoice(result.channel.state === "approved" || result.channel.state === "recognized_member" ? "approved" : "pending");
      if (result.channel.channelRole === "member_music" || result.channel.channelRole === "member_main" || result.channel.channelRole === "project_official" || result.channel.channelRole === "otw_official" || result.channel.channelRole === "unit_official") {
        setChannelRole(result.channel.channelRole);
      }
    } catch (error) {
      if (generation === recheckGeneration.current) setErrorMessage(preflightErrorMessage(error));
    } finally {
      if (generation === recheckGeneration.current) setChecking(false);
    }
  };

  const recheckChannel = useCallback(async () => {
    const generation = ++recheckGeneration.current;
    setChannelRecheck("checking");
    try {
      await refreshCatalog?.();
      const result = await preflightOtwPlayCatalogEntry({ youtubeUrl,
        startSeconds: segmentEnabled ? Number(startSeconds) : 0,
        endSeconds: segmentEnabled && endSeconds.trim() ? Number(endSeconds) : null });
      if (generation !== recheckGeneration.current) return;
      setPreflight(result);
      setChannelChoice(result.channel.state === "approved" || result.channel.state === "recognized_member" ? "approved" : "pending");
      setChannelRecheck("done");
      setErrorMessage(null);
    } catch (error) {
      if (generation !== recheckGeneration.current) return;
      setChannelRecheck("failed");
      setErrorMessage(preflightErrorMessage(error));
    }
  }, [refreshCatalog, youtubeUrl, segmentEnabled, startSeconds, endSeconds]);
  useEffect(() => () => { recheckGeneration.current++; }, [open, youtubeUrl, segmentEnabled, startSeconds, endSeconds, suspended]);
  useEffect(() => {
    if (!open) {
      wasSuspended.current = false;
      setChannelRecheck("idle");
      return;
    }
    if (suspended) { wasSuspended.current = true; return; }
    if (!wasSuspended.current) return;
    wasSuspended.current = false;
    void recheckChannel();
  }, [suspended, open, recheckChannel]);
  useEffect(() => {
    if (!suspended && (channelRecheck === "done" || channelRecheck === "failed")) channelCardRef.current?.focus();
  }, [suspended, channelRecheck]);
  const channelUnverified = suspended || wasSuspended.current || channelRecheck === "checking" || channelRecheck === "failed";

  const clipChannelReady = preflight?.channel.state === "approved" && preflight.channel.channelRole === "approved_kirinuki";
  const channelReady = clip ? clipChannelReady : Boolean(preflight &&
    (preflight.channel.state === "approved" || preflight.channel.state === "recognized_member") &&
    preflight.channel.channelRole !== "approved_kirinuki");
  const channelCanPublish = !clip && (
    preflight?.channel.state === "approved" ||
    preflight?.channel.state === "recognized_member" ||
    (preflight?.channel.state !== "revoked" && channelChoice === "approved"));
  const needsChannelOwnerChoice = Boolean(
    !clip && preflight &&
      preflight.channel.state !== "approved" &&
      preflight.channel.state !== "recognized_member" &&
      !(preflight.channel.catalogChannelId && channelChoice === "pending"),
  );
  const parsedStartSeconds = segmentEnabled ? Number(startSeconds) : 0;
  const parsedEndSeconds = segmentEnabled
    ? Number(endSeconds)
    : preflight?.video.durationSeconds ?? 0;
  const segmentLabel = segmentEnabled
    ? `구간 ${parsedStartSeconds}초–${parsedEndSeconds}초`
    : `전체 영상 · ${parsedEndSeconds}초`;
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
  const originalArtists = !clip && videoKind === "original" && coverOriginalArtists.length === 0
    ? participants
    : coverOriginalArtists;
  const hasNewSongDetails =
    Boolean(coverOriginalTitle.trim()) && coverOriginalArtists.length > 0;
  const videoReady = Boolean(preflight && !preflight.duplicate &&
    preflight.channel.state !== "revoked" && videoKind && segmentValid &&
    (clip ? clipChannelReady : preflight.channel.channelRole !== "approved_kirinuki" ||
      (preflight.channel.state !== "approved" && channelChoice === "approved")) &&
    (registrationMode !== "medley_segment" || (segmentEnabled && !clip && videoKind === "cover")) &&
    (!needsChannelOwnerChoice || channelOwners.length > 0));
  const songStepReady = hasExistingSong || (!clip && videoKind === "original"
    ? Boolean(coverOriginalTitle.trim()) : hasNewSongDetails);
  const participantsReady = participants.length > 0;
  const draftReady = videoReady && songStepReady && participantsReady &&
    (hasExistingSong || originalArtists.length > 0) && !channelUnverified && !checking;
  const hasSingingCredit = participants.some(person => (person.participantRole ?? "vocal") !== "other");
  const publishReady = draftReady && !clip && registrationMode === "standard" && channelCanPublish && hasSingingCredit;
  const stepReady = [videoReady, songStepReady, participantsReady, draftReady][step];
  const missingStep = !videoReady || channelUnverified ? 0 : !songStepReady ? 1 : 2;

  const buildRequest = (publicationTarget: "draft" | "published"): OtwPlayAdminCreateCatalogEntryRequest => {
    if (!preflight || (!clip && videoKind !== "original" && videoKind !== "cover")) {
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
        : {
              kind: "create",
              title: coverOriginalTitle.trim(),
              isOtwOriginal: !clip && videoKind === "original",
              originalReleaseDate: null,
              originalReleasePrecision: "unknown",
              aliases: [],
              originalArtists: originalArtists.map((artist, index) => ({
                subject: artist.subject,
                creditOrder: index,
                isPrimary: index === 0,
              })),
              ...(songTags.length > 0 ? { tags: songTags } : {}),
            },
      participants: participants.map((participant, index) => ({
        subject: participant.subject,
        participantRole: participant.participantRole ?? "vocal",
        creditOrder: index,
        creditNameSnapshot: participant.label,
      })),
      channel,
      relationType: clip ? "singing_clip" : videoKind === "original" ? "original" : "cover",
      releaseType: clip ? "broadcast" : releaseType,
      ...(clip ? { broadcast } : {}),
      participationType,
      ...(performanceTags.length > 0 ? { performanceTags } : {}),
      publicationTarget,
      internalNote: internalNote.trim() || null,
    };
  };

  const save = async (target: "draft" | "published") => {
    if (!draftReady || (target === "published" && !publishReady)) {
      setErrorMessage("영상·곡·가창의 필수 정보를 확인해 주세요.");
      setStep(missingStep);
      return;
    }
    setSaving(true);
    setErrorMessage(null);
    try {
      const result = await createOtwPlayCatalogEntry(buildRequest(target));
      await onSaved(clip ? "broadcast" : "official");
      toast({ variant: "success", description: target === "published" ? "영상을 게시했습니다." : "영상을 임시 저장했습니다." });
      if (
        (registrationMode === "medley_segment" || (clip && segmentEnabled)) &&
        preflight?.video.durationSeconds !== null &&
        preflight?.video.durationSeconds !== undefined
      ) {
        setParticipants(reuseCreatedSubjects(participants, result.data.createdEntities));
        setChannelOwners(reuseCreatedSubjects(channelOwners, result.data.createdEntities));
        setCompletedSegment({
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

  const prepareNextSegment = () => {
    if (!completedSegment) return;
    setStep(0);
    setSegmentEnabled(true);
    setStartSeconds(String(completedSegment.endSeconds));
    setEndSeconds(String(completedSegment.durationSeconds));
    setPreflight(null);
    setVideoKind(clip ? "karaoke" : "cover");
    setRegistrationMode(clip ? "standard" : "medley_segment");
    if (clip) setBroadcast(value => ({ ...value, extent: null }));
    setSongId("");
    setSongQuery("");
    setCoverOriginalTitle("");
    setCoverOriginalArtists([]);
    setSongTags([]);
    setInternalNote("");
    setErrorMessage(null);
    setCompletedSegment(null);
  };

  return (
    <>
      <Dialog open={open && !suspended} onOpenChange={(next) => { if (!saving && !suspended) void close(next); }}>
        <DialogContent onEscapeKeyDown={(event) => {
          if (event.target instanceof HTMLElement && event.target.matches('[role="combobox"][aria-expanded="true"]')) event.preventDefault();
        }} className="otw-play-entry-dialog flex h-[100dvh] max-h-[100dvh] max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 [color-scheme:light] dark:[color-scheme:dark] sm:h-auto sm:max-h-[92dvh] sm:max-w-3xl sm:rounded-xl sm:border">
          <DialogHeader className="shrink-0 gap-1 p-4 text-left sm:px-6 sm:pt-6">
            <DialogTitle>{clip ? "노래 클립 직접 등록" : "새 YouTube 영상 등록"}</DialogTitle>
            <DialogDescription>{clip ? "승인된 노래 클립 채널의 영상을 곡·가창자에 연결하고 임시 저장합니다. 검토 후 노래 클립 목록에서 게시하세요." : "영상과 채널을 확인하고 곡·가창 정보를 입력한 뒤 저장합니다."}</DialogDescription>
          </DialogHeader>
          {!completedSegment && (
            <ol className="mx-4 grid shrink-0 grid-cols-4 gap-1 sm:mx-6" aria-label="등록 단계">
              {STEPS.map((label, index) => (
                <li key={label} aria-current={index === step ? "step" : undefined} className={`rounded-md px-2 py-2 text-center text-xs ${index === step ? "bg-primary text-primary-foreground" : index < step ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  <span className="hidden sm:inline">{index + 1}. </span>{label}
                </li>
              ))}
            </ol>
          )}

          {!completedSegment && errorMessage && <div role="alert" className="mx-4 mt-4 shrink-0 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive sm:mx-6">{errorMessage}</div>}

          {completedSegment ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto px-4 py-8 text-center sm:min-h-72 sm:px-6" role="status">
              <div>
                <h3 className="text-lg font-semibold">{clip ? "노래방송 가창 구간을 임시 저장했습니다." : "메들리 커버 구간을 임시 저장했습니다."}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  같은 영상의 다음 곡을 이어서 등록하거나 현재 작업을 마칠 수 있습니다.
                </p>
              </div>
              <Badge variant="outline">
                다음 시작 위치 {completedSegment.endSeconds}초
              </Badge>
            </div>
          ) : (
          <div ref={formBodyRef} className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-5 [overflow-wrap:anywhere] [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin] [word-break:keep-all] sm:px-6">
            {step === 0 && (
              <section className="space-y-4" aria-label="영상 정보">
                <h3 ref={stepHeadingRef} tabIndex={-1} className="font-semibold outline-none">등록할 영상</h3>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:gap-3">
                  <div className="space-y-1.5"><Label htmlFor="catalog-youtube-url">YouTube URL</Label><Input id="catalog-youtube-url" value={youtubeUrl} disabled={checking || channelRecheck === "checking"} onChange={(event) => { setYoutubeUrl(event.target.value); setEndSeconds(""); setPreflight(null); }} placeholder="https://www.youtube.com/watch?v=..." /></div>
                  <Button type="button" onClick={() => void runPreflight()} disabled={checking || channelRecheck === "checking" || !youtubeUrl.trim()}>{checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} 영상 확인</Button>
                </div>
                {preflight && (
                  <div className="flex items-start gap-3">
                    <img src={preflight.video.thumbnailUrl ?? `https://i.ytimg.com/vi/${preflight.video.videoId}/hqdefault.jpg`} alt="확인한 영상 썸네일" className="aspect-video w-24 shrink-0 rounded-md object-cover sm:w-32" />
                    <div className="min-w-0 space-y-2">
                      <div className="break-words font-medium">{preflight.video.title}</div>
                      <div className="text-sm text-muted-foreground">{preflight.video.durationSeconds === null ? "영상 길이 미확인" : `영상 길이 · ${preflight.video.durationSeconds}초`}</div>
                      {preflight.duplicate && <div role="alert" className="text-sm text-destructive"><strong>이미 등록된 영상 구간입니다.</strong> 구간을 바꾸거나 기존 항목을 확인하세요.<Button type="button" variant="link" className="h-auto px-1" onClick={() => onOpenChange(false)}>목록으로 돌아가기</Button></div>}
                    </div>
                  </div>
                )}
                {!initialClip && <fieldset className="space-y-2">
                  <legend className="mb-2 text-sm font-medium">영상 유형</legend>
                  <div className="grid grid-cols-3 gap-2">
                    {([["original", "오리지널곡"], ["cover", "공식 커버곡"], ["karaoke", "노래방송"]] as const).map(([kind, label]) => (
                      <Button key={kind} type="button" disabled={checking || channelRecheck === "checking"} variant={videoKind === kind ? "default" : "outline"} aria-pressed={videoKind === kind}
                        className="h-auto min-h-11 whitespace-normal px-2"
                        onClick={() => {
                          ai.touch("classification"); setVideoKind(kind);
                          if (kind !== "cover") setRegistrationMode("standard");
                          if (kind === "original" && videoKind !== "original" && !hasExistingSong && !coverOriginalTitle.trim()) {
                            ai.touch("song"); setCoverOriginalTitle(preflight?.video.title ?? "");
                          }
                        }}>{label}</Button>
                    ))}
                  </div>
                </fieldset>}
                {!clip && videoKind && <div className="space-y-1.5"><Label htmlFor="catalog-release-type">공개 형태</Label><SelectField className="w-full min-w-0" id="catalog-release-type" value={releaseType} onValueChange={(value) => { ai.touch("classification"); setReleaseType(value as typeof releaseType); }} options={[{value:"official_video",label:"공식 영상"},{value:"official_mv",label:"공식 MV"}]} /></div>}
                <fieldset className="space-y-3">
                  <legend className="mb-2 text-sm font-medium">등록 범위</legend>
                  <div className="flex flex-wrap items-center gap-3">
                    <Label htmlFor="catalog-segment-enabled" className="flex min-h-11 items-center gap-2">
                      <Checkbox id="catalog-segment-enabled" checked={segmentEnabled} disabled={checking || channelRecheck === "checking" || registrationMode === "medley_segment"}
                        onCheckedChange={(checked) => {
                          setSegmentEnabled(checked === true);
                          if (checked !== true) { ai.touch("segment"); setStartSeconds("0"); setEndSeconds(""); }
                          setPreflight(null); setErrorMessage(null);
                        }} />구간 선택
                    </Label>
                    <span className="text-xs text-muted-foreground">{segmentEnabled ? "구간을 바꾼 뒤 영상을 다시 확인하세요." : "전체 영상으로 등록합니다."}</span>
                  </div>
                  {segmentEnabled && <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
                    <div className="space-y-1.5"><Label htmlFor="catalog-start">시작 위치(초)</Label><Input id="catalog-start" type="number" min="0" value={startSeconds} disabled={checking || channelRecheck === "checking"} onChange={(event) => { ai.touch("segment"); setStartSeconds(event.target.value); setPreflight(null); }} /></div>
                    <div className="space-y-1.5"><Label htmlFor="catalog-end">종료 위치(초)</Label><Input id="catalog-end" type="number" min="1" value={endSeconds} disabled={checking || channelRecheck === "checking"} onChange={(event) => { ai.touch("segment"); setEndSeconds(event.target.value); setPreflight(null); }} placeholder="확인 후 자동 입력" /></div>
                  </div>}
                  {!clip && videoKind === "cover" && <Label className="flex min-h-11 items-center gap-2">
                    <Checkbox checked={registrationMode === "medley_segment"} aria-label="메들리의 한 곡 구간" disabled={checking || channelRecheck === "checking"}
                      onCheckedChange={(checked) => {
                        setRegistrationMode(checked === true ? "medley_segment" : "standard");
                        if (checked === true && !segmentEnabled) { setSegmentEnabled(true); setPreflight(null); }
                      }} />메들리의 한 곡 구간
                  </Label>}
                  {(clip || registrationMode === "medley_segment") && <p className="text-xs text-muted-foreground">한 곡씩 임시 저장하며, 저장 후 같은 영상의 다음 곡을 이어서 등록할 수 있습니다.</p>}
                </fieldset>
              </section>
            )}

            {preflight && (step === 0 || channelUnverified || preflight.channel.state === "revoked" || (clip && !clipChannelReady)) && (
              <section ref={channelCardRef} tabIndex={-1} role="region" aria-label="등록 채널 상태" className="space-y-3 border-t pt-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">채널 · {preflight.video.channelTitle}</h3>
                  <Badge variant={preflight.channel.state === "revoked" ? "destructive" : "outline"}>{preflight.channel.state === "unknown" ? "미등록" : preflight.channel.state === "pending" ? "승인 대기" : preflight.channel.state === "inactive" ? "비활성" : preflight.channel.state === "revoked" ? "철회됨" : "채널 확인됨"}</Badge>
                </div>
                {channelRecheck !== "idle" || !channelReady ? <p role={channelReady && channelRecheck !== "failed" ? "status" : "alert"}>{channelRecheck === "checking" ? "채널 상태를 다시 확인하고 있습니다." : channelRecheck === "failed" ? "채널 상태를 확인하지 못했습니다. 다시 확인한 뒤 계속하세요." : channelReady ? "채널 확인 완료 · 계속 입력하세요." : preflight.channel.state === "revoked" ? "철회된 채널에서는 등록하거나 게시할 수 없습니다." : clip ? "승인된 노래 클립 채널에서만 등록할 수 있습니다." : preflight.channel.channelRole === "approved_kirinuki" ? "노래 클립 채널에는 공식 곡을 등록할 수 없습니다. 영상 유형 또는 채널 용도를 확인하세요." : "채널 처리와 소유·연결 주체를 확인하세요."}</p> : null}
                {!clip && preflight.channel.state !== "revoked" && preflight.channel.state !== "approved" && preflight.channel.state !== "recognized_member" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5"><Label htmlFor="catalog-channel-choice">채널 처리</Label><SelectField className="w-full min-w-0" id="catalog-channel-choice" value={channelChoice} onValueChange={value => setChannelChoice(value as "approved" | "pending")} options={[{value:"pending",label:"보류하고 임시 저장"},{value:"approved",label:"공식 채널로 승인"}]} /></div>
                    <div className="space-y-1.5"><Label htmlFor="catalog-channel-role">채널 역할</Label><SelectField className="w-full min-w-0" id="catalog-channel-role" value={channelRole} onValueChange={value => setChannelRole(value as typeof channelRole)} options={[{value:"otw_official",label:"OTW 공식"},{value:"unit_official",label:"유닛 공식"},{value:"member_music",label:"멤버 노래 채널"},{value:"member_main",label:"멤버 메인 채널"},{value:"project_official",label:"승인 프로젝트"}]} /></div>
                  </div>
                )}
                {needsChannelOwnerChoice && <SubjectPicker label="채널 소유·연결 주체" members={members} entities={catalog.entities} draftSubjects={draftExternalSubjects} selected={channelOwners} onChange={setChannelOwners} helpText="영상의 가창자와 별개로 채널을 소유하거나 연결하는 주체를 선택하세요." />}
                {onManageChannel ? <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={saving || checking || channelRecheck === "checking" || aiSession.launching}
                    onClick={() => onManageChannel({externalChannelId:preflight.video.channelId,displayName:preflight.video.channelTitle,kind:clip?"singing_clip":"official_video",role:clip?"approved_kirinuki":channelRole})}>{preflight.channel.state === "unknown" ? "이 채널 등록하기" : preflight.channel.state === "pending" ? "승인 검토" : preflight.channel.state === "inactive" ? "영상 사용 설정" : preflight.channel.state === "revoked" ? "철회 상태 확인" : !channelReady ? "채널 용도 확인" : "채널 설정"}</Button>
                  {channelRecheck === "failed" && <Button type="button" size="sm" variant="outline" onClick={() => void recheckChannel()}>채널 상태 다시 확인</Button>}
                </div> : !channelReady && <a className="underline" href="/admin/otw-play?tab=channels" target="_blank" rel="noreferrer">Play 채널 관리</a>}
              </section>
            )}

            {step === 1 && <section className="space-y-4" aria-label="곡 정보">
              <h3 ref={stepHeadingRef} tabIndex={-1} className="font-semibold outline-none">어떤 곡을 불렀나요?</h3>
              <SongConnectionPicker inputKey="catalog-medley" catalog={catalog} selectedSongId={songId} query={songQuery}
                onQueryChange={value => { ai.touch("song"); setSongQuery(value); }}
                onSelectExisting={(nextSongId, title) => {
                  ai.touch("song"); setSongId(nextSongId); setSongQuery(title);
                  setCoverOriginalTitle(""); setCoverOriginalArtists([]); setSongTags([]);
                }}
                onSelectNew={title => {
                  ai.touch("song"); setSongId("__new"); setSongQuery(title); setCoverOriginalTitle(title);
                  if (hasExistingSong) { setCoverOriginalArtists([]); setSongTags([]); }
                }} />
              {hasExistingSong ? <Button type="button" variant="outline" onClick={() => {
                ai.touch("song"); setSongId("__new"); setSongQuery(""); setCoverOriginalTitle(""); setCoverOriginalArtists([]); setSongTags([]);
              }}>새 곡 직접 입력</Button> : <div className="grid items-start gap-6 sm:grid-cols-2">
                <div className="min-w-0 space-y-4">
                <div className="space-y-1.5"><Label htmlFor="cover-original-title">곡 제목</Label><Input id="cover-original-title" value={coverOriginalTitle} onChange={event => { ai.touch("song"); setCoverOriginalTitle(event.target.value); }} placeholder="영상 제목이 아닌 곡의 정식 제목" maxLength={300} /></div>
                <SubjectPicker label="원곡 가수" placeholder="가수명을 검색하거나 새 외부 가수로 추가"
                  helpText={!clip && videoKind === "original" ? "비워두면 다음 단계의 가창 참여자를 원곡 가수로 사용합니다. 첫 번째 가수가 대표 원곡 가수입니다." : "첫 번째 가수를 대표 원곡 가수로 저장합니다."}
                  members={members} entities={catalog.entities} draftSubjects={draftExternalSubjects} selected={coverOriginalArtists} onChange={value => { ai.touch("song"); setCoverOriginalArtists(value); }} />
                </div>
                <SongTagPicker tags={songTags} onChange={value => { ai.touch("song"); setSongTags(value); }} description="곡 자체의 장르·분류입니다. 이 영상만의 라벨은 가창 단계에서 입력하세요." />
              </div>}
            </section>}

            {step === 2 && <section className="space-y-4" aria-label="가창 정보">
              <h3 ref={stepHeadingRef} tabIndex={-1} className="font-semibold outline-none">누가 어떻게 불렀나요?</h3>
              <SubjectPicker label="가창 참여자" members={members} entities={catalog.entities} draftSubjects={draftExternalSubjects} selected={participants} onChange={value => {
                ai.touch("participants"); setParticipants(value.map(person => ({...person,participantRole:participants.find(old => old.key===person.key)?.participantRole ?? "vocal"})));
              }} />
              {participants.length > 0 && <div className="space-y-2">
                {participants.map((participant,index) => <div key={participant.key} className="grid grid-cols-2 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
                  <span className="break-words text-sm">{participant.label}</span>
                  <SelectField className="w-full min-w-0" aria-label={`${participant.label} 역할`} value={participant.participantRole ?? "vocal"} onValueChange={value => {
                    ai.touch("participants"); setParticipants(old => old.map((person,i) => i===index ? {...person,participantRole:value as OtwPlayParticipantRole} : person));
                  }} options={Object.entries(participantRoleLabels).map(([value,label]) => ({value,label}))} />
                </div>)}
              </div>}
              <div className="space-y-1.5"><Label htmlFor="catalog-participation-type">참여 형태</Label><SelectField className="w-full min-w-0" id="catalog-participation-type" value={participationType} onValueChange={value => { ai.touch("participationType"); setParticipationType(value as OtwPlayParticipationType); }} options={Object.entries(participationLabels).map(([value,label]) => ({value,label}))} /></div>
              {clip && <BroadcastFields flat value={broadcast} onChange={value => {
                if(value.performedOn!==broadcast.performedOn || value.dateEvidence!==broadcast.dateEvidence) ai.touch("broadcastDate");
                if(value.originalUrl!==broadcast.originalUrl) ai.touch("originalUrl");
                if(value.extent!==broadcast.extent) ai.touch("extent");
                setBroadcast(value);
              }} />}
              <details className="border-t pt-3">
                <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">가창 라벨·내부 메모 (선택){performanceTags.length > 0 || internalNote.trim() ? " · 입력됨" : ""}</summary>
                <div className="space-y-4 pt-2">
                  <SongTagPicker tags={performanceTags} onChange={value => { ai.touch("performanceTags"); setPerformanceTags(value); }} label="가창 라벨" placeholder="이 영상만의 라벨 입력" selectedLabel="선택한 가창 라벨" description="이 영상·가창 버전에만 적용됩니다." recommendedTags={registrationMode === "medley_segment" ? ["메들리 수록"] : []} />
                  <div className="space-y-1.5"><Label htmlFor="catalog-internal-note">내부 메모 (선택)</Label><Textarea id="catalog-internal-note" value={internalNote} onChange={event => setInternalNote(event.target.value)} /></div>
                </div>
              </details>
            </section>}

            {step === 3 && preflight && <section className="space-y-5" aria-label="등록 내용 검토">
              <h3 ref={stepHeadingRef} tabIndex={-1} className="font-semibold outline-none">입력한 내용 확인</h3>
              {!draftReady && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">필수 정보가 빠졌거나 영상·채널을 다시 확인해야 합니다.<Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => setStep(missingStep)}>{STEPS[missingStep]} 정보 확인</Button></div>}
              <div className="grid gap-5 sm:grid-cols-2">
                <section className="space-y-2">
                  <div className="flex items-center justify-between"><h4 className="text-sm font-semibold">곡</h4><Button type="button" variant="link" size="sm" disabled={saving} onClick={() => setStep(1)}>곡 수정</Button></div>
                  <p className="break-words font-medium">{hasExistingSong ? catalog.songs.find(song => song.id===songId)?.title : coverOriginalTitle}</p>
                  <p className="text-sm text-muted-foreground">원곡 가수 · {hasExistingSong ? catalog.songs.find(song => song.id===songId)?.originalArtists?.map(artist => artist.displayName).join(", ") || "미등록" : originalArtists.map(artist => artist.label).join(", ") || "선택 필요"}</p>
                  {hasExistingSong && <Badge variant="outline">기존 곡 연결</Badge>}
                  {!hasExistingSong && songTags.length > 0 && <div aria-label="곡 분류" className="flex flex-wrap gap-1">{songTags.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div>}
                </section>
                <section className="space-y-2">
                  <div className="flex items-center justify-between"><h4 className="text-sm font-semibold">가창</h4><Button type="button" variant="link" size="sm" disabled={saving} onClick={() => setStep(2)}>가창 수정</Button></div>
                  <ul className="space-y-1 text-sm">{participants.map(person => <li key={person.key}>{person.label} · {participantRoleLabels[person.participantRole ?? "vocal"]}</li>)}</ul>
                  <p className="text-sm text-muted-foreground">{participationLabels[participationType]}</p>
                  {performanceTags.length > 0 && <div aria-label="가창 라벨" className="flex flex-wrap gap-1">{performanceTags.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div>}
                </section>
              </div>
              <section className="space-y-2 border-t pt-3">
                <div className="flex items-center justify-between"><h4 className="text-sm font-semibold">영상과 채널</h4><Button type="button" variant="link" size="sm" disabled={saving} onClick={() => setStep(0)}>영상 수정</Button></div>
                <p className="break-words text-sm">{preflight.video.title}</p>
                <p className="text-sm text-muted-foreground">{preflight.video.channelTitle} · {segmentLabel}</p>
                <div className="flex flex-wrap gap-1"><Badge variant="outline">{clip ? "노래 클립" : videoKind==="original" ? "오리지널곡" : "공식 커버곡"}</Badge>{!clip && <Badge variant="outline">{releaseType==="official_mv" ? "공식 MV" : "공식 영상"}</Badge>}<Badge variant="outline">{channelCanPublish || clipChannelReady ? "승인 채널" : "채널 검수 대기"}</Badge>{registrationMode==="medley_segment" && <Badge variant="outline">메들리 구간</Badge>}</div>
                {needsChannelOwnerChoice && <p className="text-sm">채널 연결 주체 · {channelOwners.map(owner => owner.label).join(", ")}</p>}
              </section>
              {clip && <section className="space-y-1 border-t pt-3 text-sm">
                <h4 className="font-semibold">방송 가창 정보</h4>
                <p>방송일 · {broadcast.performedOn ?? "미확인"} / 가창 범위 · {broadcast.extent==="full" ? "완곡" : broadcast.extent==="partial" ? "일부 가창" : "확인 필요"}</p>
                {broadcast.dateEvidence && <p className="break-words text-muted-foreground">확인 근거 · {broadcast.dateEvidence}</p>}
                {broadcast.originalUrl && <p className="break-all text-muted-foreground">원본 방송 · {broadcast.originalUrl}</p>}
              </section>}
              {internalNote.trim() && <p className="whitespace-pre-wrap break-words border-t pt-3 text-sm">내부 메모 · {internalNote.trim()}</p>}
              <p className="text-sm text-muted-foreground">{clip || registrationMode==="medley_segment" ? "비공개로 임시 저장합니다. 카탈로그에서 검토 후 게시하세요." : "임시 저장은 비공개입니다. 게시는 확인 후 공개됩니다."}</p>
              {!clip && registrationMode==="standard" && !hasSingingCredit && <p role="alert" className="text-sm text-destructive">게시하려면 메인 보컬·피처링 보컬·코러스 중 한 명 이상의 가창자가 필요합니다.</p>}
            </section>}
            {preflight && <div hidden={step===3}><AiReviewPanel compact segmentEnabled={segmentEnabled} session={aiSession} key={`${preflight.video.videoId}:${clip}`} target={{youtubeUrl,candidateKind:clip?"singing_clip":"official_video"}} videoId={preflight.video.videoId} candidateKind={clip?"singing_clip":"official_video"} durationSeconds={preflight.video.durationSeconds} initialRange={segmentEnabled && Number(endSeconds)>Number(startSeconds)?{startSeconds:Number(startSeconds),endSeconds:Number(endSeconds)}:null} form={ai} disabled={step === 3 || saving || checking || !open || channelUnverified} /></div>}
          </div>
          )}

          {completedSegment ? (
            <DialogFooter className="shrink-0 flex-row flex-wrap items-center justify-end px-4 sm:px-6">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>완료</Button>
              <Button type="button" disabled={completedSegment.endSeconds >= completedSegment.durationSeconds} onClick={prepareNextSegment}>{clip ? "같은 영상의 다음 곡 추가" : "같은 영상의 다음 커버 추가"}</Button>
            </DialogFooter>
          ) : (
            <DialogFooter className="shrink-0 flex-row items-center justify-between gap-3 px-4 sm:justify-between sm:px-6">
              <Button type="button" variant="outline" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0 || saving}><ArrowLeft className="h-4 w-4" /> 이전</Button>
              {step < 3 ? <Button type="button" onClick={() => setStep((value) => Math.min(3, value + 1))} disabled={saving || !stepReady || channelUnverified || checking}>다음 <ArrowRight className="h-4 w-4" /></Button> : <div className="flex min-w-0 flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={saving || !draftReady} onClick={() => void save("draft")}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} 임시 저장</Button>{!clip && registrationMode === "standard" ? <Button type="button" disabled={saving || !publishReady} title={publishReady ? undefined : "승인·활성 채널과 가창자 정보를 확인하세요."} onClick={() => setConfirmPublish(true)}>게시</Button> : null}</div>}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmActionDialog open={confirmPublish} onOpenChange={setConfirmPublish} title="이 영상을 게시할까요?" description="자동 생성되는 곡과 가창 metadata가 공개 카탈로그 상태로 저장됩니다. 영상 유형과 채널 정보를 다시 확인해 주세요." confirmLabel="게시" onConfirm={() => { setConfirmPublish(false); void save("published"); }} />
    </>
  );
}
