import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  OtwPlayPublicPerformanceDetailDto,
  OtwPlayPublicPerformanceSummaryDto,
  OtwPlayPublicSourceDto,
} from "@contracts/otw-play";
import { ApiError } from "@/shared/api/client";
import { fetchOtwPlayPerformance } from "../api/public";
import {
  OTW_PLAY_QUEUE_STORAGE_KEY,
  createEmptyOtwPlayQueue,
  findNextPlayableQueueIndex,
  reduceOtwPlayQueue,
  restoreOtwPlayQueue,
  serializeOtwPlayQueue,
  type OtwPlayQueueAction,
  type OtwPlayQueueItem,
  type OtwPlayQueueRepeatMode,
  type OtwPlayQueueState,
} from "../model/play-queue";
import {
  createOtwPlayYouTubePlayer,
  type OtwPlayYouTubePlayer,
} from "./youtube-iframe-api";

export interface OtwPlayTrack {
  song: {
    id: string;
    slug: string;
    title: string;
  };
  performance: OtwPlayPublicPerformanceSummaryDto | OtwPlayPublicPerformanceDetailDto;
  source: OtwPlayPublicSourceDto;
}

type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "blocked" | "error";

type PlayPlayerContextValue = {
  queue: OtwPlayQueueState;
  currentItem: OtwPlayQueueItem | null;
  currentTrack: OtwPlayTrack | null;
  status: PlayerStatus;
  volume: number;
  muted: boolean;
  playbackPositionSeconds: number;
  playbackDurationSeconds: number;
  panelExpanded: boolean;
  announcement: string;
  unavailableItemIds: ReadonlySet<string>;
  retryableItemIds: ReadonlySet<string>;
  trackForItem: (itemId: string) => OtwPlayTrack | null;
  setHostElement: (element: HTMLDivElement | null) => void;
  play: (track: OtwPlayTrack) => void;
  enqueue: (track: OtwPlayTrack) => void;
  playNext: (track: OtwPlayTrack) => void;
  select: (index: number) => void;
  remove: (itemId: string) => void;
  retry: (itemId: string) => void;
  move: (itemId: string, direction: -1 | 1) => void;
  previous: () => void;
  next: (ended?: boolean) => void;
  setRepeat: (repeat: OtwPlayQueueRepeatMode) => void;
  shuffle: () => void;
  closeQueue: () => void;
  pause: () => void;
  openQueue: () => void;
  resume: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMuted: () => void;
};

const PlayPlayerContext = createContext<PlayPlayerContextValue | null>(null);

const initialQueue = () => {
  if (typeof window === "undefined") return createEmptyOtwPlayQueue();
  return restoreOtwPlayQueue(window.sessionStorage.getItem(OTW_PLAY_QUEUE_STORAGE_KEY));
};

