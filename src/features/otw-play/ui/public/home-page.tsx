import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from "react";
import type { OtwPlayPublicSongSummaryDto } from "@contracts/otw-play";
import { Button } from "@/shared/ui/button";
import {
  useOtwPlayCatalog,
  useOtwPlayFacets,
  useOtwPlayMembers,
} from "../../queries/use-public-catalog";
import {
  OtwPlayPerformanceActions,
  OtwPlayPerformanceMetadata,
  OtwPlayPerformanceTags,
  OtwPlaySongTags,
} from "./catalog-components";
import { OtwPlayQueryError } from "./public-query-state";
import { OtwPlayThumbnail } from "../otw-play-thumbnail";
import { presentOtwPlayParticipants } from "./participant-presentation";
import { useFeaturedCarousel } from "./use-featured-carousel";

const pageItems = (query: ReturnType<typeof useOtwPlayCatalog>) =>
  query.data?.pages.flatMap((page) => page.data.items) ?? [];

export function OtwPlayHomePage() {
  const dragStartX = useRef<number | null>(null);
  const [loadMoreTarget, setLoadMoreTarget] = useState<HTMLDivElement | null>(null);
  const latest = useOtwPlayCatalog({ limit: 24 });
  const facets = useOtwPlayFacets();
  const members = useOtwPlayMembers();
  const featuredSongs = latest.data?.pages[0]?.data.items.slice(0, 8) ?? [];
  const carousel = useFeaturedCarousel(featuredSongs.length);
  const {
    fetchNextPage,
    hasNextPage,
    isFetchNextPageError,
    isFetchingNextPage,
  } = latest;

  useEffect(() => {
    const target = loadMoreTarget;
    if (
      !target ||
      !hasNextPage ||
      isFetchingNextPage ||
      isFetchNextPageError ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    let requested = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || requested) return;
        requested = true;
        observer.unobserve(target);
        void fetchNextPage();
      },
      { rootMargin: "320px 0px" },
    );
    observer.observe(target);
    return () => {
      requested = true;
      observer.disconnect();
    };
  }, [
    loadMoreTarget,
    fetchNextPage,
    hasNextPage,
    isFetchNextPageError,
    isFetchingNextPage,
  ]);

  if (latest.isPending || facets.isPending) {
    return (
      <div
        className="flex min-h-64 items-center justify-center text-sm text-muted-foreground"
        aria-busy="true"
      >
        <LoaderCircle className="mr-2 size-4 animate-spin" /> 발견 큐레이션
        불러오는 중
      </div>
    );
  }

  if (facets.isError) {
    return (
      <div className="mx-auto max-w-screen-2xl p-4 sm:p-6 lg:p-8">
        <OtwPlayQueryError
          error={facets.error}
          retry={() => void facets.refetch()}
        />
      </div>
    );
  }

  if (latest.isError && !latest.data) {
    return (
      <div className="mx-auto max-w-screen-2xl p-4 sm:p-6 lg:p-8">
        <OtwPlayQueryError
          error={latest.error}
          retry={() => void latest.refetch()}
        />
      </div>
    );
  }

  const songs = pageItems(latest);
  const { activeIndex } = carousel;
  const featured = featuredSongs[activeIndex] ?? null;

  const moveFeatured = carousel.move;

  const handleHeroPointerDown = (event: PointerEvent<HTMLElement>) => {
    if ((event.target as Element).closest("a, button, input")) return;
    dragStartX.current = event.clientX;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleHeroPointerUp = (event: PointerEvent<HTMLElement>) => {
    if (dragStartX.current === null) return;
    const distance = event.clientX - dragStartX.current;
    dragStartX.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (Math.abs(distance) >= 48) moveFeatured(distance < 0 ? 1 : -1);
  };

  const handleHeroWheel = (event: WheelEvent<HTMLElement>) => {
    if (Math.abs(event.deltaX) < 32 || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) {
      return;
    }
    event.preventDefault();
    moveFeatured(event.deltaX > 0 ? 1 : -1);
  };

  const handleHeroKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    moveFeatured(event.key === "ArrowLeft" ? -1 : 1);
  };

  return (
    <div className="play-page">
      <header className="play-intro">
        <div className="min-w-0">
          <h1><span className="play-intro-brand">오버더월</span> NOW PLAY ON OTW PLAY</h1>
          <p>오버더월의 오리지널과 공식 커버를 한곳에서.</p>
        </div>
        <img src="/images/otw-play/glass-note.png" alt="" width={1024} height={1536} className="play-brand-note" decoding="async" />
      </header>
      {featured ? (
        <section
          aria-roledescription="carousel"
          aria-label="추천 배너"
          tabIndex={0}
          className="play-spotlight relative w-full touch-pan-y outline-none"
          onMouseEnter={() => carousel.setHovered(true)}
          onMouseLeave={() => carousel.setHovered(false)}
          onFocusCapture={() => carousel.setFocused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) carousel.setFocused(false);
          }}
          onPointerDown={handleHeroPointerDown}
          onPointerUp={handleHeroPointerUp}
          onPointerCancel={() => { dragStartX.current = null; }}
          onWheel={handleHeroWheel}
          onKeyDown={handleHeroKeyDown}
        >
          <article className="play-spotlight-layout">
            <div data-testid="otw-play-hero-media" className="play-spotlight-media relative w-full overflow-hidden">
              {featuredSongs.map((song) => (
                <div
                  key={song.id}
                  className="play-spotlight-artwork"
                  data-active={song.id === featured.id}
                  aria-hidden={song.id !== featured.id}
                >
                  <SongImage song={song} eager backdrop />
                  <SongImage song={song} eager natural />
                </div>
              ))}
            </div>
            <div className="play-spotlight-copy">
              <div className="play-spotlight-body">
                <div className="play-spotlight-content-stack" aria-live={carousel.rotating ? "off" : "polite"} aria-atomic="true">
                  {featuredSongs.map((song) => (
                    <div key={song.id} className="play-spotlight-content" data-active={song.id === featured.id} aria-hidden={song.id !== featured.id}>
                      <p className="play-kicker">New on OTW Play</p>
                      <div className="play-spotlight-identity">
                        <h2 id={song.id === featured.id ? "play-home-featured" : undefined}>{song.title}</h2>
                        <p className="text-sm text-muted-foreground">
                          {presentOtwPlayParticipants(song.representativePerformance.participants).primaryNames || "참여자 정보 없음"}
                        </p>
                      </div>
                      <div className="play-spotlight-classification">
                        {song.tags.length > 0 || song.representativePerformance.tags.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <OtwPlaySongTags tags={song.tags} />
                            <OtwPlayPerformanceTags tags={song.representativePerformance.tags} />
                          </div>
                        ) : null}
                        <OtwPlayPerformanceMetadata performance={song.representativePerformance} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <OtwPlayPerformanceActions song={featured} performance={featured.representativePerformance} compact />
                  <Button asChild variant="outline" size="sm">
                    <Link to="/play/songs/$songSlug" params={{ songSlug: featured.slug }} search={{ performance: undefined }}>
                      곡 상세 <ArrowRight />
                    </Link>
                  </Button>
                </div>
              </div>
              {featuredSongs.length > 1 ? (
                <div className="play-carousel-controls">
                  <div className="play-carousel-dots" aria-label={(activeIndex + 1) + " / " + featuredSongs.length}>
                    {featuredSongs.map((song, index) => (
                      <button
                        type="button"
                        key={song.id}
                        aria-label={(index + 1) + "번째 추천곡 보기"}
                        aria-current={index === activeIndex ? "true" : undefined}
                        onClick={() => carousel.select(index)}
                        className="play-carousel-dot"
                      />
                    ))}
                  </div>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="이전 추천곡" onClick={() => moveFeatured(-1)}>
                    <ArrowLeft />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="다음 추천곡" onClick={() => moveFeatured(1)}>
                    <ArrowRight />
                  </Button>
                </div>
              ) : null}
            </div>
          </article>
        </section>
      ) : (
        <section className="rounded-3xl border bg-card p-10 text-center">
          <h2 className="play-section-title">새로운 목소리를 준비하고 있어요</h2>
          <p className="mt-2 text-sm text-muted-foreground">공개 가능한 공식 가창을 준비하고 있습니다.</p>
        </section>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-6">
        <section aria-labelledby="play-home-members" className="min-w-0 space-y-3">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Featured
              </p>
              <h2 id="play-home-members" className="play-section-title">
                멤버로 찾기
              </h2>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/play/songs" search={{}}>
                전체 <ArrowRight />
              </Link>
            </Button>
          </div>
          <div
            className="play-member-rail overflow-x-auto [scrollbar-width:thin]"
            role="region"
            aria-label="현재 멤버 목록"
            tabIndex={0}
          >
            <div className="flex min-w-max gap-3 px-1 sm:gap-4">
              {facets.data?.data.members.map((member) => (
                <Link
                  key={member.memberUid}
                  {...(!members.isError && members.data?.data.members.some(item => item.uid === member.memberUid && item.pageEligible)
                    ? { to: "/play/members/$memberCode" as const, params: { memberCode: member.code }, search: {} }
                    : { to: "/play/songs" as const, search: { member: String(member.memberUid) } })}
                  className="play-member-link group flex w-20 shrink-0 flex-col items-center gap-2 text-center sm:w-24"
                  aria-label={`${member.displayName} 메인 보컬·피처링 곡 보기`}
                >
                  <img
                    src={`/profile/${member.code}.webp`}
                    alt=""
                    width={80}
                    height={80}
                    className="size-14 rounded-full object-cover ring-1 ring-border sm:size-16"
                  />
                  <span className="line-clamp-2 min-h-8 w-full break-keep text-xs font-medium leading-4">
                    {member.oshiMark ? (
                      <span aria-hidden="true">{member.oshiMark} </span>
                    ) : null}
                    {member.displayName}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {songs.length > 0 ? (
          <section aria-labelledby="play-home-latest" className="min-w-0">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Songs
                </p>
                <h2 id="play-home-latest" className="play-section-title">
                  최근 공개된 곡
                </h2>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link to="/play/songs" search={{}}>
                  곡 검색 <ArrowRight />
                </Link>
              </Button>
            </div>
            <RecentSongCards songs={songs} />
            <div
              ref={setLoadMoreTarget}
              className="flex min-h-14 items-center justify-center pt-3"
              aria-live="polite"
            >
              {isFetchNextPageError ? (
                <div role="alert" className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
                  <span>다음 최신곡을 불러오지 못했습니다.</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void fetchNextPage()}
                  >
                    다시 시도
                  </Button>
                </div>
              ) : hasNextPage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isFetchingNextPage}
                  onClick={() => void fetchNextPage()}
                >
                  {isFetchingNextPage ? (
                    <LoaderCircle className="animate-spin" />
                  ) : null}
                  {isFetchingNextPage ? "최신곡 불러오는 중" : "더 불러오기"}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  최신 수록곡을 모두 불러왔습니다.
                </p>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function SongImage({
  song,
  eager = false,
  natural = false,
  backdrop = false,
}: {
  song: OtwPlayPublicSongSummaryDto;
  eager?: boolean;
  natural?: boolean;
  backdrop?: boolean;
}) {
  const source = song.representativePerformance.selectedSource;
  return source ? (
    <OtwPlayThumbnail
      source={source}
      alt=""
      width={960}
      height={540}
      loading={eager ? "eager" : "lazy"}
      className={backdrop ? "play-spotlight-backdrop" : natural ? "block h-auto w-full" : "absolute inset-0 h-full w-full object-contain"}
      fallback={backdrop ? null :
        <div className="flex aspect-video w-full items-center justify-center bg-muted text-sm text-muted-foreground">
          썸네일 없음
        </div>
      }
    />
  ) : backdrop ? null : (
    <div className="flex aspect-video w-full items-center justify-center bg-muted text-sm text-muted-foreground">
      썸네일 없음
    </div>
  );
}

function RecentSongCards({ songs }: { songs: OtwPlayPublicSongSummaryDto[] }) {
  return (
    <div className="play-recent-grid">
      {songs.map((song) => {
        const performance = song.representativePerformance;
        const participants = presentOtwPlayParticipants(performance.participants);
        return (
          <article key={song.id} className="play-recent-card" aria-label={song.title}>
            <Link
              to="/play/songs/$songSlug" params={{ songSlug: song.slug }} search={{ performance: undefined }}
              className="play-recent-artwork relative block aspect-video overflow-hidden bg-muted"
              aria-label={`${song.title} 곡 상세`}
            >
              <SongImage song={song} />
            </Link>
            <div className="play-recent-copy">
              <Link to="/play/songs/$songSlug" params={{ songSlug: song.slug }} search={{ performance: undefined }} className="play-song-title line-clamp-2 font-bold hover:underline">
                {song.title}
              </Link>
              <p className="text-sm text-muted-foreground">{participants.primaryNames || "참여자 정보 없음"}</p>
              <div className="flex flex-wrap gap-1.5">
                <OtwPlaySongTags tags={song.tags} />
                <OtwPlayPerformanceTags tags={performance.tags} />
              </div>
              <p className="text-xs text-muted-foreground">
                {performance.releasedAt ? `${new Date(performance.releasedAt).toLocaleDateString("ko-KR")} 공개` : "공개일 미상"}
              </p>
              <OtwPlayPerformanceActions song={song} performance={performance} compact className="mt-auto pt-2" />
            </div>
          </article>
        );
      })}
    </div>
  );
}
