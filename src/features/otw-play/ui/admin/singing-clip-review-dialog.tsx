import { useEffect, useState } from "react";
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
import { ExternalLink, Loader2 } from "lucide-react";
import {
  convertOtwPlayImportCandidate,
  updateOtwPlayImportCandidate,
} from "../../api/admin";
import { SubjectPicker, type SelectedSubject } from "./catalog-entry-dialog";

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
  catalog,
  onOpenChange,
  onConverted,
  onReviewStateChanged,
}: {
  candidate: OtwPlayChannelMonitorCandidateDto | null;
  catalog: OtwPlayAdminCatalogDto;
  onOpenChange: (open: boolean) => void;
  onConverted: (performanceId: string | null) => Promise<void>;
  onReviewStateChanged: () => Promise<void>;
}) {
  const { toast } = useToast();
  const membersQuery = useQuery({
    queryKey: queryKeys.members.active(),
    queryFn: fetchActiveMembers,
    staleTime: 60_000,
    enabled: candidate !== null,
  });
  const [songId, setSongId] = useState("__new");
  const [songTitle, setSongTitle] = useState("");
  const [originalArtists, setOriginalArtists] = useState<SelectedSubject[]>([]);
  const [participants, setParticipants] = useState<SelectedParticipant[]>([]);
  const [relationType, setRelationType] = useState<OtwPlayRelationType>("cover");
  const [participationType, setParticipationType] =
    useState<OtwPlayParticipationType>("solo");
  const [startSeconds, setStartSeconds] = useState("0");
  const [endSeconds, setEndSeconds] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [reviewBaseline, setReviewBaseline] = useState<{
    version: number;
    status: OtwPlayChannelMonitorCandidateDto["status"];
    reviewInput: OtwPlayChannelMonitorCandidateDto["reviewInput"];
  } | null>(null);

  useEffect(() => {
    if (!candidate) {
      setReviewBaseline(null);
      return;
    }
    const input = candidate.reviewInput;
    setReviewBaseline({
      version: candidate.candidateVersion,
      status: candidate.status,
      reviewInput: input,
    });
    setSongId(input?.song.kind === "existing" ? input.song.songId : "__new");
    setSongTitle(
      input?.song.kind === "create" ? input.song.title : candidate.title ?? "",
    );
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
    setParticipationType(input?.participationType ?? "solo");
    setStartSeconds(String(input?.startSeconds ?? 0));
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
  const segmentValid = Number.isSafeInteger(parsedStart) && parsedStart >= 0 &&
    (parsedEnd === null || (Number.isSafeInteger(parsedEnd) && parsedEnd > parsedStart)) &&
    (durationSeconds === null || parsedStart < durationSeconds) &&
    (durationSeconds === null || parsedEnd === null || parsedEnd <= durationSeconds);
  const songValid = songId !== "__new" ||
    (songTitle.trim().length > 0 && originalArtists.length > 0);
  const canSave = candidate !== null &&
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
    let reviewSaved = false;
    try {
      const reviewInput = {
        song: songId === "__new"
          ? {
              kind: "create" as const,
              title: songTitle.trim(),
              isOtwOriginal: relationType === "original",
              originalReleaseDate: null,
              originalReleasePrecision: "unknown" as const,
              aliases: [],
              originalArtists: originalArtists.map((artist, creditOrder) => ({
                subject: artist.subject,
                creditOrder,
                isPrimary: creditOrder === 0,
              })),
              tags: [],
            }
          : { kind: "existing" as const, songId },
        participants: participants.map((participant, creditOrder) => ({
          subject: participant.subject,
          participantRole: participant.participantRole,
          creditOrder,
          creditNameSnapshot: participant.label,
        })),
        relationType,
        releaseType: "broadcast" as const,
        participationType,
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
      reviewSaved = true;
      setReviewBaseline({
        version: reviewed.version,
        status: reviewed.status,
        reviewInput: reviewed.reviewInput,
      });
      const converted = await convertOtwPlayImportCandidate(candidate.candidateId, {
        expectedVersion: reviewed.version,
      });
      if (converted.outcome !== "created" && converted.outcome !== "duplicate") {
        throw new Error(converted.errorCode ?? converted.outcome);
      }
      toast({
        variant: "success",
        description: converted.outcome === "created"
          ? "검수한 영상을 방송 가창 draft로 저장했습니다."
          : "이미 등록된 영상과 연결했습니다.",
      });
      onOpenChange(false);
      await onConverted(converted.performanceId);
    } catch {
      if (reviewSaved) {
        await onReviewStateChanged().catch(() => undefined);
      }
      toast({
        variant: "error",
        description: "검수 영상을 draft로 저장하지 못했습니다. 최신 후보와 입력값을 확인해 주세요.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={candidate !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>노래 클립 검수 · draft 생성</DialogTitle>
          <DialogDescription>
            승인 채널의 개별 영상을 곡과 가창자에 연결합니다. 저장 결과는 비공개
            방송 가창 draft이며 자동 게시되지 않습니다.
          </DialogDescription>
        </DialogHeader>
        {candidate ? (
          <div className="space-y-6">
            <div className="flex gap-4 rounded-xl border bg-muted/20 p-4">
              {candidate.thumbnailUrl ? (
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
                  <Badge variant="secondary">방송 가창 draft</Badge>
                  <Badge variant="outline">키리누키 source</Badge>
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

            <section className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>연결할 곡</Label>
                <Select value={songId} onValueChange={setSongId}>
                  <SelectTrigger aria-label="연결할 곡"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__new">새 곡 만들기</SelectItem>
                    {catalog.songs.filter((song) => song.archivedAt === null).map((song) => (
                      <SelectItem key={song.id} value={song.id}>{song.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {songId === "__new" ? (
                <>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="clip-song-title">곡명</Label>
                    <Input
                      id="clip-song-title"
                      value={songTitle}
                      onChange={(event) => setSongTitle(event.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <SubjectPicker
                      label="원곡 가수"
                      members={membersQuery.data ?? []}
                      entities={catalog.entities}
                      selected={originalArtists}
                      onChange={setOriginalArtists}
                    />
                  </div>
                </>
              ) : null}
              <div className="space-y-1.5">
                <Label>곡 관계</Label>
                <Select value={relationType} onValueChange={(value) => setRelationType(value as OtwPlayRelationType)}>
                  <SelectTrigger aria-label="곡 관계"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cover">커버</SelectItem>
                    <SelectItem value="original">오리지널</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>참여 형태</Label>
                <Select value={participationType} onValueChange={(value) => setParticipationType(value as OtwPlayParticipationType)}>
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
            </section>

            <section className="space-y-3">
              <SubjectPicker
                label="가창 참여자"
                members={membersQuery.data ?? []}
                entities={catalog.entities}
                selected={participants}
                onChange={updateParticipantSubjects}
              />
              {participants.map((participant) => (
                <div key={participant.key} className="flex items-center gap-3 rounded-lg border p-3">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{participant.label}</span>
                  <Select
                    value={participant.participantRole}
                    onValueChange={(value) => setParticipants((current) => current.map((item) =>
                      item.key === participant.key
                        ? { ...item, participantRole: value as OtwPlayParticipantRole }
                        : item
                    ))}
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

            <section className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="clip-start-seconds">시작 위치(초)</Label>
                <Input id="clip-start-seconds" type="number" min={0} value={startSeconds} onChange={(event) => setStartSeconds(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="clip-end-seconds">종료 위치(초)</Label>
                <Input id="clip-end-seconds" type="number" min={0} value={endSeconds} onChange={(event) => setEndSeconds(event.target.value)} placeholder="전체 영상이면 비워두기" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="clip-internal-note">검수 메모</Label>
                <Textarea id="clip-internal-note" value={internalNote} onChange={(event) => setInternalNote(event.target.value)} placeholder="원본 방송, 방송일 또는 확인 근거가 있으면 기록" />
              </div>
            </section>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button disabled={!canSave} onClick={() => void save()}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            검수 완료 후 draft 생성
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
