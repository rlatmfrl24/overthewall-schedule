import { Link } from "@tanstack/react-router";
import { useUser } from "@clerk/clerk-react";
import { Button } from "@/shared/ui/button";
import { useMyPlaylists, usePlaylistDefaults } from "../../queries/use-playlists";
import { DefaultPlaylistCard } from "./playlist-components";

export function OtwPlayPlaylistsPage() {
  const defaults = usePlaylistDefaults();
  const mine = useMyPlaylists(), { isSignedIn } = useUser();
  return <div className="playlist-page"><header className="playlist-heading"><div><p>골라 듣는 즐거움</p><h1>플레이리스트</h1></div>
    <Button asChild><Link to="/play/playlists/new" search={{}}>새 플레이리스트</Link></Button></header>
    {defaults.isPending ? <p role="status">플레이리스트 불러오는 중…</p> : defaults.isError ? <div role="alert">기본 목록을 불러오지 못했습니다. <Button onClick={() => void defaults.refetch()}>다시 시도</Button></div> :
      <div className="playlist-grid">{defaults.data.data.items.map(playlist => <DefaultPlaylistCard key={playlist.id} playlist={playlist} />)}</div>}
    <section className="space-y-4"><h2 className="text-xl font-semibold">내 플레이리스트</h2>
      {!isSignedIn ? <p className="text-muted-foreground">로그인하고 나만의 목록을 만들어 보세요.</p> : mine.isPending ? <p role="status">내 목록 불러오는 중…</p> : mine.isError ? <Button onClick={() => void mine.refetch()}>내 목록 다시 불러오기</Button> :
        mine.data.data.length ? <div className="playlist-grid">{mine.data.data.map(playlist => <Link className="playlist-saved-card playlist-card-main" key={playlist.id} to="/play/playlists/$playlistId" params={{ playlistId: playlist.id }}>
          <div className="playlist-art"><img src="/images/otw-play/glass-note.png" alt="" loading="lazy" /></div>
          <div className="playlist-card-copy"><span className="playlist-card-kicker">MY PLAYLIST</span>
            <div className="playlist-card-title"><h3>{playlist.title}</h3><p className="line-clamp-2">{playlist.description || "나만의 노래 모음"}</p></div>
            <div className="playlist-card-footer"><span>가창 {playlist.itemCount}개 · 비공개</span><span>목록 보기</span></div></div></Link>)}</div> : <p className="playlist-empty">아직 저장한 플레이리스트가 없습니다.</p>}
    </section>
  </div>;
}

export function OtwPlayPlaylistDiscovery() {
  const query = usePlaylistDefaults();
  return <section className="playlist-discovery"><header className="flex items-center justify-between"><h2 className="text-xl font-semibold">플레이리스트</h2><Link to="/play/playlists">전체 보기</Link></header>
    {query.isPending ? <p role="status">플레이리스트 불러오는 중…</p> : query.isError ? <Button variant="ghost" onClick={() => void query.refetch()}>플레이리스트 다시 불러오기</Button> :
      <div className="playlist-discovery-grid">{query.data.data.items.map(playlist => <DefaultPlaylistCard key={playlist.id} playlist={playlist} />)}</div>}
  </section>;
}
