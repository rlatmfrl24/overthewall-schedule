// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  usePlayer: vi.fn(),
}));

vi.mock("../../player/play-player-context", () => ({
  useOtwPlayPlayer: mocks.usePlayer,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
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
  openQueue: vi.fn(),
  closeQueue: vi.fn(),
  select: vi.fn(),
  move: vi.fn(),
  remove: vi.fn(),
};

const emptyPlayer = {
  queue: { items: [], currentIndex: null, repeat: "off", shuffled: false },
  currentItem: null,
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
  performance: {
    id: "performance-1",
    relation: "cover",
    releaseType: "official_video",
    participation: "solo",
    participants: [
      {
        entityId: "entity-1",
        creditOrder: 0,
        displayName: "참여 멤버",
      },
    ],
  },
  source: {
    externalId: "dQw4w9WgXcQ",
    thumbnailUrl: "https://example.com/thumb.jpg",
    title: "공식 커버 영상",
    availability: "playable",
    durationSeconds: 184,
    channel: { displayName: "OTW 공식 채널" },
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
      currentItem: { id: "item-1", performanceId: "performance-1", sourceId: "source-1" },
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
    const playbackRegion = screen.getByRole("region", { name: "재생 컨트롤" });
    expect(playbackRegion.className).toContain("h-16");

    expect(screen.getByRole("region", { name: "현재 재생 상세" })).toBeTruthy();
    expect(screen.getByLabelText("YouTube 영상 플레이어")).toBeTruthy();
    expect(
      within(screen.getByRole("complementary", { name: "플레이큐" }))
        .queryByLabelText("YouTube 영상 플레이어"),
    ).toBeNull();
    expect(screen.getByRole("heading", { name: "재생 중인 노래" })).toBeTruthy();
    expect(screen.getByText("OTW 공식 채널")).toBeTruthy();
    expect(screen.getByText("3:04")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /곡과 가창 상세 보기/ }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "재생 상세 접기" }));
    expect(screen.queryByRole("region", { name: "현재 재생 상세" })).toBeNull();
    expect(actions.pause).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "재생 상세 펼치기" }));
    expect(screen.getByRole("region", { name: "현재 재생 상세" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "다음 항목" }));
    expect(actions.next).toHaveBeenCalledOnce();
    fireEvent.click(
      within(screen.getByRole("complementary", { name: "플레이큐" }))
        .getByRole("button", { name: "플레이큐 닫기" }),
    );
    expect(actions.closeQueue).toHaveBeenCalledOnce();
  });
});
