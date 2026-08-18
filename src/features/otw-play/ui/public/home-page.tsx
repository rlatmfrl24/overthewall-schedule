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
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-4 px-4 py-4 sm:px-5 lg:px-6">
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
            <div className="relative min-h-[17rem] aspect-[12/5] max-h-[20rem]">
              <SongImage song={featured} eager />
              <div className="absolute inset-0 bg-black/55" />
              <div className="absolute inset-x-0 bottom-0 flex max-w-3xl flex-col gap-3 p-5 text-white sm:p-7 lg:p-8">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/75">
                    New on OTW Play
                  </p>
                  <h1
                    id="play-home-featured"
                    className="max-w-2xl break-words text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl"
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
                aria-label={`${activeIndex + 1} / ${songs.length}`}
              >
                {songs.map((song, index) => (
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

      <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(15rem,0.75fr)]">
        {songs.length > 1 ? (
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
            <RecentSongTable songs={songs.slice(1, 6)} />
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
          <div className="grid grid-cols-4 gap-x-3 gap-y-4 border-t pt-4 xl:grid-cols-3 2xl:grid-cols-4">
            {facets.data?.data.members.slice(0, 7).map((member) => (
              <Link
                key={member.memberUid}
                to="/play/songs"
                search={{ member: String(member.memberUid) }}
                className="group flex min-w-0 flex-col items-center gap-2 text-center"
                aria-label={`${member.displayName} 곡 보기`}
              >
                <img
                  src={`/profile/${member.code}.webp`}
                  alt=""
                  width={80}
                  height={80}
                  className="size-12 rounded-full object-cover ring-1 ring-border transition-transform group-hover:-translate-y-1 sm:size-14"
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

function RecentSongTable({ songs }: { songs: OtwPlayPublicSongSummaryDto[] }) {
  return (
    <div className="mt-2 border-y">
      <table className="w-full table-fixed text-left text-xs">
        <thead className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <tr className="h-8 border-b">
            <th scope="col" className="w-[34%] px-2 font-medium">곡</th>
            <th scope="col" className="hidden w-[20%] px-2 font-medium sm:table-cell">참여자</th>
            <th scope="col" className="hidden w-[14%] px-2 font-medium md:table-cell">구분</th>
            <th scope="col" className="w-[14%] px-2 font-medium">공개일</th>
            <th scope="col" className="w-[18%] px-1 text-right font-medium">작업</th>
          </tr>
        </thead>
        <tbody>
          {songs.map((song) => {
            const performance = song.representativePerformance;
            return (
              <tr key={song.id} className="h-12 border-b last:border-b-0 hover:bg-muted/45">
                <td className="px-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="size-8 shrink-0 overflow-hidden bg-muted">
                      <SongImage song={song} />
                    </div>
                    <Link
                      to="/play/songs/$songSlug"
                      params={{ songSlug: song.slug }}
                      search={{ performance: undefined }}
                      className="truncate font-semibold hover:underline"
                    >
                      {song.title}
                    </Link>
                  </div>
                </td>
                <td className="hidden truncate px-2 text-muted-foreground sm:table-cell">
                  {performance.participants
                    .map(({ displayName }) => displayName)
                    .join(", ") || "정보 없음"}
                </td>
                <td className="hidden px-2 text-muted-foreground md:table-cell">
                  {relationLabel[performance.relation]}
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
