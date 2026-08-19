import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ListMusic,
  Maximize2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  RefreshCw,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  UserRound,
  UsersRound,
  Volume1,
  Volume2,
  VolumeX,
  Youtube,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { useOtwPlayPlayer } from "../../player/play-player-context";
import { OtwPlayThumbnail } from "../otw-play-thumbnail";
import { presentOtwPlayParticipants } from "../public/participant-presentation";

const repeatLabel = {
  off: "반복 꺼짐",
  all: "전체 반복",
  one: "한 곡 반복",
} as const;

const relationLabel = {
  original: "오리지널",
  cover: "공식 커버",
} as const;

const releaseTypeLabel = {
  official_mv: "공식 MV",
  official_video: "공식 영상",
} as const;

const participationLabel = {
  solo: "솔로",
  duet: "듀엣",
  unit: "유닛",
  group: "단체",
  external_collab: "외부 협업",
} as const;

const formatPlaybackTime = (seconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const remainingSeconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
};

const participantSummaryText = (
  participants: NonNullable<
    OtwPlayPlayerContext["currentTrack"]
  >["performance"]["participants"],
) => {
  const presentation = presentOtwPlayParticipants(participants);
  return presentation.primaryNames || "참여자 정보 없음";
};

type OtwPlayPlayerContext = ReturnType<typeof useOtwPlayPlayer>;

type MobilePlayerPresentation = "full" | "mini" | "launcher";

const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const media = window.matchMedia(query);
    const handleChange = () => setMatches(media.matches);
    handleChange();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [query]);

  return matches;
};

