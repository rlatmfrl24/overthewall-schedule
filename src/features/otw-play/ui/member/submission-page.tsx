import { useUnsavedChanges } from "@/shared/lib/unsaved-changes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Plus,
  Search,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type {
  OtwPlaySubmissionArtistDto,
  OtwPlaySubmissionKind,
  OtwPlayCreateSubmissionResponse,
  OtwPlayMemberSubmissionDto,
  OtwPlayParticipantRole,
  OtwPlaySubmissionParticipantInput,
  OtwPlaySubmissionPreflightDto,
  OtwPlaySubmissionSongCandidateDto,
} from "@contracts/otw-play";
import { fetchActiveMembers, type Member } from "@/features/members";
import { ApiError } from "@/shared/api/client";
import { queryKeys } from "@/shared/query/query-keys";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import Stepper, { Step } from "@/shared/ui/stepper/Stepper";
import { Textarea } from "@/shared/ui/textarea";
import {
  createOtwPlaySubmission,
  preflightOtwPlaySubmission,
  updateOtwPlaySubmission,
  searchOtwPlaySubmissionArtists,
} from "../../api/submissions";
import { useMyOtwPlaySubmission } from "../../queries/use-member-submissions";
import { BroadcastMetadataFields } from "../broadcast-metadata-fields";
import { emptySubmissionBroadcast } from "../../model/submission-broadcast";
import { SongTagPicker } from "../song-tag-picker";

const steps = [
  { label: "영상", title: "어떤 영상인가요?", description: "함께 듣고 싶은 영상의 주소를 알려 주세요." },
  { label: "노래", title: "어떤 노래인가요?", description: "곡을 찾아볼까요? 아직 없는 노래라면 직접 알려 주세요." },
  { label: "가창자", title: "누가 불렀나요?", description: "영상에서 노래한 멤버를 골라 주세요. 여러 명을 선택해도 좋아요." },
  { label: "확인", title: "이 내용으로 보낼까요?", description: "알려 주신 내용을 한번 확인해 주세요. 보내 주신 제안은 관리자가 살펴볼게요." },
] as const;
const PARTICIPANT_LIMIT = 30;
const ORIGINAL_ARTIST_LIMIT = 20;
const SUBMISSION_DRAFT_KEY = "otw-play:member-submission-draft:v1";

const participantRoleLabel: Record<OtwPlayParticipantRole, string> = {
  vocal: "메인 보컬",
  featured_vocal: "피처링 보컬",
  chorus: "코러스",
  other: "기타 참여",
};
const newClientRequestId = () => crypto.randomUUID();
const normalizedText = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/gu, " ");
const comparableText = (value: string) => normalizedText(value).toLowerCase();

