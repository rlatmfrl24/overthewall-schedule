import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react";
import {
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
  relationLabel,
} from "./catalog-components";
import { OtwPlayQueryError } from "./public-query-state";

const pageItems = (query: ReturnType<typeof useOtwPlayCatalog>) =>
  query.data?.pages.flatMap((page) => page.data.items) ?? [];

export function OtwPlayHomePage() {
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const dragStartX = useRef<number | null>(null);
  const latest = useOtwPlayCatalog({ limit: 8 });
  const facets = useOtwPlayFacets();

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

  if (latest.isError || facets.isError) {
    const failed = latest.isError ? latest : facets;
    return (
      <div className="mx-auto max-w-screen-2xl p-4 sm:p-6 lg:p-8">
        <OtwPlayQueryError
          error={failed.error}
          retry={() => void failed.refetch()}
        />
      </div>
    );
  }

  const songs = pageItems(latest);
  const activeIndex = songs.length === 0 ? 0 : featuredIndex % songs.length;
  const featured = songs[activeIndex] ?? null;
  const previousIndex = songs.length === 0
    ? 0
    : (activeIndex - 1 + songs.length) % songs.length;
  const nextIndex = songs.length === 0 ? 0 : (activeIndex + 1) % songs.length;
  const supporting = songs.length > 1
    ? [
        { side: "previous" as const, index: previousIndex, song: songs[previousIndex]! },
        ...(songs.length > 2
          ? [{ side: "next" as const, index: nextIndex, song: songs[nextIndex]! }]
          : []),
      ]
    : [];

  const moveFeatured = (direction: -1 | 1) => {
    if (songs.length < 2) return;
    setFeaturedIndex((current) =>
      (current + direction + songs.length) % songs.length,
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
    <div className="mx-auto w-full max-w-[1320px] space-y-5 px-4 py-4 sm:px-5 lg:px-6 lg:py-5">
      {featured ? (
        <section
          aria-roledescription="carousel"
          aria-label="추천 카드"
          tabIndex={0}
          className="relative isolate mx-auto w-full max-w-5xl touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onPointerDown={handleHeroPointerDown}
          onPointerUp={handleHeroPointerUp}
          onPointerCancel={() => {
            dragStartX.current = null;
          }}
          onWheel={handleHeroWheel}
          onKeyDown={handleHeroKeyDown}
        >
          {supporting.map(({ song, side, index }) => (
            <button
              type="button"
              key={`${side}:${song.id}`}
              aria-label={side === "previous" ? "이전 추천곡 보기" : "다음 추천곡 보기"}
              onClick={() => setFeaturedIndex(index)}
              className={
                side === "previous"
                  ? "absolute inset-y-8 left-0 hidden w-[44%] -translate-x-4 -rotate-2 overflow-hidden rounded-2xl border bg-card opacity-55 shadow-lg transition hover:opacity-85 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring md:block"
                  : "absolute inset-y-8 right-0 hidden w-[44%] translate-x-4 rotate-2 overflow-hidden rounded-2xl border bg-card opacity-55 shadow-lg transition hover:opacity-85 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring md:block"
              }
            >
              <SongImage song={song} eager />
            </button>
          ))}

          <article className="relative z-10 mx-auto w-full cursor-grab overflow-hidden rounded-2xl border bg-card shadow-xl active:cursor-grabbing md:w-[82%]">
            <div className="relative h-[clamp(18rem,43vh,25rem)] min-h-[288px]">
              <SongImage song={featured} eager />
              <div className="absolute inset-0 bg-black/50" />
              <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-5 text-white sm:p-7">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/75">
                    New on OTW Play
                  </p>
                  <h1
                    id="play-home-featured"
                    className="max-w-2xl break-words text-3xl font-bold leading-tight sm:text-4xl"
                  >
                    {featured.title}
                  </h1>
                  <p className="mt-2 text-sm text-white/75">
                    {relationLabel[
                      featured.representativePerformance.relation
                    ]}
                    {" · "}
                    {featured.representativePerformance.participants
                      .map(({ displayName }) => displayName)
                      .join(", ") || "참여자 정보 없음"}
                  </p>
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

          {songs.length > 1 ? (
            <div className="relative z-20 mt-3 flex items-center justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="rounded-full"
                aria-label="이전 추천곡"
                onClick={() => moveFeatured(-1)}
              >
                <ArrowLeft />
              </Button>
              <div className="flex gap-1.5" aria-label={`${activeIndex + 1} / ${songs.length}`}>
                {songs.map((song, index) => (
                  <button
                    type="button"
                    key={song.id}
                    aria-label={`${index + 1}번째 추천곡 보기`}
                    aria-current={index === activeIndex ? "true" : undefined}
                    onClick={() => setFeaturedIndex(index)}
                    className={
                      index === activeIndex
                        ? "h-2 w-6 rounded-full bg-foreground transition-[width]"
                        : "size-2 rounded-full bg-muted-foreground/35 hover:bg-muted-foreground"
                    }
                  />
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="rounded-full"
                aria-label="다음 추천곡"
                onClick={() => moveFeatured(1)}
              >
                <ArrowRight />
              </Button>
            </div>
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

      <div className="grid min-h-0 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
        {songs.length > 1 ? (
          <section aria-labelledby="play-home-latest" className="min-w-0 space-y-3">
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
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {songs.slice(1, 5).map((song) => (
                <HomeSongCard key={song.id} song={song} />
              ))}
            </div>
          </section>
        ) : null}

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
          <div className="flex gap-4 overflow-x-auto overscroll-x-contain pb-2">
            {facets.data?.data.members.slice(0, 7).map((member) => (
              <Link
                key={member.memberUid}
                to="/play/songs"
                search={{ member: String(member.memberUid) }}
                className="group flex w-20 shrink-0 flex-col items-center gap-2 text-center"
                aria-label={`${member.displayName} 곡 보기`}
              >
                <img
                  src={`/profile/${member.code}.webp`}
                  alt=""
                  width={80}
                  height={80}
                  className="size-16 rounded-full border-2 border-background object-cover shadow-md ring-1 ring-border transition-transform group-hover:-translate-y-1 sm:size-20"
                />
                <span className="line-clamp-1 w-full text-xs font-medium">
                  {member.displayName}
                </span>
              </Link>
            ))}
          </div>
        </section>
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
  const thumbnail = song.representativePerformance.selectedSource?.thumbnailUrl;
  return thumbnail ? (
    <img
      src={thumbnail}
      alt=""
      width={960}
      height={540}
      loading={eager ? "eager" : "lazy"}
      className="h-full w-full object-cover"
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-muted text-sm text-muted-foreground">
      썸네일 없음
    </div>
  );
}

function HomeSongCard({ song }: { song: OtwPlayPublicSongSummaryDto }) {
  const performance = song.representativePerformance;
  return (
    <article className="flex min-w-0 gap-3 rounded-xl border bg-card p-2.5 shadow-sm">
      <div className="aspect-square w-16 shrink-0 overflow-hidden rounded-lg bg-muted sm:w-20">
        <SongImage song={song} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground">
            {relationLabel[performance.relation]}
          </p>
          <Link
            to="/play/songs/$songSlug"
            params={{ songSlug: song.slug }}
            search={{ performance: undefined }}
            className="line-clamp-2 text-sm font-semibold hover:underline"
          >
            {song.title}
          </Link>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {performance.participants
              .map(({ displayName }) => displayName)
              .join(", ") || "참여자 정보 없음"}
          </p>
        </div>
        <OtwPlayPerformanceActions song={song} performance={performance} compact />
      </div>
    </article>
  );
}
