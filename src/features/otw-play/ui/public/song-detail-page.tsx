import { ArrowLeft, ExternalLink, LoaderCircle, Play } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { ApiError } from "@/shared/api/client";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { useOtwPlaySong } from "../../queries/use-public-catalog";
import { useOtwPlayPlayer } from "../../player/play-player-context";
import {
  OtwPlayParticipantCreditGroups,
  OtwPlayPerformanceActions,
  relationLabel,
} from "./catalog-components";
import { OtwPlayQueryError } from "./public-query-state";
import { OtwPlayThumbnail } from "../otw-play-thumbnail";

export function OtwPlaySongDetailPage({
  songSlug,
  highlightedPerformanceId,
}: {
  songSlug: string;
  highlightedPerformanceId?: string;
}) {
  const query = useOtwPlaySong(songSlug);
  const player = useOtwPlayPlayer();

  if (query.isPending) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground" aria-busy="true">
        <LoaderCircle className="mr-2 size-4 animate-spin" /> 곡 상세 불러오는 중
      </div>
    );
  }
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <div className="mx-auto max-w-xl p-8 text-center">
          <h1 className="text-xl font-semibold">공개된 곡을 찾지 못했습니다</h1>
          <Button asChild variant="outline" className="mt-4"><Link to="/play/songs">곡 검색으로</Link></Button>
        </div>
      );
    }
    return <div className="mx-auto max-w-screen-lg p-5"><OtwPlayQueryError error={query.error} retry={() => void query.refetch()} /></div>;
  }

  const song = query.data?.data;
  if (!song) return null;
  const heroPerformance =
    song.performances.find(({ id }) => id === highlightedPerformanceId) ??
    song.performances[0];

  return (
    <div className="mx-auto w-full max-w-screen-xl space-y-7 px-3 py-5 sm:px-5 lg:px-7 xl:px-8">
      <Button asChild variant="ghost" size="sm">
        <Link to="/play/songs"><ArrowLeft /> 곡 검색</Link>
      </Button>

      <section className="grid gap-5 rounded-2xl border bg-card p-4 shadow-sm md:grid-cols-[minmax(16rem,28rem)_1fr] md:p-6">
        <div className="aspect-video overflow-hidden rounded-xl bg-muted">
          {heroPerformance?.selectedSource ? (
            <OtwPlayThumbnail
              source={heroPerformance.selectedSource}
              alt=""
              width={640}
              height={360}
              className="h-full w-full object-cover"
              fallback={
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  썸네일 없음
                </div>
              }
            />
          ) : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">썸네일 없음</div>}
        </div>
        <div className="flex flex-col justify-center gap-4">
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              {song.isOtwOriginal ? <Badge>OTW 오리지널</Badge> : <Badge variant="secondary">공식 커버</Badge>}
              <Badge variant="outline">공식 버전 {song.performanceCount}개</Badge>
            </div>
            <h1 className="text-2xl font-semibold sm:text-3xl">{song.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              원곡 가수 {song.originalArtists.map(({ displayName }) => displayName).join(", ") || "정보 없음"}
            </p>
          </div>
          {heroPerformance ? <OtwPlayPerformanceActions song={song} performance={heroPerformance} /> : null}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">공식 버전</h2>
          <p className="text-sm text-muted-foreground">모든 공개 공식 가창과 검수된 source를 비교합니다.</p>
        </div>
        {song.performances.map((performance) => {
          const highlighted = performance.id === highlightedPerformanceId;
          return (
            <article
              key={performance.id}
              id={`performance-${performance.id}`}
              className={cn("scroll-mt-24 rounded-xl border bg-card p-4 shadow-sm", highlighted && "border-primary ring-2 ring-primary/20")}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{relationLabel[performance.relation]}</Badge>
                    <Badge variant="outline">{performance.releaseType === "official_mv" ? "공식 MV" : "공식 영상"}</Badge>
                    {highlighted ? <Badge>직접 링크로 선택됨</Badge> : null}
                  </div>
                  <div className="mt-3">
                    <OtwPlayParticipantCreditGroups participants={performance.participants} />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {performance.releasedAt ? new Date(performance.releasedAt).toLocaleDateString("ko-KR") : "공개일 미상"}
                    {performance.selectedSource ? ` · ${performance.selectedSource.channel.displayName}` : " · 공개 source 없음"}
                  </p>
                </div>
                <OtwPlayPerformanceActions song={song} performance={performance} compact />
              </div>

              <div className="mt-4 space-y-2 border-t pt-4">
                <h3 className="text-sm font-semibold">공식 source</h3>
                {performance.sources.length === 0 ? (
                  <p className="text-sm text-muted-foreground">공개 가능한 source가 없습니다.</p>
                ) : performance.sources.map((source) => (
                  <div key={source.sourceId} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs">
                    <span className="font-medium">{source.channel.displayName}</span>
                    <span className="text-muted-foreground">{source.isPrimary ? "대표" : "대체"}</span>
                    <span className={source.playable ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                      {source.playable ? "재생 가능" : source.availability}
                    </span>
                    {performance.selectedSource?.sourceId === source.sourceId && performance.usingFallback ? (
                      <span className="text-amber-600 dark:text-amber-400">대체 source 사용 중</span>
                    ) : null}
                    <div className="ml-auto flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={!source.playable}
                        onClick={() => player.play({ song, performance, source })}
                      >
                        <Play /> 이 source 재생
                      </Button>
                      <Button asChild variant="ghost" size="sm">
                        <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(source.externalId)}`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink /> YouTube
                        </a>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
