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
  panelExpanded: boolean;
  announcement: string;
  unavailableItemIds: ReadonlySet<string>;
  trackForItem: (itemId: string) => OtwPlayTrack | null;
  setHostElement: (element: HTMLDivElement | null) => void;
  play: (track: OtwPlayTrack) => void;
  enqueue: (track: OtwPlayTrack) => void;
  playNext: (track: OtwPlayTrack) => void;
  select: (index: number) => void;
  remove: (itemId: string) => void;
  move: (itemId: string, direction: -1 | 1) => void;
  previous: () => void;
  next: (ended?: boolean) => void;
  setRepeat: (repeat: OtwPlayQueueRepeatMode) => void;
  shuffle: () => void;
  pauseAndCollapse: () => void;
  pause: () => void;
  expand: () => void;
  resume: () => void;
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

const trackFromPerformance = (
  item: OtwPlayQueueItem,
  response: Awaited<ReturnType<typeof fetchOtwPlayPerformance>>,
): OtwPlayTrack | null => {
  const source = response.data.performance.sources.find(
    ({ sourceId }) => sourceId === item.sourceId,
  );
  if (!source?.playable) return null;
  return {
    song: response.data.song,
    performance: response.data.performance,
    source,
  };
};

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
  const [hostElement, setHostElement] = useState<HTMLDivElement | null>(null);
  const [hostVisible, setHostVisible] = useState(false);
  const [hasPlaybackIntent, setHasPlaybackIntent] = useState(false);
  const [playerReadyVersion, setPlayerReadyVersion] = useState(0);
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const playerRef = useRef<OtwPlayYouTubePlayer | null>(null);
  const playerPromiseRef = useRef<Promise<OtwPlayYouTubePlayer> | null>(null);
  const loadedKeyRef = useRef<string | null>(null);
  const playerReadyRef = useRef(false);
  const selectPlayableRef = useRef<(direction: -1 | 1, ended?: boolean) => void>(
    () => undefined,
  );
  const playbackErrorRef = useRef<() => void>(() => undefined);

  const currentItem =
    queue.currentIndex === null ? null : queue.items[queue.currentIndex] ?? null;
  const currentTrack = currentItem ? tracks.get(currentItem.id) ?? null : null;

  useEffect(() => {
    window.sessionStorage.setItem(
      OTW_PLAY_QUEUE_STORAGE_KEY,
      serializeOtwPlayQueue(queue),
    );
  }, [queue]);

  useEffect(() => {
    const pending = queue.items.filter(
      ({ id }) => !tracks.has(id) && !unavailableItemIds.has(id),
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
          return [item, trackFromPerformance(item, response)] as const;
        } catch {
          return [item, null] as const;
        }
      }),
    ).then((resolved) => {
      if (cancelled) return;
      setTracks((current) => {
        const next = new Map(current);
        for (const [item, track] of resolved) {
          if (track) next.set(item.id, track);
        }
        return next;
      });
      setUnavailableItemIds((current) => {
        const next = new Set(current);
        for (const [item, track] of resolved) {
          if (!track) next.add(item.id);
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [adminPreview, queue.items, tracks, unavailableItemIds]);

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
    (direction: -1 | 1, ended = false) => {
      const index = findNextPlayableQueueIndex(
        queue,
        direction,
        ({ id }) => tracks.has(id) && !unavailableItemIds.has(id),
        { ended },
      );
      if (index === null) {
        setStatus("idle");
        setAnnouncement("재생 가능한 다음 항목이 없습니다.");
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

  const handlePlaybackError = useCallback(() => {
    if (!currentItem || !currentTrack) {
      setStatus("error");
      return;
    }
    const sources =
      "sources" in currentTrack.performance
        ? currentTrack.performance.sources
        : [currentTrack.source];
    const alternative = sources.find(
      ({ sourceId, playable }) =>
        playable && sourceId !== currentTrack.source.sourceId,
    );
    if (alternative) {
      setTracks((current) =>
        new Map(current).set(currentItem.id, {
          ...currentTrack,
          source: alternative,
        }),
      );
      dispatch({
        type: "replace_source",
        itemId: currentItem.id,
        sourceId: alternative.sourceId,
      });
      loadedKeyRef.current = null;
      setStatus("loading");
      setAnnouncement("재생 오류로 다음 공식 소스를 사용합니다.");
      return;
    }
    setUnavailableItemIds((current) => new Set(current).add(currentItem.id));
    setStatus("error");
    setAnnouncement("이 가창의 재생 가능한 공식 소스를 찾지 못했습니다.");
    selectPlayableRef.current(1);
  }, [currentItem, currentTrack]);
  playbackErrorRef.current = handlePlaybackError;

  useEffect(() => {
    if (!hasPlaybackIntent || !hostVisible || !hostElement || !currentTrack) return;
    if (playerRef.current || playerPromiseRef.current) return;
    setStatus("loading");
    const pendingPlayer = createOtwPlayYouTubePlayer(hostElement, {
      onReady: () => {
        playerReadyRef.current = true;
        setPlayerReadyVersion((version) => version + 1);
      },
      onStateChange: (nextState) => {
        if (nextState === "playing") setStatus("playing");
        else if (nextState === "paused") setStatus("paused");
        else if (nextState === "buffering") setStatus("loading");
        else if (nextState === "ended") selectPlayableRef.current(1, true);
      },
      onError: () => playbackErrorRef.current(),
      onAutoplayBlocked: () => setStatus("blocked"),
    });
    playerPromiseRef.current = pendingPlayer;
    void pendingPlayer.then(
      (player) => {
        playerRef.current = player;
        if (playerReadyRef.current) {
          setPlayerReadyVersion((version) => version + 1);
        }
      },
      () => {
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

  useEffect(
    () => () => {
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
    }
    dispatch(action);
  }, []);

  const play = useCallback((track: OtwPlayTrack) => {
    const item = queueItemForTrack(track);
    register(track, { type: "play", item });
    setHasPlaybackIntent(true);
    setPanelExpanded(true);
  }, [register]);
  const enqueue = useCallback((track: OtwPlayTrack) => {
    const item = queueItemForTrack(track);
    register(track, { type: "enqueue", item });
    setAnnouncement(`${track.song.title}을(를) 대기열 마지막에 추가했습니다.`);
  }, [register]);
  const playNext = useCallback((track: OtwPlayTrack) => {
    const item = queueItemForTrack(track);
    register(track, { type: "play_next", item });
    setAnnouncement(`${track.song.title}을(를) 다음에 재생합니다.`);
  }, [register]);

  const value = useMemo<PlayPlayerContextValue>(() => ({
    queue,
    currentItem,
    currentTrack,
    status,
    panelExpanded,
    announcement,
    unavailableItemIds,
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
      setPanelExpanded(true);
    },
    remove(itemId) {
      dispatch({ type: "remove", itemId });
      setTracks((current) => {
        const next = new Map(current);
        next.delete(itemId);
        return next;
      });
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
    pauseAndCollapse() {
      playerRef.current?.pause();
      setStatus("paused");
      setPanelExpanded(false);
    },
    pause() {
      playerRef.current?.pause();
      setStatus("paused");
    },
    expand() {
      setPanelExpanded(true);
    },
    resume() {
      setHasPlaybackIntent(true);
      setPanelExpanded(true);
      playerRef.current?.play();
    },
  }), [
    announcement,
    currentItem,
    currentTrack,
    enqueue,
    panelExpanded,
    play,
    playNext,
    queue,
    selectPlayable,
    status,
    unavailableItemIds,
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
