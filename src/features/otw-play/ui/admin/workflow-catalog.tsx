import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  OtwPlayAdminCatalogDto,
  OtwPlayAdminPerformanceDto,
  OtwPlayAdminSongDto,
  OtwPlayParticipantRole,
  OtwPlayParticipationType,
  OtwPlayQualityStatus,
  OtwPlayRelationType,
  OtwPlayReleaseType,
} from "@contracts/otw-play";
import { ConfirmActionDialog } from "@/app/admin";
import { fetchActiveMembers, type Member } from "@/features/members";
import { queryKeys } from "@/shared/query/query-keys";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { Textarea } from "@/shared/ui/textarea";
import { ChevronDown, ChevronRight, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  deleteOtwPlayPerformance,
  deleteOtwPlaySong,
  publishOtwPlayPerformance,
  recheckOtwPlaySource,
  updateOtwPlayPerformance,
  updateOtwPlaySong,
  withdrawOtwPlayPerformance,
} from "../../api/admin";
import {
  SongTagPicker,
  SubjectPicker,
  type SelectedSubject,
} from "./catalog-entry-dialog";

type Run = (label: string, task: () => Promise<unknown>) => Promise<boolean>;
const EMPTY_MEMBERS: Member[] = [];

const relationLabel = (value: string) => (value === "original" ? "오리지널" : "공식 커버");
const publicationLabel = (value: string) =>
  value === "published" ? "게시됨" : value === "withdrawn" ? "철회됨" : "임시 저장";
const releaseLabel = (value: string) => (value === "official_mv" ? "공식 MV" : "공식 영상");
const participationLabel = (value: string) =>
  ({ solo: "솔로", duet: "듀엣", unit: "유닛", group: "그룹", external_collab: "외부 협업" })[value] ?? value;

