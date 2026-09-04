import { Link } from "@tanstack/react-router";
import { CalendarDays, Check, Disc3, ListPlus, Play, StepForward } from "lucide-react";
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
import {
  groupOtwPlayParticipantCredits,
  presentOtwPlayParticipants,
} from "./participant-presentation";

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

const releaseTypeLabel = {
  official_mv: "공식 MV",
  official_video: "공식 영상",
} as const;

export function OtwPlaySongTags({
  tags = [],
  singleLine = false,
}: {
  tags?: readonly string[];
  singleLine?: boolean;
}) {
  if (tags.length === 0) return null;
  return (
    <div
      className={cn(
        "flex gap-1.5",
        singleLine ? "shrink-0 flex-nowrap whitespace-nowrap" : "flex-wrap",
      )}
      aria-label="음악 분류"
    >
      {tags.map((tag) => (
        <Badge key={tag} className={cn(singleLine && "shrink-0 whitespace-nowrap")}>
          {tag}
        </Badge>
      ))}
    </div>
  );
}

export function OtwPlayPerformanceTags({
  tags = [],
  singleLine = false,
}: {
  tags?: readonly string[];
  singleLine?: boolean;
}) {
  if (tags.length === 0) return null;
  return (
    <div
      className={cn(
        "flex gap-1.5",
        singleLine ? "shrink-0 flex-nowrap whitespace-nowrap" : "flex-wrap",
      )}
      aria-label="커버 영상 라벨"
    >
      {tags.map((tag) => (
        <Badge
          key={tag}
          variant="secondary"
          className={cn(singleLine && "shrink-0 whitespace-nowrap")}
        >
          {tag}
        </Badge>
      ))}
    </div>
  );
}

export function OtwPlayPerformanceMetadata({
  performance,
  inverse = false,
  singleLine = false,
}: {
  performance: Pick<OtwPlayPublicPerformanceSummaryDto, "relation" | "releaseType" | "participation">;
  inverse?: boolean;
  singleLine?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-x-2 gap-y-1 text-[11px]",
        singleLine ? "shrink-0 flex-nowrap whitespace-nowrap" : "flex-wrap",
        inverse ? "text-white/70" : "text-muted-foreground",
      )}
      aria-label="가창 분류"
    >
      <span>{relationLabel[performance.relation]}</span>
      <span aria-hidden="true">·</span>
      <span>{releaseTypeLabel[performance.releaseType]}</span>
      <span aria-hidden="true">·</span>
      <span>{participationLabel[performance.participation]}</span>
    </div>
  );
}

export function OtwPlayPerformanceBadges({
  performance,
  singleLine = false,
}: {
  performance: Pick<
    OtwPlayPublicPerformanceSummaryDto,
    "relation" | "releaseType" | "participation" | "releasedAt"
  >;
  singleLine?: boolean;
}) {
  const releasedAt = performance.releasedAt
    ? new Date(performance.releasedAt).toLocaleDateString("ko-KR")
    : null;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5",
        singleLine ? "shrink-0 flex-nowrap whitespace-nowrap" : "flex-wrap",
      )}
      aria-label="가창 및 공개 정보"
    >
      <Badge
        variant="outline"
        className="h-6 border-primary/25 bg-primary/5 px-2 text-[11px] font-medium text-primary"
      >
        {relationLabel[performance.relation]}
      </Badge>
      <Badge
        variant="secondary"
        className="h-6 px-2 text-[11px] font-medium"
      >
        {releaseTypeLabel[performance.releaseType]}
      </Badge>
      <Badge
        variant="outline"
        className="h-6 px-2 text-[11px] font-medium text-muted-foreground"
      >
        {participationLabel[performance.participation]}
      </Badge>
      <Badge
        variant="outline"
        className="h-6 gap-1 px-2 text-[11px] font-medium tabular-nums text-muted-foreground"
        aria-label={releasedAt ? `게시일 ${releasedAt}` : "게시일 미상"}
      >
        <CalendarDays className="size-3" aria-hidden="true" />
        {releasedAt ?? "게시일 미상"}
      </Badge>
    </div>
  );
}

