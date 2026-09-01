// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OtwPlayTrack } from "./play-player-context";
import {
  OTW_PLAY_QUEUE_STORAGE_KEY,
  serializeOtwPlayQueue,
} from "../model/play-queue";

const mocks = vi.hoisted(() => ({
  createPlayer: vi.fn(),
  fetchPerformance: vi.fn(),
  controller: {
    load: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    getCurrentTime: vi.fn(() => 65),
    getDuration: vi.fn(() => 184),
    seekTo: vi.fn(),
    setVolume: vi.fn(),
    setMuted: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn(),
  },
  events: { current: null as null | {
    onReady?: () => void;
    onStateChange?: (
      state: "unstarted" | "ended" | "playing" | "paused" | "buffering" | "cued",
    ) => void;
    onError?: (code: number) => void;
    onAutoplayBlocked?: () => void;
  } },
}));

vi.mock("./youtube-iframe-api", () => ({
  createOtwPlayYouTubePlayer: mocks.createPlayer,
}));
vi.mock("../api/public", () => ({
  fetchOtwPlayPerformance: mocks.fetchPerformance,
}));

import {
  OtwPlayPlayerProvider,
  useOtwPlayPlayer,
} from "./play-player-context";

const track = {
  song: { id: "song-1", slug: "song-1", title: "Song One", tags: ["K-POP"] },
  performance: {
    id: "performance-1",
    relation: "cover",
    releaseType: "official_video",
    participation: "solo",
    releasedAt: "2026-08-18T00:00:00.000Z",
    tags: ["어쿠스틱"],
    participants: [],
    selectedSource: null,
    sourceCount: 1,
    playable: true,
    usingFallback: false,
  },
  source: {
    sourceId: "source-1",
    provider: "youtube",
    externalId: "dQw4w9WgXcQ",
    title: "Source",
    thumbnailUrl: null,
    durationSeconds: 180,
    providerPublishedAt: null,
    availability: "playable",
    sourceRole: "official",
    startSeconds: 0,
    endSeconds: null,
    priority: 0,
    isPrimary: true,
    playable: true,
    channel: { id: "channel-1", displayName: "Channel", role: "member_main" },
  },
} satisfies OtwPlayTrack;

const alternateSource = {
  ...track.source,
  sourceId: "source-2",
  externalId: "AAAAAAAAAAA",
  isPrimary: false,
  priority: 1,
};

const detailTrack: OtwPlayTrack = {
  ...track,
  performance: {
    ...track.performance,
    sources: [track.source, alternateSource],
  },
};

class VisibleIntersectionObserver {
  private readonly callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback(
      [{ target, isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  disconnect() {}
  unobserve() {}
  takeRecords() { return []; }
  readonly root = null;
  readonly rootMargin = "0px";
  readonly thresholds = [0.5];
}

function Consumer() {
  const player = useOtwPlayPlayer();
  const setPlaybackSurfaceActive = player.setPlaybackSurfaceActive;
  React.useEffect(() => {
    setPlaybackSurfaceActive(true);
    return () => setPlaybackSurfaceActive(false);
  }, [setPlaybackSurfaceActive]);
  return (
    <div>
      <div ref={player.setHostElement} data-testid="host" />
      <button type="button" onClick={() => player.play(track)}>play</button>
      <button type="button" onClick={() => player.play(detailTrack)}>play detail</button>
      <button type="button" onClick={() => player.enqueue(track)}>enqueue</button>
      <button type="button" onClick={() => player.playNext(track)}>play next</button>
      <button
        type="button"
        disabled={!player.currentItem}
        onClick={() => player.currentItem && player.retry(player.currentItem.id)}
      >
        retry current
      </button>
      <button type="button" onClick={() => player.setVolume(35)}>volume 35</button>
      <button type="button" onClick={player.toggleMuted}>toggle mute</button>
      <button type="button" onClick={() => player.seek(90)}>seek 90</button>
      <button type="button" onClick={() => player.setPlaybackSurfaceActive(false)}>
        hide surface
      </button>
      <button type="button" onClick={() => player.setPlaybackSurfaceActive(true)}>
        show surface
      </button>
      <button
        type="button"
        disabled={!player.currentItem}
        onClick={() => player.currentItem && player.remove(player.currentItem.id)}
      >
        remove current
      </button>
      <span data-testid="status">{player.status}</span>
      <span data-testid="queue-size">{player.queue.items.length}</span>
      <span data-testid="unavailable-size">{player.unavailableItemIds.size}</span>
      <span data-testid="retryable-size">{player.retryableItemIds.size}</span>
      <span data-testid="announcement">{player.announcement}</span>
      <span data-testid="volume">{player.volume}</span>
      <span data-testid="muted">{String(player.muted)}</span>
      <span data-testid="position">{player.playbackPositionSeconds}</span>
      <span data-testid="duration">{player.playbackDurationSeconds}</span>
      <span data-testid="intent-version">{player.playbackIntentVersion}</span>
    </div>
  );
}

describe("OtwPlayPlayerProvider", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    mocks.controller.getCurrentTime.mockReturnValue(65);
    mocks.controller.getDuration.mockReturnValue(184);
    vi.stubGlobal("IntersectionObserver", VisibleIntersectionObserver);
    mocks.createPlayer.mockImplementation(async (_element, events) => {
      mocks.events.current = events;
      events.onReady?.();
      return mocks.controller;
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("creates and loads one player only after a visible user gesture, then destroys it on leave", async () => {
    const view = render(<OtwPlayPlayerProvider><Consumer /></OtwPlayPlayerProvider>);
    expect(mocks.createPlayer).not.toHaveBeenCalled();
    expect(mocks.controller.load).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "play" }));
    await waitFor(() => expect(mocks.createPlayer).toHaveBeenCalledOnce());
    await waitFor(() => expect(mocks.controller.load).toHaveBeenCalledWith({
      videoId: "dQw4w9WgXcQ",
      startSeconds: 0,
    }));

    view.unmount();
    expect(mocks.controller.pause).toHaveBeenCalled();
    expect(mocks.controller.stop).toHaveBeenCalled();
    expect(mocks.controller.destroy).toHaveBeenCalledOnce();
  });

  it("pauses before a hidden playback surface and requires a new gesture to resume", async () => {
    render(<OtwPlayPlayerProvider><Consumer /></OtwPlayPlayerProvider>);
    fireEvent.click(screen.getByRole("button", { name: "play" }));
    await waitFor(() => expect(mocks.controller.load).toHaveBeenCalledOnce());
    expect(screen.getByTestId("intent-version").textContent).toBe("1");

    fireEvent.click(screen.getByRole("button", { name: "hide surface" }));
    await waitFor(() => expect(mocks.controller.pause).toHaveBeenCalled());
    expect(screen.getByTestId("status").textContent).toBe("paused");

    fireEvent.click(screen.getByRole("button", { name: "show surface" }));
    expect(mocks.controller.play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "play" }));
    expect(screen.getByTestId("intent-version").textContent).toBe("2");
  });