export function WorkflowCatalog({
  catalog,
  saving,
  run,
  onAddPerformance,
}: {
  catalog: OtwPlayAdminCatalogDto;
  saving: string | null;
  run: Run;
  onAddPerformance: (songId: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editSong, setEditSong] = useState<OtwPlayAdminSongDto | null>(null);
  const [editPerformance, setEditPerformance] = useState<OtwPlayAdminPerformanceDto | null>(null);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    destructive?: boolean;
    confirmLabel?: string;
    action: () => Promise<void>;
  } | null>(null);
  const activeSongs = catalog.songs.filter((song) => song.archivedAt === null);

  const performanceActions = (performance: OtwPlayAdminPerformanceDto) => (
    <div className="flex flex-wrap justify-end gap-1">
      <Button size="sm" variant="ghost" onClick={() => setEditPerformance(performance)} disabled={performance.publicationStatus === "withdrawn"}>
        <Pencil className="h-3.5 w-3.5" /> 수정
      </Button>
      {performance.sources[0] && (
        <Button
          size="sm"
          variant="ghost"
          disabled={saving !== null}
          onClick={() => {
            const source = performance.sources[0]!;
            void run("source 재확인", () =>
              recheckOtwPlaySource(source.source.id, {
                expectedVersion: source.source.version,
                youtubeUrl: `https://www.youtube.com/watch?v=${source.source.externalId}`,
                channelId: source.source.channelId,
              }),
            );
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" /> source 재확인
        </Button>
      )}
      {performance.publicationStatus === "draft" && (
        <Button size="sm" disabled={saving !== null} onClick={() => setConfirmation({
          title: "가창을 게시할까요?",
          description: "승인된 공식 채널과 metadata를 다시 확인한 뒤 공개 상태로 전환합니다.",
          action: async () => { await run("가창 게시", () => publishOtwPlayPerformance(performance.id, { expectedVersion: performance.version })); },
        })}>게시</Button>
      )}
      {(performance.publicationStatus === "draft" || performance.publicationStatus === "withdrawn") && (
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          disabled={saving !== null}
          onClick={() => setConfirmation({
            title: performance.publicationStatus === "withdrawn" ? "철회된 가창을 삭제할까요?" : "임시 저장 가창을 삭제할까요?",
            description: performance.publicationStatus === "withdrawn"
              ? "철회 이력과 이 가창의 연결 정보가 영구 삭제됩니다. 이 작업은 되돌릴 수 없습니다."
              : "이 가창과 연결 정보가 영구 삭제됩니다. 게시 이력은 없으며 이 작업은 되돌릴 수 없습니다.",
            destructive: true,
            confirmLabel: "삭제",
            action: async () => { await run("가창 삭제", () => deleteOtwPlayPerformance(performance.id, { expectedVersion: performance.version })); },
          })}
        >
          <Trash2 className="h-3.5 w-3.5" /> 삭제
        </Button>
      )}
      {performance.publicationStatus === "published" && (
        <Button size="sm" variant="destructive" disabled={saving !== null} onClick={() => setConfirmation({
          title: "가창을 철회할까요?",
          description: "공개 카탈로그에서 내려가며 기존 metadata와 event 이력은 보존됩니다.",
          destructive: true,
          action: async () => { await run("가창 철회", () => withdrawOtwPlayPerformance(performance.id, { expectedVersion: performance.version })); },
        })}>철회</Button>
      )}
    </div>
  );

  const songDeleteAction = (
    song: OtwPlayAdminSongDto,
    performances: OtwPlayAdminPerformanceDto[],
  ) => {
    const canDelete = performances.every(
      (performance) => performance.publicationStatus !== "published",
    );
    const withdrawnCount = performances.filter(
      (performance) => performance.publicationStatus === "withdrawn",
    ).length;
    return (
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        disabled={saving !== null || !canDelete}
        title={
          canDelete
            ? undefined
            : "현재 게시 중인 가창이 있는 곡은 삭제할 수 없습니다."
        }
        onClick={() => setConfirmation({
          title: "곡을 삭제할까요?",
          description: performances.length > 0
            ? `곡 정보와 가창 ${performances.length}개${withdrawnCount > 0 ? ` (철회 ${withdrawnCount}개 포함)` : ""}를 영구 삭제합니다. 이 작업은 되돌릴 수 없습니다.`
            : "곡 정보를 영구 삭제합니다. 이 작업은 되돌릴 수 없습니다.",
          destructive: true,
          confirmLabel: "삭제",
          action: async () => { await run("곡 삭제", () => deleteOtwPlaySong(song.id, { expectedVersion: song.version })); },
        })}
      >
        <Trash2 className="h-3.5 w-3.5" /> 곡 삭제
      </Button>
    );
  };

  return (
    <>
      {activeSongs.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          등록된 곡이 없습니다. 새 영상 등록에서 첫 곡과 가창을 함께 만드세요.
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border md:block">
            <Table className="min-w-[900px]">
              <TableHeader><TableRow><TableHead className="w-10" /><TableHead>곡</TableHead><TableHead>원곡 가수</TableHead><TableHead>가창</TableHead><TableHead>분류</TableHead><TableHead className="text-right">작업</TableHead></TableRow></TableHeader>
              <TableBody>
                {activeSongs.flatMap((song) => {
                  const performances = catalog.performances.filter((item) => item.songId === song.id);
                  const open = expanded.has(song.id);
                  const rows = [
                    <TableRow key={song.id} className="bg-muted/20">
                      <TableCell><Button size="icon-sm" variant="ghost" aria-label={`${song.title} 가창 펼치기`} onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(song.id)) next.delete(song.id); else next.add(song.id); return next; })}>{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</Button></TableCell>
                      <TableCell><div className="font-semibold">{song.title}</div><Badge variant="outline" className="mt-1">{song.isOtwOriginal ? "오리지널" : "커버 원곡"}</Badge></TableCell>
                      <TableCell>{song.originalArtists.map((artist) => artist.displayName).join(", ")}</TableCell>
                      <TableCell>{performances.length}개</TableCell>
                      <TableCell><div className="flex flex-wrap gap-1">{(song.tags?.length ?? 0) > 0 ? song.tags.map((tag) => <Badge key={tag}>{tag}</Badge>) : <span className="text-muted-foreground">미분류</span>}</div></TableCell>
                      <TableCell><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => setEditSong(song)}><Pencil className="h-3.5 w-3.5" /> 곡 정보 수정</Button><Button size="sm" variant="outline" onClick={() => onAddPerformance(song.id)}><Plus className="h-3.5 w-3.5" /> 다른 가창 추가</Button>{songDeleteAction(song, performances)}</div></TableCell>
                    </TableRow>,
                  ];
                  if (open) rows.push(...performances.map((performance) => {
                    const source = performance.sources[0]?.source;
                    const channel = catalog.channels.find((item) => item.id === source?.channelId);
                    return <TableRow key={performance.id}><TableCell /><TableCell><div className="pl-5 text-sm font-medium">{performance.participants.map((item) => item.displayName).join(", ") || "참여자 미입력"}</div><div className="pl-5 text-xs text-muted-foreground">{source?.title ?? "source 없음"}</div></TableCell><TableCell>{channel?.displayName ?? "채널 없음"}</TableCell><TableCell><Badge variant={performance.publicationStatus === "published" ? "secondary" : performance.publicationStatus === "withdrawn" ? "destructive" : "outline"}>{publicationLabel(performance.publicationStatus)}</Badge></TableCell><TableCell>{relationLabel(performance.relationType)} · {releaseLabel(performance.releaseType)} · {participationLabel(performance.participationType)}</TableCell><TableCell>{performanceActions(performance)}</TableCell></TableRow>;
                  }));
                  return rows;
                })}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 md:hidden">
            {activeSongs.map((song) => {
              const performances = catalog.performances.filter((item) => item.songId === song.id);
              return <Card key={song.id}><CardContent className="space-y-3 p-4"><div className="flex items-start justify-between gap-2"><div><div className="font-semibold">{song.title}</div><div className="text-sm text-muted-foreground">{song.originalArtists.map((artist) => artist.displayName).join(", ")}</div></div><Badge variant="outline">{performances.length} 가창</Badge></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => onAddPerformance(song.id)}><Plus className="h-3.5 w-3.5" /> 가창 추가</Button><Button size="sm" variant="ghost" onClick={() => setEditSong(song)}>곡 수정</Button>{songDeleteAction(song, performances)}</div><div className="space-y-2">{performances.map((performance) => { const source = performance.sources[0]?.source; const channel = catalog.channels.find((item) => item.id === source?.channelId); return <div key={performance.id} className="rounded-lg border bg-muted/20 p-3"><div className="flex items-center justify-between gap-2"><div className="font-medium">{performance.participants.map((item) => item.displayName).join(", ") || "참여자 미입력"}</div><Badge variant="outline">{publicationLabel(performance.publicationStatus)}</Badge></div><div className="mt-1 text-xs text-muted-foreground">{relationLabel(performance.relationType)} · {releaseLabel(performance.releaseType)} · {participationLabel(performance.participationType)}</div><div className="mt-1 text-xs text-muted-foreground">{channel?.displayName ?? "채널 없음"} · {source?.title ?? "source 없음"}</div><div className="mt-2">{performanceActions(performance)}</div></div>; })}</div></CardContent></Card>;
            })}
          </div>
        </>
      )}
      <SongEditDialog catalog={catalog} song={editSong} onOpenChange={(open) => !open && setEditSong(null)} run={run} />
      <PerformanceEditDialog catalog={catalog} performance={editPerformance} onOpenChange={(open) => !open && setEditPerformance(null)} run={run} />
      <ConfirmActionDialog open={confirmation !== null} onOpenChange={(open) => !open && setConfirmation(null)} title={confirmation?.title ?? "확인"} description={confirmation?.description ?? ""} destructive={confirmation?.destructive} confirmLabel={confirmation?.confirmLabel ?? "계속"} onConfirm={() => { const action = confirmation?.action; setConfirmation(null); if (action) void action(); }} />
    </>
  );
}

