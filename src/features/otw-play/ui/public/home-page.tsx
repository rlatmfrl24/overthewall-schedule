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

const pageItems = (query: ReturnType<typeof useOtwPlayCatalog>) =>
  query.data?.pages.flatMap((page) => page.data.items) ?? [];

export function OtwPlayHomePage() {
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const dragStartX = useRef<number | null>(null);
  const [loadMoreTarget, setLoadMoreTarget] = useState<HTMLDivElement | null>(null);
  const latest = useOtwPlayCatalog({ limit: 24 });
  const facets = useOtwPlayFacets();
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
  const featuredSongs = latest.data?.pages[0]?.data.items.slice(0, 8) ?? [];
  const activeIndex =
    featuredSongs.length === 0 ? 0 : featuredIndex % featuredSongs.length;
  const featured = featuredSongs[activeIndex] ?? null;
  const featuredParticipants = featured
    ? presentOtwPlayParticipants(
        featured.representativePerformance.participants,
      )
    : null;

  const moveFeatured = (direction: -1 | 1) => {
    if (featuredSongs.length < 2) return;
    setFeaturedIndex((current) =>
      (current + direction + featuredSongs.length) % featuredSongs.length,
    );
  };

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
    <div className="mx-auto flex min-h-full w-full max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-5 lg:px-6">
      {featured ? (
        <section
          aria-roledescription="carousel"
          aria-label="추천 배너"
          tabIndex={0}
          className="relative isolate w-full touch-pan-y overflow-hidden bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onPointerDown={handleHeroPointerDown}
          onPointerUp={handleHeroPointerUp}
          onPointerCancel={() => {
            dragStartX.current = null;
          }}
          onWheel={handleHeroWheel}
          onKeyDown={handleHeroKeyDown}
        >
          <article className="relative cursor-grab active:cursor-grabbing">
            <div
              data-testid="otw-play-hero-media"
              className="relative aspect-video w-full"
            >
              <SongImage song={featured} eager />
              <div className="absolute inset-0 bg-black/55" />
              <div className="absolute inset-x-0 bottom-0 flex max-w-3xl flex-col gap-2 p-4 text-white sm:gap-3 sm:p-7 lg:p-8">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/75">
                    New on OTW Play
                  </p>
                  <div className="mb-2 hidden sm:block"><OtwPlaySongTags tags={featured.tags} /></div>
                  <h1
                    id="play-home-featured"
                    className="line-clamp-2 max-w-2xl break-words text-2xl font-bold leading-tight sm:line-clamp-none sm:text-4xl lg:text-5xl"
                  >
                    {featured.title}
                  </h1>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/75">
                    <span>
                      {featuredParticipants?.primaryNames || "참여자 정보 없음"}
                    </span>
                    <OtwPlayPerformanceMetadata performance={featured.representativePerformance} inverse />
                  </div>
                  <div className="mt-2 hidden sm:block">
                    <OtwPlayPerformanceTags
                      tags={featured.representativePerformance.tags}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <OtwPlayPerformanceActions
                    song={featured}
                    performance={featured.representativePerformance}
                    compact
                    className="text-foreground"
                  />
                  <Button asChild variant="secondary" size="sm">
                    <Link
                      to="/play/songs/$songSlug"
                      params={{ songSlug: featured.slug }}
                      search={{ performance: undefined }}
                    >
                      곡 상세 <ArrowRight />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </article>

          {featuredSongs.length > 1 ? (
            <>
              <Button
                type="button"
                variant="secondary"
                size="icon-sm"
                className="absolute left-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-background/85 shadow-sm"
                aria-label="이전 추천곡"
                onClick={() => moveFeatured(-1)}
              >
                <ArrowLeft />
              </Button>
              <div
                className="absolute bottom-4 right-4 z-20 flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-2"
                aria-label={`${activeIndex + 1} / ${featuredSongs.length}`}
              >
                {featuredSongs.map((song, index) => (
                  <button
                    type="button"
                    key={song.id}
                    aria-label={`${index + 1}번째 추천곡 보기`}
                    aria-current={index === activeIndex ? "true" : undefined}
                    onClick={() => setFeaturedIndex(index)}
                    className={
                      index === activeIndex
                        ? "h-1.5 w-5 rounded-full bg-white transition-[width]"
                        : "size-1.5 rounded-full bg-white/45 hover:bg-white/75"
                    }
                  />
                ))}
              </div>
              <Button
                type="button"
                variant="secondary"
                size="icon-sm"
                className="absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-background/85 shadow-sm"
                aria-label="다음 추천곡"
                onClick={() => moveFeatured(1)}
              >
                <ArrowRight />
              </Button>
            </>
          ) : null}
        </section>
      ) : (
        <section className="rounded-2xl border bg-card p-10 text-center">
          <h1 className="text-2xl font-semibold">OTW Play</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            공개 가능한 공식 가창을 준비하고 있습니다.
          </p>
        </section>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-6">
        <section aria-labelledby="play-home-members" className="min-w-0 space-y-3">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Featured
              </p>
              <h2 id="play-home-members" className="text-lg font-semibold sm:text-xl">
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
            className="overflow-x-auto border-y py-4 [scrollbar-width:thin]"
            role="region"
            aria-label="현재 멤버 목록"
            tabIndex={0}
          >
            <div className="flex min-w-max gap-3 px-1 sm:gap-4">
              {facets.data?.data.members.map((member) => (
                <Link
                  key={member.memberUid}
                  to="/play/songs"
                  search={{
                    member: String(member.memberUid),
                    participantRole: "vocal",
                  }}
                  className="group flex w-20 shrink-0 flex-col items-center gap-2 text-center sm:w-24"
                  aria-label={`${member.displayName} 메인 보컬 곡 보기`}
                >
                  <img
                    src={`/profile/${member.code}.webp`}
                    alt=""
                    width={80}
                    height={80}
                    className="size-14 rounded-full object-cover ring-1 ring-border transition-transform group-hover:-translate-y-1 sm:size-16"
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
                <h2 id="play-home-latest" className="text-lg font-semibold sm:text-xl">
                  최근 공개된 곡
                </h2>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link to="/play/songs" search={{}}>
                  곡 검색 <ArrowRight />
                </Link>
              </Button>
            </div>
            <RecentSongTable songs={songs} />
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
}: {
  song: OtwPlayPublicSongSummaryDto;
  eager?: boolean;
}) {
  const source = song.representativePerformance.selectedSource;
  return source ? (
    <OtwPlayThumbnail
      source={source}
      alt=""
      width={960}
      height={540}
      loading={eager ? "eager" : "lazy"}
      className="h-full w-full object-cover object-center"
      fallback={
        <div className="flex h-full w-full items-center justify-center bg-muted text-sm text-muted-foreground">
          썸네일 없음
        </div>
      }
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-muted text-sm text-muted-foreground">
      썸네일 없음
    </div>
  );
}

function RecentSongTable({ songs }: { songs: OtwPlayPublicSongSummaryDto[] }) {
  return (
    <div className="mt-2 border-y">
      <table className="w-full table-fixed text-left text-xs">
        <thead className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <tr className="h-8 border-b">
            <th scope="col" className="w-[34%] px-2 font-medium">곡</th>
            <th scope="col" className="hidden w-[20%] px-2 font-medium sm:table-cell">참여자</th>
            <th scope="col" className="hidden w-[18%] px-2 font-medium md:table-cell">음악 분류</th>
            <th scope="col" className="w-[14%] px-2 font-medium">공개일</th>
            <th scope="col" className="w-[18%] px-1 text-right font-medium">작업</th>
          </tr>
        </thead>
        <tbody>
          {songs.map((song) => {
            const performance = song.representativePerformance;
            const participants = presentOtwPlayParticipants(
              performance.participants,
            );
            return (
              <tr key={song.id} className="h-12 border-b last:border-b-0 hover:bg-muted/45">
                <td className="px-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="size-8 shrink-0 overflow-hidden bg-muted">
                      <SongImage song={song} />
                    </div>
                    <div className="min-w-0">
                      <Link
                        to="/play/songs/$songSlug"
                        params={{ songSlug: song.slug }}
                        search={{ performance: undefined }}
                        className="block truncate font-semibold hover:underline"
                      >
                        {song.title}
                      </Link>
                      <OtwPlayPerformanceTags tags={performance.tags} singleLine />
                    </div>
                  </div>
                </td>
                <td className="hidden px-2 text-muted-foreground sm:table-cell">
                  <span className="block truncate">
                    {participants.primaryNames || "정보 없음"}
                  </span>
                </td>
                <td className="hidden px-2 text-muted-foreground md:table-cell">
                  <span className="block truncate">{song.tags.join(" · ") || "미분류"}</span>
                </td>
                <td className="px-2 tabular-nums text-muted-foreground">
                  {performance.releasedAt
                    ? new Date(performance.releasedAt).toLocaleDateString("ko-KR", {
                        month: "2-digit",
                        day: "2-digit",
                      })
                    : "—"}
                </td>
                <td className="px-1">
                  <OtwPlayPerformanceActions
                    song={song}
                    performance={performance}
                    compact
                    iconOnly
                    className="justify-end gap-1"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
