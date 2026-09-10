import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { resolveSiteSeo } from "@contracts/site-seo";
import { useSiteSeo } from "@/shared/seo/use-site-seo";
import { useConfirmation } from "@/shared/lib/confirmation";
import { Button } from "@/shared/ui/button";
import { deleteMyPlaylist } from "../../api/playlists";
import { usePublicRequestOptions } from "../../queries/use-public-catalog";
import { useMyPlaylist, usePlaylistActions, usePlaylistDefaults, usePlaylistPerformances, useResolvedPlaylist } from "../../queries/use-playlists";
import { PerformanceRow, PlaylistFeedback, PlaylistLoginGate } from "./playlist-components";

function PlaylistBackButton() {
  return <Button asChild variant="ghost" size="sm" className="w-fit -ml-2"><Link to="/play/playlists"><ArrowLeft />플레이리스트로 돌아가기</Link></Button>;
}

export function OtwPlayDefaultPlaylistPage({ playlistKey }: { playlistKey: string }) {
  const defaults = usePlaylistDefaults();
  const playlist = defaults.data?.data.items.find(item => item.id === playlistKey);
  const listing = usePlaylistPerformances(playlist?.query ?? {}, Boolean(playlist));
  const actions = usePlaylistActions();
  if (!playlist) return <div className="playlist-page"><p>{defaults.isPending ? "목록 불러오는 중…" : defaults.isError ? "목록을 불러오지 못했습니다." : "플레이리스트를 찾을 수 없습니다."}</p>
    {defaults.isError && <Button onClick={() => void defaults.refetch()}>다시 시도</Button>}<PlaylistBackButton /></div>;
  return <div className="playlist-page playlist-detail"><PlaylistBackButton /><header className="playlist-heading"><img className="h-16 w-24 shrink-0 rounded object-cover" src={playlist.imageUrl || "/images/otw-play/glass-note.png"} alt="" onError={event => { if (!event.currentTarget.src.endsWith("/images/otw-play/glass-note.png")) event.currentTarget.src = "/images/otw-play/glass-note.png"; }} /><div><p>기본 플레이리스트</p><h1>{playlist.title}</h1><p>{playlist.description}</p>
    <p>{playlist.songCount}곡 · 가창 {playlist.performanceCount}개 · 최신순</p></div><div className="flex flex-wrap gap-2">
      <Button disabled={actions.pending.includes(playlist.id)} onClick={() => actions.add(playlist.id, playlist.query, true)}>전체 대기열에 추가</Button>
      <Button variant="outline" asChild><Link to="/play/playlists/new" search={{ from: playlist.id }}>내 목록으로 편집</Link></Button></div></header>
    <PlaylistFeedback actions={actions} />
    {listing.isPending ? <p role="status">가창 불러오는 중…</p> : listing.isError ? <Button onClick={() => void listing.refetch()}>가창 목록 다시 불러오기</Button> :
      <div>{listing.data.pages.flatMap(page => page.data.items).map(item => <PerformanceRow key={item.performance.id} item={item} />)}
        {!listing.data.pages[0].data.items.length && <p className="playlist-empty">아직 공개된 가창이 없습니다.</p>}</div>}
    {listing.hasNextPage && <Button variant="outline" disabled={listing.isFetching} onClick={() => void listing.fetchNextPage()}>더 보기</Button>}
  </div>;
}

export function OtwPlayPersonalPlaylistPage({ playlistId }: { playlistId: string }) {
  const seo = useMemo(() => ({ ...resolveSiteSeo(`/play/playlists/${playlistId}`), title: "내 플레이리스트 | OTW Play" }), [playlistId]);
  useSiteSeo(seo);
  return <PlaylistLoginGate><PersonalPlaylist playlistId={playlistId} /></PlaylistLoginGate>;
}
function PersonalPlaylist({ playlistId }: { playlistId: string }) {
  const saved = useMyPlaylist(playlistId), resolved = useResolvedPlaylist(saved.data?.data.performanceIds);
  const actions = usePlaylistActions(), confirm = useConfirmation(), request = usePublicRequestOptions();
  const client = useQueryClient(), navigate = useNavigate();
  const [error, setError] = useState(""), [deleting, setDeleting] = useState(false);
  const playlist = saved.data?.data;
  const remove = async () => {
    if (!playlist || !await confirm({ title: "플레이리스트 삭제", description: "이 개인 목록을 삭제할까요? 카탈로그의 노래는 유지됩니다.", destructive: true })) return;
    setDeleting(true);
    try { await deleteMyPlaylist(playlist.id, playlist.version, request); await client.invalidateQueries({ queryKey: ["otw-play-private"] }); await navigate({ to: "/play/playlists" }); }
    catch { setError("삭제하지 못했습니다. 목록이 다른 곳에서 변경되었는지 확인해 주세요."); }
    finally { setDeleting(false); }
  };
  if (!playlist) return <div className="playlist-page"><p>{saved.isPending ? "내 목록 불러오는 중…" : "목록을 찾을 수 없거나 접근할 수 없습니다."}</p>{saved.isError && <Button onClick={() => void saved.refetch()}>다시 시도</Button>}<PlaylistBackButton /></div>;
  const byId = new Map(resolved.data?.items.map(item => [item.performance.id, item]));
  return <div className="playlist-page playlist-detail"><PlaylistBackButton /><header className="playlist-heading"><img className="h-16 w-24 shrink-0 rounded object-cover" src={playlist.imageUrl || "/images/otw-play/glass-note.png"} alt="" onError={event => { if (!event.currentTarget.src.endsWith("/images/otw-play/glass-note.png")) event.currentTarget.src = "/images/otw-play/glass-note.png"; }} /><div><p>나만 볼 수 있는 플레이리스트</p><h1>{playlist.title}</h1><p>{playlist.description}</p><p>가창 {playlist.itemCount}개</p></div>
    <div className="flex flex-wrap gap-2"><Button disabled={actions.pending.includes(playlist.id)} onClick={() => actions.add(playlist.id, playlist.performanceIds, true)}>대기열에 추가</Button>
      <Button asChild variant="outline"><Link to="/play/playlists/$playlistId/edit" params={{ playlistId }}>편집</Link></Button>
      <Button variant="ghost" disabled={deleting} onClick={() => void remove()}>삭제</Button></div></header>
    {error && <p role="alert">{error}</p>}<PlaylistFeedback actions={actions} />
    {resolved.isPending ? <p role="status">가창 확인 중…</p> : resolved.isError ? <Button onClick={() => void resolved.refetch()}>가창 다시 불러오기</Button> :
      <div>{playlist.performanceIds.map((id, index) => { const item = byId.get(id); return item ? <PerformanceRow key={id} item={item} /> : <p key={id} className="playlist-track">{index + 1}. 이용할 수 없는 항목</p>; })}</div>}
    {!playlist.itemCount && <p className="playlist-empty">편집 화면에서 노래를 추가해 보세요.</p>}
  </div>;
}
