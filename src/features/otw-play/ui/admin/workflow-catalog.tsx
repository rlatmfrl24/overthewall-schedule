import {SongConnectionPicker} from "./song-connection-picker";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/shared/ui/dropdown-menu";
import { BroadcastFields, EMPTY_BROADCAST } from "./broadcast-fields";
import { Checkbox } from "@/shared/ui/checkbox";
import { SelectField } from "@/shared/ui/select-field"
import { useUnsavedChanges } from "@/shared/lib/unsaved-changes";
import { useConsoleSearch } from "@/shared/lib/admin-console-search";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  OtwPlayAdminUpdatePerformanceRequest,
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
import { ConfirmActionDialog } from "@/shared/ui/confirm-action-dialog";
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
import { PiCaretDownBold as ChevronDown, PiCaretUpBold as ChevronUp, PiCaretRightBold as ChevronRight, PiPencilSimpleBold as Pencil, PiPlusBold as Plus, PiArrowsClockwiseBold as RefreshCw, PiTrashBold as Trash2, PiUploadSimpleBold as Upload } from "react-icons/pi";
import { PiCheckBold, PiDotsThreeBold, PiLockSimpleBold, PiMicrophoneBold, PiMinusBold } from "react-icons/pi";
import {
  fetchOtwPlayAdminCatalog,
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
import { CatalogSearchInput } from "./catalog-search-input";
import { mergeAdminCatalogRows, useOtwPlayAdminCatalogLookup } from "../../queries/use-admin-catalog";

type Run = (label: string, task: () => Promise<unknown>) => Promise<boolean>;
const EMPTY_MEMBERS: Member[] = [];
const CATALOG_BATCH_SIZE = 25;

const relationLabel = (value: string) => (value === "singing_clip" ? "노래 클립" : value === "original" ? "오리지널" : "커버");
const publicationLabel = (value: string) =>
  value === "published" ? "게시됨" : value === "withdrawn" ? "철회됨" : "비공개";
const publicationFilters = [
  { value: "", label: "전체 상태" }, { value: "draft", label: "비공개" },
  { value: "published", label: "게시됨" }, { value: "withdrawn", label: "철회됨" },
] as const;

function PublicationBadge({ status }: { status: OtwPlayAdminPerformanceDto["publicationStatus"] }) {
  const Icon = status === "published" ? PiCheckBold : status === "withdrawn" ? PiMinusBold : PiLockSimpleBold;
  return <Badge variant={status === "published" ? "secondary" : "outline"} className="gap-1 whitespace-nowrap"><Icon aria-hidden="true" />{publicationLabel(status)}</Badge>;
}

const canPublishDraft = (performance: OtwPlayAdminPerformanceDto) =>
  performance.contentAccess !== "admin_archive" && performance.publicationStatus === "draft" &&
  (performance.releaseType !== "broadcast" || Boolean(performance.broadcast?.extent));
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
    return <div className="text-xs text-destructive">연결된 영상 없음</div>;
  }
  return (
    <div className="mt-1 space-y-1 text-[13px] leading-5 text-muted-foreground" aria-label={`${performance.id} source 목록`}>
      {sources.map((relation) => {
        const channel = catalog.channels.find((item) => item.id === relation.source.channelId);
        return (
          <div key={`${relation.source.id}:${relation.startSeconds}`} className="flex min-w-0 items-start gap-1">
            <span className="shrink-0">{relation.priority + 1}{relation.isPrimary ? " · 대표" : ""}</span>
            <span className="min-w-0 whitespace-normal break-words" title={`${channel?.displayName ?? "채널 없음"} · ${relation.source.title ?? relation.source.externalId}`}>
              {channel?.displayName ?? "채널 없음"} · {relation.source.title ?? relation.source.externalId}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PublicationSummary({ performances }: { performances: OtwPlayAdminPerformanceDto[] }) {
  return <div className="space-y-1 tabular-nums">
    <div className="whitespace-nowrap font-medium">{performances.length}개 가창</div>
    <div className="flex flex-wrap gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
      {(["published", "draft", "withdrawn"] as const).map((status) => {
        const count = performances.filter((item) => item.publicationStatus === status).length;
        return count > 0 && <span className="whitespace-nowrap" key={status}>{publicationLabel(status)} {count}</span>;
      })}
    </div>
  </div>;
}

export function WorkflowCatalog({
  scope = "official",
  loadMore,loadingMore,
  catalog,
  saving,
  run,
  onPublishDrafts,
  onAddPerformance,
  onScopeChange,
  publicationRequestId,
  deletionRequestId,
}: {
  scope?: "official" | "broadcast" | "all";
  loadMore?:()=>void;loadingMore?:boolean;
  catalog: OtwPlayAdminCatalogDto;
  saving: string | null;
  run: Run;
  onPublishDrafts: (performances: OtwPlayAdminPerformanceDto[]) => Promise<void>;
  onAddPerformance: (songId: string) => void;
  onScopeChange: (scope: "official" | "broadcast" | "all") => void;
  publicationRequestId: (performance: OtwPlayAdminPerformanceDto, target: "published" | "withdrawn") => string;
  deletionRequestId: (kind: "song" | "performance", id: string, version: number) => string;
}) {
  const scopedPerformances = catalog.performances.filter(performance => scope === "all" || (scope === "broadcast" ? performance.releaseType === "broadcast" : performance.releaseType !== "broadcast"));
  const scopedSongIds = new Set(scopedPerformances.map(performance => performance.songId));
  const [consoleSearch, updateConsole] = useConsoleSearch();
  const draftView = consoleSearch.state === "draft";
  const filterPerformances = (songId: string) => scopedPerformances.filter(performance =>
    performance.songId === songId && (!consoleSearch.state || performance.publicationStatus === consoleSearch.state));
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
  const activeSongs = catalog.songs.filter(song => song.archivedAt === null && scopedSongIds.has(song.id));
  const filteredSongs = activeSongs.filter((song) => {
    const text = [song.title, ...song.originalArtists.map((artist) => artist.displayName)].join(" ").toLocaleLowerCase();
    return (!consoleSearch.q || text.includes(consoleSearch.q.toLocaleLowerCase())) &&
      (!consoleSearch.category || song.tags?.includes(consoleSearch.category)) &&
      (!consoleSearch.state || scopedPerformances.some((item) => item.songId === song.id && item.publicationStatus === consoleSearch.state));
  });
  const filterKey = JSON.stringify([scope, consoleSearch.q, consoleSearch.category, consoleSearch.state, consoleSearch.page]);
  const [selection, setSelection] = useState<{ filter: string; versions: Record<string, number> }>({ filter: filterKey, versions: {} });
  if (selection.filter !== filterKey) setSelection({ filter: filterKey, versions: {} });
  // Old page links still reveal their results, now together with preceding rows.
  const initialCount = (consoleSearch.page ?? 1) * CATALOG_BATCH_SIZE;
  const [windowState, setWindowState] = useState({ filterKey, count: initialCount });
  if (windowState.filterKey !== filterKey) {
    setWindowState({ filterKey, count: initialCount });
  }
  const requestedCount = windowState.filterKey === filterKey ? windowState.count : initialCount;
  const selectedIndex = filteredSongs.findIndex((song) => song.id === consoleSearch.selected);
  const visibleCount = Math.min(filteredSongs.length, Math.max(requestedCount, selectedIndex + 1));
  const visibleSongs = filteredSongs.slice(0, visibleCount);
  const hasMore = visibleCount < filteredSongs.length || Boolean(loadMore);
  const [loadMoreTarget, setLoadMoreTarget] = useState<HTMLDivElement | null>(null);
  const showMore = useCallback(() => {
    if(visibleCount>=filteredSongs.length) {if(!loadingMore) loadMore?.();}
    setWindowState({ filterKey, count: visibleCount + CATALOG_BATCH_SIZE });
  }, [filterKey, visibleCount,filteredSongs.length,loadMore,loadingMore]);

  useEffect(() => {
    if (!loadMoreTarget || !hasMore || typeof IntersectionObserver === "undefined") return;
    let requested = false;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || requested) return;
      requested = true;
      observer.unobserve(loadMoreTarget);
      showMore();
    }, { root: loadMoreTarget.closest("main"), rootMargin: "240px 0px" });
    observer.observe(loadMoreTarget);
    return () => {
      requested = true;
      observer.disconnect();
    };
  }, [loadMoreTarget, hasMore, showMore]);
  const activeSongIds = new Set(activeSongs.map((song) => song.id));
  const publicationCatalog = useQuery({
    queryKey: queryKeys.otwPlay.adminCatalog(),
    queryFn: () => fetchOtwPlayAdminCatalog(),
    enabled: false,
  });
  const draftPerformances = scopedPerformances.filter(performance => canPublishDraft(performance) && activeSongIds.has(performance.songId));
  const visibleSongIds = new Set(visibleSongs.map(song => song.id));
  const visibleDrafts = draftView ? draftPerformances.filter(performance => visibleSongIds.has(performance.songId)) : [];
  const selectedDrafts = selection.filter === filterKey ? visibleDrafts.filter(performance => selection.versions[performance.id] === performance.version) : [];
  const allVisibleSelected = visibleDrafts.length > 0 && selectedDrafts.length === visibleDrafts.length;
  const publishingDrafts = saving?.startsWith("미게시 가창 게시") ?? false;
  const [emptyBulkScope, setEmptyBulkScope] = useState<typeof scope | null>(null);

  const preparePublication = (performances: OtwPlayAdminPerformanceDto[], all: boolean) => {
    if (!performances.length) return;
    setConfirmation({
      title: all ? "미게시 곡을 모두 게시할까요?" : "선택한 영상을 게시할까요?",
      description: `${all ? "검색 조건과 관계없이 현재 영상 종류의 " : "선택한 "}${new Set(performances.map(item => item.songId)).size}곡 · ${performances.length}개 가창을 공개합니다. 실패 항목은 임시 저장 상태로 유지합니다.`,
      confirmLabel: `${performances.length}개 게시`,
      action: () => onPublishDrafts(performances),
    });
  };
  const prepareBulkPublication = async () => {
    setEmptyBulkScope(null);
    if (!catalog.paged) { preparePublication(draftPerformances, true); return; }
    const prepared = await publicationCatalog.refetch();
    if (prepared.isError || !prepared.data) return;
    const full = prepared.data;
    const songs = new Set(full.songs.filter(song => song.archivedAt === null).map(song => song.id));
    const targets = full.performances.filter(performance => canPublishDraft(performance) && songs.has(performance.songId) &&
      (scope === "all" || (scope === "broadcast" ? performance.releaseType === "broadcast" : performance.releaseType !== "broadcast")));
    setEmptyBulkScope(targets.length === 0 ? scope : null);
    preparePublication(targets, true);
  };
  const publicationCheckbox = (song: OtwPlayAdminSongDto, performance: OtwPlayAdminPerformanceDto) => {
    if (!draftView || !canPublishDraft(performance)) return null;
    const participantNames = performance.participants.map(participant => participant.displayName).join(", ");
    const sourceTitle = orderedPerformanceSources(performance)[0]?.source.title;
    return <label className="inline-flex min-h-11 min-w-9 items-center justify-center lg:min-h-9">
      <Checkbox aria-label={`${[song.title, participantNames, sourceTitle].filter(Boolean).join(" · ")} 게시 선택`} checked={selection.filter === filterKey && selection.versions[performance.id] === performance.version} disabled={saving !== null} onCheckedChange={checked => {
        setSelection(current => {
          const versions = current.filter === filterKey ? { ...current.versions } : {};
          if (checked === true) versions[performance.id] = performance.version;
          else delete versions[performance.id];
          return { filter: filterKey, versions };
        });
      }} />
    </label>;
  };

  const performanceActions = (performance: OtwPlayAdminPerformanceDto) => performance.contentAccess === "admin_archive"
    ? <Badge variant="outline">관리자 보관 · 읽기 전용</Badge> : (
    <div className="flex items-center justify-end gap-1">
      <Button size="sm" variant="ghost" onClick={() => setEditPerformance(performance)} disabled={performance.publicationStatus === "withdrawn"}>
        <Pencil className="h-3.5 w-3.5" /> 수정
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" className="size-11 lg:size-8" aria-label="가창 작업 메뉴"><PiDotsThreeBold className="size-5" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
      {performance.sources[0] && (
        <DropdownMenuItem
          aria-label="source 재확인"
          disabled={saving !== null}
          onSelect={() => {
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
          <RefreshCw className="h-3.5 w-3.5" /> 영상 확인
        </DropdownMenuItem>
      )}
      {canPublishDraft(performance) && (
        <DropdownMenuItem disabled={saving !== null} onSelect={() => setConfirmation({
          title: "가창을 게시할까요?",
          description: "승인 채널, 가창 정보와 재생 구간을 다시 확인한 뒤 공개 상태로 전환합니다.",
          action: async () => { await run("가창 게시", () => publishOtwPlayPerformance(performance.id, { expectedVersion: performance.version }, publicationRequestId(performance, "published"))); },
        })}>게시</DropdownMenuItem>
      )}
      <div role="separator" className="my-1 border-t" />
      {(performance.publicationStatus === "draft" || performance.publicationStatus === "withdrawn") && (
        <DropdownMenuItem
          aria-label="삭제"
          className="text-destructive hover:text-destructive"
          disabled={saving !== null}
          onSelect={() => setConfirmation({
            title: performance.publicationStatus === "withdrawn" ? "철회된 가창을 삭제할까요?" : "임시 저장 가창을 삭제할까요?",
            description: "이 가창과 연결 정보를 영구 삭제합니다. 승인 제안과 작업 이력은 보존됩니다. 이 작업은 되돌릴 수 없습니다.",
            destructive: true,
            confirmLabel: "삭제",
            action: async () => { await run("가창 삭제", () => deleteOtwPlayPerformance(performance.id, { expectedVersion: performance.version }, deletionRequestId("performance",performance.id,performance.version))); },
          })}
        >
          <Trash2 className="h-3.5 w-3.5" /> 삭제
        </DropdownMenuItem>
      )}
      {performance.publicationStatus === "published" && (
        <DropdownMenuItem className="text-destructive" disabled={saving !== null} onSelect={() => setConfirmation({
          title: "가창을 철회할까요?",
          description: "공개 카탈로그에서 내려가며 기존 metadata와 event 이력은 보존됩니다.",
          destructive: true,
          action: async () => { await run("가창 철회", () => withdrawOtwPlayPerformance(performance.id, { expectedVersion: performance.version }, publicationRequestId(performance, "withdrawn"))); },
        })}>철회</DropdownMenuItem>
      )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const songDeleteAction = (
    song: OtwPlayAdminSongDto,
  ) => {
    const performances = catalog.performances.filter((item) => item.songId === song.id);
    const canDelete = performances.every(
      (performance) => performance.contentAccess !== "admin_archive" && performance.publicationStatus !== "published",
    );
    const withdrawnCount = performances.filter(
      (performance) => performance.publicationStatus === "withdrawn",
    ).length;
    return (
      <>
      <DropdownMenuItem
        aria-label="곡 삭제"
        className="text-destructive hover:text-destructive"
        disabled={saving !== null || !canDelete}
        aria-describedby={!canDelete ? `song-delete-reason-${song.id}` : undefined}
        onSelect={() => setConfirmation({
          title: "곡을 삭제할까요?",
          description: performances.length > 0
            ? `곡 정보와 가창 ${performances.length}개${withdrawnCount > 0 ? ` (철회 ${withdrawnCount}개 포함)` : ""}를 영구 삭제합니다. 승인 제안과 작업 이력은 보존됩니다. 이 작업은 되돌릴 수 없습니다.`
            : "곡 정보를 영구 삭제합니다. 이 작업은 되돌릴 수 없습니다.",
          destructive: true,
          confirmLabel: "삭제",
          action: async () => { await run("곡 삭제", () => deleteOtwPlaySong(song.id, { expectedVersion: song.version }, deletionRequestId("song",song.id,song.version))); },
        })}
      >
        <Trash2 className="h-3.5 w-3.5" /> 곡 삭제
      </DropdownMenuItem>
      {!canDelete && <p id={`song-delete-reason-${song.id}`} className="max-w-56 px-2 py-1 text-xs text-muted-foreground">다른 영상 종류를 포함해 게시 중인 가창이 있어 삭제할 수 없습니다.</p>}
      </>
    );
  };

  const songActions = (song: OtwPlayAdminSongDto) => <div className="flex items-center justify-end gap-1">
    <Button size="sm" variant="ghost" aria-label="곡 정보 수정" onClick={() => setEditSong(song)}><Pencil className="h-3.5 w-3.5" /> 수정</Button>
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" className="size-11 lg:size-8" aria-label="곡 작업 메뉴"><PiDotsThreeBold className="size-5" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onAddPerformance(song.id)}><Plus className="h-3.5 w-3.5" /> 다른 가창 추가</DropdownMenuItem>
        <div role="separator" className="my-1 border-t" />
        {songDeleteAction(song)}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;

  return (
    <>
      <div role="search" aria-label="카탈로그 필터" className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div role="group" aria-label="게시 상태" className="flex max-w-full flex-wrap gap-1 rounded-lg border bg-background p-1">
            {publicationFilters.map(option => {
              const current = (consoleSearch.state ?? "") === option.value;
              return <Button key={option.value} size="sm" variant={current ? "default" : "ghost"} aria-pressed={current} className="min-h-11 px-2.5 md:min-h-9" onClick={() => updateConsole({ state: option.value || undefined, selected: undefined, page: 1 }, false)}>{option.label}</Button>;
            })}
          </div>
          {(catalog.paged || draftPerformances.length > 0 || publishingDrafts) && <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="sm" variant="ghost" className="min-h-11 md:min-h-9" disabled={saving !== null || publicationCatalog.isFetching}>
              <PiDotsThreeBold aria-hidden="true" />{publicationCatalog.isFetching ? "게시 대상 확인 중" : "게시 옵션"}
            </Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void prepareBulkPublication()}>미게시 곡 모두 게시</DropdownMenuItem>
              <p className="max-w-56 px-2 py-1 text-xs text-muted-foreground">검색 조건과 관계없이 현재 영상 종류의 비공개 영상이 대상입니다.</p>
            </DropdownMenuContent>
          </DropdownMenu>}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t pt-3 [&>input]:h-11 md:[&>input]:h-9">
          <CatalogSearchInput value={consoleSearch.q ?? ""} onSearch={(q) => updateConsole({ q, page: 1 })} />
          <SelectField aria-label="카탈로그 영상 종류" className="min-h-11 md:min-h-9" value={scope} onValueChange={value => onScopeChange(value as typeof scope)} options={[{ value: "official", label: "공식 곡" }, { value: "broadcast", label: "노래 클립" }, { value: "all", label: "전체" }]} />
          <SelectField aria-label="곡 분류" className="min-h-11 md:min-h-9" value={consoleSearch.category ?? ""} onValueChange={(value) => updateConsole({ category: value, page: 1 })} options={[{ value: "", label: "모든 분류" }, ...[...new Set(catalog.availableTags ?? activeSongs.flatMap(song => song.tags ?? []))].sort().map(tag => ({ value: tag, label: tag }))]} />
          {(consoleSearch.q || consoleSearch.state || consoleSearch.category) && <Button variant="ghost" size="sm" onClick={() => updateConsole({ q: undefined, state: undefined, category: undefined, page: 1 })}>필터 초기화</Button>}
          <span role="status" className="text-sm tabular-nums text-muted-foreground sm:ml-auto">{activeSongs.length}곡 중 {filteredSongs.length}곡 · {visibleCount}곡 표시</span>
        </div>
      </div>
      {(draftView && visibleSongs.length > 0 || publishingDrafts) && <section aria-label="선택한 영상 게시" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold tabular-nums"><span role="status">{publishingDrafts ? saving : `영상 ${selectedDrafts.length}개 선택`}</span></h2>
          <p className="text-xs text-muted-foreground">{visibleDrafts.length ? "비공개 영상 중 공개할 항목을 체크하세요." : "현재 목록에 선택할 수 있는 비공개 영상이 없습니다."}</p>
        </div>
        {draftView && visibleDrafts.length > 0 && <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="min-h-11 md:min-h-9" disabled={saving !== null} onClick={() => setSelection({
            filter: filterKey, versions: allVisibleSelected ? {} : Object.fromEntries(visibleDrafts.map(item => [item.id, item.version])),
          })}>{allVisibleSelected ? "선택 해제" : "표시된 영상 선택"}</Button>
          <Button size="sm" className="min-h-11 md:min-h-9" disabled={saving !== null || !selectedDrafts.length} onClick={() => preparePublication(selectedDrafts, false)}><Upload aria-hidden="true" />선택 항목 게시</Button>
        </div>}
      </section>}
      {publicationCatalog.isError && <p role="alert" className="text-sm text-destructive">전체 게시 대상을 불러오지 못했습니다. 다시 시도해 주세요.</p>}
      {emptyBulkScope === scope && !publicationCatalog.isFetching && <p role="status" className="text-sm text-muted-foreground">현재 영상 종류에 게시할 수 있는 비공개 영상이 없습니다.</p>}
      {(activeSongs.length > 0 || consoleSearch.q || consoleSearch.state || consoleSearch.category) && filteredSongs.length === 0 && <p role="status" className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">조건에 맞는 곡이 없습니다. 검색어를 바꾸거나 필터를 초기화해 주세요.</p>}
      {activeSongs.length === 0 ? (consoleSearch.q || consoleSearch.state || consoleSearch.category ? null :
        <div className="rounded-xl border border-dashed p-3 text-center text-sm text-muted-foreground">
          연결된 가창이 있는 곡이 없습니다. 새 영상 등록에서 곡과 가창을 함께 만드세요.
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border lg:block">
            <Table aria-label="곡 카탈로그" className="w-full table-fixed">
              <TableHeader className="bg-muted/40"><TableRow><TableHead className="w-12"><span className="sr-only">{draftView ? "게시 선택" : "가창 상세"}</span></TableHead><TableHead>곡 / 가창</TableHead><TableHead className="w-32">게시 현황</TableHead><TableHead className="w-32">분류</TableHead><TableHead className="w-28 text-right">작업</TableHead></TableRow></TableHeader>
              <TableBody>
                {visibleSongs.flatMap((song) => {
                  const performances = filterPerformances(song.id);
                  const open = draftView || expanded.has(song.id);
                  const rows = [
                    <TableRow key={song.id} className={open ? "bg-muted/30" : undefined}>
                      <TableCell>{!draftView && <Button size="icon-sm" variant="ghost" aria-expanded={open} aria-controls={open ? `catalog-song-${song.id}` : undefined} aria-label={`${song.title} 가창 펼치기`} onClick={() => updateConsole({selected: open ? undefined : song.id}, false)}>{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</Button>}</TableCell>
                      <TableCell className="whitespace-normal"><div className="line-clamp-2 text-[15px] font-semibold leading-5 break-words" title={song.title}>{song.title}</div><div className="mt-1 text-[13px] leading-5 text-muted-foreground">{song.originalArtists.map((artist) => artist.displayName).join(", ") || "원곡 가수 미입력"}</div></TableCell>
                      <TableCell className="whitespace-normal"><PublicationSummary performances={performances} /></TableCell>
                      <TableCell className="whitespace-normal"><div className="text-[13px] text-muted-foreground">{song.isOtwOriginal ? "오리지널" : "커버 원곡"}</div><div className="mt-1 flex flex-wrap gap-1">{(song.tags?.length ?? 0) > 0 ? song.tags.map((tag) => <Badge variant="outline" key={tag}>{tag}</Badge>) : <span className="text-[13px] text-muted-foreground">미분류</span>}</div></TableCell>
                      <TableCell>{songActions(song)}</TableCell>
                    </TableRow>,
                  ];
                  if (open) rows.push(...performances.map((performance, index) => (
                    <TableRow key={performance.id} id={index === 0 ? `catalog-song-${song.id}` : undefined} aria-label={`${song.title} 가창 ${index + 1}`} className="bg-muted/15">
                      <TableCell className="text-center">{draftView ? publicationCheckbox(song, performance) : <><PiMicrophoneBold className="mx-auto size-4 text-muted-foreground" aria-hidden="true" /><span className="sr-only">가창</span></>}</TableCell>
                      <TableCell className="whitespace-normal"><div className="border-l-2 border-border pl-3"><div className="font-medium leading-5 break-words">{performance.participants.map((item) => item.displayName).join(", ") || "참여자 미입력"}</div><PerformanceSourceSummary catalog={catalog} performance={performance} /></div></TableCell>
                      <TableCell><PublicationBadge status={performance.publicationStatus} />{performance.publicationStatus === "draft" && performance.releaseType === "broadcast" && <div className="mt-1 whitespace-normal text-[13px] text-muted-foreground">{performance.broadcast?.extent ? "검수 완료" : "완곡 여부 확인 필요"}</div>}</TableCell>
                      <TableCell className="whitespace-normal"><div className="flex flex-wrap gap-x-2 gap-y-1 text-[13px] text-muted-foreground">{[relationLabel(performance.relationType), releaseLabel(performance.releaseType), participationLabel(performance.participationType)].map((label) => <span key={label} className="whitespace-nowrap">{label}</span>)}{performance.tags?.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}</div></TableCell>
                      <TableCell>{performanceActions(performance)}</TableCell>
                    </TableRow>
                  )));
                  return rows;
                })}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 lg:hidden">
            {visibleSongs.map((song) => {
              const performances = filterPerformances(song.id);
              const open = draftView || expanded.has(song.id);
              return <Card key={song.id} className="py-3.5"><CardContent className="space-y-2.5 px-3.5 py-0">
                <div className="text-[15px] font-semibold leading-5 break-words">{song.title}</div>
                <div className="text-sm text-muted-foreground">{song.originalArtists.map((artist) => artist.displayName).join(", ") || "원곡 가수 미입력"}</div>
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground"><span>{song.isOtwOriginal ? "오리지널" : "커버 원곡"}</span>{song.tags?.map((tag) => <Badge variant="outline" key={tag}>{tag}</Badge>)}</div>
                <PublicationSummary performances={performances} />
                <div className={`flex items-center gap-2 ${draftView ? "justify-end" : "justify-between"}`}>{!draftView && <Button size="sm" variant="outline" className="min-h-11" aria-expanded={open} aria-controls={open ? `catalog-mobile-${song.id}` : undefined} onClick={() => updateConsole({ selected: open ? undefined : song.id }, false)}>{open ? "가창 접기" : "가창 보기"}</Button>}{songActions(song)}</div>
                {open && <div id={`catalog-mobile-${song.id}`} className="space-y-2">
                  {performances.map((performance) => <div key={performance.id} className="border-t pt-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1">{publicationCheckbox(song, performance)}<span className="min-w-0 font-medium wrap-anywhere">{performance.participants.map((item) => item.displayName).join(", ") || "참여자 미입력"}</span></div>
                      <PublicationBadge status={performance.publicationStatus} />
                    </div>
                    <div className="mt-1 text-[13px] text-muted-foreground">{relationLabel(performance.relationType)} · {releaseLabel(performance.releaseType)} · {participationLabel(performance.participationType)}</div>
                    {performance.publicationStatus === "draft" && performance.releaseType === "broadcast" && <div className="text-[13px] text-muted-foreground">{performance.broadcast?.extent ? "검수 완료" : "완곡 여부 확인 필요"}</div>}
                    {(performance.tags?.length ?? 0) > 0 && <div className="mt-1 flex flex-wrap gap-1">{performance.tags?.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div>}
                    <PerformanceSourceSummary catalog={catalog} performance={performance} />
                    <div className="mt-1">{performanceActions(performance)}</div>
                  </div>)}
                </div>}
              </CardContent></Card>;
            })}
          </div>
        </>
      )}
      {filteredSongs.length > 0 && (
        <div ref={setLoadMoreTarget} className="flex justify-center py-4">
          {hasMore ? (
            <Button variant="ghost" onClick={showMore}>곡 더 보기</Button>
          ) : (
            <p role="status" className="text-xs text-muted-foreground">모든 곡을 표시했습니다.</p>
          )}
        </div>
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
  const requestIdentity=useRef<{body:string;id:string}|null>(null);
  const save=async()=>{
    if(!song) return;
    const input={id:song.id,expectedVersion:song.version,slug:song.slug,title:title.trim(),isOtwOriginal:original,originalReleaseDate:song.originalReleaseDate,originalReleasePrecision:song.originalReleasePrecision,aliases:song.aliases.map(alias=>({alias:alias.alias,locale:alias.locale,aliasKind:alias.aliasKind})),originalArtists:artists.map((artist,index)=>({subject:artist.subject,creditOrder:index,isPrimary:index===0})),tags};
    const body=JSON.stringify(input);
    if(requestIdentity.current?.body!==body) requestIdentity.current={body,id:crypto.randomUUID()};
    const ok=await run("곡 정보 수정",()=>updateOtwPlaySong(input,requestIdentity.current!.id));
    if(ok) {requestIdentity.current=null;onOpenChange(false);}
  };
  const close = async (open: boolean) => { if (open || await canDiscard()) onOpenChange(open); };
  const open = song !== null;
  return <Dialog open={open} onOpenChange={(open) => void close(open)}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>곡 정보 수정</DialogTitle><DialogDescription>곡명, 원곡 가수와 태그를 수정합니다.</DialogDescription></DialogHeader>{song && <div className="space-y-3"><div className="space-y-1.5"><Label htmlFor="edit-song-title">곡명</Label><Input id="edit-song-title" value={title} onChange={(event) => setTitle(event.target.value)} /></div><SongTagPicker tags={tags} onChange={setTags} /><SubjectPicker remote={catalog.paged} label="원곡 가수" placeholder="멤버 또는 기존 원곡 가수 검색" helpText="기존 가수를 선택하거나 새 외부 인물·그룹을 칩으로 추가할 수 있습니다. 첫 번째 가수를 대표 원곡 가수로 저장합니다." members={members} entities={catalog.entities} selected={artists} onChange={setArtists} /><label className="flex items-center gap-2 text-sm"><Checkbox checked={original} onCheckedChange={(checked) => setOriginal(checked === true)} /> OTW 오리지널곡</label></div>}<DialogFooter><Button variant="outline" onClick={() => void close(false)}>취소</Button><Button disabled={!title.trim() || artists.length === 0} onClick={() => void save()}>저장</Button></DialogFooter></DialogContent></Dialog>;
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
  const initializedPerformance = useRef<OtwPlayAdminPerformanceDto | null>(null);
  const saveRequests=useRef(new Map<string,string>());
  const [sameSingingConfirmed, setSameSingingConfirmed] = useState(false);
  const [broadcast, setBroadcast] = useState(EMPTY_BROADCAST);
  const [channelSearch,setChannelSearch]=useState("");
  const channelQuery = useOtwPlayAdminCatalogLookup("channels", channelSearch, Boolean(performance && catalog.paged));
  const availableChannels = mergeAdminCatalogRows(catalog.channels, channelQuery.data?.channels);
  const [songSearch,setSongSearch]=useState("");
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
    if (!performance) { initializedPerformance.current = null; return; }
    if (initializedPerformance.current === performance) return;
    initializedPerformance.current = performance;
    setSameSingingConfirmed(false);
    setBroadcast(performance.broadcast ?? EMPTY_BROADCAST);
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
    validSources && (releaseType !== "broadcast" || !sources.some(source => source.key.startsWith("new-")) || sameSingingConfirmed);

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
    JSON.stringify(broadcast) !== JSON.stringify(performance.broadcast ?? EMPTY_BROADCAST) ||
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
          <div className="space-y-3">
            {catalog.performances.find(item => item.id === performance.id)?.version !== performance.version && <p role="status" className="rounded-lg border border-amber-500 p-3 text-sm">다른 수정이 먼저 저장되었습니다. 입력값은 유지하고 있습니다. 변경 내용을 확인한 뒤 이 창을 닫고 최신 가창을 다시 열어 주세요.</p>}
            <p className="text-sm text-muted-foreground">
              게시 상태 변경은 목록의 게시·철회 작업을 사용합니다. 이 화면에서는
              연결된 곡, 참여자와 source를 포함한 가창 정보를 수정합니다.
            </p>
            <section className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>연결된 곡</Label>
                {catalog.paged?<SongConnectionPicker inputKey="performance-edit" catalog={catalog} selectedSongId={songId} query={songSearch} onQueryChange={setSongSearch} onSelectExisting={(id,title)=>{setSongId(id);setSongSearch(title);}} />:<Select value={songId} onValueChange={setSongId}><SelectTrigger aria-label="연결된 곡"><SelectValue /></SelectTrigger><SelectContent>{catalog.songs.filter(s=>s.archivedAt===null).map(song=><SelectItem key={song.id} value={song.id}>{song.title}</SelectItem>)}</SelectContent></Select>}
              </div>
              <div className="space-y-1.5">
                <Label>곡 관계</Label>
                {releaseType === "broadcast" ? <p className="text-sm font-medium">노래 클립</p> : <Select
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
                </Select>}
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
                    {performance.releaseType === "broadcast" ? <SelectItem value="broadcast">노래 클립</SelectItem> : <><SelectItem value="official_video">공식 영상</SelectItem><SelectItem value="official_mv">공식 MV</SelectItem></>}
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
              {catalog.paged&&<><Input aria-label="영상 채널 검색" placeholder="영상 채널 검색" value={channelSearch} onChange={e=>setChannelSearch(e.target.value)} />{channelQuery.hasNextPage&&<Button type="button" variant="outline" disabled={channelQuery.isFetchingNextPage} onClick={()=>void channelQuery.fetchNextPage()}>채널 더 보기</Button>}{channelQuery.isError&&<p role="alert">채널 검색에 실패했습니다.</p>}</>}
              <SubjectPicker
                remote={catalog.paged}
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

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">영상 source</h3>
                  <p className="text-xs text-muted-foreground">
                    위에서부터 재생 우선순위가 적용되며 대표 영상은 정확히 하나여야 합니다. 방송 클립은 같은 방송의 같은 가창을 편집한 영상만 추가하세요. 다른 방송에서 부른 노래는 새 가창으로 등록합니다.
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
              {releaseType === "broadcast" && sources.some(source => source.key.startsWith("new-")) && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={sameSingingConfirmed} onChange={event => setSameSingingConfirmed(event.target.checked)} />추가하는 영상이 같은 방송의 같은 가창임을 확인했습니다.</label>}
              {sources.map((source, index) => (
                <div key={source.key} className="space-y-3 rounded-xl border p-3">
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
                        <SelectContent>{availableChannels.filter(channel => releaseType === "broadcast" ? channel.channelRole === "approved_kirinuki" : channel.channelRole !== "approved_kirinuki").map((channel) => (
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
                        <SelectContent>{releaseType === "broadcast" ? <SelectItem value="kirinuki">노래 클립 영상</SelectItem> : <><SelectItem value="official">공식 영상</SelectItem><SelectItem value="alternate">대체 영상</SelectItem></>}</SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
              <div className="grid gap-3 sm:grid-cols-2">
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
        {releaseType === "broadcast" && <BroadcastFields value={broadcast} onChange={setBroadcast} />}
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
              const command:OtwPlayAdminUpdatePerformanceRequest={
                  id: performance.id,
                  expectedVersion: performance.version,
                  songId,
                  ...(releaseType === "broadcast" ? { broadcast } : {}),
                  relationType: releaseType === "broadcast" ? "singing_clip" : relation,
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
                };
              const key=JSON.stringify(command),requestId=saveRequests.current.get(key)??crypto.randomUUID();
              saveRequests.current.set(key,requestId);
              void run("가창 정보 수정", () => updateOtwPlayPerformance(command,requestId)).then((ok) => ok && onOpenChange(false));
            }}
          >
            전체 정보 저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
