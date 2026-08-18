import { Link } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ListMusic,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { useOtwPlayPlayer } from "../../player/play-player-context";

const repeatLabel = {
  off: "반복 꺼짐",
  all: "전체 반복",
  one: "한 곡 반복",
} as const;

const statusLabel = {
  idle: "재생 대기",
  loading: "불러오는 중",
  playing: "재생 중",
  paused: "일시정지",
  blocked: "재생 허용 필요",
  error: "재생할 수 없음",
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

const availabilityLabel = {
  unknown: "확인 전",
  playable: "재생 가능",
  private: "비공개",
  embed_disabled: "임베드 제한",
  deleted: "삭제됨",
  region_blocked: "지역 제한",
  unavailable: "재생 불가",
} as const;

const formatDuration = (seconds: number | null) => {
  if (seconds === null) return "길이 미상";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
};

export function OtwPlayQueuePanel() {
  const player = useOtwPlayPlayer();
  const hasQueue = player.queue.items.length > 0;

  return (
    <aside
      aria-label="플레이큐"
      className={cn(
        "z-40 min-h-0 shrink-0 border-border bg-card text-card-foreground",
        "fixed inset-x-0 bottom-16 top-16 border-t shadow-2xl xl:static xl:flex xl:w-[336px] xl:flex-col xl:border-l xl:border-t-0 xl:shadow-none",
        player.panelExpanded ? "flex flex-col" : "hidden xl:flex",
      )}
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <ListMusic className="size-4" />
          <h2 className="text-sm font-semibold">플레이큐</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {player.queue.items.length}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="xl:hidden"
          aria-label="플레이큐 닫기"
          onClick={player.closeQueue}
        >
          <X />
        </Button>
      </div>

      {hasQueue ? (
        <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
          {player.queue.items.map((item, index) => {
            const track = player.trackForItem(item.id);
            const unavailable = player.unavailableItemIds.has(item.id);
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
                  disabled={unavailable}
                  onClick={() => player.select(index)}
                >
                  <span className="flex size-8 items-center justify-center overflow-hidden rounded-md bg-muted text-xs font-semibold">
                    {track?.source.thumbnailUrl ? (
                      <img
                        src={track.source.thumbnailUrl}
                        alt=""
                        width={64}
                        height={64}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {track?.song.title ??
                        (unavailable ? "사용할 수 없는 가창" : "불러오는 중")}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {track?.performance.participants
                        .map(({ displayName }) => displayName)
                        .join(", ") || item.performanceId}
                    </span>
                  </span>
                </button>
                <div className="flex shrink-0 items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="위로 이동"
                    disabled={index === 0}
                    onClick={() => player.move(item.id, -1)}
                  >
                    <ChevronUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="아래로 이동"
                    disabled={index === player.queue.items.length - 1}
                    onClick={() => player.move(item.id, 1)}
                  >
                    <ChevronDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="대기열에서 삭제"
                    onClick={() => player.remove(item.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
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
      <p className="sr-only" aria-live="polite">
        {player.announcement}
      </p>
    </aside>
  );
}

export function OtwPlayPlaybackBar() {
  const player = useOtwPlayPlayer();
  const current = player.currentTrack;
  const currentItemId = player.currentItem?.id ?? null;
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const RepeatIcon = player.queue.repeat === "one" ? Repeat1 : Repeat;
  const nextRepeat =
    player.queue.repeat === "off"
      ? "all"
      : player.queue.repeat === "all"
        ? "one"
        : "off";

  useEffect(() => {
    setDetailsExpanded(currentItemId !== null);
  }, [currentItemId]);

  const toggleDetails = () => {
    if (detailsExpanded) {
      player.pause();
      setDetailsExpanded(false);
      return;
    }
    setDetailsExpanded(true);
  };

  const resume = () => {
    setDetailsExpanded(true);
    player.resume();
  };

  return (
    <div
      className={cn(
        "relative z-50 shrink-0",
        !current && "hidden lg:block",
      )}
    >
      {current ? (
        <section
          id="otw-play-current-details"
          aria-label="현재 재생 상세"
          aria-hidden={!detailsExpanded}
          className={cn(
            "absolute inset-x-0 bottom-full max-h-[calc(100dvh-7.5rem)] overflow-y-auto overscroll-contain border-t bg-card shadow-[0_-24px_52px_rgba(0,0,0,0.22)] transition-[opacity,transform] duration-200 lg:max-h-[min(34rem,calc(100dvh-8rem))]",
            detailsExpanded
              ? "visible translate-y-0 opacity-100"
              : "invisible translate-y-3 opacity-0",
          )}
        >
          <div className="mx-auto grid w-full max-w-7xl gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(22rem,0.95fr)_minmax(0,1.05fr)] lg:items-center lg:px-7">
            <YouTubePlayerHost setHostElement={player.setHostElement} />

            <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(13rem,0.72fr)] lg:items-end">
              <div className="min-w-0 space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge>{relationLabel[current.performance.relation]}</Badge>
                  <Badge variant="secondary">
                    {releaseTypeLabel[current.performance.releaseType]}
                  </Badge>
                  <Badge variant="outline">
                    {participationLabel[current.performance.participation]}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Now playing
                  </p>
                  <h2 className="mt-1 break-words text-2xl font-bold sm:text-3xl">
                    {current.song.title}
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {current.performance.participants.length > 0 ? (
                    current.performance.participants.map((participant) => (
                      <span
                        key={`${participant.entityId}:${participant.creditOrder}`}
                        className="rounded-full border bg-background px-3 py-1 text-xs font-medium"
                      >
                        {participant.displayName}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">참여자 정보 없음</span>
                  )}
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link
                    to="/play/songs/$songSlug"
                    params={{ songSlug: current.song.slug }}
                    search={{ performance: current.performance.id }}
                  >
                    곡과 가창 상세 보기 <ExternalLink />
                  </Link>
                </Button>
              </div>

              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-xl border bg-background/70 p-4 text-sm">
                <dt className="text-muted-foreground">채널</dt>
                <dd className="truncate font-medium">{current.source.channel.displayName}</dd>
                <dt className="text-muted-foreground">소스</dt>
                <dd className="line-clamp-2 font-medium">
                  {current.source.title ?? "제목 정보 없음"}
                </dd>
                <dt className="text-muted-foreground">재생 상태</dt>
                <dd className="font-medium">
                  {availabilityLabel[current.source.availability]}
                </dd>
                <dt className="text-muted-foreground">길이</dt>
                <dd className="font-medium">
                  {formatDuration(current.source.durationSeconds)}
                </dd>
              </dl>
            </div>
          </div>
        </section>
      ) : null}

      <section
        aria-label="재생 컨트롤"
        className="grid h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t bg-background/95 px-3 shadow-[0_-10px_30px_rgba(0,0,0,0.08)] backdrop-blur sm:px-5 lg:grid-cols-[minmax(15rem,1fr)_minmax(18rem,1.15fr)_minmax(15rem,1fr)]"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="size-10 shrink-0 overflow-hidden rounded-lg bg-muted">
            {current?.source.thumbnailUrl ? (
              <img
                src={current.source.thumbnailUrl}
                alt=""
                width={96}
                height={96}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Play className="size-4 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {current?.song.title ?? "재생할 곡을 선택하세요"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {current
                ? current.performance.participants
                    .map(({ displayName }) => displayName)
                    .join(", ") || "참여자 정보 없음"
                : "OTW Play"}
            </p>
          </div>
        </div>

        <div className="hidden min-w-0 items-center justify-center gap-1 lg:flex">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="이전 항목"
            disabled={!current}
            onClick={player.previous}
          >
            <SkipBack />
          </Button>
          {player.status === "playing" ? (
            <Button
              type="button"
              size="icon"
              className="rounded-full"
              aria-label="일시정지"
              onClick={player.pause}
            >
              <Pause />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              className="rounded-full"
              aria-label="재생"
              disabled={!current}
              onClick={resume}
            >
              <Play />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="다음 항목"
            disabled={!current}
            onClick={() => player.next()}
          >
            <SkipForward />
          </Button>
          <span className="ml-2 text-[11px] text-muted-foreground">
            {statusLabel[player.status]}
          </span>
        </div>

        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label={player.status === "playing" ? "일시정지" : "재생"}
            disabled={!current}
            onClick={player.status === "playing" ? player.pause : resume}
          >
            {player.status === "playing" ? <Pause /> : <Play />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="hidden sm:inline-flex"
            aria-label={`${repeatLabel[player.queue.repeat]}; 다음 모드로 변경`}
            aria-pressed={player.queue.repeat !== "off"}
            disabled={!current}
            onClick={() => player.setRepeat(nextRepeat)}
          >
            <RepeatIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="hidden sm:inline-flex"
            aria-label="현재 곡을 제외하고 대기열 섞기"
            aria-pressed={player.queue.shuffled}
            disabled={player.queue.items.length < 2}
            onClick={player.shuffle}
          >
            <Shuffle />
          </Button>
          {current ? (
            <Button asChild variant="ghost" size="icon" className="hidden sm:inline-flex">
              <a
                href={`https://www.youtube.com/watch?v=${encodeURIComponent(current.source.externalId)}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="YouTube에서 열기"
              >
                <ExternalLink />
              </a>
            </Button>
          ) : null}
          <Button
            type="button"
            variant={detailsExpanded ? "secondary" : "ghost"}
            size="icon"
            aria-label={detailsExpanded ? "재생 상세 접기" : "재생 상세 펼치기"}
            aria-controls="otw-play-current-details"
            aria-expanded={detailsExpanded}
            disabled={!current}
            onClick={toggleDetails}
          >
            {detailsExpanded ? <ChevronDown /> : <ChevronUp />}
          </Button>
          <Button
            type="button"
            variant={player.panelExpanded ? "secondary" : "ghost"}
            size="icon"
            className="xl:hidden"
            aria-label={player.panelExpanded ? "플레이큐 닫기" : "플레이큐 열기"}
            aria-expanded={player.panelExpanded}
            onClick={
              player.panelExpanded ? player.closeQueue : player.openQueue
            }
          >
            <ListMusic />
          </Button>
        </div>
      </section>
    </div>
  );
}

function YouTubePlayerHost({
  setHostElement,
}: {
  setHostElement: (element: HTMLDivElement | null) => void;
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
      ref={containerRef}
      className="aspect-video min-h-[200px] w-full overflow-hidden rounded-xl bg-black"
      aria-label="YouTube 영상 플레이어"
    />
  );
}
