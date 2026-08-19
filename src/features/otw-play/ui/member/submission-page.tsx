import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useBlocker } from "@tanstack/react-router";
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
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type {
  OtwPlayCreateSubmissionResponse,
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
import { Textarea } from "@/shared/ui/textarea";
import {
  createOtwPlaySubmission,
  preflightOtwPlaySubmission,
} from "../../api/submissions";

const steps = ["영상 확인", "곡과 참여자", "검토·제출"] as const;
const PARTICIPANT_LIMIT = 30;
const ORIGINAL_ARTIST_LIMIT = 20;
const participantRoleLabel: Record<OtwPlayParticipantRole, string> = {
  vocal: "메인 보컬",
  featured_vocal: "서브 보컬",
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
}: {
  id: string;
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  maxValues: number;
  required?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const commit = () => {
    const value = normalizedText(draft);
    if (!value) return setError("추가할 이름을 입력해 주세요.");
    if (values.some((item) => comparableText(item) === comparableText(value))) {
      return setError("이미 추가한 이름입니다.");
    }
    if (values.length >= maxValues) {
      return setError(`최대 ${maxValues}명까지 추가할 수 있습니다.`);
    }
    onChange([...values, value]);
    setDraft("");
    setError(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commit();
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
        <Button type="button" variant="outline" onClick={commit} disabled={values.length >= maxValues}>
          <Plus /> 추가
        </Button>
      </div>
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        Enter 또는 추가 버튼으로 확정합니다. 입력창을 벗어나도 자동 추가되지 않습니다.
      </p>
      {error ? <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function MemberAutocomplete({
  members,
  selectedUids,
  onChange,
  maxReached,
}: {
  members: Member[];
  selectedUids: number[];
  onChange: (uids: number[]) => void;
  maxReached: boolean;
}) {
  const inputId = useId();
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = members.filter((member) => selectedUids.includes(member.uid));
  const search = comparableText(query);
  const options = members.filter((member) =>
    !selectedUids.includes(member.uid) &&
    (!search || [member.name, member.code, member.unit_name ?? ""].some((value) => comparableText(value).includes(search))),
  );
  const select = (member: Member) => {
    if (maxReached) return;
    onChange([...selectedUids, member.uid]);
    setQuery("");
    setOpen(false);
    setActiveIndex(0);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, Math.max(options.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && open && options[activeIndex]) {
      event.preventDefault();
      select(options[activeIndex]);
    } else if (event.key === "Escape") setOpen(false);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={inputId}>OTW 참여 멤버</Label>
        <span className="text-xs text-muted-foreground">이름·코드·유닛 검색</span>
      </div>
      {selected.length ? (
        <div className="flex flex-wrap gap-2" aria-label="선택한 OTW 멤버">
          {selected.map((member) => (
            <Badge key={member.uid} variant="secondary" className="gap-2 py-1 pl-1">
              <img src={`/profile/${member.code}.webp`} alt="" className="size-6 rounded-full object-cover" />
              <span>{member.oshi_mark} {member.name}</span>
              {member.unit_name ? <span className="text-muted-foreground">· {member.unit_name}</span> : null}
              <button type="button" aria-label={`${member.name} 제거`} onClick={() => onChange(selectedUids.filter((uid) => uid !== member.uid))}>
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
      <div
        className="relative"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
        <Input
          id={inputId}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={open && options[activeIndex] ? `${listboxId}-${options[activeIndex].uid}` : undefined}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); setActiveIndex(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="멤버 검색"
          className="pl-9"
          disabled={maxReached}
        />
        {open ? (
          <div id={listboxId} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg">
            {options.length ? options.map((member, index) => (
              <button
                id={`${listboxId}-${member.uid}`}
                key={member.uid}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(member)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm ${index === activeIndex ? "bg-accent" : "hover:bg-accent"}`}
              >
                <img src={`/profile/${member.code}.webp`} alt="" className="size-8 rounded-full object-cover" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{member.oshi_mark} {member.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{member.code}{member.unit_name ? ` · ${member.unit_name}` : ""}</span>
                </span>
              </button>
            )) : <p className="px-3 py-4 text-center text-sm text-muted-foreground">일치하는 현재 멤버가 없습니다.</p>}
          </div>
        ) : null}
      </div>
      {maxReached ? <p role="alert" className="text-sm text-destructive">참여자는 최대 {PARTICIPANT_LIMIT}명입니다.</p> : null}
    </div>
  );
}

function VideoSummary({ preflight }: { preflight: OtwPlaySubmissionPreflightDto }) {
  return (
    <div className="grid gap-4 rounded-xl border bg-muted/30 p-3 sm:grid-cols-[160px_minmax(0,1fr)] sm:p-4">
      <img src={preflight.thumbnailUrl} alt="확인한 YouTube 영상 썸네일" className="aspect-video w-full rounded-lg object-cover" />
      <div className="min-w-0 self-center text-sm">
        <p className="font-medium text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="mr-1 inline size-4" /> 영상 확인 완료</p>
        <a href={preflight.canonicalUrl} target="_blank" rel="noreferrer" className="mt-2 block truncate text-primary underline-offset-4 hover:underline">{preflight.canonicalUrl}</a>
        <p className="mt-1 text-xs text-muted-foreground">Video ID: {preflight.videoId}</p>
      </div>
    </div>
  );
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
    <div className="space-y-2" aria-label="가창자 역할 분류">
      <div>
        <p className="text-sm font-medium">가창 역할</p>
        <p className="text-xs text-muted-foreground">
          메인 보컬은 발견 화면과 Player에 우선 표시됩니다.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-2 rounded-lg border bg-background p-2">
            <span className="truncate text-sm font-medium">{item.label}</span>
            <Select
              value={item.role}
              onValueChange={(value) =>
                onRoleChange(item.key, value as OtwPlayParticipantRole)
              }
            >
              <SelectTrigger aria-label={`${item.label} 가창 역할`}>
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

export function OtwPlaySubmissionPage() {
  const queryClient = useQueryClient();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState(0);
  const [clientRequestId, setClientRequestId] = useState(newClientRequestId);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [title, setTitle] = useState("");
  const [songMode, setSongMode] = useState<"new" | "existing">("new");
  const [suggestedSongId, setSuggestedSongId] = useState<string | null>(null);
  const [originalArtists, setOriginalArtists] = useState<string[]>([]);
  const [memberUids, setMemberUids] = useState<number[]>([]);
  const [externalParticipants, setExternalParticipants] = useState<string[]>([]);
  const [memberRoles, setMemberRoles] = useState<Record<number, OtwPlayParticipantRole>>({});
  const [externalRoles, setExternalRoles] = useState<Record<string, OtwPlayParticipantRole>>({});
  const [note, setNote] = useState("");
  const [preflight, setPreflight] = useState<OtwPlaySubmissionPreflightDto | null>(null);
  const [candidateSearchAttempted, setCandidateSearchAttempted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<OtwPlayCreateSubmissionResponse | null>(null);

  const members = useQuery({ queryKey: queryKeys.members.active(), queryFn: fetchActiveMembers });
  const preflightMutation = useMutation({ mutationFn: preflightOtwPlaySubmission });
  const submitMutation = useMutation({
    mutationFn: createOtwPlaySubmission,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.otwPlay.memberSubmissions() });
      setMessage(null);
      setSuccess(result);
    },
    onError: (error) => {
      const apiError = error instanceof ApiError ? error : null;
      const fields = Object.keys(apiError?.fields ?? {}).map((field) => field.toLowerCase());
      if (fields.some((field) => field.includes("youtube"))) setStep(0);
      else if (fields.some((field) => field === "title" || field.includes("originalartists") || field.includes("participants"))) setStep(1);
      setMessage(apiError?.code === "PLAY_SUBMISSION_DUPLICATE"
        ? "이미 카탈로그에 있거나 검토 중인 영상입니다."
        : apiError?.code === "PLAY_SUBMISSION_RATE_LIMITED"
          ? "제안 횟수 제한에 도달했습니다. 잠시 후 다시 시도해 주세요."
          : apiError?.message ?? "제안 제출에 실패했습니다.");
    },
  });

  useEffect(() => { headingRef.current?.focus(); }, [step]);
  const dirty = !success && Boolean(youtubeUrl || title || originalArtists.length || memberUids.length || externalParticipants.length || note);
  const shouldBlock = useCallback(
    () => dirty && !window.confirm("작성 중인 곡 제안이 있습니다. 이 페이지를 나가시겠습니까?"),
    [dirty],
  );
  useBlocker({ shouldBlockFn: shouldBlock, enableBeforeUnload: dirty, disabled: !dirty });

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
      participantRole: externalRoles[displayName] ?? "vocal",
    })),
  ], [externalParticipants, externalRoles, memberRoles, memberUids]);
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
    setMessage(null);
    setCandidateSearchAttempted(false);
    const data = await preflightMutation.mutateAsync({ youtubeUrl }).catch((error: unknown) => {
      setMessage(error instanceof ApiError ? error.message : "영상 확인에 실패했습니다.");
      return null;
    });
    if (!data) return;
    setPreflight(data);
    if (data.duplicate) {
      return;
    }
    setStep(1);
  };
  const searchSongCandidates = async () => {
    setMessage(null);
    setCandidateSearchAttempted(true);
    const data = await preflightMutation.mutateAsync({ youtubeUrl, title }).catch((error: unknown) => {
      setMessage(error instanceof ApiError ? error.message : "기존 곡 검색에 실패했습니다.");
      return null;
    });
    if (data) setPreflight(data);
  };
  const selectCandidate = (candidate: OtwPlaySubmissionSongCandidateDto) => {
    setSongMode("existing");
    setSuggestedSongId(candidate.id);
    setTitle(candidate.title);
    setOriginalArtists(candidate.originalArtists);
  };
  const useNewSong = () => { setSongMode("new"); setSuggestedSongId(null); };
  const canReview = title.trim().length > 0 && originalArtists.length > 0 && originalArtists.length <= ORIGINAL_ARTIST_LIMIT && participantCount > 0 && participantCount <= PARTICIPANT_LIMIT && (songMode === "new" || suggestedSongId !== null);
  const resetForm = () => {
    setStep(0); setClientRequestId(newClientRequestId()); setYoutubeUrl(""); setTitle("");
    setSongMode("new"); setSuggestedSongId(null); setOriginalArtists([]); setMemberUids([]);
    setExternalParticipants([]); setMemberRoles({}); setExternalRoles({}); setNote(""); setPreflight(null); setCandidateSearchAttempted(false);
    setMessage(null); setSuccess(null);
  };

  if (success) {
    return (
      <div className="mx-auto flex w-full max-w-3xl items-center p-4 py-10 sm:p-8">
        <section className="w-full rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-10">
          <CheckCircle2 className="mx-auto size-12 text-emerald-600" />
          <p className="mt-4 text-sm font-medium text-primary">곡 제안 접수 완료</p>
          <h1 className="mt-1 text-2xl font-bold">{success.data.title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">관리자 검수 전까지 공개되지 않습니다. 내 제안에서 현재 상태를 확인할 수 있어요.</p>
          <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row">
            <Button asChild><Link to="/play/submissions">내 제안에서 확인</Link></Button>
            <Button type="button" variant="outline" onClick={resetForm}>다른 곡 제안</Button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 py-7 sm:p-8">
      <div>
        <p className="text-sm font-medium text-primary">회원 공식 커버 제안</p>
        <h1 ref={headingRef} tabIndex={-1} className="mt-1 text-2xl font-bold outline-none">{steps[step]}</h1>
        <p className="mt-2 text-sm text-muted-foreground">공식 커버 영상만 접수하며, 제출 내용은 관리자 승인 전까지 비공개입니다.</p>
      </div>
      <ol className="grid grid-cols-3 gap-2" aria-label="제안 단계">
        {steps.map((label, index) => {
          const complete = index < step;
          return (
            <li key={label} aria-current={step === index ? "step" : undefined} className={`rounded-lg border px-2 py-2 text-center text-xs font-medium sm:px-3 sm:text-sm ${step === index ? "border-foreground bg-foreground text-background" : complete ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200" : "bg-card"}`}>
              {complete ? <Check className="mr-1 inline size-3.5" /> : `${index + 1}. `}{label}
            </li>
          );
        })}
      </ol>
      <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
        {step === 0 ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="submission-youtube-url">YouTube 영상 URL</Label>
              <Input id="submission-youtube-url" value={youtubeUrl} onChange={(event) => { setYoutubeUrl(event.target.value); setPreflight(null); setMessage(null); }} placeholder="https://www.youtube.com/watch?v=..." maxLength={500} aria-invalid={Boolean(message)} />
              <p className="text-xs text-muted-foreground">OTW 멤버가 참여한 공식 커버 영상만 제안할 수 있습니다. 원본 URL은 확인 후 표준 주소로 정리됩니다.</p>
            </div>
            {preflight && !preflight.duplicate ? <VideoSummary preflight={preflight} /> : null}
            {preflight?.duplicate ? <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">이미 {preflight.duplicate === "catalog" ? "카탈로그에 등록된" : "검토 중인"} 영상입니다.</p> : null}
            <Button onClick={() => void verifyVideo()} disabled={!youtubeUrl.trim() || preflightMutation.isPending}>
              {preflightMutation.isPending ? <LoaderCircle className="animate-spin" /> : null}{preflightMutation.isPending ? "확인 중" : "영상 확인"} <ChevronRight />
            </Button>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-7">
            {preflight ? <VideoSummary preflight={preflight} /> : null}
            <fieldset className="space-y-4 rounded-xl border p-4 sm:p-5">
              <legend className="px-1 font-semibold">곡 정보</legend>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="곡 연결 방식">
                <button type="button" role="radio" aria-checked={songMode === "new"} onClick={useNewSong} className={`rounded-lg border p-3 text-left ${songMode === "new" ? "border-primary bg-primary/5" : "hover:bg-muted"}`}>
                  <span className="block font-medium">새 곡으로 제안</span><span className="mt-1 block text-xs text-muted-foreground">새 곡명과 원곡 가수 snapshot을 제출합니다.</span>
                </button>
                <button type="button" role="radio" aria-checked={songMode === "existing"} onClick={() => setSongMode("existing")} className={`rounded-lg border p-3 text-left ${songMode === "existing" ? "border-primary bg-primary/5" : "hover:bg-muted"}`}>
                  <span className="block font-medium">기존 곡 연결</span><span className="mt-1 block text-xs text-muted-foreground">검색한 카탈로그 곡에 새 가창을 연결합니다.</span>
                </button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="submission-title">곡명 *</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input id="submission-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={300} />
                  <Button type="button" variant="outline" onClick={() => void searchSongCandidates()} disabled={!title.trim() || preflightMutation.isPending}>
                    {preflightMutation.isPending ? <LoaderCircle className="animate-spin" /> : <Search />} 기존 곡 찾기
                  </Button>
                </div>
              </div>
              {candidateSearchAttempted ? (
                <div className="space-y-2" aria-live="polite">
                  <div className="flex items-center justify-between gap-3"><Label>기존 곡 후보</Label>{suggestedSongId ? <Button type="button" size="sm" variant="ghost" onClick={useNewSong}>선택 해제</Button> : null}</div>
                  {preflightMutation.isPending ? <p className="text-sm text-muted-foreground"><LoaderCircle className="mr-1 inline size-4 animate-spin" /> 검색 중</p> : preflight?.songCandidates.length ? (
                    <div className="grid gap-2">{preflight.songCandidates.map((song) => (
                      <button type="button" key={song.id} onClick={() => selectCandidate(song)} className={`rounded-lg border p-3 text-left text-sm ${suggestedSongId === song.id ? "border-primary bg-primary/5" : "hover:bg-muted"}`}>
                        <span className="font-medium">{song.title}</span>{song.originalArtists.length ? <span className="ml-2 text-muted-foreground">{song.originalArtists.join(", ")}</span> : null}
                      </button>
                    ))}</div>
                  ) : <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">일치하는 기존 곡이 없습니다. 새 곡으로 제안해 주세요.</p>}
                </div>
              ) : null}
              {songMode === "existing" && !suggestedSongId ? <p className="text-sm text-muted-foreground">기존 곡을 검색한 뒤 후보를 선택해 주세요.</p> : null}
              <ChipInput id="submission-original-artists" label="원곡 가수" values={originalArtists} onChange={setOriginalArtists} placeholder="가수명 입력" maxValues={ORIGINAL_ARTIST_LIMIT} required />
            </fieldset>

            <fieldset className="space-y-5 rounded-xl border p-4 sm:p-5">
              <legend className="px-1 font-semibold">가창 참여자</legend>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm"><span>OTW 멤버와 외부 참여자를 함께 선택해 주세요.</span><span className="font-medium">{participantCount}/{PARTICIPANT_LIMIT}</span></div>
              <MemberAutocomplete members={members.data ?? []} selectedUids={memberUids} onChange={setMemberUids} maxReached={participantCount >= PARTICIPANT_LIMIT} />
              <ChipInput id="submission-external-participants" label="외부 참여자" values={externalParticipants} onChange={setExternalParticipants} placeholder="외부 인물 또는 그룹명" maxValues={Math.max(PARTICIPANT_LIMIT - memberUids.length, 0)} />
              <ParticipantRoleEditor items={participantRoleItems} onRoleChange={changeParticipantRole} />
              {participantCount === 0 ? <p className="text-sm text-muted-foreground">가창 참여자를 1명 이상 선택해 주세요.</p> : null}
            </fieldset>
            <div className="flex flex-col-reverse justify-between gap-2 sm:flex-row"><Button variant="ghost" onClick={() => setStep(0)}><ChevronLeft /> 이전</Button><Button disabled={!canReview} onClick={() => setStep(2)}>검토하기 <ChevronRight /></Button></div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-6">
            {preflight ? <VideoSummary preflight={preflight} /> : null}
            <div className="rounded-xl bg-muted/50 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2"><Badge>{songMode === "existing" ? "기존 곡 연결" : "새 곡"}</Badge><strong className="text-base">{title}</strong></div>
              <div className="mt-4 space-y-3">
                <div><p className="mb-2 text-xs text-muted-foreground">원곡 가수</p><div className="flex flex-wrap gap-2">{originalArtists.map((artist) => <Badge key={artist} variant="outline">{artist}</Badge>)}</div></div>
                <div><p className="mb-2 text-xs text-muted-foreground">참여자</p><div className="flex flex-wrap gap-2">{selectedMembers.map((member) => <Badge key={member.uid} variant="secondary">{member.oshi_mark} {member.name} · {participantRoleLabel[memberRoles[member.uid] ?? "vocal"]}</Badge>)}{externalParticipants.map((name) => <Badge key={name} variant="outline">{name} · {participantRoleLabel[externalRoles[name] ?? "vocal"]}</Badge>)}</div></div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3"><Label htmlFor="submission-note">관리자에게 전할 메모 (선택)</Label><span className="text-xs text-muted-foreground">{note.length}/1000</span></div>
              <Textarea id="submission-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={5} />
            </div>
            <p className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm"><AlertCircle className="mr-1 inline size-4" /> 승인 전에는 제안과 메모가 공개되지 않습니다. 반려 시 회원 화면에는 상태만 표시되고 내부 검수 사유는 공개되지 않습니다.</p>
            <div className="flex flex-col-reverse justify-between gap-2 sm:flex-row">
              <Button variant="ghost" onClick={() => setStep(1)}><ChevronLeft /> 이전</Button>
              <Button disabled={submitMutation.isPending} onClick={() => submitMutation.mutate({ clientRequestId, youtubeUrl, title, suggestedSongId, originalArtists: originalArtists.map((displayName) => ({ kind: "external", displayName })), participants, note: note || null })}>
                {submitMutation.isPending ? <LoaderCircle className="animate-spin" /> : null}{submitMutation.isPending ? "제출 중" : "최종 제출"}
              </Button>
            </div>
          </div>
        ) : null}
      </section>
      {message ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{message}</p> : null}
    </div>
  );
}
