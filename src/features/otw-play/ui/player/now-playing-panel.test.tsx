// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  usePlayer: vi.fn(),
}));

vi.mock("../../player/play-player-context", () => ({
  useOtwPlayPlayer: mocks.usePlayer,
}));

import { OtwPlayPlaybackBar, OtwPlayQueuePanel } from "./now-playing-panel";

const actions = {
  setHostElement: vi.fn(),
  previous: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  next: vi.fn(),
  setRepeat: vi.fn(),
  shuffle: vi.fn(),
  expand: vi.fn(),
  pauseAndCollapse: vi.fn(),
  select: vi.fn(),
  move: vi.fn(),
  remove: vi.fn(),
};

const emptyPlayer = {
  queue: { items: [], currentIndex: null, repeat: "off", shuffled: false },
  currentTrack: null,
  status: "idle",
  panelExpanded: false,
  unavailableItemIds: new Set<string>(),
  announcement: "",
  trackForItem: vi.fn(),
  ...actions,
};

const track = {
  song: { id: "song-1", slug: "song", title: "재생 중인 노래" },
  performance: { participants: [{ displayName: "참여 멤버" }] },
  source: {
    externalId: "dQw4w9WgXcQ",
    thumbnailUrl: "https://example.com/thumb.jpg",
  },
};

describe("OTW Play queue rail and playback bar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.usePlayer.mockReturnValue(emptyPlayer);
  });
  afterEach(cleanup);

  it("keeps an explicit empty queue rail and desktop playback placeholder", () => {
    render(
      <>
        <OtwPlayQueuePanel />
        <OtwPlayPlaybackBar />
      </>,
    );

    expect(screen.getByText("플레이큐가 비어 있습니다")).toBeTruthy();
    expect(screen.getByText("재생할 곡을 선택하세요")).toBeTruthy();
  });

  it("connects the persistent bar and queue controls to player actions", () => {
    mocks.usePlayer.mockReturnValue({
      ...emptyPlayer,
      queue: {
        items: [{ id: "item-1", performanceId: "performance-1", sourceId: "source-1" }],
        currentIndex: 0,
        repeat: "off",
        shuffled: false,
      },
      currentTrack: track,
      panelExpanded: true,
      trackForItem: () => track,
    });

    render(
      <>
        <OtwPlayQueuePanel />
        <OtwPlayPlaybackBar />
      </>,
    );

    expect(screen.getAllByText("재생 중인 노래").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "다음 항목" }));
    expect(actions.next).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "플레이큐 닫기" }));
    expect(actions.pauseAndCollapse).toHaveBeenCalledOnce();
  });
});