export function OtwPlayPlayerQueuePanel() {
  const player = useOtwPlayPlayer();
  const current = player.currentTrack;
  const currentItem = player.currentItem;
  const currentItemId = player.currentItem?.id ?? null;
  const currentLoadFailed = Boolean(
    currentItem && player.retryableItemIds.has(currentItem.id),
  );
  const previousCurrentItemIdRef = useRef<string | null>(null);
  const [mobilePresentation, setMobilePresentation] =
    useState<MobilePlayerPresentation>("launcher");
  const [shortRailView, setShortRailView] = useState<"player" | "queue">("player");
  const isMiniPlayerViewport = useMediaQuery(
    "(min-width: 640px) and (max-width: 1279px)",
  );
  const isPhonePlayerViewport = useMediaQuery("(max-width: 639px)");
  const isDesktopPlayerViewport = useMediaQuery("(min-width: 1280px)");
  const mobilePlayerOpen = mobilePresentation === "full";
  const miniPlayerActive = current !== null && mobilePresentation === "mini";
  const RepeatIcon = player.queue.repeat === "one" ? Repeat1 : Repeat;
  const nextRepeat =
    player.queue.repeat === "off"
      ? "all"
      : player.queue.repeat === "all"
        ? "one"
        : "off";

  useEffect(() => {
    const previousCurrentItemId = previousCurrentItemIdRef.current;
    if (currentItemId === null) {
      setMobilePresentation("launcher");
    } else if (previousCurrentItemId === null) {
      setMobilePresentation("full");
    }
    previousCurrentItemIdRef.current = currentItemId;
  }, [currentItemId]);

  useEffect(() => {
    if (!miniPlayerActive) return;
    if (isPhonePlayerViewport || isDesktopPlayerViewport) {
      setMobilePresentation("full");
    }
  }, [isDesktopPlayerViewport, isPhonePlayerViewport, miniPlayerActive]);

  const closeMobilePlayer = () => {
    if (isMiniPlayerViewport && current) {
      setMobilePresentation("mini");
      return;
    }
    if (current) player.pause();
    setMobilePresentation("launcher");
  };

  const openPausedMobilePlayer = () => {
    setMobilePresentation("full");
    if (current) window.requestAnimationFrame(player.resume);
  };

  const expandMiniPlayer = () => {
    setMobilePresentation("full");
  };

  const VolumeIcon =
    player.muted || player.volume === 0
      ? VolumeX
      : player.volume < 50
        ? Volume1
        : Volume2;

  return (
    <aside
      aria-label="OTW Play 재생 및 플레이큐"
      className="pointer-events-none fixed inset-0 z-[70] xl:pointer-events-auto xl:static xl:flex xl:h-full xl:min-h-0 xl:w-[380px] xl:shrink-0 xl:flex-col xl:overflow-hidden xl:border-l xl:bg-card xl:text-card-foreground"
    >
      <section
        aria-label="OTW Play 재생 플레이어"
        data-player-presentation={mobilePresentation}
        className={cn(
          "pointer-events-auto bg-background text-foreground",
          currentItem && mobilePlayerOpen ? "fixed inset-0 flex flex-col" : "hidden",
          miniPlayerActive &&
            "sm:fixed sm:bottom-3 sm:right-3 sm:flex sm:w-[216px] sm:flex-col sm:overflow-hidden sm:rounded-xl sm:border sm:bg-card sm:shadow-2xl xl:static xl:bottom-auto xl:right-auto xl:w-auto xl:rounded-none xl:border-0 xl:shadow-none",
          "xl:static xl:flex xl:shrink-0 xl:flex-col xl:border-b xl:bg-card",
        )}
      >
        {current ? (
          <>
            <header
              className={cn(
                "flex h-14 shrink-0 items-center justify-between border-b px-3 xl:hidden",
                miniPlayerActive &&
                  "[@media_(min-width:640px)_and_(max-width:1279px)]:hidden",
              )}
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="카탈로그로 돌아가기"
                onClick={closeMobilePlayer}
              >
                <ArrowLeft />
              </Button>
              <div className="min-w-0 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Now playing
                </p>
                <p className="max-w-56 truncate text-sm font-semibold">
                  {current.song.title}
                </p>
              </div>
              <span className="flex min-w-9 items-center justify-center rounded-full bg-muted px-2 py-1 text-xs">
                {player.queue.items.length}
              </span>
            </header>

            <YouTubePlayerHost
              setHostElement={player.setHostElement}
              source={current.source}
              className={cn(
                "shrink-0 rounded-none xl:m-3 xl:mb-0 xl:h-[200px] xl:w-[356px] xl:max-w-none [@media_(min-width:1280px)_and_(max-height:719px)]:m-2 [@media_(min-width:1280px)_and_(max-height:719px)]:mb-0 [@media_(min-width:1280px)_and_(max-height:719px)]:w-[364px]",
                miniPlayerActive
                  ? "sm:m-2 sm:h-[200px] sm:w-[200px] sm:max-w-none sm:rounded-lg sm:[aspect-ratio:1/1]"
                  : "sm:mx-auto sm:mt-4 sm:max-w-2xl sm:rounded-xl",
              )}
            />

            {miniPlayerActive ? (
              <div
                data-testid="otw-play-mini-player-controls"
                className="hidden h-12 shrink-0 items-center gap-1 border-t px-2 [@media_(min-width:640px)_and_(max-width:1279px)]:flex"
              >
                <p className="min-w-0 flex-1 truncate text-xs font-semibold">
                  {current.song.title}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={player.status === "playing" ? "미니 플레이어 일시정지" : "미니 플레이어 재생"}
                  onClick={player.status === "playing" ? player.pause : player.resume}
                >
                  {player.status === "playing" ? <Pause /> : <Play />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="전체 Now Playing 열기"
                  onClick={expandMiniPlayer}
                >
                  <Maximize2 />
                </Button>
              </div>
            ) : null}

            <div
              role="group"
              aria-label="낮은 화면 재생 영역 전환"
              className="hidden h-10 shrink-0 items-center gap-1 border-b px-2 [@media_(min-width:1280px)_and_(max-height:639px)]:flex"
            >
              <Button
                type="button"
                variant={shortRailView === "player" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 flex-1"
                aria-pressed={shortRailView === "player"}
                onClick={() => setShortRailView("player")}
              >
                현재 재생
              </Button>
              <Button
                type="button"
                variant={shortRailView === "queue" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 flex-1"
                aria-pressed={shortRailView === "queue"}
                onClick={() => setShortRailView("queue")}
              >
                플레이큐 {player.queue.items.length}
              </Button>
            </div>

            <div
              data-testid="otw-play-player-details"
              className={cn(
                "min-h-0 flex-1 overflow-y-auto px-4 py-5 xl:flex-none xl:overflow-visible xl:px-4 xl:pb-4 xl:pt-3 [@media_(min-width:1280px)_and_(max-height:719px)]:px-3 [@media_(min-width:1280px)_and_(max-height:719px)]:py-2",
                miniPlayerActive &&
                  "[@media_(min-width:640px)_and_(max-width:1279px)]:hidden",
                shortRailView === "queue" &&
                  "[@media_(min-width:1280px)_and_(max-height:639px)]:!hidden",
              )}
            >
              <div className="flex flex-wrap gap-2 [@media_(min-width:1280px)_and_(max-height:719px)]:hidden">
                <Badge>{relationLabel[current.performance.relation]}</Badge>
                <Badge variant="secondary">
                  {releaseTypeLabel[current.performance.releaseType]}
                </Badge>
                <Badge variant="outline">
                  {participationLabel[current.performance.participation]}
                </Badge>
              </div>
              <h2 className="mt-3 break-words text-2xl font-bold leading-tight xl:line-clamp-2 xl:text-lg [@media_(min-width:1280px)_and_(max-height:719px)]:mt-0 [@media_(min-width:1280px)_and_(max-height:719px)]:line-clamp-1">
                {current.song.title}
              </h2>
              <div
                data-testid="otw-play-identity-actions"
                className="mt-2 flex min-w-0 items-center gap-2 [@media_(min-width:1280px)_and_(max-height:719px)]:mt-1"
              >
                <ParticipantIdentity track={current} />
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  <Button asChild variant="ghost" size="icon-sm">
                    <a
                      href={`https://www.youtube.com/watch?v=${encodeURIComponent(current.source.externalId)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="YouTube에서 열기"
                    >
                      <ExternalLink />
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link
                      to="/play/songs/$songSlug"
                      params={{ songSlug: current.song.slug }}
                      search={{ performance: current.performance.id }}
                    >
                      곡 상세
                    </Link>
                  </Button>
                </div>
              </div>

              <div
                data-testid="otw-play-transport-controls"
                className="mt-4 flex items-center justify-center gap-1 xl:justify-between [@media_(min-width:1280px)_and_(max-height:719px)]:mt-1"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="이전 항목"
                  onClick={player.previous}
                >
                  <SkipBack />
                </Button>
                {player.status === "playing" ? (
                  <Button
                    type="button"
                    size="icon-lg"
                    className="rounded-full"
                    aria-label="일시정지"
                    onClick={player.pause}
                  >
                    <Pause />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="icon-lg"
                    className="rounded-full"
                    aria-label="재생"
                    onClick={player.resume}
                  >
                    <Play />
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="다음 항목"
                  onClick={() => player.next()}
                >
                  <SkipForward />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${repeatLabel[player.queue.repeat]}; 다음 모드로 변경`}
                  aria-pressed={player.queue.repeat !== "off"}
                  onClick={() => player.setRepeat(nextRepeat)}
                >
                  <RepeatIcon />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="현재 곡을 제외하고 대기열 섞기"
                  aria-pressed={player.queue.shuffled}
                  disabled={player.queue.items.length < 2}
                  onClick={player.shuffle}
                >
                  <Shuffle />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={player.muted ? "음소거 해제" : "음소거"}
                  aria-pressed={player.muted}
                  onClick={player.toggleMuted}
                >
                  <VolumeIcon />
                </Button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={player.muted ? 0 : player.volume}
                  aria-label="재생 볼륨"
                  onChange={(event) =>
                    player.setVolume(Number(event.currentTarget.value))
                  }
                  className="h-8 w-16 min-w-0 cursor-pointer accent-primary sm:w-24 xl:w-16"
                />
              </div>

              <PublisherIdentity track={current} />

              <PlaybackProgress player={player} />

              <MobilePlayerQueue player={player} />
            </div>
          </>
        ) : currentItem ? (
          <>
            <header className="flex h-14 shrink-0 items-center justify-between border-b px-3 xl:hidden">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="카탈로그로 돌아가기"
                onClick={closeMobilePlayer}
              >
                <ArrowLeft />
              </Button>
              <span className="text-sm font-semibold">Now Playing</span>
              <span className="size-8" aria-hidden="true" />
            </header>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6 xl:h-[200px] xl:flex-none xl:items-center xl:justify-center xl:overflow-hidden">
              <div className="flex flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                  <RefreshCw className={cn("size-5", !currentLoadFailed && "animate-spin")} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {currentLoadFailed
                      ? "가창 정보를 불러오지 못했습니다"
                      : "가창 정보를 불러오는 중입니다"}
                  </p>
                  {currentLoadFailed ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-3"
                      onClick={() => player.retry(currentItem.id)}
                    >
                      <RefreshCw /> 다시 시도
                    </Button>
                  ) : null}
                </div>
              </div>
              <MobilePlayerQueue player={player} />
            </div>
          </>
        ) : (
          <div className="hidden h-[200px] flex-col items-center justify-center gap-3 bg-muted/30 px-6 text-center text-muted-foreground xl:flex">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Play className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                재생할 곡을 선택하세요
              </p>
              <p className="mt-1 text-xs">플레이어는 플레이큐 위에서 시작됩니다.</p>
            </div>
          </div>
        )}
      </section>

      {currentItem && mobilePresentation === "launcher" ? (
        <button
          type="button"
          className="pointer-events-auto fixed bottom-4 right-4 flex size-14 items-center justify-center overflow-hidden rounded-full border bg-background shadow-xl xl:hidden"
          aria-label="Now Playing 화면 열기"
          onClick={openPausedMobilePlayer}
        >
          {current ? (
            <>
              <OtwPlayThumbnail
                source={current.source}
                alt=""
                width={112}
                height={112}
                className="h-full w-full object-cover opacity-70"
              />
              <Play className="absolute size-5 drop-shadow" />
            </>
          ) : (
            <RefreshCw className="size-5" />
          )}
        </button>
      ) : null}

      <DesktopQueue
        player={player}
        hiddenForShortPlayer={current !== null && shortRailView === "player"}
      />
    </aside>
  );
}

function ParticipantIdentity({
  track,
}: {
  track: NonNullable<OtwPlayPlayerContext["currentTrack"]>;
}) {
  const participants = track.performance.participants;
  const presentation = presentOtwPlayParticipants(participants);
  const participantNames = participantSummaryText(participants);

  return (
    <div
      data-testid="otw-play-participant-identity"
      className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5"
    >
      {presentation.primary.length > 0 ? (
        <span className="flex shrink-0 -space-x-2" aria-hidden="true">
          {presentation.primary.slice(0, 3).map((participant) => (
            <ParticipantAvatar key={participant.entityId} participant={participant} />
          ))}
        </span>
      ) : null}
      <span
        data-testid="otw-play-participants"
        className="min-w-0 truncate text-sm font-medium text-foreground/85"
      >
        <span className="sr-only">참여자: </span>
        {participantNames}
      </span>
    </div>
  );
}

function ParticipantAvatar({
  participant,
}: {
  participant: NonNullable<
    OtwPlayPlayerContext["currentTrack"]
  >["performance"]["participants"][number];
}) {
  const FallbackIcon = participant.kind === "group" ? UsersRound : UserRound;

  return (
    <span
      className="relative flex size-7 items-center justify-center overflow-hidden rounded-full border-2 border-background bg-muted text-muted-foreground"
      title={participant.displayName}
    >
      <FallbackIcon className="size-3.5" />
      {participant.kind === "current_member" ? (
        <img
          src={`/profile/${encodeURIComponent(participant.code)}.webp`}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      ) : null}
    </span>
  );
}

function PublisherIdentity({
  track,
}: {
  track: NonNullable<OtwPlayPlayerContext["currentTrack"]>;
}) {
  return (
    <div
      data-testid="otw-play-publisher-identity"
      className="mt-3 flex min-w-0 items-center gap-1.5 border-t pt-2 text-xs text-muted-foreground [@media_(min-width:1280px)_and_(max-height:719px)]:hidden"
    >
      <Youtube className="size-4 shrink-0" aria-hidden="true" />
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.1em]">
        게시 채널
      </span>
      <span aria-hidden="true">·</span>
      <span className="min-w-0 truncate font-medium text-foreground/75">
        {track.source.channel.displayName}
      </span>
    </div>
  );
}

