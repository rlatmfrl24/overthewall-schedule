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
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { useOtwPlayPlayer } from "../../player/play-player-context";

const repeatLabel = {
  off: "반복 꺼짐",
  all: "전체 반복",
  one: "한 곡 반복",
} as const;

export function OtwPlayNowPlayingPanel() {
  const player = useOtwPlayPlayer();
  if (player.queue.items.length === 0) return null;

  const repeatIcon = player.queue.repeat === "one" ? Repeat1 : Repeat;
  const RepeatIcon = repeatIcon;
  const nextRepeat =
    player.queue.repeat === "off"
      ? "all"
      : player.queue.repeat === "all"
        ? "one"
        : "off";

  return (
    <aside
      aria-label="현재 재생과 대기열"
      className={cn(
        "z-40 shrink-0 border-border bg-popover text-popover-foreground shadow-2xl",
        "fixed inset-x-0 bottom-0 max-h-[calc(100dvh-3.5rem)] border-t xl:static xl:flex xl:h-full xl:w-[400px] xl:flex-col xl:border-l xl:border-t-0 xl:shadow-none",
      )}
    >
      {!player.panelExpanded ? (
        <button
          type="button"
          className="flex min-h-16 w-full items-center gap-3 px-4 text-left xl:hidden"
          onClick={player.expand}
        >
          <Play className="size-5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">
              {player.currentTrack?.song.title ?? "대기열을 확인하는 중"}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              일시정지됨 · 펼쳐서 재생
            </span>
          </span>
          <ChevronUp className="size-5" />
        </button>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">NOW PLAYING</p>
              <h2 className="max-w-[17rem] truncate text-sm font-semibold">
                {player.currentTrack?.song.title ?? "대기열을 확인하는 중"}
              </h2>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="xl:hidden"
              aria-label="플레이어 접기 및 일시정지"
              onClick={player.pauseAndCollapse}
            >
              <ChevronDown />
            </Button>
          </div>

          <div className="bg-black p-2">
            <div
              ref={player.setHostElement}
              className="aspect-video min-h-[200px] w-full overflow-hidden rounded-lg bg-black"
              aria-label="YouTube 영상 플레이어"
            />
          </div>

          <div className="space-y-3 border-b px-4 py-3">
            {player.currentTrack ? (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {player.currentTrack.song.title}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {player.currentTrack.performance.participants
                    .map(({ displayName }) => displayName)
                    .join(", ") || "참여자 정보 없음"}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                저장된 가창 정보를 다시 확인하고 있습니다.
              </p>
            )}

            {(player.status === "blocked" || player.status === "error") && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                자동 재생이 차단되었거나 이 소스를 재생할 수 없습니다. 직접 재생하거나
                다음 항목으로 이동해 주세요.
              </div>
            )}

            <div className="flex items-center justify-center gap-1">
              <Button type="button" variant="ghost" size="icon" aria-label="이전 항목" onClick={player.previous}>
                <SkipBack />
              </Button>
              {player.status === "playing" ? (
                <Button type="button" size="icon-lg" aria-label="일시정지" onClick={player.pause}>
                  <Pause />
                </Button>
              ) : (
                <Button type="button" size="icon-lg" aria-label="재생" onClick={player.resume}>
                  <Play />
                </Button>
              )}
              <Button type="button" variant="ghost" size="icon" aria-label="다음 항목" onClick={() => player.next()}>
                <SkipForward />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`${repeatLabel[player.queue.repeat]}; 다음 모드로 변경`}
                aria-pressed={player.queue.repeat !== "off"}
                onClick={() => player.setRepeat(nextRepeat)}
              >
                <RepeatIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="현재 곡을 제외하고 대기열 섞기"
                aria-pressed={player.queue.shuffled}
                onClick={player.shuffle}
              >
                <Shuffle />
              </Button>
            </div>

            {player.currentTrack && (
              <a
                href={`https://www.youtube.com/watch?v=${encodeURIComponent(player.currentTrack.source.externalId)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                YouTube에서 열기 <ExternalLink className="size-3" />
              </a>
            )}
          </div>

          <section className="min-h-0 flex-1 overflow-y-auto px-3 py-3" aria-labelledby="play-queue-heading">
            <h3 id="play-queue-heading" className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <ListMusic className="size-4" /> 세션 대기열
            </h3>
            <ol className="space-y-1">
              {player.queue.items.map((item, index) => {
                const track = player.trackForItem(item.id);
                const unavailable = player.unavailableItemIds.has(item.id);
                const current = index === player.queue.currentIndex;
                return (
                  <li
                    key={item.id}
                    className={cn(
                      "flex items-center gap-1 rounded-md border px-2 py-2",
                      current && "border-primary bg-primary/5",
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      aria-current={current ? "true" : undefined}
                      disabled={unavailable}
                      onClick={() => player.select(index)}
                    >
                      <span className="block truncate text-sm font-medium">
                        {track?.song.title ?? (unavailable ? "사용할 수 없는 가창" : "불러오는 중")}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {track?.performance.participants.map(({ displayName }) => displayName).join(", ") || item.performanceId}
                      </span>
                    </button>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="위로 이동" disabled={index === 0} onClick={() => player.move(item.id, -1)}>
                      <ChevronUp />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="아래로 이동" disabled={index === player.queue.items.length - 1} onClick={() => player.move(item.id, 1)}>
                      <ChevronDown />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="대기열에서 삭제" onClick={() => player.remove(item.id)}>
                      <Trash2 />
                    </Button>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      )}
      <p className="sr-only" aria-live="polite">{player.announcement}</p>
    </aside>
  );
}
