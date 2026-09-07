import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import type { OtwPlayPublicSongSummaryDto } from "@contracts/otw-play";
import { Button } from "@/shared/ui/button";
import { useOtwPlayCatalog } from "../../queries/use-public-catalog";
import { OtwPlayPerformanceActions, OtwPlayPerformanceMetadata, OtwPlayPerformanceTags, OtwPlaySongTags } from "./catalog-components";
import { OtwPlayQueryError } from "./public-query-state";
import { OtwPlayThumbnail } from "../otw-play-thumbnail";
import { presentOtwPlayParticipants } from "./participant-presentation";

export function OtwPlayHomePage() {
  const latest = useOtwPlayCatalog({ limit: 24 });
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [loadMoreTarget, setLoadMoreTarget] = useState<HTMLDivElement | null>(null);
  const dragStartX = useRef<number | null>(null);
  const { fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError } = latest;
  useEffect(() => {
    if (!loadMoreTarget || !hasNextPage || isFetchingNextPage || isFetchNextPageError || typeof IntersectionObserver === "undefined") return;
    let requested = false;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || requested) return;
      requested = true;
      observer.unobserve(loadMoreTarget);
      void fetchNextPage();
    }, { rootMargin: "320px 0px" });
    observer.observe(loadMoreTarget);
    return () => { requested = true; observer.disconnect(); };
  }, [loadMoreTarget, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);
  if (latest.isPending) return <div className="play-page" aria-busy="true"><p className="play-eyebrow">DISCOVER</p><h1 className="play-title mt-3">음악을 만나는 중</h1><div className="mt-8 h-64 rounded-3xl bg-muted" /><p className="mt-4 text-sm text-muted-foreground">발견 큐레이션 불러오는 중</p></div>;
  if (latest.isError && !latest.data) return <div className="play-page"><OtwPlayQueryError error={latest.error} retry={() => void latest.refetch()} /></div>;
  const songs = latest.data?.pages.flatMap(page => page.data.items) ?? [];
  const featuredSongs = latest.data?.pages[0]?.data.items.slice(0, 8) ?? [];
  const activeIndex = featuredSongs.length ? featuredIndex % featuredSongs.length : 0;
  const featured = featuredSongs[activeIndex];
  const candidates = Array.from({ length: Math.min(3, Math.max(0, featuredSongs.length - 1)) }, (_, offset) => {
    const index = (activeIndex + offset + 1) % featuredSongs.length;
    return { song: featuredSongs[index], index };
  });
  const move = (direction: number) => setFeaturedIndex((activeIndex + direction + featuredSongs.length) % Math.max(1, featuredSongs.length));
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); }
  };
  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if ((event.target as Element).closest("a,button,input")) return;
    dragStartX.current = event.clientX;
  };
  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    if (dragStartX.current !== null && Math.abs(event.clientX - dragStartX.current) >= 48) move(event.clientX < dragStartX.current ? 1 : -1);
    dragStartX.current = null;
  };
  const onWheel = (event: WheelEvent<HTMLElement>) => {
    if (Math.abs(event.deltaX) >= 32 && Math.abs(event.deltaX) > Math.abs(event.deltaY)) move(event.deltaX > 0 ? 1 : -1);
  };
  return <div className="play-page play-reveal">
    <div className="flex items-center justify-between gap-4">
      <div><p className="play-eyebrow">OTW PLAY / DISCOVER</p><h1 className="play-title mt-3">새로운 곡,<br /><span style={{ color: "var(--play-teal-text)" }}>익숙한 목소리.</span></h1></div>
      <img className="play-graphic" src="/images/otw-play/music-sculpture.webp" alt="" width={128} height={128} />
    </div>
    {featured ? <section className="play-board" aria-roledescription="carousel" aria-label="추천 배너"
      tabIndex={0} onKeyDown={onKeyDown} onPointerDown={onPointerDown} onPointerUp={onPointerUp}
      onPointerCancel={() => { dragStartX.current = null; }} onWheel={onWheel}>
      <article className="play-feature">
        <div className="play-feature-art" data-testid="otw-play-hero-media"><SongImage song={featured} eager /></div>
        <div className="play-feature-copy" key={featured.id}>
          <p className="play-eyebrow mb-3">지금 만나볼 음악</p>
          <h2 id="play-home-featured"><Link to="/play/songs/$songSlug" params={{ songSlug: featured.slug }} search={{ performance: featured.representativePerformance.id }}>{featured.title}</Link></h2>
          <p className="mt-3 text-base">{presentOtwPlayParticipants(featured.representativePerformance.participants).primaryNames || "참여자 정보 없음"}</p>
          <div className="my-4 flex flex-wrap items-center gap-3"><OtwPlaySongTags tags={featured.tags} /><OtwPlayPerformanceMetadata performance={featured.representativePerformance} /><OtwPlayPerformanceTags tags={featured.representativePerformance.tags} /><span className="text-xs text-muted-foreground">{dateLabel(featured)}</span></div>
          <OtwPlayPerformanceActions song={featured} performance={featured.representativePerformance} />
          <Link className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold" to="/play/songs/$songSlug" params={{ songSlug: featured.slug }} search={{ performance: featured.representativePerformance.id }}>곡 상세 <ArrowRight className="size-4" /></Link>
        </div>
      </article>
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex items-center justify-between"><p className="play-eyebrow">다음 발견</p><span className="text-xs tabular-nums">{activeIndex + 1} / {featuredSongs.length}</span></div>
        <div className="play-candidates">
          {candidates.map(({ song, index }) => <button key={song.id} className="play-candidate" onClick={() => setFeaturedIndex(index)} aria-label={String(index + 1) + "번째 추천곡 보기"}>
            <div className="play-candidate-art"><SongImage song={song} /></div>
            <div><h3>{song.title}</h3><p className="mt-2 text-xs text-muted-foreground">{presentOtwPlayParticipants(song.representativePerformance.participants).primaryNames}</p></div>
          </button>)}
        </div>
        {featuredSongs.length > 1 && <div className="mt-auto flex items-center justify-between gap-2">
          <Button variant="outline" aria-label="이전 추천곡" onClick={() => move(-1)}><ArrowLeft /> 이전</Button>
          <Button variant="outline" aria-label="다음 추천곡" onClick={() => move(1)}>다음 <ArrowRight /></Button>
        </div>}
      </div>
    </section> : <section className="my-8 rounded-3xl border border-dashed p-8"><h2 className="play-section-title">음악을 준비하고 있어요</h2><p className="mt-3 text-muted-foreground">공개 가능한 공식 가창이 아직 없습니다.</p></section>}
    <nav className="play-discover-links" aria-label="음악 탐색 시작">
      <Link className="play-discover-link" to="/play/songs" search={{ relation: "original" }}>오리지널 <ArrowRight className="size-5" /></Link>
      <Link className="play-discover-link" to="/play/songs" search={{ relation: "cover" }}>공식 커버 <ArrowRight className="size-5" /></Link>
      <Link className="play-discover-link" to="/play/members" search={{}}>멤버로 찾기 <ArrowRight className="size-5" /></Link>
    </nav>
    {songs.length > 0 && <section className="play-scroll-reveal" aria-labelledby="play-home-latest">
      <div className="mb-6 flex items-end justify-between gap-4"><div><p className="play-eyebrow">KEEP EXPLORING</p><h2 className="play-section-title mt-2" id="play-home-latest">최근 공개된 곡</h2></div><Link className="inline-flex min-h-11 items-center gap-2 text-sm" to="/play/songs" search={{}}>곡 탐색 <ArrowRight className="size-4" /></Link></div>
      <div className="play-record-grid">{songs.filter(song => song.id !== featured?.id).map(song => <article className="play-record" key={song.id}>
        <Link to="/play/songs/$songSlug" params={{ songSlug: song.slug }} search={{ performance: song.representativePerformance.id }}><div className="play-record-art"><SongImage song={song} /></div><h3 className="play-record-title">{song.title}</h3></Link>
        <p className="mb-3 text-sm text-muted-foreground">{presentOtwPlayParticipants(song.representativePerformance.participants).primaryNames}</p>
        <div className="mb-3 flex flex-wrap items-center gap-2"><OtwPlaySongTags tags={song.tags} /><OtwPlayPerformanceTags tags={song.representativePerformance.tags} /><span className="text-xs text-muted-foreground">{dateLabel(song)}</span></div>
        <OtwPlayPerformanceActions song={song} performance={song.representativePerformance} compact />
      </article>)}</div>
      <div ref={setLoadMoreTarget} className="flex min-h-20 items-center justify-center" aria-live="polite">
        {isFetchNextPageError ? <div role="alert"><p>다음 최신곡을 불러오지 못했습니다.</p><Button variant="outline" onClick={() => void fetchNextPage()}>다시 시도</Button></div> :
          hasNextPage ? <Button variant="outline" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>{isFetchingNextPage && <LoaderCircle className="animate-spin" />}{isFetchingNextPage ? "최신곡 불러오는 중" : "더 불러오기"}</Button> : <p className="text-xs text-muted-foreground">최신 수록곡을 모두 불러왔습니다.</p>}
      </div>
    </section>}
  </div>;
}
function dateLabel(song: OtwPlayPublicSongSummaryDto) {
  return song.representativePerformance.releasedAt ? new Date(song.representativePerformance.releasedAt).toLocaleDateString("ko-KR") : "공개일 미상";
}
function SongImage({ song, eager = false }: { song: OtwPlayPublicSongSummaryDto; eager?: boolean }) {
  const source = song.representativePerformance.selectedSource;
  return source ? <OtwPlayThumbnail source={source} alt="" width={640} height={360} loading={eager ? "eager" : "lazy"} className="h-full w-full object-contain" fallback={<div className="flex h-full items-center justify-center text-sm text-white">썸네일 없음</div>} /> : <div className="flex h-full items-center justify-center text-sm text-white">썸네일 없음</div>;
}
