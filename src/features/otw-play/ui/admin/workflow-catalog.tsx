import { useUnsavedChanges } from "@/shared/lib/unsaved-changes";
import { useConsoleSearch } from "@/shared/lib/admin-console-search";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  OtwPlayAdminCatalogDto,
  OtwPlayAdminPerformanceDto,
  OtwPlayAdminPerformanceSourceInput,
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
import {
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
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
  SubjectPicker,
  type SelectedSubject,
} from "./catalog-entry-dialog";
import { SongTagPicker } from "../song-tag-picker";

type Run = (label: string, task: () => Promise<unknown>) => Promise<boolean>;
const EMPTY_MEMBERS: Member[] = [];

const relationLabel = (value: string) => (value === "original" ? "오리지널" : "커버");
const publicationLabel = (value: string) =>
  value === "published" ? "게시됨" : value === "withdrawn" ? "철회됨" : "임시 저장";
const releaseLabel = (value: string) => ({
  official_mv: "공식 MV",
  official_video: "공식 영상",
  broadcast: "방송 가창",
  live: "라이브",
  shorts: "Shorts",
}[value] ?? value);
const participationLabel = (value: string) =>
  ({ solo: "솔로", duet: "듀엣", unit: "유닛", group: "그룹", external_collab: "외부 협업" })[value] ?? value;

const orderedPerformanceSources = (performance: OtwPlayAdminPerformanceDto) =>
  [...performance.sources].sort((left, right) => left.priority - right.priority);

