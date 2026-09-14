import type { ReactNode } from "react";
import { SignInButton, useUser } from "@clerk/clerk-react";
import { Link } from "@tanstack/react-router";
import { Music2, ArrowUpRight } from "lucide-react";
import type { PlayDefaultPlaylist } from "@contracts/otw-play-playlists";
import type { OtwPlayPublicPerformanceResponseDto } from "@contracts/otw-play";
import { Button } from "@/shared/ui/button";
import { useOtwPlayPlayer } from "../../player/play-player-context";
import type { usePlaylistActions } from "../../queries/use-playlists";
import "./playlists.css";

export function PlaylistLoginGate({ children, className }: { children: ReactNode; className?: string }) {
  const { isLoaded, isSignedIn, user } = useUser();
  if (!isLoaded) return <p role="status">로그인 확인 중…</p>;
  if (!isSignedIn) return <section className="playlist-empty"><Music2 className="mx-auto size-9" />
    <h1 className="text-xl font-semibold">나만의 플레이리스트를 만들어 보세요</h1><p>로그인하면 목록을 저장하고 다시 이어 들을 수 있어요.</p>
    <SignInButton mode="modal" forceRedirectUrl={window.location.href}><Button>로그인</Button></SignInButton></section>;
  return <div key={user?.id} className={className}>{children}</div>;
}
export function PlaylistFeedback({ actions }: { actions: ReturnType<typeof usePlaylistActions> }) {
  if (!actions.message && actions.pending.length === 0) return null;
  const busy = actions.pending.length > 0;
  const progress = actions.progress;
  const percent = progress?.total && progress.total > 0 && progress.completed > 0
    ? Math.min(99, Math.round(progress.completed / progress.total * 100)) : undefined;
  return <div className="flex min-h-7 items-center gap-3 text-sm">
    {busy ? <div className="min-w-0 flex-1 space-y-1">
      <div role="progressbar" aria-label="플레이리스트 대기열 추가 진행률"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
        aria-valuetext={progress ? `${progress.completed}개 확인 완료` : "대기열 추가 준비 중"}
        className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={percent === undefined ? "playlist-add-indeterminate h-full w-1/3 rounded-full bg-primary" : "h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none"}
          style={percent === undefined ? undefined : { width: `${percent}%` }} />
      </div>
      <span className="sr-only" role="status">대기열에 추가하고 있습니다.</span>
    </div> : <p role="status">{actions.message}</p>}
    {busy && <Button variant="ghost" size="sm" onClick={actions.cancel}>취소</Button>}
  </div>;
}
export function DefaultPlaylistCard({ playlist }: { playlist: PlayDefaultPlaylist }) {
  const member = !playlist.query.relation;
  const title = playlist.title;
  return <article className={`playlist-card ${playlist.query.relation ? "playlist-card-featured" : ""}`}>
    <Link className="playlist-card-main" to="/play/playlists/defaults/$playlistKey"
      params={{ playlistKey: playlist.id }} aria-label={`${playlist.title} 목록 보기`}>
      <div className="playlist-art"><img src={playlist.imageUrl || "/images/otw-play/glass-note.png"} alt="" loading="lazy"
        onError={event => { if (!event.currentTarget.src.endsWith("/images/otw-play/glass-note.png")) event.currentTarget.src = "/images/otw-play/glass-note.png"; }} /></div>
      <div className="playlist-card-copy">
        <span className="playlist-card-kicker">{member ? "멤버 가창곡" : "OTW PLAY COLLECTION"}</span>
        <div className="playlist-card-title"><h3>{title}</h3><p>{playlist.description}</p></div>
        <div className="playlist-card-footer"><span>{playlist.songCount}곡</span>
          <strong><span className="sr-only">목록 보기</span><ArrowUpRight aria-hidden="true" className="size-5" /></strong></div>
      </div>
    </Link>
  </article>;
}
export function PerformanceRow({ item, children, compact = false }: { item: OtwPlayPublicPerformanceResponseDto; children?: ReactNode; compact?: boolean }) {
  const player = useOtwPlayPlayer(), source = item.performance.selectedSource;
  const participants = item.performance.participants.map(p => p.displayName).join(" · ");
  const version = `${item.performance.relation === "cover" ? "커버" : "오리지널"} · ${item.performance.releasedAt?.slice(0, 10) ?? "날짜 미상"}`;
  return <div className={`playlist-track${compact ? " playlist-track-compact" : ""}`}>
    {source?.thumbnailUrl ? <img src={source.thumbnailUrl} alt="" loading="lazy" /> : <Music2 className="m-3 size-6 shrink-0" />}
    <div className="min-w-0 flex-1"><Link to="/play/songs/$songSlug" params={{ songSlug: item.song.slug }} search={{ performance: item.performance.id }} className={compact ? "block truncate text-sm font-medium" : "font-medium"} title={item.song.title}>{item.song.title}</Link>
      {compact ? <p className="flex min-w-0 gap-1 text-xs text-muted-foreground"><span className="truncate" title={`${participants} · ${version}`}>{participants} · {version}</span>{!item.performance.playable && <span className="shrink-0">재생 불가</span>}</p> : <>
        <p className="text-xs text-muted-foreground">{participants}</p>
        <p className="text-xs text-muted-foreground">{version}{!item.performance.playable && " · 재생 불가"}</p></>}</div>
    {children ?? <Button size="sm" variant="outline" disabled={!source || !item.performance.playable}
      onClick={() => source && player.enqueue({ ...item, source })}>추가</Button>}
  </div>;
}