function SongEditDialog({ catalog, song, onOpenChange, run }: { catalog: OtwPlayAdminCatalogDto; song: OtwPlayAdminSongDto | null; onOpenChange: (open: boolean) => void; run: Run }) {
  const [title, setTitle] = useState("");
  const [original, setOriginal] = useState(false);
  const [artists, setArtists] = useState<SelectedSubject[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const membersQuery = useQuery({
    queryKey: queryKeys.members.active(),
    queryFn: fetchActiveMembers,
    staleTime: 60_000,
    enabled: song !== null,
  });
  const members = membersQuery.data ?? EMPTY_MEMBERS;
  useEffect(() => {
    if (!song) return;
    setTitle(song.title);
    setOriginal(song.isOtwOriginal);
    setTags(song.tags ?? []);
    setArtists(song.originalArtists.map((artist) => {
      const entity = catalog.entities.find((item) => item.id === artist.entityId);
      const memberUid = entity?.memberUid ?? null;
      return {
        key: memberUid !== null ? `member:${memberUid}` : `entity:${artist.entityId}`,
        label: artist.displayName,
        detail: memberUid !== null
          ? "현재 멤버"
          : entity?.entityKind === "group"
            ? "기존 그룹"
            : entity?.entityKind === "organization"
              ? "기존 단체"
              : "기존 외부 인물",
        subject: memberUid !== null
          ? { kind: "member" as const, memberUid }
          : { kind: "entity" as const, entityId: artist.entityId },
      };
    }));
  }, [catalog.entities, song]);
  useEffect(() => {
    if (!membersQuery.data) return;
    const membersByUid = new Map(
      membersQuery.data.map((member) => [member.uid, member]),
    );
    setArtists((current) => current.map((artist) => {
      if (artist.subject.kind !== "member") return artist;
      const member = membersByUid.get(artist.subject.memberUid);
      return member
        ? {
            ...artist,
            label: member.name,
            detail: [member.oshi_mark, member.unit_name]
              .filter(Boolean)
              .join(" · "),
          }
        : artist;
    }));
  }, [membersQuery.data]);
  const open = song !== null;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>곡 정보 수정</DialogTitle></DialogHeader>{song && <div className="space-y-5"><div className="space-y-1.5"><Label htmlFor="edit-song-title">곡명</Label><Input id="edit-song-title" value={title} onChange={(event) => setTitle(event.target.value)} /></div><SongTagPicker tags={tags} onChange={setTags} /><SubjectPicker label="원곡 가수" placeholder="멤버 또는 기존 원곡 가수 검색" helpText="기존 identity를 선택하거나 새 외부 인물·그룹을 칩으로 추가할 수 있습니다. 첫 번째 가수를 대표 원곡 가수로 저장합니다." members={members} entities={catalog.entities} selected={artists} onChange={setArtists} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={original} onChange={(event) => setOriginal(event.target.checked)} /> OTW 오리지널곡</label></div>}<DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button><Button disabled={!title.trim() || artists.length === 0} onClick={() => { if (!song) return; void run("곡 정보 수정", () => updateOtwPlaySong({ id: song.id, expectedVersion: song.version, slug: song.slug, title: title.trim(), isOtwOriginal: original, originalReleaseDate: song.originalReleaseDate, originalReleasePrecision: song.originalReleasePrecision, aliases: song.aliases.map((alias) => ({ alias: alias.alias, locale: alias.locale, aliasKind: alias.aliasKind })), originalArtists: artists.map((artist, index) => ({ subject: artist.subject, creditOrder: index, isPrimary: index === 0 })), tags })).then((ok) => ok && onOpenChange(false)); }}>저장</Button></DialogFooter></DialogContent></Dialog>;
}

type EditableParticipant = SelectedSubject & {
  participantRole: OtwPlayParticipantRole;
  creditNameSnapshot: string;
};

const toDateTimeLocal = (value: number | null) => {
  if (value === null) return "";
  const date = new Date(value);
  const local = new Date(value - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

function PerformanceEditDialog({
  catalog,
  performance,
  onOpenChange,
  run,
}: {
  catalog: OtwPlayAdminCatalogDto;
  performance: OtwPlayAdminPerformanceDto | null;
  onOpenChange: (open: boolean) => void;
  run: Run;
}) {
  const [songId, setSongId] = useState("");
  const [relation, setRelation] = useState<OtwPlayRelationType>("cover");
  const [releaseType, setReleaseType] =
    useState<OtwPlayReleaseType>("official_video");
  const [participation, setParticipation] =
    useState<OtwPlayParticipationType>("solo");
  const [quality, setQuality] = useState<OtwPlayQualityStatus>("ok");
  const [releasedAt, setReleasedAt] = useState("");
  const [participants, setParticipants] = useState<EditableParticipant[]>([]);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [channelId, setChannelId] = useState("");
  const [startSeconds, setStartSeconds] = useState("0");
  const [endSeconds, setEndSeconds] = useState("");
  const [sourceRole, setSourceRole] = useState<"official" | "alternate">(
    "official",
  );
  const [note, setNote] = useState("");
  const membersQuery = useQuery({
    queryKey: queryKeys.members.active(),
    queryFn: fetchActiveMembers,
    staleTime: 60_000,
    enabled: performance !== null,
  });
  const members = membersQuery.data ?? EMPTY_MEMBERS;

  useEffect(() => {
    if (!performance) return;
    const source = performance.sources[0];
    setSongId(performance.songId);
    setRelation(performance.relationType);
    setReleaseType(
      performance.releaseType === "official_mv"
        ? "official_mv"
        : "official_video",
    );
    setParticipation(performance.participationType);
    setQuality(performance.qualityStatus);
    setReleasedAt(toDateTimeLocal(performance.releasedAt));
    setParticipants(
      performance.participants.map((participant) => {
        const entity = catalog.entities.find(
          (item) => item.id === participant.entityId,
        );
        const memberUid = entity?.memberUid ?? null;
        return {
          key:
            memberUid !== null
              ? `member:${memberUid}`
              : `entity:${participant.entityId}`,
          label: participant.displayName,
          detail:
            memberUid !== null
              ? "현재 멤버"
              : entity?.entityKind === "group"
                ? "기존 그룹"
                : "기존 외부 인물",
          subject:
            memberUid !== null
              ? { kind: "member" as const, memberUid }
              : {
                  kind: "entity" as const,
                  entityId: participant.entityId,
                },
          participantRole: participant.participantRole,
          creditNameSnapshot: participant.creditNameSnapshot,
        };
      }),
    );
    setYoutubeUrl(
      source
        ? `https://www.youtube.com/watch?v=${source.source.externalId}`
        : "",
    );
    setChannelId(source?.source.channelId ?? "");
    setStartSeconds(String(source?.startSeconds ?? 0));
    setEndSeconds(
      source?.endSeconds === null || source?.endSeconds === undefined
        ? ""
        : String(source.endSeconds),
    );
    setSourceRole(source?.sourceRole === "alternate" ? "alternate" : "official");
    setNote(performance.internalNote ?? "");
  }, [catalog.entities, performance]);

  useEffect(() => {
    if (!membersQuery.data) return;
    const membersByUid = new Map(
      membersQuery.data.map((member) => [member.uid, member]),
    );
    setParticipants((current) =>
      current.map((participant) => {
        if (participant.subject.kind !== "member") return participant;
        const member = membersByUid.get(participant.subject.memberUid);
        return member
          ? {
              ...participant,
              label: member.name,
              detail: [member.oshi_mark, member.unit_name]
                .filter(Boolean)
                .join(" · "),
            }
          : participant;
      }),
    );
  }, [membersQuery.data]);

  const updateSubjects = (subjects: SelectedSubject[]) => {
    setParticipants((current) => {
      const currentByKey = new Map(current.map((item) => [item.key, item]));
      return subjects.map((subject) => {
        const existing = currentByKey.get(subject.key);
        return {
          ...subject,
          participantRole: existing?.participantRole ?? "vocal",
          creditNameSnapshot:
            existing?.creditNameSnapshot || subject.label,
        };
      });
    });
  };
  const parsedStart = Number(startSeconds);
  const parsedEnd = endSeconds.trim() ? Number(endSeconds) : null;
  const validRange =
    Number.isInteger(parsedStart) &&
    parsedStart >= 0 &&
    (parsedEnd === null ||
      (Number.isInteger(parsedEnd) && parsedEnd > parsedStart));
  const canSave =
    performance !== null &&
    songId.length > 0 &&
    participants.length > 0 &&
    youtubeUrl.trim().length > 0 &&
    channelId.length > 0 &&
    validRange;

  return (
    <Dialog open={performance !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>가창 정보 수정</DialogTitle>
          <DialogDescription>
            연결된 곡, 참여자, 분류와 공식 영상 source를 한 번에 수정합니다.
          </DialogDescription>
        </DialogHeader>
        {performance && (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              게시 상태 변경은 목록의 게시·철회 작업을 사용합니다. 이 화면에서는
              연결된 곡, 참여자와 source를 포함한 가창 정보를 수정합니다.
            </p>
            <section className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>연결된 곡</Label>
                <Select value={songId} onValueChange={setSongId}>
                  <SelectTrigger aria-label="연결된 곡">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {catalog.songs
                      .filter((song) => song.archivedAt === null)
                      .map((song) => (
                        <SelectItem key={song.id} value={song.id}>
                          {song.title}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>곡 관계</Label>
                <Select
                  value={relation}
                  onValueChange={(value) =>
                    setRelation(value as OtwPlayRelationType)
                  }
                >
                  <SelectTrigger aria-label="곡 관계">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="original">오리지널</SelectItem>
                    <SelectItem value="cover">공식 커버</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>공개 형태</Label>
                <Select
                  value={releaseType}
                  onValueChange={(value) =>
                    setReleaseType(value as OtwPlayReleaseType)
                  }
                >
                  <SelectTrigger aria-label="공개 형태">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="official_video">공식 영상</SelectItem>
                    <SelectItem value="official_mv">공식 MV</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>참여 형태</Label>
                <Select
                  value={participation}
                  onValueChange={(value) =>
                    setParticipation(value as OtwPlayParticipationType)
                  }
                >
                  <SelectTrigger aria-label="참여 형태">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="solo">솔로</SelectItem>
                    <SelectItem value="duet">듀엣</SelectItem>
                    <SelectItem value="unit">유닛</SelectItem>
                    <SelectItem value="group">그룹</SelectItem>
                    <SelectItem value="external_collab">외부 협업</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>데이터 품질</Label>
                <Select
                  value={quality}
                  onValueChange={(value) =>
                    setQuality(value as OtwPlayQualityStatus)
                  }
                >
                  <SelectTrigger aria-label="데이터 품질">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ok">정상</SelectItem>
                    <SelectItem value="needs_update">업데이트 필요</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="edit-performance-released-at">가창 공개일시</Label>
                <Input
                  id="edit-performance-released-at"
                  type="datetime-local"
                  value={releasedAt}
                  onChange={(event) => setReleasedAt(event.target.value)}
                />
              </div>
            </section>

            <section className="space-y-3">
              <SubjectPicker
                label="가창 참여자"
                placeholder="현재 멤버 또는 기존 외부 identity 검색"
                members={members}
                entities={catalog.entities}
                selected={participants}
                onChange={updateSubjects}
              />
              {participants.map((participant) => (
                <div
                  key={participant.key}
                  className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2"
                >
                  <div className="space-y-1.5">
                    <Label>{participant.label} 역할</Label>
                    <Select
                      value={participant.participantRole}
                      onValueChange={(value) =>
                        setParticipants((current) =>
                          current.map((item) =>
                            item.key === participant.key
                              ? {
                                  ...item,
                                  participantRole:
                                    value as OtwPlayParticipantRole,
                                }
                              : item,
                          ),
                        )
                      }
                    >
                      <SelectTrigger aria-label={`${participant.label} 역할`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="vocal">메인 보컬</SelectItem>
                        <SelectItem value="featured_vocal">피처링 보컬</SelectItem>
                        <SelectItem value="chorus">코러스</SelectItem>
                        <SelectItem value="other">기타</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`credit-name-${participant.key}`}>
                      {participant.label} 표시 크레딧
                    </Label>
                    <Input
                      id={`credit-name-${participant.key}`}
                      value={participant.creditNameSnapshot}
                      onChange={(event) =>
                        setParticipants((current) =>
                          current.map((item) =>
                            item.key === participant.key
                              ? {
                                  ...item,
                                  creditNameSnapshot: event.target.value,
                                }
                              : item,
                          ),
                        )
                      }
                    />
                  </div>
                </div>
              ))}
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="edit-performance-youtube-url">YouTube URL</Label>
                <Input
                  id="edit-performance-youtube-url"
                  value={youtubeUrl}
                  onChange={(event) => setYoutubeUrl(event.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>공식 채널</Label>
                <Select value={channelId} onValueChange={setChannelId}>
                  <SelectTrigger aria-label="공식 채널">
                    <SelectValue placeholder="채널 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {catalog.channels.map((channel) => (
                      <SelectItem key={channel.id} value={channel.id}>
                        {channel.displayName} · {channel.verificationStatus} ·
                        {channel.active ? " 활성" : " 비활성"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-performance-start">시작 위치(초)</Label>
                <Input
                  id="edit-performance-start"
                  type="number"
                  min={0}
                  value={startSeconds}
                  onChange={(event) => setStartSeconds(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-performance-end">종료 위치(초)</Label>
                <Input
                  id="edit-performance-end"
                  type="number"
                  min={0}
                  value={endSeconds}
                  onChange={(event) => setEndSeconds(event.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>source 역할</Label>
                <Select
                  value={sourceRole}
                  onValueChange={(value) =>
                    setSourceRole(value as "official" | "alternate")
                  }
                >
                  <SelectTrigger aria-label="source 역할">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="official">공식 source</SelectItem>
                    <SelectItem value="alternate">대체 source</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="edit-performance-note">내부 메모</Label>
                <Textarea
                  id="edit-performance-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </div>
            </section>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            disabled={!canSave}
            onClick={() => {
              if (!performance || !canSave) return;
              const releasedTimestamp = releasedAt
                ? new Date(releasedAt).getTime()
                : null;
              void run("가창 정보 수정", () =>
                updateOtwPlayPerformance({
                  id: performance.id,
                  expectedVersion: performance.version,
                  songId,
                  relationType: relation,
                  releaseType,
                  participationType: participation,
                  qualityStatus: quality,
                  releasedAt:
                    releasedTimestamp !== null &&
                    Number.isFinite(releasedTimestamp)
                      ? releasedTimestamp
                      : null,
                  internalNote: note.trim() || null,
                  participants: participants.map((participant, index) => ({
                    subject: participant.subject,
                    participantRole: participant.participantRole,
                    creditOrder: index,
                    creditNameSnapshot:
                      participant.creditNameSnapshot.trim() || participant.label,
                  })),
                  source: {
                    youtubeUrl: youtubeUrl.trim(),
                    channelId,
                    startSeconds: parsedStart,
                    endSeconds: parsedEnd,
                    sourceRole,
                  },
                }),
              ).then((ok) => ok && onOpenChange(false));
            }}
          >
            전체 정보 저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