const randomId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `queue-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const queueItemForTrack = (track: OtwPlayTrack): OtwPlayQueueItem => ({
  id: randomId(),
  performanceId: track.performance.id,
  sourceId: track.source.sourceId,
});

const playbackWindowForTrack = (
  track: OtwPlayTrack,
  playerDurationSeconds = 0,
) => {
  const startSeconds = track.source.startSeconds;
  const fallbackEndSeconds = track.source.durationSeconds ?? startSeconds;
  const endSeconds =
    track.source.endSeconds ??
    (playerDurationSeconds > 0 ? playerDurationSeconds : fallbackEndSeconds);
  return {
    startSeconds,
    durationSeconds: Math.max(0, endSeconds - startSeconds),
  };
};

const trackFromPerformance = (
  item: OtwPlayQueueItem,
  response: Awaited<ReturnType<typeof fetchOtwPlayPerformance>>,
): OtwPlayTrack | null => {
  const source =
    response.data.performance.sources.find(
      ({ sourceId, playable }) => sourceId === item.sourceId && playable,
    ) ?? response.data.performance.sources.find(({ playable }) => playable);
  if (!source) return null;
  return {
    song: response.data.song,
    performance: response.data.performance,
    source,
  };
};

const isAuthoritativelyUnavailable = (error: unknown) =>
  error instanceof ApiError &&
  (error.status === 404 || error.code === "PLAY_NOT_FOUND");

export function OtwPlayPlayerProvider({
  adminPreview = false,
  children,
}: {
  adminPreview?: boolean;
  children: ReactNode;
}) {
  const [queue, dispatch] = useReducer(reduceOtwPlayQueue, undefined, initialQueue);
  const [tracks, setTracks] = useState<ReadonlyMap<string, OtwPlayTrack>>(
    () => new Map(),
  );
  const [unavailableItemIds, setUnavailableItemIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [retryableItemIds, setRetryableItemIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [hostElement, setHostElement] = useState<HTMLDivElement | null>(null);
  const [hostVisible, setHostVisible] = useState(false);
  const [hasPlaybackIntent, setHasPlaybackIntent] = useState(false);
  const [playerReadyVersion, setPlayerReadyVersion] = useState(0);
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [volume, setVolumeState] = useState(100);
  const [muted, setMuted] = useState(false);
  const [playbackPositionSeconds, setPlaybackPositionSeconds] = useState(0);
  const [playbackDurationSeconds, setPlaybackDurationSeconds] = useState(0);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const playerRef = useRef<OtwPlayYouTubePlayer | null>(null);
  const playerPromiseRef = useRef<Promise<OtwPlayYouTubePlayer> | null>(null);
  const playerSessionRef = useRef(0);
  const loadedKeyRef = useRef<string | null>(null);
  const playerReadyRef = useRef(false);
  const volumeRef = useRef(volume);
  const mutedRef = useRef(muted);
  const selectPlayableRef = useRef<(
    direction: -1 | 1,
    ended?: boolean,
    announceMissing?: boolean,
  ) => void>(() => undefined);
  const playbackErrorRef = useRef<() => void>(() => undefined);
  const currentItemRef = useRef<OtwPlayQueueItem | null>(null);
  const currentTrackRef = useRef<OtwPlayTrack | null>(null);
  const failedSourceIdsRef = useRef<Map<string, Set<string>>>(new Map());
  const playbackErrorInFlightKeysRef = useRef<Set<string>>(new Set());

  const currentItem =
    queue.currentIndex === null ? null : queue.items[queue.currentIndex] ?? null;
  const currentTrack = currentItem ? tracks.get(currentItem.id) ?? null : null;
  currentItemRef.current = currentItem;
  currentTrackRef.current = currentTrack;

  const updatePlaybackProgress = useCallback(() => {
    if (!currentTrack) {
      setPlaybackPositionSeconds(0);
      setPlaybackDurationSeconds(0);
      return;
    }
    const player = playerRef.current;
    const playbackWindow = playbackWindowForTrack(
      currentTrack,
      player?.getDuration() ?? 0,
    );
    const absolutePosition = player?.getCurrentTime() ?? playbackWindow.startSeconds;
    setPlaybackDurationSeconds(playbackWindow.durationSeconds);
    setPlaybackPositionSeconds(
      Math.min(
        playbackWindow.durationSeconds,
        Math.max(0, absolutePosition - playbackWindow.startSeconds),
      ),
    );
  }, [currentTrack]);

  const seek = useCallback((seconds: number) => {
    if (!currentTrack) return;
    const playbackWindow = playbackWindowForTrack(
      currentTrack,
      playerRef.current?.getDuration() ?? 0,
    );
    const nextPosition = Math.min(
      playbackWindow.durationSeconds,
      Math.max(0, seconds),
    );
    playerRef.current?.seekTo(playbackWindow.startSeconds + nextPosition);
    setPlaybackPositionSeconds(nextPosition);
    setPlaybackDurationSeconds(playbackWindow.durationSeconds);
  }, [currentTrack]);

  useEffect(() => {
    window.sessionStorage.setItem(
      OTW_PLAY_QUEUE_STORAGE_KEY,
      serializeOtwPlayQueue(queue),
    );
  }, [queue]);

  useEffect(() => {
    if (!currentTrack) {
      setPlaybackPositionSeconds(0);
      setPlaybackDurationSeconds(0);
      return;
    }
    const playbackWindow = playbackWindowForTrack(currentTrack);
    setPlaybackPositionSeconds(0);
    setPlaybackDurationSeconds(playbackWindow.durationSeconds);
  }, [currentItem?.id, currentTrack]);

  useEffect(() => {
    const pending = queue.items.filter(
      ({ id }) =>
        !tracks.has(id) &&
        !unavailableItemIds.has(id) &&
        !retryableItemIds.has(id),
    );
    if (pending.length === 0) return;
    let cancelled = false;
    void Promise.all(
      pending.map(async (item) => {
        try {
          const response = adminPreview
            ? await fetchOtwPlayPerformance(item.performanceId, {
                adminPreview: true,
              })
            : await fetchOtwPlayPerformance(item.performanceId);
          const track = trackFromPerformance(item, response);
          return {
            item,
            status: track ? "loaded" : "unavailable",
            track,
          } as const;
        } catch (error) {
          return {
            item,
            status: isAuthoritativelyUnavailable(error)
              ? "unavailable"
              : "retryable",
            track: null,
          } as const;
        }
      }),
    ).then((resolved) => {
      if (cancelled) return;
      setTracks((current) => {
        const next = new Map(current);
        for (const { item, track } of resolved) {
          if (track) next.set(item.id, track);
        }
        return next;
      });
      setUnavailableItemIds((current) => {
        const next = new Set(current);
        for (const { item, status } of resolved) {
          if (status === "unavailable") next.add(item.id);
          else next.delete(item.id);
        }
        return next;
      });
      setRetryableItemIds((current) => {
        const next = new Set(current);
        for (const { item, status } of resolved) {
          if (status === "retryable") next.add(item.id);
          else next.delete(item.id);
        }
        return next;
      });
      for (const { item, track } of resolved) {
        if (track && track.source.sourceId !== item.sourceId) {
          dispatch({
            type: "replace_source",
            itemId: item.id,
            sourceId: track.source.sourceId,
          });
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    adminPreview,
    queue.items,
    retryableItemIds,
    tracks,
    unavailableItemIds,
  ]);

  useEffect(() => {
    if (!hostElement) return;
    if (typeof IntersectionObserver === "undefined") {
      setHostVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setHostVisible(Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.5)),
      { threshold: [0.5] },
    );
    observer.observe(hostElement);
    return () => observer.disconnect();
  }, [hostElement]);

  const selectPlayable = useCallback(
    (direction: -1 | 1, ended = false, announceMissing = true) => {
      const index = findNextPlayableQueueIndex(
        queue,
        direction,
        ({ id }) => tracks.has(id) && !unavailableItemIds.has(id),
        { ended },
      );
      if (index === null) {
        if (announceMissing) {
          setStatus("idle");
          setAnnouncement("재생 가능한 다음 항목이 없습니다.");
        }
        return;
      }
      if (index === queue.currentIndex) {
        if (currentTrack && playerRef.current) {
          playerRef.current.load({
            videoId: currentTrack.source.externalId,
            startSeconds: currentTrack.source.startSeconds,
            ...(currentTrack.source.endSeconds === null
              ? {}
              : { endSeconds: currentTrack.source.endSeconds }),
          });
        }
      } else {
        dispatch({ type: "select", index });
      }
      setHasPlaybackIntent(true);
    },
    [currentTrack, queue, tracks, unavailableItemIds],
  );
  selectPlayableRef.current = selectPlayable;

  useEffect(() => {
    if (currentItem && unavailableItemIds.has(currentItem.id)) {
      selectPlayableRef.current(1, false, false);
    }
  }, [currentItem, unavailableItemIds]);

  const handlePlaybackError = useCallback(async () => {
    if (!currentItem || !currentTrack) {
      setStatus("error");
      return;
    }
    const itemId = currentItem.id;
    const failedSourceId = currentTrack.source.sourceId;
    const errorKey = `${itemId}:${failedSourceId}`;
    if (playbackErrorInFlightKeysRef.current.has(errorKey)) return;
    playbackErrorInFlightKeysRef.current.add(errorKey);

    const failedSourceIds = new Set(
      failedSourceIdsRef.current.get(itemId) ?? [],
    );
    failedSourceIds.add(failedSourceId);
    failedSourceIdsRef.current.set(itemId, failedSourceIds);

    try {
      let hydratedTrack = currentTrack;
      let sources =
        "sources" in currentTrack.performance
          ? currentTrack.performance.sources
          : null;

      if (!sources) {
        try {
          const response = adminPreview
            ? await fetchOtwPlayPerformance(currentTrack.performance.id, {
                adminPreview: true,
              })
            : await fetchOtwPlayPerformance(currentTrack.performance.id);
          if (
            currentItemRef.current?.id !== itemId ||
            currentTrackRef.current?.source.sourceId !== failedSourceId
          ) {
            return;
          }
          sources = response.data.performance.sources;
          hydratedTrack = {
            song: response.data.song,
            performance: response.data.performance,
            source:
              sources.find(({ sourceId }) => sourceId === failedSourceId) ??
              currentTrack.source,
          };
        } catch (error) {
          if (currentItemRef.current?.id !== itemId) return;
          if (isAuthoritativelyUnavailable(error)) {
            setUnavailableItemIds((current) =>
              current.has(itemId) ? current : new Set(current).add(itemId),
            );
            setAnnouncement("이 가창은 더 이상 공개되어 있지 않습니다.");
          } else {
            setStatus("error");
            setAnnouncement(
              "공식 소스 목록을 다시 확인하지 못했습니다. 잠시 후 재생을 다시 시도하세요.",
            );
          }
          return;
        }
      }

      const alternative = sources.find(
        ({ sourceId, playable }) =>
          playable && !failedSourceIds.has(sourceId),
      );
      if (alternative) {
        setTracks((current) =>
          new Map(current).set(itemId, {
            ...hydratedTrack,
            source: alternative,
          }),
        );
        dispatch({
          type: "replace_source",
          itemId,
          sourceId: alternative.sourceId,
        });
        loadedKeyRef.current = null;
        setStatus("loading");
        setAnnouncement("재생 오류로 다음 공식 소스를 사용합니다.");
        return;
      }
      setUnavailableItemIds((current) =>
        current.has(itemId) ? current : new Set(current).add(itemId),
      );
      setStatus("error");
      setAnnouncement("이 가창의 재생 가능한 공식 소스를 찾지 못했습니다.");
    } finally {
      playbackErrorInFlightKeysRef.current.delete(errorKey);
    }
  }, [adminPreview, currentItem, currentTrack]);
  playbackErrorRef.current = () => {
    void handlePlaybackError();
  };

  useEffect(() => {
    if (!hasPlaybackIntent || !hostVisible || !hostElement || !currentTrack) return;
    if (playerRef.current || playerPromiseRef.current) return;
    setStatus("loading");
    const playerSession = ++playerSessionRef.current;
    const pendingPlayer = createOtwPlayYouTubePlayer(hostElement, {
      onReady: () => {
        if (playerSession !== playerSessionRef.current) return;
        playerReadyRef.current = true;
        playerRef.current?.setVolume(volumeRef.current);
        playerRef.current?.setMuted(mutedRef.current);
        setPlayerReadyVersion((version) => version + 1);
      },
      onStateChange: (nextState) => {
        if (playerSession !== playerSessionRef.current) return;
        if (nextState === "playing") setStatus("playing");
        else if (nextState === "paused") setStatus("paused");
        else if (nextState === "buffering") setStatus("loading");
        else if (nextState === "ended") selectPlayableRef.current(1, true);
      },
      onError: () => {
        if (playerSession === playerSessionRef.current) {
          playbackErrorRef.current();
        }
      },
      onAutoplayBlocked: () => {
        if (playerSession === playerSessionRef.current) setStatus("blocked");
      },
    });
    playerPromiseRef.current = pendingPlayer;
    void pendingPlayer.then(
      (player) => {
        if (playerSession !== playerSessionRef.current) {
          player.stop();
          player.destroy();
          return;
        }
        playerRef.current = player;
        player.setVolume(volumeRef.current);
        player.setMuted(mutedRef.current);
        if (playerReadyRef.current) {
          setPlayerReadyVersion((version) => version + 1);
        }
      },
      () => {
        if (playerSession !== playerSessionRef.current) return;
        playerPromiseRef.current = null;
        setStatus("error");
      },
    );
  }, [currentTrack, hasPlaybackIntent, hostElement, hostVisible]);

  useEffect(() => {
    if (playerReadyVersion === 0 || !playerRef.current || !currentItem || !currentTrack) return;
    const key = `${currentItem.id}:${currentTrack.source.sourceId}`;
    if (loadedKeyRef.current === key) return;
    loadedKeyRef.current = key;
    setStatus("loading");
    playerRef.current.load({
      videoId: currentTrack.source.externalId,
      startSeconds: currentTrack.source.startSeconds,
      ...(currentTrack.source.endSeconds === null
        ? {}
        : { endSeconds: currentTrack.source.endSeconds }),
    });
    setAnnouncement(`${currentTrack.song.title} 재생을 시작합니다.`);
  }, [currentItem, currentTrack, playerReadyVersion]);

  useEffect(() => {
    updatePlaybackProgress();
    if (status !== "playing") return;
    const intervalId = window.setInterval(updatePlaybackProgress, 500);
    return () => window.clearInterval(intervalId);
  }, [playerReadyVersion, status, updatePlaybackProgress]);

  useEffect(() => {
    if (currentItem) return;
    playerSessionRef.current += 1;
    playerRef.current?.stop();
    playerRef.current?.destroy();
    playerRef.current = null;
    playerPromiseRef.current = null;
    playerReadyRef.current = false;
    setPlayerReadyVersion(0);
    loadedKeyRef.current = null;
    setHasPlaybackIntent(false);
    setStatus("idle");
  }, [currentItem]);

  useEffect(
    () => () => {
      playerSessionRef.current += 1;
      playerRef.current?.stop();
      playerRef.current?.destroy();
      playerRef.current = null;
    },
    [],
  );

  const register = useCallback((track: OtwPlayTrack, action: OtwPlayQueueAction) => {
    const item = "item" in action ? action.item : null;
    if (item) {
      setTracks((current) => new Map(current).set(item.id, track));
      setUnavailableItemIds((current) => {
        if (!current.has(item.id)) return current;
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
      setRetryableItemIds((current) => {
        if (!current.has(item.id)) return current;
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
      failedSourceIdsRef.current.delete(item.id);
    }
    dispatch(action);
  }, []);

  const play = useCallback((track: OtwPlayTrack) => {
    const existingIndex = queue.items.findIndex(
      ({ performanceId }) => performanceId === track.performance.id,
    );
    const existingItem =
      existingIndex >= 0 ? queue.items[existingIndex] ?? null : null;
    const item = existingItem
      ? { ...existingItem, sourceId: track.source.sourceId }
      : queueItemForTrack(track);
    register(track, { type: "play", item });
    setHasPlaybackIntent(true);
    if (existingItem) {
      setAnnouncement(
        existingIndex === queue.currentIndex
          ? `${track.song.title}은(는) 현재 재생 중입니다.`
          : `${track.song.title}은(는) 이미 플레이큐에 있어 해당 항목을 재생합니다.`,
      );
    }
  }, [queue.currentIndex, queue.items, register]);
  const enqueue = useCallback((track: OtwPlayTrack) => {
    const existingItem = queue.items.find(
      ({ performanceId }) => performanceId === track.performance.id,
    );
    if (existingItem) {
      setAnnouncement(`${track.song.title}은(는) 이미 플레이큐에 있습니다.`);
      return;
    }
    const item = queueItemForTrack(track);
    register(track, { type: "enqueue", item });
    setAnnouncement(`${track.song.title}을(를) 플레이큐 마지막에 추가했습니다.`);
  }, [queue.items, register]);
  const playNext = useCallback((track: OtwPlayTrack) => {
    const existingIndex = queue.items.findIndex(
      ({ performanceId }) => performanceId === track.performance.id,
    );
    const existingItem =
      existingIndex >= 0 ? queue.items[existingIndex] ?? null : null;
    const item = existingItem
      ? { ...existingItem, sourceId: track.source.sourceId }
      : queueItemForTrack(track);
    register(track, { type: "play_next", item });
    setAnnouncement(
      existingItem
        ? existingIndex === queue.currentIndex
          ? `${track.song.title}은(는) 현재 재생 중이므로 중복 추가하지 않았습니다.`
          : `${track.song.title}의 기존 항목을 다음 순서로 이동했습니다.`
        : `${track.song.title}을(를) 다음에 재생합니다.`,
    );
  }, [queue.currentIndex, queue.items, register]);

  const value = useMemo<PlayPlayerContextValue>(() => ({
    queue,
    currentItem,
    currentTrack,
    status,
    volume,
    muted,
    playbackPositionSeconds,
    playbackDurationSeconds,
    panelExpanded,
    announcement,
    unavailableItemIds,
    retryableItemIds,
    trackForItem(itemId) {
      return tracks.get(itemId) ?? null;
    },
    setHostElement,
    play,
    enqueue,
    playNext,
    select(index) {
      dispatch({ type: "select", index });
      setHasPlaybackIntent(true);
    },
    remove(itemId) {
      dispatch({ type: "remove", itemId });
      setTracks((current) => {
        const next = new Map(current);
        next.delete(itemId);
        return next;
      });
      setUnavailableItemIds((current) => {
        if (!current.has(itemId)) return current;
        const next = new Set(current);
        next.delete(itemId);
        return next;
      });
      setRetryableItemIds((current) => {
        if (!current.has(itemId)) return current;
        const next = new Set(current);
        next.delete(itemId);
        return next;
      });
      failedSourceIdsRef.current.delete(itemId);
    },
    retry(itemId) {
      setRetryableItemIds((current) => {
        if (!current.has(itemId)) return current;
        const next = new Set(current);
        next.delete(itemId);
        return next;
      });
      setAnnouncement("가창 정보를 다시 불러옵니다.");
    },
    move(itemId, direction) {
      dispatch({ type: "move", itemId, direction });
    },
    previous() {
      selectPlayable(-1);
    },
    next(ended = false) {
      selectPlayable(1, ended);
    },
    setRepeat(repeat) {
      dispatch({ type: "set_repeat", repeat });
    },
    shuffle() {
      dispatch({
        type: "shuffle",
        randomValues: Array.from({ length: Math.max(0, queue.items.length - 2) }, Math.random),
      });
      setAnnouncement("현재 항목을 제외한 대기열 순서를 섞었습니다.");
    },
    closeQueue() {
      setPanelExpanded(false);
    },
    pause() {
      playerRef.current?.pause();
      setStatus("paused");
    },
    openQueue() {
      setPanelExpanded(true);
    },
    resume() {
      setHasPlaybackIntent(true);
      playerRef.current?.play();
    },
    seek,
    setVolume(nextVolume) {
      const clamped = Math.round(Math.min(100, Math.max(0, nextVolume)));
      volumeRef.current = clamped;
      setVolumeState(clamped);
      if (clamped > 0 && mutedRef.current) {
        mutedRef.current = false;
        setMuted(false);
        playerRef.current?.setMuted(false);
      }
      playerRef.current?.setVolume(clamped);
    },
    toggleMuted() {
      const nextMuted = !mutedRef.current;
      mutedRef.current = nextMuted;
      setMuted(nextMuted);
      playerRef.current?.setMuted(nextMuted);
    },
  }), [
    announcement,
    currentItem,
    currentTrack,
    enqueue,
    panelExpanded,
    play,
    playNext,
    playbackDurationSeconds,
    playbackPositionSeconds,
    queue,
    selectPlayable,
    seek,
    status,
    volume,
    muted,
    unavailableItemIds,
    retryableItemIds,
    tracks,
  ]);

  return (
    <PlayPlayerContext.Provider value={value}>
      {children}
    </PlayPlayerContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useOtwPlayPlayer = () => {
  const value = useContext(PlayPlayerContext);
  if (!value) throw new Error("useOtwPlayPlayer must be used inside OtwPlayPlayerProvider");
  return value;
};