export function OtwPlayParticipantChip({
  participant,
}: {
  participant: OtwPlayPublicParticipantDto;
}) {
  if (participant.kind === "current_member") {
    return (
      <Link
        to="/play/songs"
        search={{ member: String(participant.uid), participantRole: "vocal" }}
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
    </div>
  );
}

export function OtwPlayParticipantCreditGroups({
  participants,
}: {
  participants: OtwPlayPublicParticipantDto[];
}) {
  const groups = groupOtwPlayParticipantCredits(participants);

  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">가창 credit 정보가 없습니다.</p>;
  }

  return (
    <div className="space-y-2" aria-label="가창 credit">
      {groups.map((group) => (
        <div
          key={group.role}
          className="grid gap-1.5 sm:grid-cols-[7rem_minmax(0,1fr)] sm:items-start"
          role="group"
          aria-label={group.label}
        >
          <span className="pt-1 text-xs font-semibold text-muted-foreground">
            {group.label}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {group.participants.map((participant) => (
              <OtwPlayParticipantChip
                key={`${participant.entityId}:${participant.creditOrder}`}
                participant={participant}
              />
            ))}
          </div>
        </div>
      ))}
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
  song: { id: string; slug: string; title: string; tags?: string[] };
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
        "overflow-hidden rounded-2xl border bg-card shadow-sm transition-[border-color,box-shadow,transform] duration-200 focus-within:border-primary/40 focus-within:shadow-md hover:border-primary/25 hover:shadow-md",
        hero
          ? "grid lg:grid-cols-[minmax(0,1.45fr)_minmax(20rem,1fr)]"
          : "grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 p-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4 sm:p-4",
      )}
    >
      <div
        className={cn(
          "relative shrink-0 overflow-hidden bg-muted",
          hero
            ? "aspect-video min-h-[220px]"
            : "aspect-video w-full self-start rounded-xl ring-1 ring-border/50",
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
      <div
        className={cn(
          "min-w-0 flex-1",
          hero
            ? "flex flex-col justify-center gap-4 p-5 sm:p-7"
            : "flex flex-col gap-2.5",
        )}
      >
        {!hero ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <OtwPlaySongTags tags={song.tags} />
            <OtwPlayPerformanceBadges performance={performance} />
            <OtwPlayPerformanceTags tags={performance.tags} />
            <Badge
              variant="outline"
              className="h-6 px-2 text-[11px] font-medium text-muted-foreground"
            >
              공식 버전 {song.performanceCount}개
            </Badge>
            {!song.playable ? (
              <Badge
                variant="outline"
                className="h-6 border-amber-500/40 bg-amber-500/10 px-2 text-[11px] font-medium text-amber-700 dark:text-amber-300"
              >
                현재 재생 불가
              </Badge>
            ) : null}
          </div>
        ) : null}
        <div>
          {hero ? (
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <OtwPlaySongTags tags={song.tags} />
              <span className="text-xs text-muted-foreground">
                공식 버전 {song.performanceCount}개
              </span>
            </div>
          ) : null}
          <Link
            to="/play/songs/$songSlug"
            params={{ songSlug: song.slug }}
            search={{ performance: undefined }}
            className={cn("font-semibold hover:underline", hero ? "text-2xl sm:text-4xl" : "line-clamp-1 text-base")}
          >
            {song.title}
          </Link>
          <p
            className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
            aria-label={`원곡 가수 ${song.originalArtists.map(({ displayName }) => displayName).join(", ") || "정보 없음"}`}
          >
            <Disc3 className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {song.originalArtists.map(({ displayName }) => displayName).join(", ") || "아티스트 정보 없음"}
            </span>
          </p>
        </div>
        <OtwPlayParticipantSummary participants={performance.participants} />
        <OtwPlayPerformanceActions
          song={song}
          performance={performance}
          compact={!hero}
          className={cn(!hero && "mt-auto border-t pt-2.5")}
        />
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
