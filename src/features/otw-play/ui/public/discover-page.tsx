import { Link } from "@tanstack/react-router";
import { ArrowRight, ListPlus, LoaderCircle, Play } from "lucide-react";
import type { OtwPlayPublicSongSummaryDto } from "@contracts/otw-play";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { assembleOtwPlayCollaborationSongs } from "../../model/public-discover";
import { useOtwPlayPlayer } from "../../player/play-player-context";
import {
  useOtwPlayCatalog,
  useOtwPlayFacets,
} from "../../queries/use-public-catalog";
import { OtwPlayQueryError } from "./public-query-state";
import {
  OtwPlayPerformanceActions,
  OtwPlayParticipantChip,
  relationLabel,
} from "./catalog-components";

const pageItems = (query: ReturnType<typeof useOtwPlayCatalog>) =>
  query.data?.pages.flatMap((page) => page.data.items) ?? [];

export function OtwPlayDiscoverPage() {
  const latest = useOtwPlayCatalog({ limit: 12 });
  const duet = useOtwPlayCatalog({ participation: "duet", limit: 8 });
  const unit = useOtwPlayCatalog({ participation: "unit", limit: 8 });
  const group = useOtwPlayCatalog({ participation: "group", limit: 8 });
  const external = useOtwPlayCatalog({ participation: "external_collab", limit: 8 });
  const facets = useOtwPlayFacets();
  const queries = [latest, duet, unit, group, external];
  const errorQuery = queries.find(({ isError }) => isError);
  const collaborations = assembleOtwPlayCollaborationSongs([
    pageItems(duet),
    pageItems(unit),
    pageItems(group),
    pageItems(external),
  ]);

  if (queries.some(({ isPending }) => isPending) || facets.isPending) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground" aria-busy="true">
        <LoaderCircle className="mr-2 size-4 animate-spin" /> 공개 카탈로그 불러오는 중
      </div>
    );
  }
  if (errorQuery || facets.isError) {
    const failed = errorQuery ?? facets;
    return (
      <div className="mx-auto max-w-screen-2xl p-4 sm:p-6 lg:p-8">
        <OtwPlayQueryError error={failed.error} retry={() => void failed.refetch()} />
      </div>
    );
  }

  const hero = pageItems(latest)[0];
  const latestSongs = pageItems(latest);

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-8 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      {hero ? <DiscoverHero song={hero} /> : null}

      <div className="grid gap-7 2xl:grid-cols-[minmax(0,1.08fr)_minmax(24rem,0.92fr)]">
        <section aria-labelledby="discover-latest-heading" className="min-w-0 space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Songs
              </p>
              <h2 id="discover-latest-heading" className="text-xl font-semibold">
                새로 등록된 곡
              </h2>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/play/songs" search={{}}>
                전체 보기 <ArrowRight />
              </Link>
            </Button>
          </div>
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            {latestSongs.slice(1, 7).map((song, index) => (
              <DiscoverSongLine
                key={song.id}
                song={song}
                className={index > 0 ? "border-t" : undefined}
              />
            ))}
          </div>
        </section>

        <section aria-labelledby="discover-collab-heading" className="min-w-0 space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Videos
            </p>
            <h2 id="discover-collab-heading" className="text-xl font-semibold">
              함께 부른 노래
            </h2>
          </div>
          {collaborations.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {collaborations.slice(0, 4).map((song) => (
                <DiscoverVideoCard key={song.id} song={song} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
              함께 부른 공식 가창을 준비하고 있습니다.
            </div>
          )}
        </section>
      </div>

      <section aria-labelledby="discover-members-heading" className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Members
          </p>
          <h2 id="discover-members-heading" className="text-xl font-semibold">
            멤버로 찾기
          </h2>
          <p className="text-sm text-muted-foreground">
            현재 활동 중인 멤버의 공식 가창을 모아봅니다.
          </p>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {facets.data?.data.members.map((member) => (
            <Link
              key={member.memberUid}
              to="/play/songs"
              search={{ member: String(member.memberUid) }}
              className="flex min-w-28 flex-col items-center gap-2 rounded-2xl border bg-card p-3 text-center shadow-sm transition-transform hover:-translate-y-1"
              aria-label={`${member.displayName} 곡 보기`}
            >
              <img
                src={`/profile/${member.code}.webp`}
                alt=""
                width={56}
                height={56}
                loading="lazy"
                className="size-16 rounded-full border object-cover"
              />
              <span className="text-xs font-medium">
                {member.oshiMark ? <span aria-hidden="true">{member.oshiMark} </span> : null}
                {member.displayName}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function DiscoverHero({ song }: { song: OtwPlayPublicSongSummaryDto }) {
  const performance = song.representativePerformance;
  const thumbnail = performance.selectedSource?.thumbnailUrl;
  return (
    <article className="relative isolate min-h-[400px] overflow-hidden rounded-[1.75rem] border bg-black shadow-xl">
      <div className="absolute inset-0 overflow-hidden">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            width={960}
            height={540}
            loading="eager"
            className="h-full w-full object-cover"
          />
        ) : null}
        <div className="absolute inset-0 bg-black/55" />
      </div>
      <div className="relative flex min-h-[400px] max-w-3xl flex-col justify-end gap-4 p-6 text-white sm:p-8 lg:p-10">
        <div className="w-fit rounded-full border border-white/25 bg-black/55 px-3 py-1 text-xs font-semibold">
          FEATURED
        </div>
        <div>
          <p className="text-xs font-semibold text-white/70">
            {relationLabel[performance.relation]} · 공식 버전 {song.performanceCount}개
          </p>
          <Link
            to="/play/songs/$songSlug"
            params={{ songSlug: song.slug }}
            search={{ performance: undefined }}
            className="mt-2 block break-words text-3xl font-bold leading-tight hover:underline sm:text-4xl"
          >
            {song.title}
          </Link>
          <p className="mt-3 text-sm text-white/75">
            원곡 가수 {song.originalArtists.map(({ displayName }) => displayName).join(", ") || "정보 없음"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-foreground">
          {performance.participants.map((participant) => (
            <OtwPlayParticipantChip
              key={`${participant.entityId}:${participant.creditOrder}`}
              participant={participant}
            />
          ))}
        </div>
        <OtwPlayPerformanceActions
          song={song}
          performance={performance}
          className="text-foreground"
        />
      </div>
    </article>
  );
}

function DiscoverSongLine({
  song,
  className,
}: {
  song: OtwPlayPublicSongSummaryDto;
  className?: string;
}) {
  const player = useOtwPlayPlayer();
  const performance = song.representativePerformance;
  const source = performance.selectedSource;
  const track = source?.playable ? { song, performance, source } : null;
  return (
    <article className={cn("grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3", className)}>
      <div className="size-12 overflow-hidden rounded-lg bg-muted">
        {source?.thumbnailUrl ? (
          <img src={source.thumbnailUrl} alt="" width={96} height={96} loading="lazy" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="min-w-0">
        <Link
          to="/play/songs/$songSlug"
          params={{ songSlug: song.slug }}
          search={{ performance: undefined }}
          className="block truncate text-sm font-semibold hover:underline"
        >
          {song.title}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {performance.participants.map(({ displayName }) => displayName).join(", ") || "참여자 정보 없음"}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" size="icon-sm" disabled={!track} aria-label={`${song.title} 재생`} onClick={() => track && player.play(track)}>
          <Play />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" disabled={!track} aria-label={`${song.title} 대기열에 추가`} onClick={() => track && player.enqueue(track)}>
          <ListPlus />
        </Button>
      </div>
    </article>
  );
}

function DiscoverVideoCard({ song }: { song: OtwPlayPublicSongSummaryDto }) {
  const performance = song.representativePerformance;
  const source = performance.selectedSource;
  return (
    <article className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="aspect-video overflow-hidden bg-muted">
        {source?.thumbnailUrl ? (
          <img src={source.thumbnailUrl} alt="" width={480} height={270} loading="lazy" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="space-y-2 p-3">
        <Link
          to="/play/songs/$songSlug"
          params={{ songSlug: song.slug }}
          search={{ performance: undefined }}
          className="line-clamp-2 text-sm font-semibold hover:underline"
        >
          {song.title}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {performance.participants.map(({ displayName }) => displayName).join(", ") || "참여자 정보 없음"}
        </p>
        <OtwPlayPerformanceActions song={song} performance={performance} compact />
      </div>
    </article>
  );
}
