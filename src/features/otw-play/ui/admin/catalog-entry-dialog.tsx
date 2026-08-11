import { useEffect, useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  OtwPlayAdminCatalogDto,
  OtwPlayAdminCatalogEntryPreflightDto,
  OtwPlayAdminCatalogSubjectInput,
  OtwPlayAdminCreateCatalogEntryRequest,
  OtwPlayAdminEntityDto,
  OtwPlayParticipationType,
  OtwPlayRelationType,
} from "@contracts/otw-play";
import { ConfirmActionDialog } from "@/app/admin";
import { fetchActiveMembers, type Member } from "@/features/members";
import { queryKeys } from "@/shared/query/query-keys";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
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
  Check,
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

type SelectedSubject = {
  key: string;
  label: string;
  detail?: string;
  subject: OtwPlayAdminCatalogSubjectInput;
};

const STEPS = ["영상 확인", "곡 연결", "참여자와 분류", "검토와 저장"];

const relationLabels: Record<OtwPlayRelationType, string> = {
  original: "오리지널",
  cover: "공식 커버",
};

const participationLabels: Record<OtwPlayParticipationType, string> = {
  solo: "솔로",
  duet: "듀엣",
  unit: "유닛",
  group: "그룹",
  external_collab: "외부 협업",
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
  detail: entity.entityKind === "group" ? "기존 그룹" : "기존 외부 인물",
  subject: { kind: "entity", entityId: entity.id },
});