  it("rehydrates identifier state without creating or autoplaying a player", async () => {
    sessionStorage.setItem(
      OTW_PLAY_QUEUE_STORAGE_KEY,
      serializeOtwPlayQueue({
        items: [{ id: "restored", performanceId: "performance-1", sourceId: "source-1" }],
        currentIndex: 0,
        repeat: "off",
        shuffled: false,
      }),
    );
    mocks.fetchPerformance.mockResolvedValue({
      data: {
        song: track.song,
        performance: { ...track.performance, sources: [track.source] },
      },
      nextCursor: null,
      catalogRevision: 1,
      generatedAt: "2026-08-18T00:00:00.000Z",
    });

    render(<OtwPlayPlayerProvider adminPreview><Consumer /></OtwPlayPlayerProvider>);
    await waitFor(() =>
      expect(mocks.fetchPerformance).toHaveBeenCalledWith("performance-1", {
        adminPreview: true,
      }),
    );
    expect(mocks.createPlayer).not.toHaveBeenCalled();
    expect(mocks.controller.load).not.toHaveBeenCalled();
  });

  it("uses the next playable official source after a player error", async () => {
    render(<OtwPlayPlayerProvider><Consumer /></OtwPlayPlayerProvider>);
    fireEvent.click(screen.getByRole("button", { name: "play detail" }));
    await waitFor(() => expect(mocks.controller.load).toHaveBeenCalledWith({
      videoId: "dQw4w9WgXcQ",
      startSeconds: 0,
    }));

    mocks.events.current?.onError?.(100);
    await waitFor(() => expect(mocks.controller.load).toHaveBeenCalledWith({
      videoId: "AAAAAAAAAAA",
      startSeconds: 0,
    }));

    mocks.events.current?.onError?.(150);
    await waitFor(() =>
      expect(screen.getByTestId("unavailable-size").textContent).toBe("1"),
    );
    expect(mocks.controller.load).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("announcement").textContent).toContain(
      "임베드 재생을 허용하지 않습니다",
    );
  });

  it("hydrates detail sources before falling back from a catalog summary", async () => {
    mocks.fetchPerformance.mockResolvedValue({
      data: {
        song: track.song,
        performance: { ...track.performance, sources: [track.source, alternateSource] },
      },
      nextCursor: null,
      catalogRevision: 1,
      generatedAt: "2026-08-18T00:00:00.000Z",
    });

    render(<OtwPlayPlayerProvider><Consumer /></OtwPlayPlayerProvider>);
    fireEvent.click(screen.getByRole("button", { name: "play" }));
    await waitFor(() => expect(mocks.controller.load).toHaveBeenCalledOnce());

    mocks.events.current?.onError?.(100);

    await waitFor(() =>
      expect(mocks.fetchPerformance).toHaveBeenCalledWith("performance-1"),
    );
    await waitFor(() => expect(mocks.controller.load).toHaveBeenLastCalledWith({
      videoId: "AAAAAAAAAAA",
      startSeconds: 0,
    }));
  });

  it("keeps transient restore failures retryable", async () => {
    sessionStorage.setItem(
      OTW_PLAY_QUEUE_STORAGE_KEY,
      serializeOtwPlayQueue({
        items: [{ id: "restored", performanceId: "performance-1", sourceId: "source-1" }],
        currentIndex: 0,
        repeat: "off",
        shuffled: false,
      }),
    );
    mocks.fetchPerformance.mockRejectedValueOnce(new Error("temporary failure"));

    render(<OtwPlayPlayerProvider><Consumer /></OtwPlayPlayerProvider>);
    await waitFor(() =>
      expect(screen.getByTestId("retryable-size").textContent).toBe("1"),
    );
    expect(screen.getByTestId("unavailable-size").textContent).toBe("0");
    expect(mocks.fetchPerformance).toHaveBeenCalledTimes(1);

    mocks.fetchPerformance.mockResolvedValue({
      data: {
        song: track.song,
        performance: { ...track.performance, sources: [track.source] },
      },
      nextCursor: null,
      catalogRevision: 1,
      generatedAt: "2026-08-18T00:00:00.000Z",
    });
    fireEvent.click(screen.getByRole("button", { name: "retry current" }));

    await waitFor(() => expect(mocks.fetchPerformance).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByTestId("retryable-size").textContent).toBe("0"),
    );
  });

  it("surfaces autoplay blocking until the user explicitly resumes", async () => {
    render(<OtwPlayPlayerProvider><Consumer /></OtwPlayPlayerProvider>);
    fireEvent.click(screen.getByRole("button", { name: "play" }));
    await waitFor(() => expect(mocks.createPlayer).toHaveBeenCalledOnce());
    await waitFor(() => expect(mocks.controller.load).toHaveBeenCalledOnce());
    mocks.events.current?.onAutoplayBlocked?.();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("blocked"));
  });

  it("does not duplicate a performance through queue actions", () => {
    render(<OtwPlayPlayerProvider><Consumer /></OtwPlayPlayerProvider>);
    fireEvent.click(screen.getByRole("button", { name: "enqueue" }));
    fireEvent.click(screen.getByRole("button", { name: "enqueue" }));
    fireEvent.click(screen.getByRole("button", { name: "play next" }));
    expect(screen.getByTestId("queue-size").textContent).toBe("1");
    expect(screen.getByTestId("announcement").textContent).toContain(
      "현재 재생 중이므로 중복 추가하지 않았습니다",
    );
  });

  it("applies volume and mute controls to the single YouTube player", async () => {
    render(<OtwPlayPlayerProvider><Consumer /></OtwPlayPlayerProvider>);
    fireEvent.click(screen.getByRole("button", { name: "play" }));
    await waitFor(() => expect(mocks.createPlayer).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("button", { name: "volume 35" }));
    expect(screen.getByTestId("volume").textContent).toBe("35");
    expect(mocks.controller.setVolume).toHaveBeenLastCalledWith(35);

    fireEvent.click(screen.getByRole("button", { name: "toggle mute" }));
    expect(screen.getByTestId("muted").textContent).toBe("true");
    expect(mocks.controller.setMuted).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "volume 35" }));
    expect(screen.getByTestId("muted").textContent).toBe("false");
    expect(mocks.controller.setMuted).toHaveBeenLastCalledWith(false);
  });

  it("reports YouTube playback progress and seeks within the active source", async () => {
    render(<OtwPlayPlayerProvider><Consumer /></OtwPlayPlayerProvider>);
    fireEvent.click(screen.getByRole("button", { name: "play" }));
    await waitFor(() => expect(mocks.controller.load).toHaveBeenCalledOnce());

    mocks.events.current?.onStateChange?.("playing");
    await waitFor(() => expect(screen.getByTestId("position").textContent).toBe("65"));
    expect(screen.getByTestId("duration").textContent).toBe("184");

    mocks.controller.getCurrentTime.mockReturnValue(90);
    fireEvent.click(screen.getByRole("button", { name: "seek 90" }));
    expect(mocks.controller.seekTo).toHaveBeenCalledWith(90);
    expect(screen.getByTestId("position").textContent).toBe("90");
  });

  it("stops playback when removing the final queue item", async () => {
    render(<OtwPlayPlayerProvider><Consumer /></OtwPlayPlayerProvider>);
    fireEvent.click(screen.getByRole("button", { name: "play" }));
    await waitFor(() => expect(mocks.controller.load).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "remove current" }));
    await waitFor(() => expect(mocks.controller.stop).toHaveBeenCalledOnce());
    expect(screen.getByTestId("queue-size").textContent).toBe("0");
    expect(screen.getByTestId("status").textContent).toBe("idle");
    expect(mocks.controller.destroy).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "play" }));
    await waitFor(() => expect(mocks.createPlayer).toHaveBeenCalledTimes(2));
  });
});
