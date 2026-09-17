import { useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type KeyboardEvent, type RefObject } from "react";
import { Reorder, useDragControls, useReducedMotion } from "motion/react";
import { useAnimations } from "@/shared/ui/animation-provider";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { useOtwPlayPlayer } from "../../player/play-player-context";
import { OtwPlayThumbnail } from "../otw-play-thumbnail";
import { presentOtwPlayParticipants } from "../public/participant-presentation";
import { usePlayerTransition } from "./use-player-transition";
import "./apple-music-player.css";

type Player = ReturnType<typeof useOtwPlayPlayer>;
type IconName = "play" | "pause" | "previous" | "next" | "shuffle" | "repeat" | "one" | "queue" | "volume" | "mute" | "grip" | "down" | "close" | "expand";

// Original vectors: filled transport symbols and a consistent 1.7px utility stroke.
function MusicIcon({ name }: { name: IconName }) {
  const paths: Partial<Record<IconName, React.ReactNode>> = {
    play: <path d="M7 3.5c-.9-.5-2 .1-2 1.1v14.8c0 1 1.1 1.6 2 1.1l13-7.4c.9-.5.9-1.7 0-2.2Z" />,
    pause: <><rect x="5" y="4" width="5" height="16" rx="1.2" /><rect x="14" y="4" width="5" height="16" rx="1.2" /></>,
    previous: <path d="M11 5c.7-.4 1.5.1 1.5.9v5l9-5.9c.7-.4 1.5.1 1.5.9v12.2c0 .8-.8 1.3-1.5.9l-9-5.9v5c0 .8-.8 1.3-1.5.9L1.5 13c-.7-.4-.7-1.6 0-2Z" />,
    next: <path d="M13 5c-.7-.4-1.5.1-1.5.9v5l-9-5.9C1.8 4.6 1 5.1 1 5.9v12.2c0 .8.8 1.3 1.5.9l9-5.9v5c0 .8.8 1.3 1.5.9l9.5-6c.7-.4.7-1.6 0-2Z" />,
    volume: <><path d="M3 9v6h4l5 4V5L7 9Z" /><path d="M15 8c2 2 2 6 0 8m3-11c4 4 4 10 0 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></>,
    mute: <><path d="M3 9v6h4l5 4V5L7 9Z" /><path d="m16 9 5 6m0-6-5 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></>,
  };
  const strokes: Partial<Record<IconName, string>> = {
    shuffle: "M3 6h2c5 0 7 12 12 12h4m-4-4 4 4-4 4M3 18h2c2 0 3-2 5-5m3-3c1-2 2-4 4-4h4m-4-4 4 4-4 4",
    repeat: "m17 2 4 4-4 4M21 6H7a4 4 0 0 0-4 4m4 12-4-4 4-4m-4 4h14a4 4 0 0 0 4-4",
    one: "m17 2 4 4-4 4M21 6H7a4 4 0 0 0-4 4m4 12-4-4 4-4m-4 4h14a4 4 0 0 0 4-4m-11-4 2-1v6",
    grip: "M5 8h14M5 12h14M5 16h14",
    queue: "M9 5h12M9 12h12M9 19h12M3 5h.01M3 12h.01M3 19h.01",
    down: "m5 9 7 7 7-7", close: "m6 6 12 12M6 18 18 6", expand: "M4 10V4h6m4 0h6v6M4 14v6h6m4 0h6v-6",
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">{paths[name] ?? <path d={strokes[name]} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />}</svg>;
}

function IconButton({ icon, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName }) {
  return <button type="button" className={`am-icon-button ${className}`} {...props}><MusicIcon name={icon} /></button>;
}
const names = (track: NonNullable<Player["currentTrack"]>) => presentOtwPlayParticipants(track.performance.participants).primaryNames || "가창자 정보 없음";
const time = (value: number) => {
  const seconds = Math.max(0, Math.floor(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};
const statuses = { idle: "재생 대기", loading: "불러오는 중", playing: "재생 중", paused: "일시정지", blocked: "재생 대기", error: "재생 오류" };
const repeats = { off: "반복 꺼짐", all: "전체 반복", one: "한 곡 반복" };

export function AppleMusicPlayer({ player, editing, desktop, open, sectionRef, onKeyDown, onClose, onLaunch, onCompactResume }: {
  player: Player; editing: boolean; desktop: boolean; open: boolean;
  sectionRef: RefObject<HTMLElement | null>; onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onClose: () => void; onLaunch: () => void; onCompactResume: () => void;
}) {
  const track = player.currentTrack;
  const hasQueue = player.queue.items.length > 0;
  const nextRepeat = player.queue.repeat === "off" ? "all" : player.queue.repeat === "all" ? "one" : "off";
  const visible = desktop || open;
  const launcherRef = usePlayerTransition(sectionRef, { open, desktop, editing, hasQueue, trackId: track?.performance.id ?? null });
  return <>
    <aside aria-label="OTW Play 재생 및 플레이큐" aria-hidden={editing || !hasQueue || undefined} inert={editing || !hasQueue}
      data-button-feedback="local" data-has-queue={hasQueue} data-presentation={desktop ? "rail" : open ? "full" : "launcher"}
      className="am-player-rail" style={editing ? { display: "none" } : undefined}>
      <section hidden={!visible} aria-hidden={!visible || undefined} inert={!visible} data-player-presentation={open ? "full" : "launcher"} ref={sectionRef} className="am-player" aria-label="OTW Play 재생 플레이어" role={!desktop && open ? "dialog" : "region"}
        aria-modal={!desktop && open ? true : undefined} tabIndex={!desktop && open ? -1 : undefined} onKeyDown={onKeyDown}>
        <header className="am-mobile-header" data-player-enter>
          <IconButton icon="down" aria-label="카탈로그로 돌아가기" onClick={onClose} />
          <span>현재 재생</span><span aria-hidden="true" />
        </header>
        {track ? <>
          <VideoHost player={player} />
          <div className="am-now-playing" data-testid="otw-play-player-details">
            <div className="am-track-heading">
              <div className="am-track-copy">
                <h2 data-player-hero="title" data-testid="otw-play-track-title" title={track.song.title}>{track.song.title}</h2>
                <p data-player-hero="participants" data-testid="otw-play-participants" title={names(track)}>{names(track)}</p>
              </div>
              <span data-player-enter><PlaybackWaveform status={player.status} /></span>
            </div>
            <div className="am-timeline" data-player-enter data-testid="otw-play-playback-progress">
              <span aria-label="진행 시간">{time(player.playbackPositionSeconds)}</span>
              <input type="range" aria-label="재생 위치" min={0} max={Math.max(1, player.playbackDurationSeconds)} step={1}
                value={Math.min(player.playbackDurationSeconds, player.playbackPositionSeconds)} disabled={player.playbackDurationSeconds <= 0}
                aria-valuetext={`${time(player.playbackPositionSeconds)} 재생, ${time(player.playbackDurationSeconds - player.playbackPositionSeconds)} 남음`}
                style={{ "--am-fill": `${player.playbackDurationSeconds > 0 ? Math.min(100, player.playbackPositionSeconds / player.playbackDurationSeconds * 100) : 0}%` } as CSSProperties}
                onChange={event => player.seek(Number(event.currentTarget.value))} />
              <span aria-label="남은 시간">-{time(player.playbackDurationSeconds - player.playbackPositionSeconds)}</span>
            </div>
            <div className="am-transport" data-player-enter role="group" aria-label="재생 컨트롤" data-testid="otw-play-transport-controls">
              <IconButton icon="shuffle" aria-label={player.queue.shuffled ? "랜덤 재생 끄기" : "랜덤 재생 켜기"} aria-pressed={player.queue.shuffled} disabled={player.queue.items.length < 2} onClick={player.shuffle} />
              <IconButton icon="previous" className="am-skip" aria-label="이전 항목" onClick={player.previous} />
              <PlaybackButton player={player} />
              <IconButton icon="next" className="am-skip" aria-label="다음 항목" onClick={() => player.next()} />
              <IconButton icon={player.queue.repeat === "one" ? "one" : "repeat"} aria-label={`${repeats[player.queue.repeat]}; ${repeats[nextRepeat]}으로 변경`}
                aria-pressed={player.queue.repeat !== "off"} onClick={() => player.setRepeat(nextRepeat)} />
              <VolumeControl player={player} />
            </div>
            {(player.status === "blocked" || player.status === "error") && <div className="am-error" data-player-enter role="alert">
              <p>{player.status === "blocked" ? "브라우저가 자동 재생을 차단했습니다." : "현재 소스를 재생하지 못했습니다."}</p>
              <button type="button" onClick={player.retryPlayback}>다시 시도</button>
            </div>}
          </div>
        </> : <div className="am-loading" data-player-enter>
          <MusicIcon name="queue" />
          <p>{player.currentItem ? player.retryableItemIds.has(player.currentItem.id) ? "가창 정보를 불러오지 못했습니다" : "가창 정보를 불러오는 중입니다" : "재생할 곡을 선택하세요"}</p>
          {player.currentItem && player.retryableItemIds.has(player.currentItem.id) && <button type="button" onClick={() => player.retry(player.currentItem!.id)}>다시 시도</button>}
        </div>}
        <div className="am-queue-container" data-player-enter>
          <Queue player={player} desktop={desktop} />
        </div>
      </section>
      {!desktop && hasQueue && <div ref={launcherRef} className="am-launcher" data-open={open} aria-hidden={open || undefined} inert={open} role="region" aria-label="소형 플레이어">
        <button className="am-launcher-open" type="button" aria-label="Now Playing 화면 열기" onClick={onLaunch}>
          <strong data-player-hero="title">{track?.song.title ?? "플레이큐"}</strong><small data-player-hero="participants">{track ? names(track) : `${player.queue.items.length}곡`}</small>
        </button>
        {track && <><PlaybackWaveform status={player.status} /><PlaybackButton player={player} compact onResume={onCompactResume} /></>}
      </div>}
    </aside>
    {player.announcement && <p className="sr-only" aria-live="polite">{player.announcement}</p>}
  </>;
}

function PlaybackWaveform({ status }: { status: Player["status"] }) {
  return <span className="am-waveform" role="img" aria-label={statuses[status]} data-playing={status === "playing"}>
    {Array.from({ length: 6 }, (_, index) => <i key={index} />)}
  </span>;
}

function PlaybackButton({ player, compact = false, onResume = player.resume }: { player: Player; compact?: boolean; onResume?: () => void }) {
  const playing = player.status === "playing";
  const label = playing ? "일시정지" : "재생";
  return <IconButton icon={playing ? "pause" : "play"} className={compact ? "am-compact-play" : "am-play"}
    aria-label={compact ? `미니 플레이어 ${label}` : label} onClick={playing ? player.pause : onResume} />;
}

function VolumeControl({ player }: { player: Player }) {
  const [open, setOpen] = useState(false);
  const hovering = useRef(false);
  const adjusting = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  useEffect(() => {
    const release = () => { adjusting.current = false; };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => { window.removeEventListener("pointerup", release); window.removeEventListener("pointercancel", release); };
  }, []);
  const leave = () => {
    hovering.current = false;
    cancelClose();
    if (!adjusting.current) closeTimer.current = setTimeout(() => setOpen(false), 180);
  };
  const volume = player.muted ? 0 : player.volume;
  return <div className="am-volume-control" onPointerEnter={event => { if (event.pointerType === "mouse") { hovering.current = true; cancelClose(); setOpen(true); } }} onPointerLeave={leave}>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><IconButton icon={volume === 0 ? "mute" : "volume"} aria-label="볼륨 조절" title="볼륨 조절" onFocus={cancelClose} onClick={event => { if (hovering.current && open) event.preventDefault(); }} /></PopoverTrigger>
      <PopoverContent className="am-popover" side="top" align="end" sideOffset={4} aria-label="볼륨 컨트롤"
        onPointerEnter={cancelClose} onPointerLeave={leave} onFocusCapture={cancelClose}
        onOpenAutoFocus={event => { if (hovering.current) event.preventDefault(); }} onEscapeKeyDown={event => event.stopPropagation()}>
        <div className="am-volume">
          <IconButton icon={volume === 0 ? "mute" : "volume"} aria-label={player.muted ? "음소거 해제" : "음소거"} aria-pressed={player.muted} onClick={player.toggleMuted} />
          <input type="range" aria-label="재생 볼륨" aria-valuetext={`${volume}%`} onPointerDown={() => { adjusting.current = true; cancelClose(); }} min={0} max={100} step={1} value={volume}
            style={{ "--am-fill": `${volume}%` } as CSSProperties} onChange={event => player.setVolume(Number(event.currentTarget.value))} />
        </div>
      </PopoverContent>
    </Popover>
  </div>;
}

function Queue({ player, desktop }: { player: Player; desktop: boolean }) {
  return <section className="am-queue" aria-label={desktop ? "플레이큐" : "모바일 플레이큐"} data-testid="otw-play-desktop-queue">
    <header><div><h2>다음 재생</h2><span>{player.queue.items.length}곡</span></div><button type="button" disabled={!player.queue.items.length} onClick={player.clearQueue} aria-label="플레이큐 비우기">지우기</button></header>
    <Reorder.Group as="ol" axis="y" layoutScroll values={player.queue.items.map(item => item.id)} onReorder={player.reorder}>
      {player.queue.items.map((item, index) => <QueueItem key={item.id} player={player} item={item} index={index} />)}
    </Reorder.Group>
  </section>;
}

function QueueItem({ player, item, index }: { player: Player; item: Player["queue"]["items"][number]; index: number }) {
  const rowRef = useRef<HTMLLIElement>(null);
  const current = index === player.queue.currentIndex;
  useEffect(() => {
    if (!current || !rowRef.current) return;
    const row = rowRef.current;
    const list = row.closest("ol");
    if (!list) return;
    const rowBounds = row.getBoundingClientRect();
    const listBounds = list.getBoundingClientRect();
    if (rowBounds.top < listBounds.top) list.scrollTop -= listBounds.top - rowBounds.top;
    else if (rowBounds.bottom > listBounds.bottom) list.scrollTop += rowBounds.bottom - listBounds.bottom;
  }, [current]);
  const controls = useDragControls();
  const { enabled } = useAnimations();
  const reducedMotion = useReducedMotion();
  const track = player.trackForItem(item.id);
  const unavailable = player.unavailableItemIds.has(item.id);
  const retryable = player.retryableItemIds.has(item.id);
  const label = track?.song.title ?? `${index + 1}번 곡`;
  return <Reorder.Item ref={rowRef} as="li" value={item.id} data-current={index === player.queue.currentIndex} dragListener={false} dragControls={controls} dragMomentum={false}
    transition={!enabled || reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 450, damping: 35 }}
    whileDrag={{ zIndex: 2, backgroundColor: "var(--am-bg)", boxShadow: "0 4px 16px #0002" }}>
    <IconButton icon="grip" className="am-drag-handle" aria-label={`${label} 순서 변경`} title="드래그 또는 위·아래 방향키로 순서 변경" disabled={player.queue.items.length < 2}
      onPointerDown={event => controls.start(event)} onKeyDown={event => {
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault(); player.move(item.id, event.key === "ArrowUp" ? -1 : 1);
        }
      }} />
    <button type="button" className="am-queue-track" aria-current={index === player.queue.currentIndex ? "true" : undefined} disabled={unavailable || retryable} onClick={() => player.select(index)}>
      <span className="am-queue-art">{track ? <OtwPlayThumbnail source={track.source} alt="" width={80} height={80} /> : index + 1}</span>
      <span><strong title={track?.song.title}>{track?.song.title ?? (unavailable ? "사용할 수 없는 가창" : retryable ? "다시 불러오기 필요" : "불러오는 중")}</strong><small>{track ? names(track) : item.performanceId}</small></span>
    </button>
    {retryable && <button type="button" className="am-retry" aria-label="가창 정보 다시 불러오기" onClick={() => player.retry(item.id)}>재시도</button>}
    <IconButton icon="close" className="am-queue-delete" aria-label={`${label} 재생목록에서 삭제`} onClick={() => player.remove(item.id)} />

  </Reorder.Item>;
}

function VideoHost({ player }: { player: Player }) {
  const track = player.currentTrack;
  const sourceKey = `${player.currentItem?.id}:${track?.source.sourceId}`;
  const [playedSource, setPlayedSource] = useState<string | null>(null);
  useEffect(() => {
    if (player.status === "playing") setPlayedSource(sourceKey);
  }, [player.status, sourceKey]);
  const showThumbnail = player.status === "idle" || (player.status !== "playing" && playedSource !== sourceKey);
  const ref = useRef<HTMLDivElement>(null);
  const setHost = player.setHostElement;
  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const host = document.createElement("div");
    host.className = "am-video-mount";
    container.replaceChildren(host);
    setHost(host);
    return () => { setHost(null); container.replaceChildren(); };
  }, [setHost]);
  return <div className="am-video" data-player-enter aria-label="YouTube 영상 플레이어">
    <div ref={ref} />
    {showThumbnail && track && <OtwPlayThumbnail source={track.source} alt={`${track.song.title} 영상 썸네일`}
      className="am-video-poster" loading="eager" width={640} height={360} />}
  </div>;
}
