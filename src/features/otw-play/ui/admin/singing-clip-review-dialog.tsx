import { useQueryClient } from "@tanstack/react-query";
import { applyReviewCatalogChanges } from "../../queries/review-catalog-changes";
import { BroadcastFields, EMPTY_BROADCAST } from "./broadcast-fields";
import { ReviewPublicationPreview } from "./review-publication-preview";
import { AI_REVIEW_FIELDS, type AiReviewFields } from "@contracts/otw-play-ai-review";
import { AiReviewPanel } from "./ai-review-panel";
import { SongConnectionPicker } from "./song-connection-picker";
import { aiPersonSelection, useAiReviewForm } from "./ai-review-form";
import { useUnsavedChanges } from "@/shared/lib/unsaved-changes";
import { preservesPlayReview } from "./review-navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  OtwPlayAdminCatalogDto,
  OtwPlayAdminCatalogSubjectInput,
  OtwPlayChannelMonitorCandidateDto,
  OtwPlayParticipantRole,
  OtwPlayParticipationType,
  OtwPlayRelationType,
} from "@contracts/otw-play";
import { fetchActiveMembers } from "@/features/members";
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
import { SelectField } from "@/shared/ui/select-field";
import { Textarea } from "@/shared/ui/textarea";
import { useToast } from "@/shared/ui/toast";
import { PiArrowLeftBold as ArrowLeft, PiArrowSquareOutBold as ExternalLink, PiSpinnerGapBold as Loader2 } from "react-icons/pi";
import {
  convertOtwPlayImportCandidate,
  updateOtwPlayImportCandidate,
} from "../../api/admin";
import {
  SubjectPicker,
  type SelectedSubject,
} from "./catalog-entry-dialog";
import { SongTagPicker } from "../song-tag-picker";

type SelectedParticipant = SelectedSubject & {
  participantRole: OtwPlayParticipantRole;
};

const selectedSubjectFromInput = (
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
    const entity = catalog.entities.find((item) => item.memberUid === subject.memberUid);
    return {
      key: entity ? `entity:${entity.id}` : `member:${subject.memberUid}`,
      label: entity?.displayName ?? `멤버 UID ${subject.memberUid}`,
      detail: "OTW 멤버",
      subject,
    };
  }
  const entity = catalog.entities.find((item) => item.id === subject.entityId);
  return {
    key: `entity:${subject.entityId}`,
    label: entity?.displayName ?? subject.entityId,
    detail: entity?.entityKind === "group" ? "기존 그룹" : "기존 외부 인물",
    subject,
  };
};