function PerformanceSourceSummary({
  catalog,
  performance,
}: {
  catalog: OtwPlayAdminCatalogDto;
  performance: OtwPlayAdminPerformanceDto;
}) {
  const sources = orderedPerformanceSources(performance);
  if (sources.length === 0) {
    return <div className="text-xs text-muted-foreground">source 없음</div>;
  }
  return (
    <div className="mt-1 space-y-0.5 text-xs text-muted-foreground" aria-label={`${performance.id} source 목록`}>
      {sources.map((relation) => {
        const channel = catalog.channels.find((item) => item.id === relation.source.channelId);
        return (
          <div key={`${relation.source.id}:${relation.startSeconds}`} className="flex min-w-0 items-center gap-1">
            <span className="shrink-0">{relation.priority + 1}{relation.isPrimary ? " · 대표" : ""}</span>
            <span className="truncate" title={`${channel?.displayName ?? "채널 없음"} · ${relation.source.title ?? relation.source.externalId}`}>
              {channel?.displayName ?? "채널 없음"} · {relation.source.title ?? relation.source.externalId}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function WorkflowCatalog({
  catalog,
  saving,
  run,
  onPublishDrafts,
  onAddPerformance,
}: {
  catalog: OtwPlayAdminCatalogDto;
  saving: string | null;
  run: Run;
  onPublishDrafts: (performances: OtwPlayAdminPerformanceDto[]) => Promise<void>;
  onAddPerformance: (songId: string) => void;
}) {
  const [consoleSearch, updateConsole] = useConsoleSearch();
  const expanded = new Set(consoleSearch.selected ? [consoleSearch.selected] : []);
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
  const filteredSongs = activeSongs.filter((song) => {
    const text = [song.title, ...song.originalArtists.map((artist) => artist.displayName)].join(" ").toLocaleLowerCase();
    return (!consoleSearch.q || text.includes(consoleSearch.q.toLocaleLowerCase())) &&
      (!consoleSearch.category || song.tags?.includes(consoleSearch.category)) &&
      (!consoleSearch.state || catalog.performances.some((item) => item.songId === song.id && item.publicationStatus === consoleSearch.state));
  });
  const totalPages = Math.max(1, Math.ceil(filteredSongs.length / 25));
  const page = Math.min(consoleSearch.page ?? 1, totalPages);
  const visibleSongs = filteredSongs.slice((page - 1) * 25, page * 25);
  const activeSongIds = new Set(activeSongs.map((song) => song.id));
  const draftPerformances = catalog.performances.filter(
    (performance) =>
      performance.publicationStatus === "draft" &&
      performance.releaseType !== "broadcast" &&
      activeSongIds.has(performance.songId),
  );
  const draftSongCount = new Set(
    draftPerformances.map((performance) => performance.songId),
  ).size;
  const publishingDrafts = saving?.startsWith("미게시 가창 게시") ?? false;

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
      {performance.publicationStatus === "draft" && performance.releaseType !== "broadcast" && (
        <Button size="sm" disabled={saving !== null} onClick={() => setConfirmation({
          title: "가창을 게시할까요?",
          description: "승인된 공식 채널과 metadata를 다시 확인한 뒤 공개 상태로 전환합니다.",
          action: async () => { await run("가창 게시", () => publishOtwPlayPerformance(performance.id, { expectedVersion: performance.version })); },
        })}>게시</Button>
      )}
      {performance.publicationStatus === "draft" && performance.releaseType === "broadcast" && (
        <Badge variant="outline">비공개 검수 draft</Badge>
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
      <div className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
        <Input aria-label="곡명·원곡 가수 검색" placeholder="곡명·원곡 가수 검색" className="w-64" value={consoleSearch.q ?? ""} onChange={(event) => updateConsole({ q: event.target.value, page: 1 })} />
        <select aria-label="게시 상태" className="h-9 rounded border bg-background px-2" value={consoleSearch.state ?? ""} onChange={(event) => updateConsole({ state: event.target.value, page: 1 })}><option value="">모든 게시 상태</option><option value="draft">임시 저장만</option><option value="published">게시됨</option><option value="withdrawn">철회된 가창</option></select>
        <select aria-label="곡 분류" className="h-9 rounded border bg-background px-2" value={consoleSearch.category ?? ""} onChange={(event) => updateConsole({ category: event.target.value, page: 1 })}><option value="">모든 분류</option>{[...new Set(activeSongs.flatMap((song) => song.tags ?? []))].sort().map((tag) => <option key={tag}>{tag}</option>)}</select>
        <span className="ml-auto text-sm">{filteredSongs.length}곡 · {page}/{totalPages}</span>
        <Button variant="outline" disabled={page <= 1} onClick={() => updateConsole({ page: page - 1 }, false)}>이전</Button><Button variant="outline" disabled={page >= totalPages} onClick={() => updateConsole({ page: page + 1 }, false)}>다음</Button>
      </div>
      {filteredSongs.length === 0 && <p role="status" className="p-4">조건에 맞는 곡이 없습니다.</p>}
      {activeSongs.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          등록된 곡이 없습니다. 새 영상 등록에서 첫 곡과 가창을 함께 만드세요.
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">
                미게시 가창 {draftPerformances.length}개 · {draftSongCount}곡
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                현재 카탈로그의 임시 저장 가창만 게시합니다. 철회된 항목은 포함하지 않습니다.
              </p>
            </div>
            <Button
              className="shrink-0"
              disabled={saving !== null || draftPerformances.length === 0}
              onClick={() => setConfirmation({
                title: "미게시 곡을 모두 게시할까요?",
                description: `${draftSongCount}곡에 연결된 임시 저장 가창 ${draftPerformances.length}개를 순서대로 게시합니다. 각 항목은 승인된 공식 채널과 실제 가창 참여자를 다시 검증하며, 실패 항목은 임시 저장 상태로 유지합니다.`,
                confirmLabel: `${draftPerformances.length}개 게시`,
                action: async () => {
                  await onPublishDrafts(draftPerformances);
                },
              })}
            >
              {publishingDrafts ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {publishingDrafts ? saving : "미게시 곡 모두 게시"}
            </Button>
          </div>
          <div className="hidden overflow-x-auto rounded-xl border md:block">
            <Table className="w-full">
              <TableHeader><TableRow><TableHead className="w-10" /><TableHead>곡</TableHead><TableHead>원곡 가수</TableHead><TableHead>가창</TableHead><TableHead>분류</TableHead><TableHead className="text-right">작업</TableHead></TableRow></TableHeader>
              <TableBody>
                {visibleSongs.flatMap((song) => {
                  const performances = catalog.performances.filter((item) => item.songId === song.id);
                  const open = expanded.has(song.id);
                  const rows = [
                    <TableRow key={song.id} className="bg-muted/20">
                      <TableCell><Button size="icon-sm" variant="ghost" aria-label={`${song.title} 가창 펼치기`} onClick={() => updateConsole({selected: open ? undefined : song.id}, false)}>{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</Button></TableCell>
                      <TableCell><div className="font-semibold">{song.title}</div><Badge variant="outline" className="mt-1">{song.isOtwOriginal ? "오리지널" : "커버 원곡"}</Badge></TableCell>
                      <TableCell>{song.originalArtists.map((artist) => artist.displayName).join(", ")}</TableCell>
                      <TableCell>{performances.length}개</TableCell>
                      <TableCell><div className="flex flex-wrap gap-1">{(song.tags?.length ?? 0) > 0 ? song.tags.map((tag) => <Badge key={tag}>{tag}</Badge>) : <span className="text-muted-foreground">미분류</span>}</div></TableCell>
                      <TableCell><div className="flex flex-wrap justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => setEditSong(song)}><Pencil className="h-3.5 w-3.5" /> 곡 정보 수정</Button><Button size="sm" variant="outline" onClick={() => onAddPerformance(song.id)}><Plus className="h-3.5 w-3.5" /> 다른 가창 추가</Button>{songDeleteAction(song, performances)}</div></TableCell>
                    </TableRow>,
                  ];
                  if (open) rows.push(...performances.map((performance) => (
                    <TableRow key={performance.id}>
                      <TableCell />
                      <TableCell>
                        <div className="pl-5 text-sm font-medium">{performance.participants.map((item) => item.displayName).join(", ") || "참여자 미입력"}</div>
                        <div className="pl-5"><PerformanceSourceSummary catalog={catalog} performance={performance} /></div>
                      </TableCell>
                      <TableCell>{orderedPerformanceSources(performance).map((relation) => catalog.channels.find((item) => item.id === relation.source.channelId)?.displayName ?? "채널 없음").join(", ") || "채널 없음"}</TableCell>
                      <TableCell><Badge variant={performance.publicationStatus === "published" ? "secondary" : performance.publicationStatus === "withdrawn" ? "destructive" : "outline"}>{publicationLabel(performance.publicationStatus)}</Badge></TableCell>
                      <TableCell><div>{relationLabel(performance.relationType)} · {releaseLabel(performance.releaseType)} · {participationLabel(performance.participationType)}</div>{(performance.tags?.length ?? 0) > 0 ? <div className="mt-1 flex flex-wrap gap-1">{performance.tags?.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div> : null}</TableCell>
                      <TableCell>{performanceActions(performance)}</TableCell>
                    </TableRow>
                  )));
                  return rows;
                })}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 md:hidden">
            {visibleSongs.map((song) => {
              const performances = catalog.performances.filter((item) => item.songId === song.id);
              return <Card key={song.id}><CardContent className="space-y-3 p-4"><div className="flex items-start justify-between gap-2"><div><div className="font-semibold">{song.title}</div><div className="text-sm text-muted-foreground">{song.originalArtists.map((artist) => artist.displayName).join(", ")}</div></div><Badge variant="outline">{performances.length} 가창</Badge></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => onAddPerformance(song.id)}><Plus className="h-3.5 w-3.5" /> 가창 추가</Button><Button size="sm" variant="ghost" onClick={() => setEditSong(song)}>곡 수정</Button>{songDeleteAction(song, performances)}</div><div className="space-y-2">{performances.map((performance) => <div key={performance.id} className="rounded-lg border bg-muted/20 p-3"><div className="flex items-center justify-between gap-2"><div className="font-medium">{performance.participants.map((item) => item.displayName).join(", ") || "참여자 미입력"}</div><Badge variant="outline">{publicationLabel(performance.publicationStatus)}</Badge></div><div className="mt-1 text-xs text-muted-foreground">{relationLabel(performance.relationType)} · {releaseLabel(performance.releaseType)} · {participationLabel(performance.participationType)}</div>{(performance.tags?.length ?? 0) > 0 ? <div className="mt-2 flex flex-wrap gap-1">{performance.tags?.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div> : null}<PerformanceSourceSummary catalog={catalog} performance={performance} /><div className="mt-2">{performanceActions(performance)}</div></div>)}</div></CardContent></Card>;
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
  const canDiscard = useUnsavedChanges(Boolean(song && (
    title !== song.title || original !== song.isOtwOriginal ||
    JSON.stringify(tags) !== JSON.stringify(song.tags ?? []) ||
    JSON.stringify(artists.map((artist) => artist.subject)) !== JSON.stringify(song.originalArtists.map((artist) => {
      const memberUid = catalog.entities.find((entity) => entity.id === artist.entityId)?.memberUid;
      return memberUid != null ? {kind: "member", memberUid} : {kind: "entity", entityId: artist.entityId};
    }))
  )));
  const close = async (open: boolean) => { if (open || await canDiscard()) onOpenChange(open); };
  const open = song !== null;
  return <Dialog open={open} onOpenChange={(open) => void close(open)}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>곡 정보 수정</DialogTitle></DialogHeader>{song && <div className="space-y-5"><div className="space-y-1.5"><Label htmlFor="edit-song-title">곡명</Label><Input id="edit-song-title" value={title} onChange={(event) => setTitle(event.target.value)} /></div><SongTagPicker tags={tags} onChange={setTags} /><SubjectPicker label="원곡 가수" placeholder="멤버 또는 기존 원곡 가수 검색" helpText="기존 가수를 선택하거나 새 외부 인물·그룹을 칩으로 추가할 수 있습니다. 첫 번째 가수를 대표 원곡 가수로 저장합니다." members={members} entities={catalog.entities} selected={artists} onChange={setArtists} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={original} onChange={(event) => setOriginal(event.target.checked)} /> OTW 오리지널곡</label></div>}<DialogFooter><Button variant="outline" onClick={() => void close(false)}>취소</Button><Button disabled={!title.trim() || artists.length === 0} onClick={() => { if (!song) return; void run("곡 정보 수정", () => updateOtwPlaySong({ id: song.id, expectedVersion: song.version, slug: song.slug, title: title.trim(), isOtwOriginal: original, originalReleaseDate: song.originalReleaseDate, originalReleasePrecision: song.originalReleasePrecision, aliases: song.aliases.map((alias) => ({ alias: alias.alias, locale: alias.locale, aliasKind: alias.aliasKind })), originalArtists: artists.map((artist, index) => ({ subject: artist.subject, creditOrder: index, isPrimary: index === 0 })), tags })).then((ok) => ok && onOpenChange(false)); }}>저장</Button></DialogFooter></DialogContent></Dialog>;
}

type EditableParticipant = SelectedSubject & {
  participantRole: OtwPlayParticipantRole;
  creditNameSnapshot: string;
};

type EditablePerformanceSource = Omit<
  OtwPlayAdminPerformanceSourceInput,
  "startSeconds" | "endSeconds" | "priority"
> & {
  key: string;
  sourceVersion?: number;
  startSeconds: string;
  endSeconds: string;
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
  const [tags, setTags] = useState<string[]>([]);
  const [participants, setParticipants] = useState<EditableParticipant[]>([]);
  const [sources, setSources] = useState<EditablePerformanceSource[]>([]);
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
    setSongId(performance.songId);
    setRelation(performance.relationType);
    setReleaseType(performance.releaseType);
    setParticipation(performance.participationType);
    setQuality(performance.qualityStatus);
    setReleasedAt(toDateTimeLocal(performance.releasedAt));
    setTags([...(performance.tags ?? [])]);
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
    setSources(
      [...performance.sources]
        .sort((left, right) => left.priority - right.priority)
        .map((source) => ({
          key: source.source.id,
          sourceVersion: source.source.version,
          youtubeUrl: `https://www.youtube.com/watch?v=${source.source.externalId}`,
          channelId: source.source.channelId,
          startSeconds: String(source.startSeconds),
          endSeconds: source.endSeconds === null ? "" : String(source.endSeconds),
          sourceRole:
            source.sourceRole === "kirinuki"
              ? "kirinuki"
              : source.sourceRole === "alternate"
                ? "alternate"
                : "official",
          isPrimary: source.isPrimary,
        })),
    );
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
  const parsedSources = sources.map((source, priority) => ({
    youtubeUrl: source.youtubeUrl.trim(),
    channelId: source.channelId,
    startSeconds: Number(source.startSeconds),
    endSeconds: source.endSeconds.trim() ? Number(source.endSeconds) : null,
    sourceRole: source.sourceRole,
    priority,
    isPrimary: source.isPrimary,
  }));
  const validSources =
    parsedSources.length > 0 &&
    parsedSources.filter((source) => source.isPrimary).length === 1 &&
    parsedSources.every(
      (source) =>
        source.youtubeUrl.length > 0 &&
        source.channelId.length > 0 &&
        Number.isInteger(source.startSeconds) &&
        source.startSeconds >= 0 &&
        (source.endSeconds === null ||
          (Number.isInteger(source.endSeconds) &&
            source.endSeconds > source.startSeconds)),
    );
  const canSave =
    performance !== null &&
    songId.length > 0 &&
    participants.length > 0 &&
    validSources;

  const updateSource = (
    key: string,
    update: Partial<EditablePerformanceSource>,
  ) => setSources((current) =>
    current.map((source) => source.key === key ? { ...source, ...update } : source),
  );
  const moveSource = (index: number, direction: -1 | 1) => setSources((current) => {
    const target = index + direction;
    if (target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target]!, next[index]!];
    return next;
  });

  const canDiscard = useUnsavedChanges(Boolean(performance && (
    songId !== performance.songId || relation !== performance.relationType ||
    releaseType !== performance.releaseType || participation !== performance.participationType ||
    quality !== performance.qualityStatus || releasedAt !== toDateTimeLocal(performance.releasedAt) ||
    note !== (performance.internalNote ?? "") || JSON.stringify(tags) !== JSON.stringify(performance.tags ?? []) ||
    JSON.stringify(participants.map((item) => [item.subject, item.participantRole, item.creditNameSnapshot])) !==
      JSON.stringify(performance.participants.map((item) => {
        const memberUid = catalog.entities.find((entity) => entity.id === item.entityId)?.memberUid;
        return [memberUid != null ? {kind: "member", memberUid} : {kind: "entity", entityId: item.entityId}, item.participantRole, item.creditNameSnapshot];
      })) ||
    JSON.stringify(parsedSources) !== JSON.stringify([...performance.sources].sort((a, b) => a.priority - b.priority).map((source, priority) => ({
      youtubeUrl: `https://www.youtube.com/watch?v=${source.source.externalId}`,
      channelId: source.source.channelId, startSeconds: source.startSeconds, endSeconds: source.endSeconds,
      sourceRole: source.sourceRole === "kirinuki" ? "kirinuki" : source.sourceRole === "alternate" ? "alternate" : "official",
      priority, isPrimary: source.isPrimary,
    })))
  )));
  const close = async (open: boolean) => { if (open || await canDiscard()) onOpenChange(open); };
  return (
    <Dialog open={performance !== null} onOpenChange={(open) => void close(open)}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>가창 정보 수정</DialogTitle>
          <DialogDescription>
              연결된 곡, 참여자, 분류와 원본 영상을 한 번에 수정합니다.
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
                    <SelectItem value="broadcast">방송 가창</SelectItem>
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
              <div className="sm:col-span-2">
                <SongTagPicker
                  tags={tags}
                  onChange={setTags}
                  label="커버 영상 라벨"
                  placeholder="이 영상만의 라벨 입력"
                  selectedLabel="선택한 커버 영상 라벨"
                  description="이 가창 영상에만 적용되는 라벨입니다. 곡 분류와 독립적으로 저장됩니다."
                  recommendedTags={[]}
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

            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">영상 source</h3>
                  <p className="text-xs text-muted-foreground">
                    위에서부터 재생 우선순위가 적용되며 대표 source는 정확히 하나여야 합니다.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setSources((current) => [
                    ...current,
                    {
                      key: `new-${Date.now()}-${current.length}`,
                      youtubeUrl: "",
                      channelId: "",
                      startSeconds: "0",
                      endSeconds: "",
                      sourceRole: releaseType === "broadcast" ? "kirinuki" : "alternate",
                      isPrimary: current.length === 0,
                    },
                  ])}
                >
                  <Plus /> source 추가
                </Button>
              </div>
              {sources.map((source, index) => (
                <div key={source.key} className="space-y-3 rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={source.isPrimary ? "default" : "outline"}>
                        우선순위 {index + 1}{source.isPrimary ? " · 대표" : ""}
                      </Badge>
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="radio"
                          name="performance-primary-source"
                          checked={source.isPrimary}
                          onChange={() => setSources((current) => current.map((item) => ({
                            ...item,
                            isPrimary: item.key === source.key,
                          })))}
                        />
                        대표 지정
                      </label>
                    </div>
                    <div className="flex gap-1">
                      <Button type="button" size="icon-sm" variant="ghost" aria-label={`source ${index + 1} 위로 이동`} disabled={index === 0} onClick={() => moveSource(index, -1)}><ChevronUp /></Button>
                      <Button type="button" size="icon-sm" variant="ghost" aria-label={`source ${index + 1} 아래로 이동`} disabled={index === sources.length - 1} onClick={() => moveSource(index, 1)}><ChevronDown /></Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`source ${index + 1} 삭제`}
                        disabled={sources.length === 1}
                        onClick={() => setSources((current) => {
                          const next = current.filter((item) => item.key !== source.key);
                          if (source.isPrimary && next[0]) next[0] = { ...next[0], isPrimary: true };
                          return next;
                        })}
                      ><Trash2 /></Button>
                      {source.sourceVersion !== undefined ? (
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`source ${index + 1} 재검사`}
                          disabled={!source.youtubeUrl.trim() || !source.channelId}
                          onClick={() => void run(`source:${source.key}`, () =>
                            recheckOtwPlaySource(source.key, {
                              expectedVersion: source.sourceVersion!,
                              youtubeUrl: source.youtubeUrl.trim(),
                              channelId: source.channelId,
                            }),
                          )}
                        ><RefreshCw /></Button>
                      ) : null}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor={`edit-source-url-${source.key}`}>YouTube URL</Label>
                      <Input id={`edit-source-url-${source.key}`} value={source.youtubeUrl} onChange={(event) => updateSource(source.key, { youtubeUrl: event.target.value })} />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>영상 채널</Label>
                      <Select value={source.channelId} onValueChange={(channelId) => updateSource(source.key, { channelId })}>
                        <SelectTrigger aria-label={`source ${index + 1} 채널`}><SelectValue placeholder="채널 선택" /></SelectTrigger>
                        <SelectContent>{catalog.channels.map((channel) => (
                          <SelectItem key={channel.id} value={channel.id}>{channel.displayName} · {channel.verificationStatus} · {channel.active ? " 활성" : " 비활성"}</SelectItem>
                        ))}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5"><Label htmlFor={`edit-source-start-${source.key}`}>시작 위치(초)</Label><Input id={`edit-source-start-${source.key}`} type="number" min={0} value={source.startSeconds} onChange={(event) => updateSource(source.key, { startSeconds: event.target.value })} /></div>
                    <div className="space-y-1.5"><Label htmlFor={`edit-source-end-${source.key}`}>종료 위치(초)</Label><Input id={`edit-source-end-${source.key}`} type="number" min={0} value={source.endSeconds} onChange={(event) => updateSource(source.key, { endSeconds: event.target.value })} /></div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>source 역할</Label>
                      <Select value={source.sourceRole} onValueChange={(sourceRole) => updateSource(source.key, { sourceRole: sourceRole as EditablePerformanceSource["sourceRole"] })}>
                        <SelectTrigger aria-label={`source ${index + 1} 역할`}><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="official">공식 source</SelectItem><SelectItem value="kirinuki">키리누키 source</SelectItem><SelectItem value="alternate">대체 source</SelectItem></SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
              <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="edit-performance-note">내부 메모</Label>
                <Textarea
                  id="edit-performance-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </div>
              </div>
            </section>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => void close(false)}>
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
                  tags,
                  participants: participants.map((participant, index) => ({
                    subject: participant.subject,
                    participantRole: participant.participantRole,
                    creditOrder: index,
                    creditNameSnapshot:
                      participant.creditNameSnapshot.trim() || participant.label,
                  })),
                  sources: parsedSources,
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