function SubjectPicker({
  label,
  members,
  entities,
  selected,
  onChange,
  allowGroup = true,
}: {
  label: string;
  members: Member[];
  entities: OtwPlayAdminEntityDto[];
  selected: SelectedSubject[];
  onChange: (items: SelectedSubject[]) => void;
  allowGroup?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listboxId = useId();
  const normalized = query.trim().toLocaleLowerCase();
  const selectedKeys = new Set(selected.map((item) => item.key));
  const memberMatches = members
    .filter(
      (member) =>
        !selectedKeys.has(`member:${member.uid}`) &&
        (!normalized ||
          member.name.toLocaleLowerCase().includes(normalized) ||
          member.code.toLocaleLowerCase().includes(normalized)),
    )
    .slice(0, 6);
  const entityMatches = entities
    .filter(
      (entity) =>
        entity.archivedAt === null &&
        entity.memberUid === null &&
        !selectedKeys.has(`entity:${entity.id}`) &&
        (!normalized ||
          entity.displayName.toLocaleLowerCase().includes(normalized)),
    )
    .slice(0, 6);
  const suggestionCount = memberMatches.length + entityMatches.length;
  const selectSuggestion = (index: number) => {
    if (index < memberMatches.length) {
      const member = memberMatches[index];
      if (member) onChange([...selected, subjectFromMember(member)]);
    } else {
      const entity = entityMatches[index - memberMatches.length];
      if (entity) onChange([...selected, subjectFromEntity(entity)]);
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
          placeholder="멤버 또는 기존 외부 identity 검색"
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
                {entity.entityKind === "group" ? "기존 그룹" : "기존 외부 인물"}
              </span>
            </button>
            );
          })}
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
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        기존 외부 identity 후보를 먼저 보여주며, 새 칩은 자동 병합하지 않고 별도 identity로 저장합니다.
      </p>
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
  const [preflight, setPreflight] = useState<OtwPlayAdminCatalogEntryPreflightDto | null>(null);
  const [checking, setChecking] = useState(false);
  const [channelChoice, setChannelChoice] = useState<"approved" | "pending">("pending");
  const [channelRole, setChannelRole] = useState<"member_music" | "member_main" | "project_official" | "otw_official" | "unit_official">("project_official");
  const [songMode, setSongMode] = useState<"existing" | "create">("existing");
  const [songId, setSongId] = useState("");
  const [songSearch, setSongSearch] = useState("");
  const [title, setTitle] = useState("");
  const [isOtwOriginal, setIsOtwOriginal] = useState(false);
  const [artists, setArtists] = useState<SelectedSubject[]>([]);
  const [aliases, setAliases] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [participants, setParticipants] = useState<SelectedSubject[]>([]);
  const [channelOwners, setChannelOwners] = useState<SelectedSubject[]>([]);
  const [relationType, setRelationType] = useState<OtwPlayRelationType>("cover");
  const [releaseType, setReleaseType] = useState<"official_mv" | "official_video">("official_video");
  const [participationType, setParticipationType] = useState<OtwPlayParticipationType>("solo");
  const [internalNote, setInternalNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setYoutubeUrl("");
    setStartSeconds("0");
    setPreflight(null);
    setErrorMessage(null);
    setChannelChoice("pending");
    setChannelRole("project_official");
    setSongMode("existing");
    setSongSearch("");
    setTitle("");
    setIsOtwOriginal(false);
    setArtists([]);
    setAliases("");
    setReleaseDate("");
    setParticipants([]);
    setChannelOwners([]);
    setRelationType("cover");
    setReleaseType("official_video");
    setParticipationType("solo");
    setInternalNote("");
    if (preselectedSongId) {
      setSongId(preselectedSongId);
    } else {
      setSongId("");
    }
  }, [open, preselectedSongId]);

  const matchingSongs = useMemo(() => {
    const query = songSearch.trim().toLocaleLowerCase();
    return catalog.songs
      .filter(
        (song) =>
          song.archivedAt === null &&
          (!query ||
            song.title.toLocaleLowerCase().includes(query) ||
            song.aliases.some((alias) => alias.alias.toLocaleLowerCase().includes(query)) ||
            song.originalArtists.some((artist) => artist.displayName.toLocaleLowerCase().includes(query))),
      )
      .slice(0, 10);
  }, [catalog.songs, songSearch]);

  const runPreflight = async () => {
    setChecking(true);
    setErrorMessage(null);
    try {
      const result = await preflightOtwPlayCatalogEntry({
        youtubeUrl,
        startSeconds: Number(startSeconds),
      });
      setPreflight(result);
      setTitle((current) => current || result.video.title);
      setChannelChoice(result.channel.state === "approved" || result.channel.state === "recognized_member" ? "approved" : "pending");
      if (result.channel.channelRole === "member_music" || result.channel.channelRole === "member_main" || result.channel.channelRole === "project_official" || result.channel.channelRole === "otw_official" || result.channel.channelRole === "unit_official") {
        setChannelRole(result.channel.channelRole);
      }
    } catch {
      setErrorMessage("영상 metadata를 확인하지 못했습니다. URL과 YouTube 상태를 확인하세요.");
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
  const songReady =
    songMode === "existing" ? Boolean(songId) : Boolean(title.trim() && artists.length);
  const stepReady = [
    Boolean(preflight && !preflight.duplicate && preflight.channel.state !== "revoked"),
    songReady,
    participants.length > 0 &&
      (!needsChannelOwnerChoice || channelOwners.length > 0),
    true,
  ][step];

  const buildRequest = (publicationTarget: "draft" | "published"): OtwPlayAdminCreateCatalogEntryRequest => {
    if (!preflight) throw new Error("Preflight required");
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
      startSeconds: Number(startSeconds),
      endSeconds: null,
      song:
        songMode === "existing"
          ? { kind: "existing", songId }
          : {
              kind: "create",
              title: title.trim(),
              isOtwOriginal,
              originalReleaseDate: releaseDate || null,
              originalReleasePrecision: releaseDate ? "day" : "unknown",
              aliases: aliases.split("\n").map((alias) => alias.trim()).filter(Boolean).map((alias) => ({ alias })),
              originalArtists: artists.map((artist, index) => ({
                subject: artist.subject,
                creditOrder: index,
                isPrimary: index === 0,
              })),
            },
      participants: participants.map((participant, index) => ({
        subject: participant.subject,
        participantRole: "vocal",
        creditOrder: index,
        creditNameSnapshot: participant.label,
      })),
      channel,
      relationType,
      releaseType,
      participationType,
      publicationTarget,
      internalNote: internalNote.trim() || null,
    };
  };

  const save = async (target: "draft" | "published") => {
    setSaving(true);
    setErrorMessage(null);
    try {
      await createOtwPlayCatalogEntry(buildRequest(target));
      await onSaved();
      toast({ variant: "success", description: target === "published" ? "영상을 게시했습니다." : "영상을 임시 저장했습니다." });
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "등록에 실패했습니다.";
      setErrorMessage(message);
      toast({ variant: "error", description: "입력값은 유지했습니다. 오류 내용을 확인하세요." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
        <DialogContent className="h-[100dvh] max-h-[100dvh] max-w-none overflow-y-auto rounded-none sm:h-auto sm:max-h-[92vh] sm:max-w-5xl sm:rounded-xl">
          <DialogHeader>
            <DialogTitle>새 YouTube 영상 등록</DialogTitle>
            <DialogDescription>영상 하나를 확인하고 곡·참여자·공식 채널을 한 흐름에서 연결합니다.</DialogDescription>
          </DialogHeader>
          <ol className="grid grid-cols-4 gap-1" aria-label="등록 단계">
            {STEPS.map((label, index) => (
              <li key={label} className={`rounded-md px-2 py-2 text-center text-xs ${index === step ? "bg-primary text-primary-foreground" : index < step ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                <span className="hidden sm:inline">{index + 1}. </span>{label}
              </li>
            ))}
          </ol>

          {errorMessage && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{errorMessage}</div>}

          <div className="min-h-[360px] space-y-5 py-2">
            {step === 0 && (
              <>
                <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end">
                  <div className="space-y-1.5"><Label htmlFor="catalog-youtube-url">YouTube URL</Label><Input id="catalog-youtube-url" value={youtubeUrl} onChange={(event) => { setYoutubeUrl(event.target.value); setPreflight(null); }} placeholder="https://www.youtube.com/watch?v=..." /></div>
                  <div className="space-y-1.5"><Label htmlFor="catalog-start">시작 위치(초)</Label><Input id="catalog-start" type="number" min="0" value={startSeconds} onChange={(event) => { setStartSeconds(event.target.value); setPreflight(null); }} /></div>
                  <Button onClick={() => void runPreflight()} disabled={checking || !youtubeUrl.trim()}>{checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} 영상 확인</Button>
                </div>
                {preflight && (
                  <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 md:grid-cols-[240px_1fr]">
                    <img src={preflight.video.thumbnailUrl ?? `https://i.ytimg.com/vi/${preflight.video.videoId}/hqdefault.jpg`} alt="확인한 영상 썸네일" className="aspect-video w-full rounded-lg object-cover" />
                    <div className="space-y-3">
                      <div><div className="font-semibold">{preflight.video.title}</div><div className="text-sm text-muted-foreground">{preflight.video.channelTitle}</div></div>
                      {preflight.duplicate && <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm"><strong>이미 등록된 영상 구간입니다.</strong><div>곡 {preflight.duplicate.songId} · 가창 {preflight.duplicate.performanceId}</div><Button type="button" variant="link" className="h-auto p-0" onClick={() => onOpenChange(false)}>기존 항목 보기</Button></div>}
                      <div className="flex flex-wrap items-center gap-2"><Badge variant={preflight.channel.state === "revoked" ? "destructive" : "secondary"}>채널: {preflight.channel.state === "approved" ? "승인됨" : preflight.channel.state === "recognized_member" ? "멤버 채널 자동 인식" : preflight.channel.state === "pending" ? "검수 대기" : preflight.channel.state === "inactive" ? "비활성" : preflight.channel.state === "revoked" ? "철회됨" : "미등록"}</Badge><Badge variant="outline">catalog r{preflight.catalogRevision}</Badge></div>
                      {preflight.channel.state === "revoked" ? <p className="text-sm text-destructive">철회된 채널에서는 등록하거나 게시할 수 없습니다. 고급 관리에서 상태를 확인하세요.</p> : preflight.channel.state !== "approved" && preflight.channel.state !== "recognized_member" && <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label>채널 처리</Label><Select value={channelChoice} onValueChange={(value) => setChannelChoice(value as "approved" | "pending")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="approved">공식 채널로 승인</SelectItem><SelectItem value="pending">보류하고 draft만 저장</SelectItem></SelectContent></Select></div><div className="space-y-1.5"><Label>채널 역할</Label><Select value={channelRole} onValueChange={(value) => setChannelRole(value as typeof channelRole)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="otw_official">OTW 공식</SelectItem><SelectItem value="unit_official">유닛 공식</SelectItem><SelectItem value="member_music">멤버 노래 채널</SelectItem><SelectItem value="member_main">멤버 메인 채널</SelectItem><SelectItem value="project_official">승인 프로젝트</SelectItem></SelectContent></Select></div></div>}
                    </div>
                  </div>
                )}
              </>
            )}

            {step === 1 && (
              <>
                <div className="flex gap-2"><Button type="button" variant={songMode === "existing" ? "default" : "outline"} onClick={() => setSongMode("existing")}>기존 곡 연결</Button><Button type="button" variant={songMode === "create" ? "default" : "outline"} onClick={() => setSongMode("create")}>새 곡 만들기</Button></div>
                {songMode === "existing" ? <div className="space-y-3"><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={songSearch} onChange={(event) => setSongSearch(event.target.value)} placeholder="곡명·별칭·원곡 가수 검색" className="pl-9" /></div><div className="grid gap-2 sm:grid-cols-2">{matchingSongs.map((song) => <button key={song.id} type="button" className={`rounded-lg border p-3 text-left ${songId === song.id ? "border-primary bg-primary/5" : "hover:bg-muted"}`} onClick={() => setSongId(song.id)}><div className="flex items-center justify-between gap-2"><span className="font-medium">{song.title}</span>{songId === song.id && <Check className="h-4 w-4 text-primary" />}</div><div className="text-xs text-muted-foreground">{song.originalArtists.map((artist) => artist.displayName).join(", ")}</div></button>)}</div></div> : <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label>곡명</Label><Input value={title} onChange={(event) => setTitle(event.target.value)} /></div><label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={isOtwOriginal} onChange={(event) => { setIsOtwOriginal(event.target.checked); setRelationType(event.target.checked ? "original" : "cover"); }} /> OTW 오리지널곡</label></div><SubjectPicker label="원곡 가수" members={members} entities={catalog.entities} selected={artists} onChange={setArtists} /><details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">추가 정보</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label>별칭 (한 줄에 하나)</Label><Textarea value={aliases} onChange={(event) => setAliases(event.target.value)} /></div><div className="space-y-1.5"><Label>원곡 공개일</Label><Input type="date" value={releaseDate} onChange={(event) => setReleaseDate(event.target.value)} /></div></div></details></div>}
              </>
            )}

            {step === 2 && (
              <>
                <SubjectPicker label="가창 참여자" members={members} entities={catalog.entities} selected={participants} onChange={setParticipants} />
                {needsChannelOwnerChoice && (
                  <div className="rounded-lg border p-3">
                    <SubjectPicker
                      label="채널 소유·연결 주체"
                      members={members}
                      entities={catalog.entities}
                      selected={channelOwners}
                      onChange={setChannelOwners}
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      미등록 또는 재승인 채널은 가창 참여자와 별개로 공식 소유·연결 주체를 확인해야 합니다.
                    </p>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-3"><div className="space-y-1.5"><Label>곡 관계</Label><Select value={relationType} onValueChange={(value) => setRelationType(value as OtwPlayRelationType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="original">오리지널</SelectItem><SelectItem value="cover">공식 커버</SelectItem></SelectContent></Select></div><div className="space-y-1.5"><Label>공개 형태</Label><Select value={releaseType} onValueChange={(value) => setReleaseType(value as typeof releaseType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="official_video">공식 영상</SelectItem><SelectItem value="official_mv">공식 MV</SelectItem></SelectContent></Select></div><div className="space-y-1.5"><Label>참여 형태</Label><Select value={participationType} onValueChange={(value) => setParticipationType(value as OtwPlayParticipationType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(participationLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></div>
                <div className="space-y-1.5"><Label>내부 메모 (선택)</Label><Textarea value={internalNote} onChange={(event) => setInternalNote(event.target.value)} /></div>
              </>
            )}

            {step === 3 && preflight && (
              <div className="grid gap-4 md:grid-cols-2"><div className="rounded-xl border p-4"><div className="mb-3 text-sm font-semibold">영상과 채널</div><img src={preflight.video.thumbnailUrl ?? `https://i.ytimg.com/vi/${preflight.video.videoId}/hqdefault.jpg`} alt="등록 영상" className="mb-3 aspect-video w-full rounded-md object-cover" /><div className="font-medium">{preflight.video.title}</div><div className="text-sm text-muted-foreground">{preflight.video.channelTitle}</div><Badge className="mt-2" variant="outline">{channelChoice === "approved" || preflight.channel.state === "approved" || preflight.channel.state === "recognized_member" ? "승인 채널" : "채널 검수 대기"}</Badge>{needsChannelOwnerChoice && <div className="mt-3 text-sm"><span className="font-medium">연결 주체:</span> {channelOwners.map((owner) => owner.label).join(", ")}</div>}</div><div className="space-y-4 rounded-xl border p-4"><div><div className="text-sm font-semibold">곡</div><div>{songMode === "existing" ? catalog.songs.find((song) => song.id === songId)?.title : title}</div><div className="text-sm text-muted-foreground">{songMode === "create" ? artists.map((artist) => artist.label).join(", ") : "기존 곡에 연결"}</div></div><div><div className="text-sm font-semibold">참여자</div><div className="flex flex-wrap gap-1">{participants.map((participant) => <Badge key={participant.key} variant="secondary">{participant.label}</Badge>)}</div></div><div><div className="text-sm font-semibold">분류</div><div className="text-sm text-muted-foreground">{relationLabels[relationType]} · {releaseType === "official_mv" ? "공식 MV" : "공식 영상"} · {participationLabels[participationType]}</div></div><div className="rounded-md bg-muted p-3 text-sm">임시 저장은 공개되지 않습니다. 게시는 승인·활성 채널에서만 가능하며 확인 후 즉시 공개 상태가 됩니다.</div></div></div>
            )}
          </div>

          <DialogFooter className="border-t pt-4 sm:justify-between">
            <div><Button type="button" variant="outline" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0 || saving}><ArrowLeft className="h-4 w-4" /> 이전</Button></div>
            {step < 3 ? <Button type="button" onClick={() => setStep((value) => Math.min(3, value + 1))} disabled={!stepReady}>다음 <ArrowRight className="h-4 w-4" /></Button> : <div className="flex flex-col-reverse gap-2 sm:flex-row"><Button type="button" variant="outline" disabled={saving} onClick={() => void save("draft")}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} 임시 저장</Button><Button type="button" disabled={saving || !channelCanPublish} title={channelCanPublish ? undefined : "승인·활성 채널에서만 게시할 수 있습니다."} onClick={() => setConfirmPublish(true)}>게시</Button></div>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmActionDialog open={confirmPublish} onOpenChange={setConfirmPublish} title="이 영상을 게시할까요?" description="곡과 가창 metadata가 공개 카탈로그 상태로 저장됩니다. 영상과 채널 정보를 다시 확인해 주세요." confirmLabel="게시" onConfirm={() => { setConfirmPublish(false); void save("published"); }} />
    </>
  );
}
