import { useEffect, useState } from "react";
import type {
  OtwPlayAdminCatalogDto,
  OtwPlayAdminPerformanceDto,
  OtwPlayAdminSongDto,
  OtwPlayParticipationType,
  OtwPlayRelationType,
} from "@contracts/otw-play";
import { ConfirmActionDialog } from "@/app/admin";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import {
  Dialog,
  DialogContent,
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

type Run = (label: string, task: () => Promise<unknown>) => Promise<boolean>;

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
                      <TableCell>-</TableCell>
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
      <SongEditDialog song={editSong} onOpenChange={(open) => !open && setEditSong(null)} run={run} />
      <PerformanceEditDialog performance={editPerformance} onOpenChange={(open) => !open && setEditPerformance(null)} run={run} />
      <ConfirmActionDialog open={confirmation !== null} onOpenChange={(open) => !open && setConfirmation(null)} title={confirmation?.title ?? "확인"} description={confirmation?.description ?? ""} destructive={confirmation?.destructive} confirmLabel={confirmation?.confirmLabel ?? "계속"} onConfirm={() => { const action = confirmation?.action; setConfirmation(null); if (action) void action(); }} />
    </>
  );
}

function SongEditDialog({ song, onOpenChange, run }: { song: OtwPlayAdminSongDto | null; onOpenChange: (open: boolean) => void; run: Run }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [original, setOriginal] = useState(false);
  useEffect(() => {
    if (!song) return;
    setTitle(song.title);
    setDate(song.originalReleaseDate ?? "");
    setOriginal(song.isOtwOriginal);
  }, [song]);
  const open = song !== null;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>곡 정보 수정</DialogTitle></DialogHeader>{song && <div className="space-y-4"><div className="space-y-1.5"><Label>곡명</Label><Input value={title} onChange={(event) => setTitle(event.target.value)} /></div><div className="space-y-1.5"><Label>원곡 공개일</Label><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div><label className="flex gap-2 text-sm"><input type="checkbox" checked={original} onChange={(event) => setOriginal(event.target.checked)} /> OTW 오리지널곡</label><p className="text-xs text-muted-foreground">원곡 가수 identity 수정은 고급 관리가 아니라 등록 흐름의 재사용 후보를 통해 별도 보정합니다.</p></div>}<DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button><Button disabled={!title.trim()} onClick={() => { if (!song) return; void run("곡 정보 수정", () => updateOtwPlaySong({ id: song.id, expectedVersion: song.version, slug: song.slug, title: title.trim(), isOtwOriginal: original, originalReleaseDate: date || null, originalReleasePrecision: date ? "day" : "unknown", aliases: song.aliases.map((alias) => ({ alias: alias.alias, locale: alias.locale, aliasKind: alias.aliasKind })), originalArtists: song.originalArtists.map((artist) => ({ entityId: artist.entityId, creditOrder: artist.creditOrder, isPrimary: artist.isPrimary })) })).then((ok) => ok && onOpenChange(false)); }}>저장</Button></DialogFooter></DialogContent></Dialog>;
}

function PerformanceEditDialog({ performance, onOpenChange, run }: { performance: OtwPlayAdminPerformanceDto | null; onOpenChange: (open: boolean) => void; run: Run }) {
  const [relation, setRelation] = useState<OtwPlayRelationType>("cover");
  const [participation, setParticipation] = useState<OtwPlayParticipationType>("solo");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!performance) return;
    setRelation(performance.relationType);
    setParticipation(performance.participationType);
    setNote(performance.internalNote ?? "");
  }, [performance]);
  return <Dialog open={performance !== null} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>가창 정보 수정</DialogTitle></DialogHeader>{performance && <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label>곡 관계</Label><Select value={relation} onValueChange={(value) => setRelation(value as OtwPlayRelationType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="original">오리지널</SelectItem><SelectItem value="cover">공식 커버</SelectItem></SelectContent></Select></div><div className="space-y-1.5"><Label>참여 형태</Label><Select value={participation} onValueChange={(value) => setParticipation(value as OtwPlayParticipationType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="solo">솔로</SelectItem><SelectItem value="duet">듀엣</SelectItem><SelectItem value="unit">유닛</SelectItem><SelectItem value="group">그룹</SelectItem><SelectItem value="external_collab">외부 협업</SelectItem></SelectContent></Select></div><div className="space-y-1.5 sm:col-span-2"><Label>내부 메모</Label><Textarea value={note} onChange={(event) => setNote(event.target.value)} /></div></div>}<DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button><Button disabled={!performance?.sources[0]} onClick={() => { if (!performance?.sources[0]) return; const source = performance.sources[0]; void run("가창 정보 수정", () => updateOtwPlayPerformance({ id: performance.id, expectedVersion: performance.version, songId: performance.songId, relationType: relation, releaseType: performance.releaseType === "official_mv" ? "official_mv" : "official_video", participationType: participation, qualityStatus: performance.qualityStatus, releasedAt: performance.releasedAt, internalNote: note.trim() || null, participants: performance.participants.map((item) => ({ entityId: item.entityId, participantRole: item.participantRole, creditOrder: item.creditOrder, creditNameSnapshot: item.creditNameSnapshot })), source: { youtubeUrl: `https://www.youtube.com/watch?v=${source.source.externalId}`, channelId: source.source.channelId, startSeconds: source.startSeconds, endSeconds: source.endSeconds, sourceRole: source.sourceRole === "alternate" ? "alternate" : "official" } })).then((ok) => ok && onOpenChange(false)); }}>저장</Button></DialogFooter></DialogContent></Dialog>;
}
