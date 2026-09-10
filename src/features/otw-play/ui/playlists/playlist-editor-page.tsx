import { motion, Reorder, useDragControls, useReducedMotion } from "motion/react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowUp, GripVertical, Star, X } from "lucide-react";
import { PLAY_PLAYLIST_MAX_ITEMS, type PlayPlaylist, type PlayPlaylistWrite } from "@contracts/otw-play-playlists";
import type { OtwPlayPublicPerformanceResponseDto } from "@contracts/otw-play";
import { resolveSiteSeo } from "@contracts/site-seo";
import { useSiteSeo } from "@/shared/seo/use-site-seo";
import { useUnsavedChanges } from "@/shared/lib/unsaved-changes";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { ApiError } from "@/shared/api/client";
import { createMyPlaylist, fetchMyPlaylist, saveMyPlaylist } from "../../api/playlists";
import { collectPlaylist } from "../../use-cases/resolve-playlist";
import { usePublicRequestOptions, useOtwPlayMembers } from "../../queries/use-public-catalog";
import { useMyPlaylist, usePlaylistDefaults, usePlaylistOwner, usePlaylistPerformances } from "../../queries/use-playlists";
import { performanceArtwork } from "../../model/playlist-artwork";
import { PlaylistArtworkPreview } from "./playlist-artwork-preview";
import { PerformanceRow, PlaylistLoginGate } from "./playlist-components";