function PlaybackProgress({ player }: { player: OtwPlayPlayerContext }) {
  const duration = Math.max(0, player.playbackDurationSeconds);
  const position = Math.min(duration, Math.max(0, player.playbackPositionSeconds));
  const remaining = Math.max(0, duration - position);

  return (
    <div
      className="mt-3 [@media_(min-width:1280px)_and_(max-height:719px)]:mt-1"
      data-progress-visual="linear"
    >
      <input
        type="range"
        min="0"
        max={Math.max(1, duration)}
        step="1"
        value={position}
        disabled={duration === 0}
        aria-label="재생 위치"
        aria-valuetext={`${formatPlaybackTime(position)} 재생, ${formatPlaybackTime(remaining)} 남음`}
        onChange={(event) => player.seek(Number(event.currentTarget.value))}
        className="block h-4 w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
      />
      <div className="mt-0.5 flex items-center justify-between font-mono text-[11px] tabular-nums text-muted-foreground">
        <span aria-label="진행 시간">{formatPlaybackTime(position)}</span>
        <span aria-label="남은 시간">-{formatPlaybackTime(remaining)}</span>
      </div>
    </div>
  );
}

function DesktopQueue({
  player,
  hiddenForShortPlayer,
}: {
  player: OtwPlayPlayerContext;
  hiddenForShortPlayer: boolean;
}) {
  const hasQueue = player.queue.items.length > 0;

  return (
    <section
      aria-label="플레이큐"
      data-testid="otw-play-desktop-queue"
      className={cn(
        "hidden min-h-0 flex-1 flex-col xl:flex [@media_(min-width:1280px)_and_(max-height:719px)]:min-h-36",
        hiddenForShortPlayer &&
          "[@media_(min-width:1280px)_and_(max-height:639px)]:!hidden",
      )}
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b px-4 [@media_(min-width:1280px)_and_(max-height:719px)]:h-11">
        <div className="flex items-center gap-2">
          <ListMusic className="size-4" />
          <h2 className="text-sm font-semibold">플레이큐</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {player.queue.items.length}
          </span>
        </div>
      </div>

      {hasQueue ? (
        <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
          {player.queue.items.map((item, index) => {
            const track = player.trackForItem(item.id);
            const unavailable = player.unavailableItemIds.has(item.id);
            const retryable = player.retryableItemIds.has(item.id);
            const current = index === player.queue.currentIndex;
            return (
              <li
                key={item.id}
                className={cn(
                  "group flex items-center gap-2 rounded-xl border border-transparent px-2 py-2",
                  current && "border-primary/30 bg-primary/10",
                  unavailable && "opacity-60",
                )}
              >
                <button
                  type="button"
                  className="grid min-w-0 flex-1 grid-cols-[2rem_minmax(0,1fr)] items-center gap-2 text-left"
                  aria-current={current ? "true" : undefined}
                  disabled={unavailable || retryable}
                  onClick={() => player.select(index)}
                >
                  <span className="flex size-8 items-center justify-center overflow-hidden rounded-md bg-muted text-xs font-semibold">
                    {track?.source ? (
                      <OtwPlayThumbnail
                        source={track.source}
                        alt=""
                        width={64}
                        height={64}
                        className="h-full w-full object-cover"
                        fallback={index + 1}
                      />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {track?.song.title ??
                        (unavailable
                          ? "사용할 수 없는 가창"
                          : retryable
                            ? "다시 불러오기 필요"
                            : "불러오는 중")}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {track
                        ? participantSummaryText(track.performance.participants)
                        : item.performanceId}
                    </span>
                  </span>
                </button>
                {retryable ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="가창 정보 다시 불러오기"
                    onClick={() => player.retry(item.id)}
                  >
                    <RefreshCw />
                  </Button>
                ) : null}
                <QueueItemActions player={player} itemId={item.id} index={index} />
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted">
            <ListMusic className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold">플레이큐가 비어 있습니다</p>
          <p className="mt-1 max-w-52 text-xs leading-relaxed text-muted-foreground">
            곡의 재생 또는 대기열 추가 버튼을 누르면 이곳에서 순서를 관리할 수 있습니다.
          </p>
        </div>
      )}
      {player.announcement ? (
        <p className="sr-only" aria-live="polite">
          {player.announcement}
        </p>
      ) : null}
    </section>
  );
}

function QueueItemActions({
  player,
  itemId,
  index,
}: {
  player: OtwPlayPlayerContext;
  itemId: string;
  index: number;
}) {
  return (
    <div className="flex shrink-0 items-center">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="위로 이동"
        disabled={index === 0}
        onClick={() => player.move(itemId, -1)}
      >
        <ChevronUp />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="아래로 이동"
        disabled={index === player.queue.items.length - 1}
        onClick={() => player.move(itemId, 1)}
      >
        <ChevronDown />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="대기열에서 삭제"
        onClick={() => player.remove(itemId)}
      >
        <Trash2 />
      </Button>
    </div>
  );
}

function MobilePlayerQueue({
  player,
}: {
  player: OtwPlayPlayerContext;
}) {
  return (
    <section aria-label="모바일 플레이큐" className="mt-7 border-t pt-5 lg:hidden">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <ListMusic className="size-4" /> 플레이큐
        </h3>
        <span className="text-xs text-muted-foreground">
          {player.queue.items.length}곡
        </span>
      </div>
      <ol className="space-y-1 pb-4">
        {player.queue.items.map((item, index) => {
          const track = player.trackForItem(item.id);
          const unavailable = player.unavailableItemIds.has(item.id);
          const retryable = player.retryableItemIds.has(item.id);
          const current = index === player.queue.currentIndex;
          return (
            <li
              key={item.id}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2 py-2",
                current && "bg-primary/10",
              )}
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                aria-current={current ? "true" : undefined}
                disabled={unavailable || retryable}
                onClick={() => player.select(index)}
              >
                <span className="block truncate text-sm font-medium">
                  {track?.song.title ??
                    (unavailable
                      ? "사용할 수 없는 가창"
                      : retryable
                        ? "다시 불러오기 필요"
                        : "불러오는 중")}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {track
                    ? participantSummaryText(track.performance.participants)
                    : item.performanceId}
                </span>
              </button>
              {retryable ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="가창 정보 다시 불러오기"
                  onClick={() => player.retry(item.id)}
                >
                  <RefreshCw />
                </Button>
              ) : null}
              <QueueItemActions player={player} itemId={item.id} index={index} />
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function YouTubePlayerHost({
  setHostElement,
  source,
  className,
}: {
  setHostElement: (element: HTMLDivElement | null) => void;
  source: Parameters<typeof OtwPlayThumbnail>[0]["source"];
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const host = document.createElement("div");
    host.className = "h-full w-full";
    container.replaceChildren(host);
    setHostElement(host);
    return () => {
      setHostElement(null);
      container.replaceChildren();
    };
  }, [setHostElement]);

  return (
    <div
      className={cn(
        "relative aspect-video min-h-[200px] w-full overflow-hidden rounded-xl bg-black",
        className,
      )}
      aria-label="YouTube 영상 플레이어"
    >
      <OtwPlayThumbnail
        source={source}
        alt=""
        width={1280}
        height={720}
        loading="eager"
        className="absolute inset-0 h-full w-full"
      />
      <div ref={containerRef} className="relative z-10 h-full w-full" />
    </div>
  );
}
