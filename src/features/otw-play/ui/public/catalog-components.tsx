import { Link } from "@tanstack/react-router";
import { Check, ListPlus, Play, StepForward } from "lucide-react";
import type {
  OtwPlayPublicParticipantDto,
  OtwPlayPublicPerformanceDetailDto,
  OtwPlayPublicPerformanceSummaryDto,
  OtwPlayPublicSongSummaryDto,
} from "@contracts/otw-play";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import {
  useOtwPlayPlayer,
  type OtwPlayTrack,
} from "../../player/play-player-context";
import { OtwPlayThumbnail } from "../otw-play-thumbnail";
import { OtwPlaySupportingRoleChips } from "../participant-role-chips";
import { presentOtwPlayParticipants } from "./participant-presentation";

// eslint-disable-next-line react-refresh/only-export-components
export const relationLabel = {
  original: "오리지널",
  cover: "공식 커버",
} as const;

const participationLabel = {
  solo: "솔로",
  duet: "듀엣",
  unit: "유닛",
  group: "단체",
  external_collab: "외부 협업",
} as const;

export function OtwPlayParticipantChip({
  participant,
}: {
  participant: OtwPlayPublicParticipantDto;
}) {
  if (participant.kind === "current_member") {
    return (
      <Link
        to="/play/songs"
        search={{ member: String(participant.uid) }}
        aria-label={`현재 OTW 멤버, ${participant.displayName}`}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-full border bg-card px-2.5 text-xs font-medium hover:bg-accent"
      >
        {participant.oshiMark ? <span aria-hidden="true">{participant.oshiMark}</span> : null}
        {participant.displayName}
      </Link>
    );
  }
  if (participant.kind === "group") {
    return (
      <Link
        to="/play/songs"
        search={{ group: participant.groupKey }}
        aria-label={`그룹, ${participant.displayName}`}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-full border bg-muted px-2.5 text-xs font-medium hover:bg-accent"
      >
        {participant.displayName}
        <span className="text-[10px] text-muted-foreground">그룹</span>
      </Link>
    );
  }
  return (
    <Link
      to="/play/songs"
      search={{ participant: participant.slug }}
      aria-label={`외부 참여자, ${participant.displayName}`}
      className="inline-flex min-h-8 items-center rounded-full border border-dashed bg-background px-2.5 text-xs font-medium hover:bg-accent"
    >
      {participant.displayName}
    </Link>
  );
}

export function OtwPlayParticipantSummary({
  participants,
}: {
  participants: OtwPlayPublicParticipantDto[];
}) {
  const presentation = presentOtwPlayParticipants(participants);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {presentation.primary.map((participant) => (
        <OtwPlayParticipantChip
          key={`${participant.entityId}:${participant.creditOrder}`}
          participant={participant}
        />
      ))}
      <OtwPlaySupportingRoleChips participants={participants} />
    </div>
  );
}

export function OtwPlayPerformanceActions({
  song,
  performance,
  compact = false,
  iconOnly = false,
  className,
}: {
  song: { id: string; slug: string; title: string };
  performance: OtwPlayPublicPerformanceSummaryDto | OtwPlayPublicPerformanceDetailDto;
  compact?: boolean;
  iconOnly?: boolean;
  className?: string;
}) {
  const player = useOtwPlayPlayer();
  const source = performance.selectedSource;
  const track: OtwPlayTrack | null =
    source?.playable
      ? { song, performance, source }
      : null;
  const alreadyQueued = player.queue.items.some(
    ({ performanceId }) => performanceId === performance.id,
  );

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <Button
        type="button"
        size={iconOnly ? "icon-sm" : compact ? "sm" : "default"}
        disabled={!track}
        onClick={() => track && player.play(track)}
        aria-label={iconOnly ? `${song.title} 재생` : undefined}
      >
        <Play /> {iconOnly ? <span className="sr-only">재생</span> : "재생"}
      </Button>
      <Button
        type="button"
        variant="outline"
        size={iconOnly ? "icon-sm" : compact ? "sm" : "default"}
        disabled={!track || alreadyQueued}
        onClick={() => track && player.enqueue(track)}
        aria-label={
          iconOnly
            ? alreadyQueued
              ? `${song.title} 플레이큐에 있음`
              : `${song.title} 마지막에 추가`
            : undefined
        }
      >
        {alreadyQueued ? <Check /> : <ListPlus />} {iconOnly ? (
          <span className="sr-only">
            {alreadyQueued ? "플레이큐에 있음" : "마지막에 추가"}
          </span>
        ) : alreadyQueued ? (
          "추가됨"
        ) : (
          "마지막에 추가"
        )}
      </Button>
      {!compact && (
        <Button
          type="button"
          variant="outline"
          disabled={!track}
          onClick={() => track && player.playNext(track)}
        >
          <StepForward /> 다음에 재생
        </Button>
      )}
    </div>
  );
}

export function OtwPlaySongRow({
  song,
  hero = false,
}: {
  song: OtwPlayPublicSongSummaryDto;
  hero?: boolean;
}) {
  const performance = song.representativePerformance;
  const source = performance.selectedSource;
  return (
    <article
      className={cn(
        "overflow-hidden rounded-xl border bg-card shadow-sm",
        hero ? "grid lg:grid-cols-[minmax(0,1.45fr)_minmax(20rem,1fr)]" : "flex gap-3 p-3",
      )}
    >
      <div
        className={cn(
          "relative shrink-0 overflow-hidden bg-muted",
          hero ? "aspect-video min-h-[220px]" : "h-20 w-36 rounded-lg sm:h-24 sm:w-44",
        )}
      >
        {source ? (
          <OtwPlayThumbnail
            source={source}
            alt=""
            width={480}
            height={270}
            loading={hero ? "eager" : "lazy"}
            className="h-full w-full object-cover"
            fallback={
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                썸네일 없음
              </div>
            }
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">썸네일 없음</div>
        )}
      </div>
      <div className={cn("min-w-0 flex-1", hero ? "flex flex-col justify-center gap-4 p-5 sm:p-7" : "space-y-2")}>
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{relationLabel[performance.relation]}</Badge>
            <span className="text-xs text-muted-foreground">
              공식 버전 {song.performanceCount}개
            </span>
          </div>
          <Link
            to="/play/songs/$songSlug"
            params={{ songSlug: song.slug }}
            search={{ performance: undefined }}
            className={cn("font-semibold hover:underline", hero ? "text-2xl sm:text-4xl" : "line-clamp-1 text-base")}
          >
            {song.title}
          </Link>
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
            원곡 가수 {song.originalArtists.map(({ displayName }) => displayName).join(", ") || "정보 없음"}
          </p>
        </div>
        <OtwPlayParticipantSummary participants={performance.participants} />
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{participationLabel[performance.participation]}</span>
          <span>{performance.releasedAt ? new Date(performance.releasedAt).toLocaleDateString("ko-KR") : "공개일 미상"}</span>
          {!song.playable ? <span className="text-amber-600 dark:text-amber-400">현재 재생 불가</span> : null}
        </div>
        <OtwPlayPerformanceActions song={song} performance={performance} compact={!hero} />
      </div>
    </article>
  );
}

export function OtwPlaySection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold sm:text-xl">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
