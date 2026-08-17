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
    stop: vi.fn(),
    destroy: vi.fn(),
  },
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
  song: { id: "song-1", slug: "song-1", title: "Song One" },
  performance: {
    id: "performance-1",
    relation: "cover",
    releaseType: "official_video",
    participation: "solo",
    releasedAt: "2026-08-18T00:00:00.000Z",
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
  return (
    <div>
      <div ref={player.setHostElement} data-testid="host" />
      <button type="button" onClick={() => player.play(track)}>play</button>
      <span data-testid="status">{player.status}</span>
    </div>
  );
}

describe("OtwPlayPlayerProvider", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    vi.stubGlobal("IntersectionObserver", VisibleIntersectionObserver);
    mocks.createPlayer.mockImplementation(async (_element, events) => {
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
    expect(mocks.controller.stop).toHaveBeenCalled();
    expect(mocks.controller.destroy).toHaveBeenCalledOnce();
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

    render(<OtwPlayPlayerProvider><Consumer /></OtwPlayPlayerProvider>);
    await waitFor(() => expect(mocks.fetchPerformance).toHaveBeenCalledWith("performance-1"));
    expect(mocks.createPlayer).not.toHaveBeenCalled();
    expect(mocks.controller.load).not.toHaveBeenCalled();
  });
});