function ChipInput({
  id,
  label,
  values,
  onChange,
  placeholder,
  maxValues,
  required = false,
  draft,
  onDraftChange: setDraft,
  onSelect,
  externalOnly = false,
}: {
  id: string;
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  maxValues: number;
  required?: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onSelect: (artist: OtwPlaySubmissionArtistDto) => void;
  externalOnly?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(normalizedText(draft)), 200);
    return () => clearTimeout(timer);
  }, [draft]);
  const search = useQuery({
    queryKey: [...queryKeys.otwPlay.all, "member", "artists", searchTerm],
    queryFn: () => searchOtwPlaySubmissionArtists(searchTerm),
    enabled: Boolean(searchTerm),
    staleTime: 30_000,
    retry: false,
  });
  const currentSearch = searchTerm === normalizedText(draft) && Boolean(searchTerm);
  const results = search.data ?? [];
  const ready = currentSearch && search.isSuccess && !search.isFetching;
  const commit = (artist?: OtwPlaySubmissionArtistDto) => {
    if (!ready || (!artist && results.length > 0)) return;
    if (externalOnly && artist?.memberUid != null) {
      setError("OTW 멤버는 위의 참여 멤버 목록에서 선택해 주세요.");
      return;
    }
    const value = artist?.displayName ?? normalizedText(draft);
    if (!value) return setError("추가할 이름을 입력해 주세요.");
    if (values.some((item) => comparableText(item) === comparableText(value))) {
      return setError("이미 추가한 이름입니다.");
    }
    if (values.length >= maxValues) {
      return setError(`최대 ${maxValues}명까지 추가할 수 있습니다.`);
    }
    onChange([...values, value]);
    if (artist) onSelect(artist);
    setDraft("");
    setError(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      const exact = results.filter(artist => comparableText(artist.displayName) === comparableText(draft));
      commit(exact.length === 1 ? exact[0] : undefined);
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}{required ? " *" : ""}</Label>
        <span className="text-xs text-muted-foreground">{values.length}/{maxValues}</span>
      </div>
      {values.length ? (
        <div className="flex flex-wrap gap-2" aria-label={`${label} 선택 목록`}>
          {values.map((value) => (
            <Badge key={value} variant="secondary" className="gap-1 py-1">
              {value}
              <button
                type="button"
                aria-label={`${value} 제거`}
                onClick={() => onChange(values.filter((item) => item !== value))}
              ><X className="size-3" /></button>
            </Badge>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          onChange={(event) => { setDraft(event.target.value); setError(null); }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
          aria-invalid={Boolean(error)}
          disabled={values.length >= maxValues}
        />
      </div>
      {normalizedText(draft) ? <div className="space-y-2 rounded-lg border p-3" aria-label={`${label} 검색 결과`}>
        {!currentSearch || search.isPending || search.isFetching ? <p role="status" className="text-sm text-muted-foreground">기존 가수를 검색하고 있습니다.</p>
          : search.isError ? <div role="alert" className="text-sm"><p>가수 검색에 실패했습니다. 다시 검색해 주세요.</p><Button type="button" variant="outline" onClick={() => void search.refetch()}>다시 검색</Button></div>
          : results.length ? <ul className="max-h-56 overflow-y-auto">{results.map(artist => <li key={artist.entityId}><Button type="button" variant="ghost" className="h-auto w-full justify-between whitespace-normal text-left" disabled={values.length >= maxValues} onClick={() => commit(artist)}><span>{artist.displayName}</span><span className="ml-2 text-xs text-muted-foreground">{artist.memberUid !== null ? "OTW 멤버" : artist.entityKind === "group" ? "그룹" : "기존 가수"}</span></Button></li>)}</ul>
          : <><p className="text-sm text-muted-foreground">등록된 가수가 없습니다.</p><Button type="button" variant="outline" onClick={() => commit()} disabled={!ready || values.length >= maxValues}><Plus /> “{normalizedText(draft)}” 새 가수로 추가</Button></>}
      </div> : null}
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        기존 가수를 먼저 검색해 선택해 주세요. 검색 결과가 없으면 새 가수로 추가할 수 있습니다.
      </p>
      {error ? <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function MemberSelector({ members, selectedUids, onChange, maxReached }: {
  members: Member[]; selectedUids: number[]; onChange: (uids: number[]) => void; maxReached: boolean;
}) {
  return <div className="space-y-3">
    <p id="submission-members-label" className="text-sm font-medium">OTW 참여 멤버 *</p>
    <div id="submission-members" role="group" tabIndex={-1} aria-labelledby="submission-members-label" className="grid grid-cols-2 gap-2 rounded-lg sm:grid-cols-3">
      {members.map(member => {
        const selected = selectedUids.includes(member.uid);
        return <button key={member.uid} type="button" aria-pressed={selected} disabled={!selected && maxReached} onClick={() => onChange(selected ? selectedUids.filter(uid => uid !== member.uid) : [...selectedUids, member.uid])} className={`flex items-center gap-2 rounded-lg border p-3 text-left text-sm ${selected ? "border-primary bg-primary/10" : "hover:bg-muted"}`}>
          <img src={`/profile/${member.code}.webp`} alt="" className="size-9 shrink-0 rounded-full object-cover" />
          <span className="min-w-0 flex-1 break-words">{member.oshi_mark} {member.name}</span>{selected ? <Check className="size-4 shrink-0" /> : null}
        </button>;
      })}
    </div>
    {!members.length ? <p className="text-sm text-muted-foreground">선택할 멤버를 불러오는 중입니다.</p> : null}
  </div>;
}

function VideoSummary({ preflight, expanded = false }: { preflight: OtwPlaySubmissionPreflightDto; expanded?: boolean }) {
  return (
    <div className={`grid items-center gap-3 ${expanded ? "grid-cols-[96px_minmax(0,1fr)] sm:grid-cols-[160px_minmax(0,1fr)]" : "grid-cols-[88px_minmax(0,1fr)] sm:grid-cols-[112px_minmax(0,1fr)]"}`}>
      <img src={preflight.thumbnailUrl} alt="확인한 YouTube 영상 썸네일" className="aspect-video w-full rounded-lg object-cover" />
      <div className="min-w-0 self-center text-sm">
        <p className="font-medium text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="mr-1 inline size-4" /> {preflight.video ? "영상 확인 완료" : "영상 정보 재확인 필요"}</p>
        <a href={preflight.canonicalUrl} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-muted-foreground underline-offset-4 hover:underline">YouTube에서 보기</a>
        {preflight.video ? <><p className={`mt-1 font-medium ${expanded ? "break-words text-base leading-relaxed" : "line-clamp-2"}`}>{preflight.video.title}</p><p className={`mt-1 text-muted-foreground ${expanded ? "text-sm" : "text-xs"}`}>{expanded ? "업로더: " : ""}{preflight.video.channelName} · {expanded ? "영상 길이: " : ""}{preflight.video.durationSeconds == null ? "길이 미확인" : `${Math.floor(preflight.video.durationSeconds / 60)}:${String(preflight.video.durationSeconds % 60).padStart(2, "0")}`}</p></> : null}
      </div>
    </div>
  );
}

function ReviewCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <section aria-label={title} className="rounded-xl border bg-card p-4 sm:p-5">
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold">{title}</h2>
      {action}
    </div>
    {children}
  </section>;
}

function ParticipantRoleEditor({
  items,
  onRoleChange,
}: {
  items: Array<{ key: string; label: string; role: OtwPlayParticipantRole }>;
  onRoleChange: (key: string, role: OtwPlayParticipantRole) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-3 border-t pt-4" aria-label="가창자 역할 분류">
      <div>
        <p className="text-sm font-medium">가창 역할</p>
        <p className="text-xs text-muted-foreground">
          메인 보컬은 발견 화면과 Player에 우선 표시됩니다.
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border bg-background">
        {items.map((item) => (
          <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-3 border-b px-3 py-2 last:border-b-0">
            <span className="min-w-0 break-words text-sm font-medium">{item.label}</span>
            <Select
              value={item.role}
              onValueChange={(value) =>
                onRoleChange(item.key, value as OtwPlayParticipantRole)
              }
            >
              <SelectTrigger className="w-full" aria-label={`${item.label} 가창 역할`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(participantRoleLabel).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}

type SubmissionPageProps = { editId?: string; initialKind?: OtwPlaySubmissionKind };

export function OtwPlaySubmissionPage(props: SubmissionPageProps) {
  const [visit, setVisit] = useState(0);
  useEffect(() => {
    // A full-page back navigation can restore React memory from the browser's BFCache.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setVisit(value => value + 1);
    };
    window.addEventListener("pageshow", onPageShow);
    // Retire only this feature's old browser drafts; new input stays in component state.
    try {
      for (const key of Object.keys(sessionStorage)) {
        if (key === SUBMISSION_DRAFT_KEY || key.startsWith(`${SUBMISSION_DRAFT_KEY}:edit:`)) sessionStorage.removeItem(key);
      }
    } catch { /* Storage may be unavailable; this form no longer depends on it. */ }
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);
  return <SubmissionForm key={`${props.editId ?? "new"}:${props.initialKind ?? "choose"}:${visit}`} {...props} />;
}

function SubmissionForm({ editId, initialKind }: SubmissionPageProps) {
  const queryClient = useQueryClient();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const editDetail = useMyOtwPlaySubmission(editId ?? null);
  const initializedEditId = useRef<string | null>(null);
  const preflightRequestId = useRef(0);
  const [submissionKind, setSubmissionKind] = useState<OtwPlaySubmissionKind | null>(initialKind ?? null);
  const [broadcast, setBroadcast] = useState(emptySubmissionBroadcast);
  const [originalArtistDraft, setOriginalArtistDraft] = useState("");
  const [externalParticipantDraft, setExternalParticipantDraft] = useState("");
  const [step, setStep] = useState(0);
  const [clientRequestId, setClientRequestId] = useState<string>(newClientRequestId);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [title, setTitle] = useState("");
  const [songMode, setSongMode] = useState<"new" | "existing">("existing");
  const [suggestedSongId, setSuggestedSongId] = useState<string | null>(null);
  const [songTags, setSongTags] = useState<string[]>([]);
  const [originalArtists, setOriginalArtists] = useState<string[]>([]);
  const [artistEntityIds, setArtistEntityIds] = useState<Record<string, string>>({});
  const [memberUids, setMemberUids] = useState<number[]>([]);
  const [externalParticipants, setExternalParticipants] = useState<string[]>([]);
  const [memberRoles, setMemberRoles] = useState<Record<number, OtwPlayParticipantRole>>({});
  const [externalRoles, setExternalRoles] = useState<Record<string, OtwPlayParticipantRole>>({});
  const [note, setNote] = useState("");
  const [expectedVersion, setExpectedVersion] = useState<number | null>(null);
  const [originalArtistMemberUids, setOriginalArtistMemberUids] = useState<Record<string, number>>({});
  const [editBaseline, setEditBaseline] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<OtwPlaySubmissionPreflightDto | null>(null);
  const [candidateSearchAttempted, setCandidateSearchAttempted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<
    OtwPlayCreateSubmissionResponse | { data: OtwPlayMemberSubmissionDto } | null
  >(null);

  const members = useQuery({ queryKey: queryKeys.members.active(), queryFn: fetchActiveMembers });
  const preflightMutation = useMutation({ mutationFn: preflightOtwPlaySubmission });
  const submitMutation = useMutation({
    mutationFn: async (input: Parameters<typeof createOtwPlaySubmission>[0]) => {
      if (!editId) {
        return createOtwPlaySubmission(input);
      }
      if (expectedVersion === null) {
        throw new Error("수정 기준 버전을 불러오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.");
      }
      const data = await updateOtwPlaySubmission(editId, {
        expectedVersion,
        submissionKind: input.submissionKind,
        broadcast: input.broadcast,
        youtubeUrl: input.youtubeUrl,
        title: input.title,
        suggestedSongId: input.suggestedSongId,
        tags: input.tags,
        originalArtists: input.originalArtists,
        participants: input.participants,
        note: input.note,
      });
      return { data };
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [...queryKeys.otwPlay.all, "member"] }),
        queryClient.invalidateQueries({ queryKey: [...queryKeys.otwPlay.all, "admin", "proposals"] }),
      ]);
      setMessage(null);
      setSuccess(result);
    },
    onError: (error) => {
      const apiError = error instanceof ApiError ? error : null;
      const fields = Object.keys(apiError?.fields ?? {}).map((field) => field.toLowerCase());
      if (fields.some((field) => field.includes("youtube"))) setStep(0);
      else if (fields.some((field) => field === "title" || field.includes("originalartists"))) setStep(1);
      else if (fields.some((field) => field.includes("participants") || field.includes("broadcast"))) setStep(2);
      setMessage(apiError?.code === "PLAY_SUBMISSION_DUPLICATE"
        ? "이미 카탈로그에 있거나 검토 중인 영상입니다."
        : apiError?.code === "PLAY_SUBMISSION_STALE_WRITE"
          ? "제안이 먼저 변경되었습니다. 입력 내용은 유지했습니다. 내 제안에서 최신 상태를 확인한 뒤 다시 수정해 주세요."
        : apiError?.code === "PLAY_SUBMISSION_RATE_LIMITED"
          ? apiError.fields?.scope === "daily"
            ? "오늘의 곡 제안 한도에 도달했습니다. KST 자정 이후 다시 제안할 수 있습니다."
            : "짧은 시간에 제안 요청이 많았습니다. 잠시 후 다시 시도해 주세요."
          : apiError?.message ?? "제안 제출에 실패했습니다.");
    },
  });

  useEffect(() => {
    const submission = editDetail.data;
    if (!editId || !submission || initializedEditId.current === editId) return;
    initializedEditId.current = editId;
    setArtistEntityIds(Object.fromEntries([...submission.originalArtists, ...submission.participants]
      .flatMap(artist => artist.memberUid === null && artist.entityId ? [[artist.displayName, artist.entityId]] : [])));
    setOriginalArtistMemberUids(Object.fromEntries(
      submission.originalArtists.flatMap((artist) =>
        artist.memberUid === null ? [] : [[artist.displayName, artist.memberUid]],
      ),
    ));
    const memberParticipants = submission.participants.filter(
      (participant) => participant.memberUid !== null,
    );
    const external = submission.participants.filter(
      (participant) => participant.memberUid === null,
    );
    setExpectedVersion(submission.version);
    setStep(0);
    setClientRequestId(submission.clientRequestId);
    setYoutubeUrl(submission.youtubeUrl);
    setTitle(submission.title);
    setSubmissionKind(submission.submissionKind ?? "official_cover");
    setBroadcast(submission.broadcast ?? emptySubmissionBroadcast());
    setSongMode(submission.suggestedSongId ? "existing" : "new");
    setSuggestedSongId(submission.suggestedSongId);
    setSongTags(submission.tags);
    setOriginalArtists(submission.originalArtists.map((artist) => artist.displayName));
    setMemberUids(memberParticipants.map((participant) => participant.memberUid!));
    setExternalParticipants(external.map((participant) => participant.displayName));
    setMemberRoles(Object.fromEntries(
      memberParticipants.map((participant) => [participant.memberUid!, participant.participantRole]),
    ));
    setExternalRoles(Object.fromEntries(
      external.map((participant) => [participant.displayName, participant.participantRole]),
    ));
    setNote(submission.note ?? "");
    setPreflight({
      videoId: submission.youtubeVideoId,
      canonicalUrl: submission.youtubeUrl,
      thumbnailUrl: `https://i.ytimg.com/vi/${submission.youtubeVideoId}/hqdefault.jpg`,
      duplicate: null,
      songCandidates: [],
    });
    setEditBaseline(JSON.stringify({
      submissionKind: submission.submissionKind ?? "official_cover",
      broadcast: submission.broadcast ?? emptySubmissionBroadcast(),
      youtubeUrl: submission.youtubeUrl,
      title: submission.title,
      suggestedSongId: submission.suggestedSongId,
      tags: submission.tags,
      originalArtists: submission.originalArtists.map((artist) => ({
        memberUid: artist.memberUid,
        entityId: artist.memberUid === null ? artist.entityId : undefined,
        displayName: artist.displayName,
      })),
      participants: [...memberParticipants, ...external].map((participant) => ({
        memberUid: participant.memberUid,
        entityId: participant.memberUid === null ? participant.entityId : undefined,
        displayName: participant.displayName,
        participantRole: participant.participantRole,
      })),
      note: submission.note ?? null,
    }));
  }, [editDetail.data, editId]);

  useEffect(() => { headingRef.current?.focus(); }, [step]);

  const selectedMembers = useMemo(
    () => (members.data ?? []).filter((member) => memberUids.includes(member.uid)),
    [memberUids, members.data],
  );
  const participants = useMemo<OtwPlaySubmissionParticipantInput[]>(() => [
    ...memberUids.map((memberUid) => ({
      kind: "member" as const,
      memberUid,
      participantRole: memberRoles[memberUid] ?? "vocal",
    })),
    ...externalParticipants.map((displayName) => ({
      kind: "external" as const,
      displayName,
      ...(artistEntityIds[displayName] ? { entityId: artistEntityIds[displayName] } : {}),
      participantRole: externalRoles[displayName] ?? "vocal",
    })),
  ], [externalParticipants, externalRoles, memberRoles, memberUids, artistEntityIds]);
  const currentEditSnapshot = useMemo(
    () => JSON.stringify({
      submissionKind, broadcast,
      youtubeUrl,
      title,
      suggestedSongId,
      tags: songMode === "new" ? songTags : [],
      originalArtists: originalArtists.map((displayName) => ({
        memberUid: originalArtistMemberUids[displayName] ?? null,
        entityId: originalArtistMemberUids[displayName] ? undefined : artistEntityIds[displayName],
        displayName,
      })),
      participants: participants.map((participant) => ({
        memberUid: participant.kind === "member" ? participant.memberUid : null,
        entityId: participant.kind === "external" ? participant.entityId : undefined,
        displayName:
          participant.kind === "member"
            ? (members.data ?? []).find((member) => member.uid === participant.memberUid)?.name ?? ""
            : participant.displayName,
        participantRole: participant.participantRole ?? "vocal",
      })),
      note: note || null,
    }),
    [submissionKind, broadcast, members.data, note, artistEntityIds, originalArtistMemberUids, originalArtists, participants, songMode, songTags, suggestedSongId, title, youtubeUrl],
  );
  const dirty = !success && (editId
    ? editBaseline !== null && (currentEditSnapshot !== editBaseline || Boolean(originalArtistDraft || externalParticipantDraft))
    : Boolean(submissionKind !== (initialKind ?? null) || originalArtistDraft || externalParticipantDraft || youtubeUrl || title || songTags.length || originalArtists.length || memberUids.length || externalParticipants.length || note));
  useUnsavedChanges(dirty);
  const participantCount = participants.length;
  const participantRoleItems = useMemo(
    () => [
      ...selectedMembers.map((member) => ({
        key: `member:${member.uid}`,
        label: `${member.oshi_mark ? `${member.oshi_mark} ` : ""}${member.name}`,
        role: memberRoles[member.uid] ?? "vocal",
      })),
      ...externalParticipants.map((displayName) => ({
        key: `external:${displayName}`,
        label: displayName,
        role: externalRoles[displayName] ?? "vocal",
      })),
    ],
    [externalParticipants, externalRoles, memberRoles, selectedMembers],
  );
  const changeParticipantRole = (
    key: string,
    role: OtwPlayParticipantRole,
  ) => {
    if (key.startsWith("member:")) {
      const uid = Number(key.slice("member:".length));
      setMemberRoles((current) => ({ ...current, [uid]: role }));
      return;
    }
    const displayName = key.slice("external:".length);
    setExternalRoles((current) => ({ ...current, [displayName]: role }));
  };

  const verifyVideo = async () => {
    if (!submissionKind) { setMessage("신청 유형을 선택해 주세요."); return; }
    setMessage(null);
    setCandidateSearchAttempted(false);
    const requestId = ++preflightRequestId.current;
    const data = await preflightMutation.mutateAsync({ youtubeUrl }).catch((error: unknown) => {
      if (requestId !== preflightRequestId.current) return null;
      setMessage(error instanceof ApiError ? error.message : "영상 확인에 실패했습니다.");
      document.getElementById("submission-youtube-url")?.focus();
      return null;
    });
    if (!data || requestId !== preflightRequestId.current) return;
    const ownPendingDuplicate = Boolean(
      editDetail.data &&
      data.duplicate === "pending" &&
      data.videoId === editDetail.data.youtubeVideoId,
    );
    const visibleData = ownPendingDuplicate ? { ...data, duplicate: null } : data;
    setPreflight(visibleData);
    if (visibleData.duplicate) {
      return;
    }
    setStep(1);
  };
  const searchSongCandidates = async () => {
    setMessage(null);
    setCandidateSearchAttempted(false);
    const verifiedVideo = preflight?.video;
    const requestId = ++preflightRequestId.current;
    const data = await preflightMutation.mutateAsync({ youtubeUrl, title }).catch((error: unknown) => {
      if (requestId !== preflightRequestId.current) return null;
      setMessage(error instanceof ApiError ? error.message : "기존 곡 검색에 실패했습니다.");
      return null;
    });
    if (data && requestId === preflightRequestId.current) {
      const searchData = { ...data, video: verifiedVideo };
      setCandidateSearchAttempted(true);
      setPreflight(
        editDetail.data &&
          data.duplicate === "pending" &&
          data.videoId === editDetail.data.youtubeVideoId
          ? { ...searchData, duplicate: null }
          : searchData,
      );
    }
  };
  const selectCandidate = (candidate: OtwPlaySubmissionSongCandidateDto) => {
    setSongMode("existing");
    setSuggestedSongId(candidate.id);
    setTitle(candidate.title);
    setOriginalArtists(candidate.originalArtists);
    setOriginalArtistMemberUids({});
    setSongTags([]);
  };
  const selectNewSong = () => { setSongMode("new"); setSuggestedSongId(null); };
  const changeSong = () => {
    preflightRequestId.current += 1;
    setSongMode("existing");
    setSuggestedSongId(null);
    setOriginalArtists([]);
    setOriginalArtistMemberUids({});
    setSongTags([]);
    setCandidateSearchAttempted(false);
    setMessage(null);
  };
  const songSelected = songMode === "new" || suggestedSongId !== null;
  const canReview = title.trim().length > 0 && originalArtists.length > 0 && originalArtists.length <= ORIGINAL_ARTIST_LIMIT && participantCount > 0 && participantCount <= PARTICIPANT_LIMIT && (songMode === "new" || suggestedSongId !== null);
  const continueToSingers = () => {
    if (!preflight?.video) { setMessage("영상 정보를 다시 확인해 주세요. 곡 입력은 유지됩니다."); setStep(0); return; }
    if (originalArtistDraft.trim()) { setMessage("검색 결과에서 원곡 가수를 선택하거나 새 가수로 추가해 주세요."); return; }
    const artists = originalArtists;
    if (!title.trim() || !songSelected || !artists.length || artists.length > ORIGINAL_ARTIST_LIMIT) {
      setMessage("곡명과 원곡 가수를 알려 주세요. 기존 곡을 선택해도 좋아요.");
      document.getElementById(!title.trim() || !songSelected ? "submission-title" : "submission-original-artists")?.focus(); return;
    }
    setMessage(null); setStep(2);
  };
  const reviewSubmission = () => {
    if (externalParticipantDraft.trim()) { setMessage("검색 결과에서 외부 참여자를 선택하거나 새 가수로 추가해 주세요."); return; }
    const external = externalParticipants;
    if (!memberUids.length || memberUids.length + external.length > PARTICIPANT_LIMIT) {
      setMessage(`노래한 OTW 멤버를 골라 주세요. 참여자는 ${PARTICIPANT_LIMIT}명까지 추가할 수 있어요.`);
      document.getElementById("submission-members")?.focus(); return;
    }
    if (submissionKind === "singing_clip" && broadcast.originalUrl) {
      try { const url = new URL(broadcast.originalUrl); if (url.protocol !== "https:" || url.username || url.password) throw new Error(); } catch { setMessage("원본 방송 링크에 올바른 HTTPS 주소를 입력해 주세요."); document.getElementById("submission-broadcast-url")?.focus(); return; }
    }
    setMessage(null); setStep(3);
  };
  const resetForm = () => {
    setArtistEntityIds({});
    setOriginalArtistMemberUids({});
    preflightRequestId.current += 1;
    setSubmissionKind(initialKind ?? null); setBroadcast(emptySubmissionBroadcast()); setOriginalArtistDraft(""); setExternalParticipantDraft("");
    setStep(0); setClientRequestId(newClientRequestId()); setYoutubeUrl(""); setTitle("");
    setSongMode("existing"); setSuggestedSongId(null); setSongTags([]); setOriginalArtists([]); setMemberUids([]);
    setExternalParticipants([]); setMemberRoles({}); setExternalRoles({}); setNote(""); setPreflight(null); setCandidateSearchAttempted(false);
    setMessage(null); setSuccess(null);
  };

  const submissionDisabled = !preflight?.video || !canReview || !submissionKind || submitMutation.isPending || Boolean(editId && expectedVersion === null);
  const navigationBusy = preflightMutation.isPending || submitMutation.isPending;
  const changeStep = (requestedStep: number) => {
    if (navigationBusy) return;
    const target = requestedStep - 1;
    if (target < step) { setMessage(null); setStep(target); return; }
    if (target !== step + 1) return;
    if (step === 0) void verifyVideo();
    else if (step === 1) continueToSingers();
    else if (step === 2) reviewSubmission();
  };
  const submitProposal = () => {
    if (submissionDisabled) return;
    submitMutation.mutate({ clientRequestId, submissionKind: submissionKind ?? "official_cover", broadcast: submissionKind === "singing_clip" ? broadcast : null, youtubeUrl, title, suggestedSongId, tags: songMode === "new" ? songTags : [], originalArtists: originalArtists.map((displayName) => originalArtistMemberUids[displayName] ? { kind: "member", memberUid: originalArtistMemberUids[displayName] } : { kind: "external", displayName, ...(artistEntityIds[displayName] ? { entityId: artistEntityIds[displayName] } : {}) }), participants, note: note || null });
  };
  const finalButtonText = submitMutation.isPending ? (editId ? "저장 중" : "제출 중") : (editId ? "수정 저장" : "검수 요청하기");

  if (success) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col items-start gap-4 p-4 py-10 sm:p-8">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/play"><ChevronLeft /> OTW Play로 돌아가기</Link>
        </Button>
        <section className="w-full rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-10">
          <CheckCircle2 className="mx-auto size-12 text-emerald-600" />
          <p className="mt-4 text-sm font-medium text-primary">{editId ? "곡 제안 수정 완료" : "곡 제안 접수 완료"}</p>
          <h1 className="mt-1 text-2xl font-bold">{success.data.title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">관리자 검수 전까지 공개되지 않습니다. 내 제안에서 현재 상태를 확인할 수 있어요.</p>
          <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row">
            <Button asChild><Link to="/play/submissions">내 제안에서 확인</Link></Button>
            {!editId ? <Button type="button" variant="outline" onClick={resetForm}>다른 곡 제안</Button> : null}
          </div>
        </section>
      </div>
    );
  }

  if (editId && editDetail.isPending) {
    return (
      <div className="flex min-h-80 items-center justify-center" aria-busy="true">
        <LoaderCircle className="mr-2 size-5 animate-spin" /> 수정할 제안을 불러오는 중
      </div>
    );
  }

  if (editId && (editDetail.isError || !editDetail.data?.editable)) {
    return (
      <div className="mx-auto flex min-h-96 w-full max-w-3xl flex-col items-start justify-center gap-4 p-4 sm:p-8">
        <section className="w-full rounded-2xl border bg-card p-8 text-center shadow-sm" role="alert">
          <h1 className="text-xl font-bold">이 제안은 수정할 수 없습니다</h1>
          <p className="mt-2 text-sm text-muted-foreground">본인의 검토 대기 중 제안만 수정할 수 있습니다.</p>
          <Button asChild className="mt-6"><Link to="/play/submissions">내 제안으로 돌아가기</Link></Button>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:px-6 sm:py-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/play"><ChevronLeft /> OTW Play로 돌아가기</Link>
      </Button>
      <div>
        <p className="text-sm font-medium text-primary">{editId ? "노래 영상 제안 수정" : "노래 영상 추가 제안"}</p>
        <h1 ref={headingRef} tabIndex={-1} className="mt-1 text-2xl font-bold outline-none">{steps[step].title}</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{steps[step].description}</p>
      </div>
      <Stepper
        currentStep={step + 1}
        reducedMotion="never"
        onStepChange={changeStep}
        onFinalStepCompleted={submitProposal}
        stepLabels={steps.map(item => item.label)}
        allowStepClick={target => target <= step + 1}
        disableStepIndicators={navigationBusy}
        backButtonText={<><ChevronLeft /> 이전</>}
        nextButtonText={<>{preflightMutation.isPending ? <LoaderCircle className="animate-spin" /> : null}{step === 0 ? (preflightMutation.isPending ? "확인 중" : preflightMutation.isError && message ? "영상 확인 다시 시도" : "영상 확인") : step === 1 ? "가창자 선택하기" : "제안 내용 확인하기"}<ChevronRight /></>}
        completeButtonText={<>{submitMutation.isPending ? <LoaderCircle className="animate-spin" /> : null}{finalButtonText}</>}
        backButtonProps={{ disabled: navigationBusy }}
        nextButtonProps={{ disabled: navigationBusy || (step === 0 && (!submissionKind || !youtubeUrl.trim())) || (step === 3 && submissionDisabled) }}
        footerContent={message ? <p role="alert" className="mb-3 rounded-lg bg-destructive/5 p-3 text-sm text-destructive">{message}</p> : null}
      >
        <Step>
          <div className="space-y-5">
            <fieldset className="space-y-3"><legend className="font-semibold">신청 유형 *</legend><div className="grid gap-3 sm:grid-cols-2">{([ ["official_cover", "공식 커버", "멤버의 공식 채널에 공개된 커버곡 영상"], ["singing_clip", "노래 클립", "방송에서 부른 한 곡을 편집해 올린 영상"] ] as const).map(([kind, label, description]) => <button type="button" key={kind} aria-pressed={submissionKind === kind} onClick={() => { preflightRequestId.current += 1; setSubmissionKind(kind); setMessage(null); }} className={`rounded-xl border p-4 text-left ${submissionKind === kind ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-muted"}`}><span className="block font-semibold">{label}</span><span className="mt-1 block text-sm text-muted-foreground">{description}</span></button>)}</div></fieldset>
            <div className="space-y-2">
              <Label htmlFor="submission-youtube-url">YouTube 영상 URL</Label>
              <Input id="submission-youtube-url" value={youtubeUrl} onChange={(event) => { preflightRequestId.current += 1; setYoutubeUrl(event.target.value); setPreflight(null); setMessage(null); }} placeholder="https://www.youtube.com/watch?v=..." maxLength={500} aria-invalid={Boolean(message)} />
              <p className="text-xs text-muted-foreground">{submissionKind === "singing_clip" ? "한 곡을 담은 편집 영상의 주소를 입력해 주세요. 전체 다시보기에서 구간을 지정하는 신청은 받지 않습니다." : "OTW 멤버가 참여한 공식 커버 영상 주소를 입력해 주세요. 오리지널곡은 이번 신청 대상에 포함되지 않습니다."}</p>
            </div>
            {preflight && !preflight.duplicate ? <VideoSummary preflight={preflight} /> : null}
            {preflight?.duplicate ? <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">이미 {preflight.duplicate === "catalog" ? "카탈로그에 등록된" : "검토 중인"} 영상입니다.</p> : null}

          </div>
        </Step>

        <Step>
          <div className="space-y-4">
            {preflight ? <VideoSummary preflight={preflight} /> : null}
            <fieldset className="min-w-0 space-y-4">
              <legend className="sr-only">곡 정보</legend>
              <div className="flex min-h-9 items-center justify-between gap-3">
                <h2 className="font-semibold">{songSelected ? songMode === "new" ? "새로운 곡 입력" : "연결한 곡" : "등록된 곡 찾기"}</h2>
                {songSelected ? <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={changeSong}><Search className="size-4" /> 다른 곡 검색</Button> : null}
              </div>
              <div className="space-y-4">
                {!songSelected ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="submission-title">곡명 *</Label>
                      <p className="text-xs text-muted-foreground">먼저 등록된 곡을 검색해 주세요. 찾는 곡이 없으면 새 곡을 추가할 수 있습니다.</p>
                      <div className="flex gap-2">
                        <Input id="submission-title" value={title} placeholder="곡명으로 검색" onChange={(event) => { preflightRequestId.current += 1; setTitle(event.target.value); setCandidateSearchAttempted(false); setMessage(null); }} onKeyDown={(event) => { if (!event.nativeEvent.isComposing && event.key === "Enter" && title.trim() && !preflightMutation.isPending) { event.preventDefault(); void searchSongCandidates(); } }} maxLength={300} />
                        <Button type="button" variant="outline" onClick={() => void searchSongCandidates()} disabled={!title.trim() || preflightMutation.isPending}>
                          {preflightMutation.isPending ? <LoaderCircle className="animate-spin" /> : <Search />} 검색
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-3" aria-live="polite">
                      {preflightMutation.isPending ? <p className="text-sm text-muted-foreground">기존 곡을 검색하고 있습니다.</p> : candidateSearchAttempted ? (
                        <>
                          {preflight?.songCandidates.length ? (
                            <div className="overflow-hidden rounded-lg border">{preflight.songCandidates.map((song) => (
                              <button type="button" key={song.id} onClick={() => selectCandidate(song)} className="flex w-full items-center justify-between gap-3 border-b p-3 text-left text-sm last:border-b-0 hover:bg-muted focus-visible:bg-muted">
                                <span className="min-w-0"><span className="block break-words font-medium">{song.title}</span><span className="block break-words text-xs text-muted-foreground">{song.originalArtists.join(", ")}</span></span>
                                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                              </button>
                            ))}</div>
                          ) : <p className="text-sm text-muted-foreground">일치하는 기존 곡이 없습니다.</p>}
                          <div className="flex flex-wrap items-center justify-between gap-2 py-2">
                            <p className="text-sm text-muted-foreground">찾는 곡이 없나요?</p>
                            <Button type="button" size="sm" variant="outline" onClick={selectNewSong}><Plus /> 새 곡 추가</Button>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">

                    {songMode === "new" ? <div className="space-y-2"><Label htmlFor="submission-title">곡명 *</Label><Input id="submission-title" placeholder="한국어 제목 (원어 제목)" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={300} /></div> : <div className="py-2"><p className="break-words font-medium">{title}</p><p className="mt-1 text-sm text-muted-foreground">{originalArtists.join(", ")}</p></div>}
                  </div>
                )}
                {songSelected ? <>
                {songMode === "new" ? (
                  <SongTagPicker
                    tags={songTags}
                    onChange={setSongTags}
                    inputId="submission-song-tags"
                    description="새로 등록할 곡의 장르나 분류를 선택하거나 직접 입력해 주세요. 선택 사항이며 최대 10개까지 저장됩니다."
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    기존 곡을 연결하면 카탈로그에 저장된 장르(분류)를 그대로 사용합니다.
                  </p>
                )}
                {songMode === "new" ? <ChipInput
                  id="submission-original-artists"
                  draft={originalArtistDraft}
                  onDraftChange={setOriginalArtistDraft}
                  label="원곡 가수"
                  onSelect={artist => {
                    if (artist.memberUid !== null) setOriginalArtistMemberUids(current => ({ ...current, [artist.displayName]: artist.memberUid! }));
                    else setArtistEntityIds(current => ({ ...current, [artist.displayName]: artist.entityId }));
                  }}
                  values={originalArtists}
                  onChange={(values) => {
                    setOriginalArtists(values);
                    setOriginalArtistMemberUids((current) =>
                      Object.fromEntries(
                        Object.entries(current).filter(([name]) => values.includes(name)),
                      ),
                    );
                  }}
                  placeholder="가수명 입력"
                  maxValues={ORIGINAL_ARTIST_LIMIT}
                  required
                /> : null}
                </> : null}
              </div>
            </fieldset>

          </div>
        </Step>

        <Step>
          <div className="space-y-4">
            <fieldset className="min-w-0 space-y-3">
              <legend className="sr-only">가창 참여자</legend>
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3 text-sm"><span className="text-muted-foreground">함께 부른 멤버도 빠짐없이 골라 주세요.</span><span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">{participantCount}/{PARTICIPANT_LIMIT}</span></div>
                <MemberSelector members={members.data ?? []} selectedUids={memberUids} onChange={setMemberUids} maxReached={participantCount >= PARTICIPANT_LIMIT} />
                <details className="pt-1"><summary className="cursor-pointer text-sm font-medium">외부 참여자·세부 역할 (선택)</summary><div className="mt-4 space-y-4"><ChipInput externalOnly onSelect={artist => setArtistEntityIds(current => ({ ...current, [artist.displayName]: artist.entityId }))} draft={externalParticipantDraft} onDraftChange={setExternalParticipantDraft} id="submission-external-participants" label="외부 참여자" values={externalParticipants} onChange={setExternalParticipants} placeholder="외부 인물 또는 그룹명" maxValues={Math.max(PARTICIPANT_LIMIT - memberUids.length, 0)} />
                <ParticipantRoleEditor items={participantRoleItems} onRoleChange={changeParticipantRole} /></div></details>
                {participantCount === 0 ? <p className="text-sm text-muted-foreground">멤버를 고르면 다음으로 넘어갈 수 있어요.</p> : null}
              </div>
            </fieldset>
            {submissionKind === "singing_clip" ? <details className="pt-1"><summary className="cursor-pointer font-semibold">방송 정보 추가 (선택)</summary><div className="mt-4"><BroadcastMetadataFields value={broadcast} onChange={setBroadcast} idPrefix="submission-broadcast" /></div></details> : null}
          </div>
        </Step>

        <Step>
          <div className="space-y-4">
            <ReviewCard title="제안할 영상" action={<Button type="button" variant="outline" size="sm" disabled={navigationBusy} onClick={() => setStep(0)}>유형·영상 수정</Button>}>
              <p className="mb-3 text-sm text-muted-foreground">신청 유형 <span className="ml-2 font-semibold text-foreground">{submissionKind === "singing_clip" ? "노래 클립" : "공식 커버"}</span></p>
              {preflight ? <VideoSummary preflight={preflight} expanded /> : null}
            </ReviewCard>
            <ReviewCard title="노래 정보" action={<Button type="button" variant="outline" size="sm" disabled={navigationBusy} onClick={() => setStep(1)}>노래 수정</Button>}>
              <dl className="space-y-4">
                <div><dt className="text-sm text-muted-foreground">곡명</dt><dd className="mt-1 break-words text-xl font-semibold leading-relaxed">{title}</dd><dd className="mt-1 text-sm text-muted-foreground">{songMode === "existing" ? "카탈로그에 등록된 곡과 연결합니다." : "새로운 곡으로 제안합니다."}</dd></div>
                <div><dt className="text-sm text-muted-foreground">원곡 가수</dt><dd className="mt-1 break-words text-base font-medium">{originalArtists.join(", ")}</dd></div>
                <div><dt className="text-sm text-muted-foreground">장르(분류)</dt><dd className="mt-2">{songMode === "existing" ? <p className="text-sm">카탈로그에 등록된 분류를 사용합니다.</p> : songTags.length ? <div className="flex flex-wrap gap-2">{songTags.map(tag => <Badge key={tag} variant="secondary" className="text-sm">{tag}</Badge>)}</div> : <p className="text-sm text-muted-foreground">선택하지 않았어요.</p>}</dd></div>
              </dl>
            </ReviewCard>
            <ReviewCard title="가창자" action={<Button type="button" variant="outline" size="sm" disabled={navigationBusy} onClick={() => setStep(2)}>가창자 수정</Button>}>
              <ul className="grid gap-4 sm:grid-cols-2">
                {selectedMembers.map(member => <li key={member.uid} className="flex items-center gap-3">
                  <img src={`/profile/${member.code}.webp`} alt="" className="size-11 rounded-full object-cover" />
                  <div className="min-w-0"><p className="break-words text-base font-semibold">{member.oshi_mark} {member.name}</p><p className="mt-1 text-sm text-muted-foreground">OTW 멤버 · {participantRoleLabel[memberRoles[member.uid] ?? "vocal"]}</p></div>
                </li>)}
                {externalParticipants.map(name => <li key={name}><p className="break-words text-base font-semibold">{name}</p><p className="mt-1 text-sm text-muted-foreground">외부 참여자 · {participantRoleLabel[externalRoles[name] ?? "vocal"]}</p></li>)}
              </ul>
            </ReviewCard>
            {submissionKind === "singing_clip" ? <ReviewCard title="방송 정보" action={<Button type="button" variant="outline" size="sm" disabled={navigationBusy} onClick={() => setStep(2)}>방송 정보 수정</Button>}>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div><dt className="text-sm text-muted-foreground">실제 가창 방송일</dt><dd className="mt-1 text-base font-medium">{broadcast.performedOn ?? "아직 확인되지 않았어요."}</dd></div>
                <div><dt className="text-sm text-muted-foreground">완곡 여부</dt><dd className="mt-1 text-base font-medium">{broadcast.extent === "full" ? "완곡" : broadcast.extent === "partial" ? "일부 가창" : "아직 확인되지 않았어요."}</dd></div>
                <div className="sm:col-span-2"><dt className="text-sm text-muted-foreground">날짜를 확인한 근거</dt><dd className="mt-1 whitespace-pre-wrap break-words text-base">{broadcast.dateEvidence ?? "입력하지 않았어요."}</dd></div>
                <div className="sm:col-span-2"><dt className="text-sm text-muted-foreground">멤버의 원본 다시보기 링크</dt><dd className="mt-1 break-all text-base">{broadcast.originalUrl ? <a href={broadcast.originalUrl} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">{broadcast.originalUrl}</a> : "입력하지 않았어요."}</dd></div>
              </dl>
            </ReviewCard> : null}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3"><Label htmlFor="submission-note">관리자에게 전할 메모 (선택)</Label><span className="text-xs text-muted-foreground">{note.length}/1000</span></div>
              <Textarea id="submission-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={3} />
            </div>
            <p className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm"><AlertCircle className="mr-1 inline size-4" /> 제안해 주셔서 고마워요. 관리자 확인 전에는 공개되지 않으며, 진행 상황은 내 제안에서 볼 수 있어요.</p>

          </div>
        </Step>
      </Stepper>
    </div>
  );
}