export function SingingClipReviewDialog({
  candidate,
  candidateKind = "singing_clip",
  reviewOnly = false,
  presentation = "dialog",
  active = true,
  onManageChannel,
  catalog,
  onOpenChange,
  onConverted,
  onReviewSaved,
  onReviewStateChanged,
}: {
  candidate: OtwPlayChannelMonitorCandidateDto | null;
  candidateKind?: "official_video" | "singing_clip";
  reviewOnly?: boolean;
  presentation?: "dialog" | "page";
  active?: boolean;
  onManageChannel?: () => void;
  catalog: OtwPlayAdminCatalogDto;
  onOpenChange: (open: boolean) => void;
  onConverted: (performanceId: string | null) => Promise<void>;
  onReviewSaved?: () => void;
  onReviewStateChanged: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const id = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pageRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (presentation !== "page" || !active || !pageRef.current || !footerRef.current || typeof ResizeObserver === "undefined") return;
    const page = pageRef.current, footer = footerRef.current;
    const reserveFooterSpace = () => page.style.setProperty("--review-footer-height", `${footer.getBoundingClientRect().height}px`);
    reserveFooterSpace();
    const observer = new ResizeObserver(reserveFooterSpace);
    observer.observe(footer);
    return () => observer.disconnect();
  }, [presentation, active]);
  useEffect(() => { if (presentation === "page" && active) headingRef.current?.focus(); }, [presentation, active]);
  const membersQuery = useQuery({
    queryKey: queryKeys.members.active(),
    queryFn: fetchActiveMembers,
    staleTime: 60_000,
    enabled: candidate !== null && active,
  });
  const [broadcast, setBroadcast] = useState(EMPTY_BROADCAST);
  const [songId, setSongId] = useState("__new");
  const [songTitle, setSongTitle] = useState("");
  const [songSearch, setSongSearch] = useState("");
  const [songTags, setSongTags] = useState<string[]>([]);
  const [performanceTags, setPerformanceTags] = useState<string[]>([]);
  const [originalArtists, setOriginalArtists] = useState<SelectedSubject[]>([]);
  const [participants, setParticipants] = useState<SelectedParticipant[]>([]);
  const [relationType, setRelationType] = useState<OtwPlayRelationType>("cover");
  const [participationType, setParticipationType] =
    useState<OtwPlayParticipationType>("solo");
  const [startSeconds, setStartSeconds] = useState("0");
  const [endSeconds, setEndSeconds] = useState("");
  const [segmentEnabled, setSegmentEnabled] = useState(false);
  const [internalNote, setInternalNote] = useState("");
  const [releaseType, setReleaseType] = useState<"official_video" | "official_mv">("official_video");
  const [previewSeconds, setPreviewSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const canDiscard = useUnsavedChanges(candidate !== null && dirty, presentation === "page" ? preservesPlayReview : undefined);
  const [reviewBaseline, setReviewBaseline] = useState<{
    version: number;
    status: OtwPlayChannelMonitorCandidateDto["status"];
    reviewInput: OtwPlayChannelMonitorCandidateDto["reviewInput"];
  } | null>(null);
  const draftExternalSubjects = [...originalArtists, ...participants].filter(
    (subject, index, subjects) =>
      subject.subject.kind === "new_external" &&
      subjects.findIndex((candidate) => candidate.key === subject.key) === index,
  );

  const initializedCandidate = useRef<string | null>(null);
  const ai = useAiReviewForm(candidate?.candidateId ?? "", {
    song: [songId, songTitle, originalArtists, songTags], participants,
    classification: [relationType, releaseType], participationType, performanceTags,
    segment: [startSeconds, endSeconds, segmentEnabled], broadcastDate: [broadcast.performedOn, broadcast.dateEvidence], originalUrl: broadcast.originalUrl, extent: broadcast.extent,
  }, (field, value) => {
    setDirty(true);
    switch(field) {
      case "song": { const v=value as AiReviewFields["song"]; setSongId(v.existingSongId ?? "__new"); setSongTitle(v.title); setOriginalArtists(v.existingSongId ? [] : v.originalArtists.map(aiPersonSelection)); setSongTags(v.existingSongId ? [] : v.tags); break; }
      case "participants": setParticipants((value as AiReviewFields["participants"]).map(p=>({...aiPersonSelection(p),participantRole:p.role}))); break;
      case "classification": {const v=value as AiReviewFields["classification"]; if(v.releaseType!=="broadcast"){setRelationType(v.relationType);setReleaseType(v.releaseType);} break;}
      case "participationType": setParticipationType(value as AiReviewFields["participationType"]); break;
      case "performanceTags": setPerformanceTags(value as string[]); break;
      case "segment": {const v=value as AiReviewFields["segment"];setStartSeconds(String(v.startSeconds));setEndSeconds(String(v.endSeconds));break;}
      case "broadcastDate": setBroadcast(old=>({...old,...value as AiReviewFields["broadcastDate"]})); break;
      case "originalUrl": setBroadcast(old=>({...old,originalUrl:value as string})); break;
      case "extent": setBroadcast(old=>({...old,extent:value as "full"|"partial"})); break;
    }
  }, (field,value)=>{
    switch(field){
      case "song": {const v=value as [string,string,SelectedSubject[],string[]];setSongId(v[0]);setSongTitle(v[1]);setOriginalArtists(v[2]);setSongTags(v[3]);break;}
      case "participants": setParticipants(value as SelectedParticipant[]);break;
      case "classification": {const v=value as [OtwPlayRelationType,typeof releaseType];setRelationType(v[0]);setReleaseType(v[1]);break;}
      case "participationType": setParticipationType(value as OtwPlayParticipationType);break;
      case "performanceTags":setPerformanceTags(value as string[]);break;
      case "segment": {const v=value as string[];setStartSeconds(v[0]);setEndSeconds(v[1]);break;}
      case "broadcastDate": {const v=value as [string|null,string|null];setBroadcast(old=>({...old,performedOn:v[0],dateEvidence:v[1]}));break;}
      case "originalUrl":setBroadcast(old=>({...old,originalUrl:value as string|null}));break;
      case "extent":setBroadcast(old=>({...old,extent:value as "full"|"partial"|null}));break;
    }
  }, candidate?.reviewInput ? AI_REVIEW_FIELDS : []);
  useEffect(() => {
    if (!candidate) {
      initializedCandidate.current = null;
      setReviewBaseline(null);
      return;
    }
    if (initializedCandidate.current === candidate.candidateId) return;
    initializedCandidate.current = candidate.candidateId;
    setDirty(false);
    setSaveMessage(null);
    const input = candidate.reviewInput;
    setBroadcast(input?.broadcast ?? EMPTY_BROADCAST);
    setReviewBaseline({
      version: candidate.candidateVersion,
      status: candidate.status,
      reviewInput: input,
    });
    setSongId(input?.song.kind === "existing" ? input.song.songId : "__new");
    setSongSearch("");
    setSongTitle(
      input?.song.kind === "create" ? input.song.title : candidate.title ?? "",
    );
    setSongTags(input?.song.kind === "existing" ? [] : [...(input?.song.tags ?? [])]);
    setPerformanceTags([...(input?.performanceTags ?? [])]);
    setOriginalArtists(
      input?.song.kind === "create"
        ? input.song.originalArtists.map((artist) =>
          selectedSubjectFromInput(artist.subject, catalog)
        )
        : [],
    );
    setParticipants(
      input?.participants.map((participant) => ({
        ...selectedSubjectFromInput(participant.subject, catalog),
        participantRole: participant.participantRole,
      })) ?? [],
    );
    setRelationType(input?.relationType ?? "cover");
    setReleaseType(input?.releaseType === "official_mv" ? "official_mv" : "official_video");
    setParticipationType(input?.participationType ?? "solo");
    setStartSeconds(String(input?.startSeconds ?? 0));
    setSegmentEnabled(Boolean(input?.startSeconds || input?.endSeconds !== null && input?.endSeconds !== undefined));
    setEndSeconds(
      input?.endSeconds === null || input?.endSeconds === undefined
        ? ""
        : String(input.endSeconds),
    );
    setInternalNote(input?.internalNote ?? "");
  }, [candidate, catalog]);

  const parsedStart = Number(startSeconds);
  const parsedEnd = endSeconds.trim() ? Number(endSeconds) : null;
  const durationSeconds = candidate?.durationSeconds ?? null;
  const selectedExistingSong = songId === "__new"
    ? null
    : catalog.songs.find((song) => song.id === songId) ?? null;
  const selectedExistingSongTags = selectedExistingSong?.tags ?? [];
  const segmentValid = Number.isSafeInteger(parsedStart) && parsedStart >= 0 &&
    (parsedEnd === null || (Number.isSafeInteger(parsedEnd) && parsedEnd > parsedStart)) &&
    (durationSeconds === null || parsedStart < durationSeconds) &&
    (durationSeconds === null || parsedEnd === null || parsedEnd <= durationSeconds);
  const songValid = songId !== "__new" ||
    (songTitle.trim().length > 0 && originalArtists.length > 0);
  const canSave = candidate !== null &&
    !["converted", "ignored"].includes(candidate.status) &&
    candidate.availabilityStatus === "playable" &&
    candidate.catalogChannelId !== null &&
    participants.length > 0 &&
    songValid &&
    segmentValid &&
    reviewBaseline !== null &&
    !saving;

  const updateParticipantSubjects = (subjects: SelectedSubject[]) => {
    setParticipants((current) => {
      const byKey = new Map(current.map((item) => [item.key, item]));
      return subjects.map((subject) => ({
        ...subject,
        participantRole: byKey.get(subject.key)?.participantRole ?? "vocal",
      }));
    });
  };

  const save = async () => {
    if (!candidate || !canSave || !reviewBaseline) return;
    setSaving(true);
    setSaveMessage("저장 중…");
    let reviewSaved = false;
    try {
      const reviewInput = {
        ...(candidateKind === "singing_clip" ? { broadcast } : {}),
        song: songId === "__new"
          ? {
              kind: "create" as const,
              title: songTitle.trim(),
              isOtwOriginal: candidateKind !== "singing_clip" && relationType === "original",
              originalReleaseDate: null,
              originalReleasePrecision: "unknown" as const,
              aliases: [],
              originalArtists: originalArtists.map((artist, creditOrder) => ({
                subject: artist.subject,
                creditOrder,
                isPrimary: creditOrder === 0,
              })),
              tags: songTags,
            }
          : { kind: "existing" as const, songId },
        participants: participants.map((participant, creditOrder) => ({
          subject: participant.subject,
          participantRole: participant.participantRole,
          creditOrder,
          creditNameSnapshot: participant.label,
        })),
        relationType: candidateKind === "singing_clip" ? "singing_clip" as const : relationType,
        releaseType: candidateKind === "singing_clip" ? "broadcast" as const : releaseType,
        participationType,
        ...(performanceTags.length > 0 ? { performanceTags } : {}),
        startSeconds: parsedStart,
        endSeconds: parsedEnd,
        internalNote: internalNote.trim() || null,
      };
      const reviewed = await updateOtwPlayImportCandidate(candidate.candidateId, {
        expectedVersion: reviewBaseline.version,
        expectedReviewInput: reviewBaseline.reviewInput,
        expectedReviewStatus: reviewBaseline.status,
        action: "save",
        input: reviewInput,
      });
      applyReviewCatalogChanges(queryClient, reviewed);
      reviewSaved = true;
      setReviewBaseline({
        version: reviewed.version,
        status: reviewed.status,
        reviewInput: reviewed.reviewInput,
      });
      // Ready saves materialize new songs and subjects before draft conversion.
      // Keep these canonical references even while the form stays mounted.
      if (reviewed.reviewInput) {
        const saved = reviewed.reviewInput;
        if (saved.song.kind === "existing") setSongId(saved.song.songId);
        setParticipants(saved.participants.map((participant, index) => ({
          ...selectedSubjectFromInput(participant.subject, catalog),
          label: participant.creditNameSnapshot ?? participants[index]?.label ??
            selectedSubjectFromInput(participant.subject, catalog).label,
          participantRole: participant.participantRole,
        })));
      }
      if (reviewOnly) { setDirty(false); setSaveMessage("검수 저장 완료"); await onReviewStateChanged(); onReviewSaved?.(); onOpenChange(false); return; }
      const converted = await convertOtwPlayImportCandidate(candidate.candidateId, {
        expectedVersion: reviewed.version,
      });
      if (converted.outcome !== "created" && converted.outcome !== "duplicate") {
        throw new Error(converted.errorCode ?? converted.outcome);
      }
      toast({
        variant: "success",
        description: converted.outcome === "created"
          ? "검수한 영상을 가창 임시 항목로 저장했습니다."
          : "이미 등록된 영상과 연결했습니다.",
      });
      setDirty(false);
      setSaveMessage("저장 완료 · 서버 결과 확인 중");
      onOpenChange(false);
      await onConverted(converted.performanceId);
    } catch {
      setSaveMessage("저장 실패 · 입력값과 최신 후보를 확인하고 다시 저장해 주세요.");
      if (reviewSaved) {
        await onReviewStateChanged().catch(() => undefined);
      }
      toast({
        variant: "error",
        description: "검수 영상을 임시 항목으로 저장하지 못했습니다. 최신 후보와 입력값을 확인해 주세요.",
      });
    } finally {
      setSaving(false);
    }
  };

  const Header = presentation === "page" ? "header" : DialogHeader;
  const Title = presentation === "page" ? "h2" : DialogTitle;
  const Description = presentation === "page" ? "p" : DialogDescription;
  const Footer = presentation === "page" ? "footer" : DialogFooter;
  const returnToList = () => { if (!saving) onOpenChange(false); };
  const content = (
    <>
        <Header className="space-y-2">
          {presentation === "page" && <Button variant="ghost" size="sm" disabled={saving} onClick={returnToList}><ArrowLeft /> 검수 목록으로</Button>}
          <Title ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">{candidateKind === "singing_clip" ? "노래 클립" : "공식 영상"} 검수</Title>
          <Description className="text-sm text-muted-foreground">
            {reviewOnly ? "영상과 곡·가창 정보를 확인한 뒤 검수를 저장하세요. 저장한 항목은 목록에서 일괄 임시 등록할 수 있습니다." : "승인 채널의 개별 영상을 곡과 가창자에 연결합니다. 저장 결과는 비공개 가창 임시 항목이며 자동 게시되지 않습니다."}
          </Description>
        </Header>
        {candidate && active && <ReviewPublicationPreview key={candidate.candidateId}
          videoId={candidate.videoId}
          title={selectedExistingSong?.title ?? songTitle}
          originalArtists={selectedExistingSong ? (selectedExistingSong.originalArtists ?? []).map(artist => artist.displayName) : originalArtists.map(artist => artist.label)}
          songTags={selectedExistingSong ? selectedExistingSongTags : songTags}
          participants={participants} relation={candidateKind === "singing_clip" ? "singing_clip" : relationType}
          releaseType={candidateKind === "singing_clip" ? "broadcast" : releaseType} participation={participationType}
          performanceTags={performanceTags} broadcast={broadcast} thumbnailUrl={candidate.thumbnailUrl}
          publishedAt={candidate.publishedAt} channelTitle={candidate.channelTitle}
          startSeconds={startSeconds} endSeconds={endSeconds} segmentValid={segmentValid} existingSong={selectedExistingSong !== null}
        />}
        {candidate ? (
          <div className={presentation === "page" ? "grid items-start gap-6 lg:grid-cols-[minmax(260px,0.7fr)_minmax(0,1.3fr)]" : "space-y-3"} onChangeCapture={() => setDirty(true)} onClickCapture={(event) => { const target = event.target as HTMLElement; if (!target.closest("aside") && target.closest("[role=combobox],button")) setDirty(true); }}>
            <aside className={presentation === "page" ? "space-y-3 lg:sticky lg:top-4" : "space-y-3"}>
            {presentation === "page" && active && <iframe
              className="aspect-video max-h-80 w-full rounded-lg border"
              src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(candidate.videoId)}?start=${previewSeconds}`}
              title={`검수 영상 · ${candidate.title ?? candidate.videoId}`}
              allow="encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
            />}
            <div className="flex flex-wrap gap-3 border-b pb-3">
              {presentation === "dialog" && candidate.thumbnailUrl ? (
                <img
                  className="h-24 w-40 shrink-0 rounded-lg object-cover"
                  src={candidate.thumbnailUrl}
                  alt=""
                />
              ) : null}
              <div className="min-w-0">
                <p className="font-semibold">{candidate.title ?? candidate.videoId}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {candidate.channelTitle ?? "승인 키리누키 채널"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="secondary">{candidate.status === "ready" ? "등록 준비 완료" : "검수 중"}</Badge>
                  <Badge variant="outline">{candidateKind === "singing_clip" ? "노래 클립" : "공식 영상"}</Badge>
                  <a
                    className="text-sm text-primary underline"
                    href={`https://www.youtube.com/watch?v=${encodeURIComponent(candidate.videoId)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    영상 확인 <ExternalLink className="inline size-3" />
                  </a>
                </div>
              </div>
            </div>

            {candidate.catalogChannelId === null && <p role="status" className="text-sm text-destructive">업로드 채널 승인이 필요합니다. 채널 설정을 확인한 뒤 검수를 저장하세요.</p>}
            {candidate.availabilityStatus !== "playable" && <p role="status" className="text-sm text-destructive">현재 재생 가능 여부를 확인해야 저장할 수 있습니다.</p>}
            {onManageChannel && <Button variant="outline" disabled={saving} onClick={onManageChannel}>채널 승인·수집 설정</Button>}
            <AiReviewPanel segmentEnabled={segmentEnabled} key={`${candidate.candidateId}:${candidateKind}`} target={{candidateId:candidate.candidateId}} videoId={candidate.videoId} candidateKind={candidateKind} durationSeconds={durationSeconds} initialRange={parsedEnd!==null?{startSeconds:parsedStart,endSeconds:parsedEnd}:null} form={ai} disabled={saving || !active || ["converted","ignored"].includes(candidate.status)} onSeek={presentation==="page"?setPreviewSeconds:undefined} />
            </aside>
            <fieldset disabled={saving} className="min-w-0 space-y-6">
            <section className="grid gap-3 sm:grid-cols-2">
              <h3 className="text-base font-semibold sm:col-span-2">1. 곡 연결·원곡 정보</h3>
              <div role="group" aria-label="곡 연결" className="min-w-0 space-y-3 rounded-lg border bg-muted/10 p-3 sm:col-span-2">
                <div className="space-y-1.5">
                  <Label>연결할 곡</Label>
                  <Select value={songId} onValueChange={(value) => { ai.touch("song"); setSongId(value); }}>
                    <SelectTrigger className="w-full" aria-label="연결할 곡"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__new">새 곡 만들기</SelectItem>
                      {catalog.songs.filter((song) => song.archivedAt === null).map((song) => (
                        <SelectItem key={song.id} value={song.id}>{song.title}{song.originalArtists?.length ? ` · ${song.originalArtists.map(artist => artist.displayName).join(", ")}` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <SongConnectionPicker
                  inputKey={`${id}-review`} catalog={catalog} selectedSongId={songId}
                  query={songSearch} onQueryChange={setSongSearch}
                  onSelectExisting={(value) => { ai.touch("song"); setSongId(value); setDirty(true); }}
                />
              </div>
              {songId === "__new" ? (
                <>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor={`${id}-clip-song-title`}>곡명</Label>
                    <Input
                      id={`${id}-clip-song-title`}
                      value={songTitle}
                      onChange={(event) => { ai.touch("song"); setSongTitle(event.target.value); }}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <SubjectPicker
                      label="원곡 가수"
                      members={membersQuery.data ?? []}
                      entities={catalog.entities}
                      draftSubjects={draftExternalSubjects}
                      selected={originalArtists}
                      onChange={(value) => { ai.touch("song"); setOriginalArtists(value); }}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <SongTagPicker
                      key={candidate.candidateId}
                      tags={songTags}
                      onChange={(value) => { ai.touch("song"); setSongTags(value); }}
                      label="장르(분류)"
                      inputId={`${id}-clip-song-tags`}
                      placeholder="장르 또는 분류 입력"
                      selectedLabel="선택한 장르(분류)"
                      description="카탈로그 검색·필터에 사용할 라벨입니다. 최대 10개까지 추가하거나 삭제할 수 있습니다."
                    />
                  </div>
                </>
              ) : (
                <div className="sm:col-span-2">
                  <Label>장르(분류)</Label>
                  <div className="mt-2 flex flex-wrap gap-1.5" aria-label="기존 곡 장르(분류)">
                    {selectedExistingSongTags.length > 0
                      ? selectedExistingSongTags.map((tag) => (
                          <Badge key={tag} variant="secondary">{tag}</Badge>
                        ))
                      : <span className="text-sm text-muted-foreground">등록된 라벨 없음</span>}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    기존 곡 장르(분류) 변경은 카탈로그의 곡 편집에서 관리합니다.
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>곡 관계</Label>
                {candidateKind === "singing_clip" ? <p className="text-sm font-medium">노래 클립</p> : <Select value={relationType} onValueChange={(value) => { ai.touch("classification"); setRelationType(value as OtwPlayRelationType); }}>
                  <SelectTrigger aria-label="곡 관계"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cover">커버</SelectItem>
                    <SelectItem value="original">오리지널</SelectItem>
                  </SelectContent>
                </Select>}
              </div>
              {candidateKind === "official_video" && <label>공개 형태<SelectField aria-label="공개 형태" value={releaseType} onValueChange={value=>{ai.touch("classification");setReleaseType(value as typeof releaseType);}} options={[{ value: "official_video", label: "공식 영상" }, { value: "official_mv", label: "공식 MV" }]} /></label>}
            </section>

            <section className="space-y-3 border-t pt-4">
              <h3 className="text-base font-semibold">2. 가창자·참여 형태</h3>
              <div className="space-y-1.5">
                <Label>참여 형태</Label>
                <Select value={participationType} onValueChange={(value) => { ai.touch("participationType"); setParticipationType(value as OtwPlayParticipationType); }}>
                  <SelectTrigger aria-label="참여 형태"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="solo">솔로</SelectItem>
                    <SelectItem value="duet">듀엣</SelectItem>
                    <SelectItem value="unit">유닛</SelectItem>
                    <SelectItem value="group">그룹</SelectItem>
                    <SelectItem value="external_collab">외부 협업</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <SubjectPicker
                label="가창 참여자"
                members={membersQuery.data ?? []}
                entities={catalog.entities}
                draftSubjects={draftExternalSubjects}
                selected={participants}
                onChange={(value) => { ai.touch("participants"); updateParticipantSubjects(value); }}
              />
              {participants.map((participant) => (
                <div key={participant.key} className="flex items-center gap-3 rounded-lg border p-3">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{participant.label}</span>
                  <Select
                    value={participant.participantRole}
                    onValueChange={(value) => { ai.touch("participants"); setParticipants((current) => current.map((item) =>
                      item.key === participant.key
                        ? { ...item, participantRole: value as OtwPlayParticipantRole }
                        : item
                    )); }}
                  >
                    <SelectTrigger className="w-36" aria-label={`${participant.label} 역할`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vocal">메인 보컬</SelectItem>
                      <SelectItem value="featured_vocal">피처링 보컬</SelectItem>
                      <SelectItem value="chorus">코러스</SelectItem>
                      <SelectItem value="other">기타</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </section>

            <section className="grid gap-3 border-t pt-4 sm:grid-cols-2">
              <h3 className="text-base font-semibold sm:col-span-2">{candidateKind === "singing_clip" ? "3. 방송 출처·가창 구간" : "3. 영상 재생 구간"}</h3>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="flex items-center gap-2"><Checkbox checked={segmentEnabled} onCheckedChange={checked => { setSegmentEnabled(checked === true); if (!checked) { ai.touch("segment"); setStartSeconds("0"); setEndSeconds(""); } setDirty(true); }} />구간 선택</Label>
                <p className="text-xs text-muted-foreground">전체 영상은 선택하지 않아도 돼요. 선택한 경우에만 AI의 시작·종료 위치를 반영합니다.</p>
              </div>
            {candidateKind === "singing_clip" && <div className="sm:col-span-2"><BroadcastFields flat value={broadcast} onChange={value => { if (value.performedOn !== broadcast.performedOn || value.dateEvidence !== broadcast.dateEvidence) ai.touch("broadcastDate"); if(value.originalUrl !== broadcast.originalUrl) ai.touch("originalUrl"); if(value.extent !== broadcast.extent) ai.touch("extent"); setBroadcast(value); setDirty(true); }} /></div>}
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-clip-start-seconds`}>시작 위치(초)</Label>
                <Input id={`${id}-clip-start-seconds`} type="number" min={0} value={startSeconds} onChange={(event) => { ai.touch("segment"); setSegmentEnabled(true); setStartSeconds(event.target.value); }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-clip-end-seconds`}>종료 위치(초)</Label>
                <Input id={`${id}-clip-end-seconds`} type="number" min={0} value={endSeconds} onChange={(event) => { ai.touch("segment"); setSegmentEnabled(true); setEndSeconds(event.target.value); }} placeholder="전체 영상이면 비워두기" />
              </div>
            </section>
            <section className="space-y-3 border-t pt-4">
              <h3 className="text-base font-semibold">4. 추가 분류·검수 메모</h3>
              <div className="sm:col-span-2">
                <SongTagPicker
                  tags={performanceTags}
                  onChange={(value) => { ai.touch("performanceTags"); setPerformanceTags(value); }}
                  label={candidateKind === "singing_clip" ? "클립 라벨" : "영상 라벨"}
                  inputId={`${id}-clip-performance-tags`}
                  placeholder="이 영상만의 라벨 입력"
                  selectedLabel="선택한 영상 라벨"
                  description="이 가창 영상·구간에만 적용되며 곡 장르·분류와 별도로 저장됩니다."
                  recommendedTags={[]}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-clip-internal-note`}>검수 메모</Label>
                <Textarea id={`${id}-clip-internal-note`} value={internalNote} onChange={(event) => setInternalNote(event.target.value)} placeholder="원본 방송, 방송일 또는 확인 근거가 있으면 기록" />
              </div>
            </section>
            </fieldset>
          </div>
        ) : null}
        {saveMessage && <p role="status" className="text-sm">{saveMessage}</p>}
        {presentation === "page" && candidate && !saving && (!songValid || participants.length === 0 || !segmentValid) && <p role="status" className="text-sm text-muted-foreground">
          저장 전 확인: {[!songValid ? "곡명·원곡 가수 또는 기존 곡 선택" : null, participants.length === 0 ? "가창 참여자 선택" : null, !segmentValid ? "영상 길이 안의 시작·종료 위치" : null].filter(Boolean).join(" · ")}
        </p>}
        <div ref={footerRef} className={presentation === "page" ? "otw-play-review-footer" : "sticky bottom-0 z-10"}>
        <Footer className="flex flex-wrap items-center justify-end gap-2 border-t bg-background py-3">
          {presentation === "page" && <p className="mr-auto text-xs text-muted-foreground">{dirty ? "작성 중인 내용은 목록으로 돌아가도 유지됩니다." : "공개는 카탈로그에서 별도로 진행합니다."}</p>}
          <Button variant="outline" disabled={saving} onClick={async () => { if (presentation === "page" || await canDiscard()) onOpenChange(false); }}>{presentation === "page" ? "목록으로" : "취소"}</Button>
          <Button disabled={!canSave} onClick={() => void save()}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            {reviewOnly ? "검수 저장 · 등록 준비 완료" : "검수 완료 후 임시 등록"}
          </Button>
        </Footer>
        </div>
    </>
  );
  if (presentation === "page") return <section ref={pageRef} aria-label={`${candidateKind === "singing_clip" ? "노래 클립" : "공식 영상"} 검수 화면`} className="otw-play-review-page space-y-5">{content}</section>;
  return <Dialog open={candidate !== null} onOpenChange={async (next) => { if (next || (!saving && await canDiscard())) onOpenChange(next); }}>
    <DialogContent onEscapeKeyDown={(event) => {
      if (event.target instanceof HTMLElement && event.target.matches('[role="combobox"][aria-expanded="true"]')) event.preventDefault();
    }} className="max-h-[90vh] max-w-4xl overflow-y-auto">{content}</DialogContent>
  </Dialog>;
}
