export type YouTubePlayerState =
  | "unstarted"
  | "ended"
  | "playing"
  | "paused"
  | "buffering"
  | "cued";

export interface YouTubePlaybackRequest {
  videoId: string;
  startSeconds?: number;
  endSeconds?: number;
}

export interface YouTubePlayerEvents {
  onReady?: () => void;
  onStateChange?: (state: YouTubePlayerState) => void;
  onError?: (code: number) => void;
  onAutoplayBlocked?: () => void;
}

interface YouTubePlayerInstance {
  loadVideoById(request: YouTubePlaybackRequest): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  destroy(): void;
}

interface YouTubePlayerNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      width: string;
      height: string;
      playerVars: {
        autoplay: 0;
        controls: 1;
        playsinline: 1;
        origin: string;
      };
      events: {
        onReady: () => void;
        onStateChange: (event: { data: number }) => void;
        onError: (event: { data: number }) => void;
        onAutoplayBlocked: () => void;
      };
    },
  ) => YouTubePlayerInstance;
}

declare global {
  interface Window {
    YT?: YouTubePlayerNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const SCRIPT_ID = "otw-play-youtube-iframe-api";
const SCRIPT_URL = "https://www.youtube.com/iframe_api";
let apiPromise: Promise<YouTubePlayerNamespace> | null = null;

const playerStateFromCode = (code: number): YouTubePlayerState => {
  if (code === 0) return "ended";
  if (code === 1) return "playing";
  if (code === 2) return "paused";
  if (code === 3) return "buffering";
  if (code === 5) return "cued";
  return "unstarted";
};

export const loadYouTubeIframeApi = () => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("YouTube player requires a browser"));
  }
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YouTubePlayerNamespace>((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube IFrame API did not expose YT.Player"));
    };

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) return;
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_URL;
    script.async = true;
    script.onerror = () => reject(new Error("YouTube IFrame API failed to load"));
    document.head.append(script);
  });
  return apiPromise;
};

export interface OtwPlayYouTubePlayer {
  load(request: YouTubePlaybackRequest): void;
  play(): void;
  pause(): void;
  stop(): void;
  destroy(): void;
}

export const createOtwPlayYouTubePlayer = async (
  element: HTMLElement,
  events: YouTubePlayerEvents = {},
  origin = window.location.origin,
): Promise<OtwPlayYouTubePlayer> => {
  const yt = await loadYouTubeIframeApi();
  const player = new yt.Player(element, {
    width: "100%",
    height: "100%",
    playerVars: {
      autoplay: 0,
      controls: 1,
      playsinline: 1,
      origin,
    },
    events: {
      onReady: () => events.onReady?.(),
      onStateChange: ({ data }) =>
        events.onStateChange?.(playerStateFromCode(data)),
      onError: ({ data }) => events.onError?.(data),
      onAutoplayBlocked: () => events.onAutoplayBlocked?.(),
    },
  });
  let destroyed = false;

  return {
    load(request) {
      if (!destroyed) player.loadVideoById(request);
    },
    play() {
      if (!destroyed) player.playVideo();
    },
    pause() {
      if (!destroyed) player.pauseVideo();
    },
    stop() {
      if (!destroyed) player.stopVideo();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      player.stopVideo();
      player.destroy();
    },
  };
};