export function OtwPlayPlaylistEditorPage({ playlistId, from }: { playlistId?: string; from?: string }) {
  const seo = useMemo(() => ({ ...resolveSiteSeo(playlistId ? `/play/playlists/${playlistId}/edit` : "/play/playlists/new"), title: "플레이리스트 편집 | OTW Play" }), [playlistId]);
  useSiteSeo(seo);
  return <PlaylistLoginGate className="playlist-editor-root"><EditorLoader key={playlistId ?? from ?? "new"} playlistId={playlistId} from={from} /></PlaylistLoginGate>;
}
function EditorLoader({ playlistId, from }: { playlistId?: string; from?: string }) {
  const saved = useMyPlaylist(playlistId), defaults = usePlaylistDefaults(), request = usePublicRequestOptions(), owner = usePlaylistOwner();
  const template = defaults.data?.data.items.find(item => item.id === from);
  const prepared = useQuery({ queryKey: ["otw-play-private", owner, request.audience, "editor", playlistId, from],
    queryFn: ({ signal }) => collectPlaylist(saved.data?.data.performanceIds ?? template?.query ?? [], { ...request, signal }),
    enabled: playlistId ? Boolean(saved.data) : from ? Boolean(template) : true });
  if (((playlistId && saved.isError && !saved.data) || (!prepared.data && ((playlistId && saved.isError) || (from && defaults.isError) || prepared.isError)))) return <div className="playlist-page"><p role="alert">편집할 목록을 불러오지 못했습니다.</p>
    <Button onClick={() => { void saved.refetch(); void defaults.refetch(); void prepared.refetch(); }}>다시 시도</Button></div>;
  if (from && defaults.isSuccess && !template) return <p className="playlist-empty">기본 목록을 찾을 수 없습니다.</p>;
  if ((playlistId && !saved.data) || !prepared.data) return <p className="playlist-empty" role="status">전체 가창 목록을 준비하고 있습니다…</p>;
  const initial: PlayPlaylistWrite = saved.data?.data ?? { title: template ? `${template.title} — 내 목록` : "새 플레이리스트", description: "",
    representativePerformanceId: template?.representativePerformanceId && prepared.data.items.some(item => item.performance.id === template.representativePerformanceId) ? template.representativePerformanceId : null,
    originDefaultId: template?.id ?? null, performanceIds: prepared.data.items.map(item => item.performance.id) };
  return <PlaylistEditor initial={initial} saved={saved.data?.data} tracks={prepared.data.items} />;
}
function PlaylistEditor({ initial, saved, tracks }: { initial: PlayPlaylistWrite; saved?: PlayPlaylist; tracks: OtwPlayPublicPerformanceResponseDto[] }) {
  const [draft, setDraft] = useState<PlayPlaylistWrite>(initial);
  const [baseline, setBaseline] = useState(JSON.stringify(initial));
  const [persisted, setPersisted] = useState(saved);
  const [trackMap, setTrackMap] = useState(() => new Map(tracks.map(item => [item.performance.id, item])));
  const [q, setQ] = useState(""), [search, setSearch] = useState("");
  const [member, setMember] = useState(""), [relation, setRelation] = useState<"" | "original" | "cover">("");
  const [tab, setTab] = useState("search"), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const representative = trackMap.get(draft.representativePerformanceId ?? "");
  const automatic = draft.performanceIds.map(id => trackMap.get(id)).find(item => performanceArtwork(item));
  const artwork = performanceArtwork(representative) ?? performanceArtwork(automatic);
  const dirty = JSON.stringify(draft) !== baseline;
  const discard = useUnsavedChanges(dirty);
  const requestId = useRef(crypto.randomUUID());
  const pendingCreate = useRef<PlayPlaylistWrite | null>(null);
  const [dragging, setDragging] = useState(false);
  const request = usePublicRequestOptions(), client = useQueryClient(), members = useOtwPlayMembers();
  const listing = usePlaylistPerformances({ q: search || undefined, member: member ? Number(member) : undefined, relation: relation || undefined });
  const add = (item: OtwPlayPublicPerformanceResponseDto) => {
    setTrackMap(current => new Map(current).set(item.performance.id, item));
    setDraft(current => current.performanceIds.length >= PLAY_PLAYLIST_MAX_ITEMS || current.performanceIds.includes(item.performance.id) ? current : { ...current, performanceIds: [...current.performanceIds, item.performance.id] });
  };
  const move = (id: string, target: number) => setDraft(current => {
    const next = [...current.performanceIds], index = next.indexOf(id);
    if (index < 0 || target < 0 || target >= next.length) return current;
    next.splice(index, 1); next.splice(target, 0, id); return { ...current, performanceIds: next };
  });
  const save = async () => {
    if (draft.performanceIds.length > PLAY_PLAYLIST_MAX_ITEMS) return;
    setBusy(true); setMessage("");
    const recoveringCreate = pendingCreate.current !== null;
    try {
      let response;
      if (persisted) {
        response = await saveMyPlaylist(persisted.id, draft, persisted.version, request);
      } else {
        // Replay the original payload after an uncertain response before saving later edits.
        const submitted = pendingCreate.current ?? { ...draft, performanceIds: [...draft.performanceIds] };
        pendingCreate.current = submitted;
        response = await createMyPlaylist(submitted, requestId.current, request);
        setPersisted(response.data);
        pendingCreate.current = null;
        if (JSON.stringify(submitted) !== JSON.stringify(draft)) {
          response = await saveMyPlaylist(response.data.id, draft, 0, request);
        }
      }
      setPersisted(response.data);
      const readback = await fetchMyPlaylist(response.data.id, request);
      const next: PlayPlaylistWrite = { title: readback.data.title, description: readback.data.description, representativePerformanceId: readback.data.representativePerformanceId, originDefaultId: readback.data.originDefaultId, performanceIds: readback.data.performanceIds };
      setPersisted(readback.data); setDraft(next); setBaseline(JSON.stringify(next));
      await client.invalidateQueries({ queryKey: ["otw-play-private"] }); setMessage("저장했습니다.");
    } catch (error) {
      if (!recoveringCreate && error instanceof ApiError && error.status >= 400 && error.status < 500) {
        pendingCreate.current = null;
      }
      setMessage(error instanceof ApiError && error.status === 409 ? "목록이 다른 곳에서 변경되었습니다. 입력은 유지됩니다. 서버 목록을 다시 불러오거나 현재 내용을 확인해 주세요." : "저장하지 못했습니다. 입력을 유지했으니 다시 시도해 주세요.");
    } finally { setBusy(false); }
  };
  const reload = async () => {
    if (!persisted || !await discard()) return;
    setBusy(true);
    try {
      const response = await fetchMyPlaylist(persisted.id, request);
      const resolved = await collectPlaylist(response.data.performanceIds, request);
      const next: PlayPlaylistWrite = { title: response.data.title, description: response.data.description, representativePerformanceId: response.data.representativePerformanceId, originDefaultId: response.data.originDefaultId, performanceIds: response.data.performanceIds };
      setPersisted(response.data); setDraft(next); setBaseline(JSON.stringify(next)); setTrackMap(new Map(resolved.items.map(item => [item.performance.id, item]))); setMessage("서버 목록을 불러왔습니다.");
    } catch { setMessage("서버 목록을 불러오지 못했습니다."); } finally { setBusy(false); }
  };
  return <div className="playlist-editor"><div className="playlist-editor-toolbar">
    <header className="playlist-editor-header">
      <Button asChild variant="ghost" size="icon" className="shrink-0">{persisted
        ? <Link to="/play/playlists/$playlistId" params={{ playlistId: persisted.id }} aria-label="뒤로 가기" title="뒤로 가기"><ArrowLeft /></Link>
        : <Link to="/play/playlists" aria-label="뒤로 가기" title="뒤로 가기"><ArrowLeft /></Link>}</Button>
      <h1>플레이리스트 편집</h1>
      <span className="playlist-editor-private">비공개</span>
      <Button size="sm" className="ml-auto shrink-0" disabled={busy || dragging || !draft.title.trim() || draft.performanceIds.length > PLAY_PLAYLIST_MAX_ITEMS} onClick={() => void save()}>{busy ? "저장 확인 중…" : "저장"}</Button>
    </header>
    {draft.performanceIds.length >= PLAY_PLAYLIST_MAX_ITEMS && <p role="note" className="text-xs text-muted-foreground">개인 목록은 최대 {PLAY_PLAYLIST_MAX_ITEMS.toLocaleString()}개 가창까지 저장할 수 있습니다.{draft.performanceIds.length > PLAY_PLAYLIST_MAX_ITEMS && " 항목을 제거한 뒤 저장해 주세요."}</p>}
    <div className={message || dirty ? "playlist-editor-status" : "sr-only"}>
      <p role="status">{message || (dirty ? "저장하지 않은 변경사항이 있습니다." : "")}</p>
      {message && persisted && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void reload()}>서버 목록 다시 불러오기</Button>}
    </div>
    <div className="playlist-editor-tabs"><Button variant={tab === "search" ? "default" : "ghost"} onClick={() => setTab("search")}>곡 찾기</Button><Button variant={tab === "list" ? "default" : "ghost"} onClick={() => setTab("list")}>편집 목록 ({draft.performanceIds.length})</Button></div>
    </div>
    <div className="playlist-editor-columns" aria-busy={busy}>
      <section className="playlist-editor-search" aria-label="카탈로그에서 찾기" tabIndex={0} data-active={tab === "search"}><h2 className="text-lg font-semibold">카탈로그에서 찾기</h2>
        <form onSubmit={event => { event.preventDefault(); setSearch(q.trim()); }} className="flex gap-2"><Input aria-label="플레이리스트 곡 검색" value={q} maxLength={80} onChange={event => setQ(event.target.value)} placeholder="곡명 · 원곡 가수 · 참여자" /><Button type="submit">검색</Button></form>
        <div className="flex flex-wrap gap-2"><label>멤버 <select value={member} onChange={event => setMember(event.target.value)}><option value="">전체 멤버</option>{members.data?.data.members.map(item => <option key={item.uid} value={item.uid}>{item.name}</option>)}</select></label>
          <label>분류 <select value={relation} onChange={event => setRelation(event.target.value as typeof relation)}><option value="">전체</option><option value="original">오리지널</option><option value="cover">커버</option></select></label></div>
        {listing.isPending ? <p role="status">검색 중…</p> : listing.isError ? <Button onClick={() => void listing.refetch()}>검색 다시 시도</Button> : <div className="playlist-editor-results">{listing.data.pages.flatMap(page => page.data.items).map(item =>
          <PerformanceRow key={item.performance.id} item={item} compact><Button size="sm" variant="outline" disabled={busy || draft.performanceIds.length >= PLAY_PLAYLIST_MAX_ITEMS || draft.performanceIds.includes(item.performance.id)} onClick={() => add(item)}>{draft.performanceIds.includes(item.performance.id) ? "추가됨" : "추가"}</Button></PerformanceRow>)}</div>}
        {listing.isSuccess && !listing.data.pages[0].data.items.length && <p className="playlist-empty">검색 결과가 없습니다.</p>}
        {listing.hasNextPage && <Button disabled={listing.isFetching} onClick={() => void listing.fetchNextPage()}>더 보기</Button>}
      </section>
      <motion.section layoutScroll className="playlist-editor-list" aria-label="현재 플레이리스트" tabIndex={0} data-active={tab === "list"}><h2 className="text-lg font-semibold">현재 플레이리스트 · {draft.performanceIds.length}개 가창</h2>
        <label className="grid gap-1">제목<Input value={draft.title} maxLength={120} disabled={busy} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
        <label className="grid gap-1">설명<textarea className="rounded-md border bg-background p-2" value={draft.description} maxLength={2000} disabled={busy} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
        <PlaylistArtworkPreview item={performanceArtwork(representative) ? representative : automatic} imageUrl={artwork}
          unavailable={Boolean(draft.representativePerformanceId && !performanceArtwork(representative))}>
        {draft.representativePerformanceId && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDraft(current => ({ ...current, representativePerformanceId: null }))}>자동 이미지 사용</Button>}
        </PlaylistArtworkPreview>
        <Reorder.Group as="ol" axis="y" values={draft.performanceIds} onReorder={performanceIds => {
          if (!busy) setDraft(current => ({ ...current, performanceIds }));
        }}>{draft.performanceIds.map((id, index) => { const item = trackMap.get(id); return <PlaylistReorderItem key={id} id={id} index={index} disabled={busy} onDraggingChange={setDragging}>
          {handle => <>
          <div className="playlist-edit-item-info">{handle}<span className="shrink-0 text-xs tabular-nums text-muted-foreground">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={item?.song.title}>{draft.representativePerformanceId === id && <span className="mr-1 text-xs text-primary">대표곡</span>}{item?.song.title ?? "이용할 수 없는 항목"}</p>
            {item && <p className="truncate text-xs text-muted-foreground" title={item.performance.participants.map(p => p.displayName).join(" · ")}>{item.performance.participants.map(p => p.displayName).join(" · ")} · {item.performance.releasedAt?.slice(0, 10)}</p>}</div></div>
          <div className="playlist-edit-item-actions"><Button size="icon-sm" variant="ghost" title={draft.representativePerformanceId === id ? "대표곡" : "대표곡 지정"}
            aria-label={`${index + 1}번 대표곡 지정`} aria-pressed={draft.representativePerformanceId === id}
            disabled={busy || !performanceArtwork(item)} onClick={() => setDraft(current => ({ ...current, representativePerformanceId: id }))}>
              <Star className={draft.representativePerformanceId === id ? "fill-current text-primary" : ""} /><span className="sr-only">{draft.representativePerformanceId === id ? "대표곡" : "대표곡 지정"}</span></Button><Button size="icon-sm" variant="ghost" aria-label={`${index + 1}번 위로 이동`} disabled={busy || index === 0} onClick={() => move(id, index - 1)}><ArrowUp /></Button>
            <Button size="icon-sm" variant="ghost" aria-label={`${index + 1}번 아래로 이동`} disabled={busy || index === draft.performanceIds.length - 1} onClick={() => move(id, index + 1)}><ArrowDown /></Button>
            <Button size="icon-sm" variant="ghost" aria-label={`${index + 1}번 삭제`} disabled={busy} onClick={() => setDraft(current => ({ ...current, representativePerformanceId: current.representativePerformanceId === id ? null : current.representativePerformanceId, performanceIds: current.performanceIds.filter(value => value !== id) }))}><X /></Button></div></>}
        </PlaylistReorderItem>; })}</Reorder.Group>
        {!draft.performanceIds.length && <p className="playlist-empty">왼쪽에서 노래를 찾아 추가해 주세요.</p>}
      </motion.section>
    </div>
  </div>;
}

function PlaylistReorderItem({ id, index, disabled, onDraggingChange, children }: {
  id: string; index: number; disabled: boolean; onDraggingChange: (dragging: boolean) => void;
  children: (handle: ReactNode) => ReactNode;
}) {
  const controls = useDragControls();
  const reducedMotion = useReducedMotion();
  return <Reorder.Item value={id} className="playlist-edit-item" dragListener={false} dragControls={controls}
    dragMomentum={false} transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 450, damping: 35 }}
    whileDrag={{ backgroundColor: "var(--card)", boxShadow: "0 4px 16px rgb(0 0 0 / 14%)" }}
    onDragStart={() => onDraggingChange(true)} onDragEnd={() => onDraggingChange(false)}>
    {children(<Button type="button" variant="ghost" size="icon-sm" className="playlist-drag-handle"
      disabled={disabled} aria-label={`${index + 1}번 순서 드래그`} title="드래그해서 순서 변경 · 키보드는 위/아래 이동 버튼 사용"
      onPointerDown={event => { if (!disabled) controls.start(event); }}><GripVertical /></Button>)}
  </Reorder.Item>;
}
