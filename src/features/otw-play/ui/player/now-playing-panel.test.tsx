// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  usePlayer: vi.fn(),
}));

vi.mock("../../player/play-player-context", () => ({
  useOtwPlayPlayer: mocks.usePlayer,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, "aria-label": label }: { children: React.ReactNode; to: string; "aria-label"?: string }) => (
    <a href={to} aria-label={label}>{children}</a>
  ),
}));

import { OtwPlayPlayerQueuePanel } from "./now-playing-panel";

const actions = {
  setHostElement: vi.fn(),
  setPlaybackSurfaceActive: vi.fn(),
  previous: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  next: vi.fn(),
  setRepeat: vi.fn(),
  shuffle: vi.fn(),
  setVolume: vi.fn(),
  seek: vi.fn(),
  toggleMuted: vi.fn(),
  openQueue: vi.fn(),
  closeQueue: vi.fn(),
  select: vi.fn(),
  move: vi.fn(),
  reorder: vi.fn(),
  remove: vi.fn(),
  clearQueue: vi.fn(),
  retry: vi.fn(),
  retryPlayback: vi.fn(),
};

const emptyPlayer = {
  queue: { items: [], currentIndex: null, repeat: "off", shuffled: false },
  currentItem: null,
  currentTrack: null,
  status: "idle",
  volume: 100,
  muted: false,
  playbackPositionSeconds: 65,
  playbackDurationSeconds: 184,
  playbackIntentVersion: 0,
  panelExpanded: false,
  unavailableItemIds: new Set<string>(),
  retryableItemIds: new Set<string>(),
  announcement: "",
  trackForItem: vi.fn(),
  ...actions,
};

const track = {
  song: {
    id: "song-1",
    slug: "song",
    title: "재생 중인 노래",
    tags: [
      "J-POP",
      "보컬로이드",
      "애니송",
      "록",
      "발라드",
      "일렉트로닉",
      "댄스",
      "팝",
      "재즈",
      "어쿠스틱",
    ],
  },
  performance: {
    id: "performance-1",
    relation: "cover",
    releaseType: "official_video",
    participation: "solo",
    releasedAt: "2026-08-18T00:00:00.000Z",
    participants: [
      {
        entityId: "entity-1",
        slug: "member",
        creditOrder: 0,
        displayName: "참여 멤버",
        role: "vocal",
        kind: "current_member",
        uid: 1,
        code: "member",
        oshiMark: null,
        unitName: null,
      },
      {
        entityId: "entity-2",
        slug: "supporting",
        creditOrder: 1,
        displayName: "코러스 멤버",
        role: "chorus",
        kind: "external",
      },
    ],
  },
  source: {
    sourceId: "source-1",
    provider: "youtube",
    externalId: "dQw4w9WgXcQ",
    thumbnailUrl: "https://example.com/thumb.jpg",
    title: "공식 커버 영상",
    availability: "playable",
    durationSeconds: 184,
    providerPublishedAt: null,
    sourceRole: "official",
    startSeconds: 0,
    endSeconds: null,
    priority: 0,
    isPrimary: true,
    playable: true,
    channel: {
      id: "channel-1",
      displayName: "OTW 공식 채널",
      role: "member_main",
    },
  },
};

const MINI_PLAYER_QUERY = "(min-width: 640px) and (max-width: 1279px)";
const PHONE_PLAYER_QUERY = "(max-width: 639px)";
const DESKTOP_PLAYER_QUERY = "(min-width: 1280px)";

const createMatchMediaController = (initial: Record<string, boolean>) => {
  const entries = new Map<
    string,
    { matches: boolean; listeners: Set<(event: MediaQueryListEvent) => void> }
  >();
  const entryFor = (query: string) => {
    const existing = entries.get(query);
    if (existing) return existing;
    const entry = {
      matches: initial[query] ?? false,
      listeners: new Set<(event: MediaQueryListEvent) => void>(),
    };
    entries.set(query, entry);
    return entry;
  };

  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      const entry = entryFor(query);
      return {
        get matches() {
          return entry.matches;
        },
        media: query,
        onchange: null,
        addEventListener: (
          type: string,
          listener: (event: MediaQueryListEvent) => void,
        ) => {
          if (type === "change") entry.listeners.add(listener);
        },
        removeEventListener: (
          type: string,
          listener: (event: MediaQueryListEvent) => void,
        ) => {
          if (type === "change") entry.listeners.delete(listener);
        },
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => true,
      } as MediaQueryList;
    }),
  );

  return {
    set(query: string, matches: boolean) {
      const entry = entryFor(query);
      entry.matches = matches;
      const event = { matches, media: query } as MediaQueryListEvent;
      entry.listeners.forEach((listener) => listener(event));
    },
  };
};

describe("OTW Play player and queue rail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    mocks.usePlayer.mockReturnValue(emptyPlayer);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each([
    [DESKTOP_PLAYER_QUERY, "플레이큐"],
    [PHONE_PLAYER_QUERY, "모바일 플레이큐"],
  ])("offers queue clearing through %s", (query, region) => {
    createMatchMediaController({ [query]: true });
    mocks.usePlayer.mockReturnValue({ ...emptyPlayer, queue: { ...emptyPlayer.queue,
      items: [{ id: "item-1", performanceId: "performance-1", sourceId: "source-1" }] }, trackForItem: () => track });
    render(<OtwPlayPlayerQueuePanel />);
    if (query === PHONE_PLAYER_QUERY) {
      fireEvent.click(screen.getByRole("button", { name: "Now Playing 화면 열기" }));
    }
    fireEvent.click(within(screen.getByRole("region", { name: region })).getByRole("button", { name: "플레이큐 비우기" }));
    expect(actions.clearQueue).toHaveBeenCalledOnce();
  });

  it("hides an empty rail, opens for queued tracks before hydration, and hides after the last removal", () => {
    createMatchMediaController({ [DESKTOP_PLAYER_QUERY]: true });
    const { rerender } = render(<OtwPlayPlayerQueuePanel />);
    const rail = screen.getByRole("complementary", { hidden: true });
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(rail.hasAttribute("inert")).toBe(true);
    expect(actions.setPlaybackSurfaceActive).toHaveBeenLastCalledWith(false);

    const item = { id: "item-1", performanceId: "performance-1", sourceId: "source-1" };
    mocks.usePlayer.mockReturnValue({
      ...emptyPlayer,
      queue: { ...emptyPlayer.queue, items: [item], currentIndex: 0 },
      currentItem: item,
    });
    rerender(<OtwPlayPlayerQueuePanel />);
    expect(screen.getByRole("complementary")).toBe(rail);
    expect(rail.hasAttribute("inert")).toBe(false);
    expect(screen.getByRole("region", { name: "플레이큐" })).toBeTruthy();
    expect(actions.setPlaybackSurfaceActive).toHaveBeenLastCalledWith(true);

    mocks.usePlayer.mockReturnValue({ ...emptyPlayer, announcement: "플레이큐에서 제거했습니다" });
    rerender(<OtwPlayPlayerQueuePanel />);
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(rail.hasAttribute("inert")).toBe(true);
    expect(actions.setPlaybackSurfaceActive).toHaveBeenLastCalledWith(false);
    const announcement = screen.getByText("플레이큐에서 제거했습니다");
    expect(announcement.closest('[aria-hidden="true"]')).toBeNull();
  });

  it("disables the playback surface and hides all player controls while editing", () => {
    createMatchMediaController({ [DESKTOP_PLAYER_QUERY]: true });
    mocks.usePlayer.mockReturnValue({ ...emptyPlayer, queue: { ...emptyPlayer.queue,
      items: [{ id: "item-1", performanceId: "performance-1", sourceId: "source-1" }] }, trackForItem: () => track });
    const { rerender } = render(<OtwPlayPlayerQueuePanel />);
    expect(actions.setPlaybackSurfaceActive).toHaveBeenLastCalledWith(true);
    rerender(<OtwPlayPlayerQueuePanel editing />);
    expect(actions.setPlaybackSurfaceActive).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.getByRole("complementary", { hidden: true }).hasAttribute("inert")).toBe(true);
  });

  it("opens an idle batch queue on mobile without selecting or starting a track", () => {
    createMatchMediaController({ [PHONE_PLAYER_QUERY]: true });
    mocks.usePlayer.mockReturnValue({ ...emptyPlayer, queue: { ...emptyPlayer.queue,
      items: [{ id: "item-1", performanceId: "performance-1", sourceId: "source-1" }] }, trackForItem: () => track });
    render(<OtwPlayPlayerQueuePanel />);
    fireEvent.click(screen.getByRole("button", { name: "Now Playing 화면 열기" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("region", { name: "모바일 플레이큐" })).toBeTruthy();
    expect(actions.resume).not.toHaveBeenCalled();
    expect(actions.select).not.toHaveBeenCalled();
  });

  it("connects Apple Music controls to playback without duplicating the video", () => {
    createMatchMediaController({ [DESKTOP_PLAYER_QUERY]: true });
    const item = { id: "item-1", performanceId: "performance-1", sourceId: "source-1" };
    mocks.usePlayer.mockReturnValue({ ...emptyPlayer, queue: { ...emptyPlayer.queue, items: [item], currentIndex: 0 }, currentItem: item, currentTrack: track, trackForItem: () => track });
    render(<OtwPlayPlayerQueuePanel />);
    expect(screen.getAllByLabelText("YouTube 영상 플레이어")).toHaveLength(1);
    const controls = screen.getByRole("group", { name: "재생 컨트롤" });
    expect(within(controls).getAllByRole("button").map(button => button.getAttribute("aria-label"))).toEqual([
      "랜덤 재생 켜기", "이전 항목", "재생", "다음 항목", "반복 꺼짐; 전체 반복으로 변경", "볼륨 조절",
    ]);
    fireEvent.click(within(controls).getByRole("button", { name: "다음 항목" }));
    expect(actions.next).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByRole("slider", { name: "재생 위치" }), { target: { value: "90" } });
    expect(actions.seek).toHaveBeenCalledWith(90);
    expect(screen.queryByRole("slider", { name: "재생 볼륨" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "볼륨 조절" }));
    fireEvent.change(screen.getByRole("slider", { name: "재생 볼륨" }), { target: { value: "42" } });
    expect(actions.setVolume).toHaveBeenCalledWith(42);
  });

  it("shows zero while muted and restores the saved volume after unmuting", () => {
    createMatchMediaController({ [DESKTOP_PLAYER_QUERY]: true });
    const item = { id: "item-1", performanceId: "performance-1", sourceId: "source-1" };
    const player = {
      ...emptyPlayer,
      queue: { ...emptyPlayer.queue, items: [item], currentIndex: 0 },
      currentItem: item,
      currentTrack: track,
      trackForItem: () => track,
      volume: 64,
      muted: true,
    };
    mocks.usePlayer.mockReturnValue(player);
    const { rerender } = render(<OtwPlayPlayerQueuePanel />);

    fireEvent.click(screen.getByRole("button", { name: "볼륨 조절" }));
    const volume = screen.getByRole("slider", { name: "재생 볼륨" }) as HTMLInputElement;
    expect(volume.value).toBe("0");
    expect(volume.getAttribute("aria-valuetext")).toBe("0%");
    const unmute = screen.getByRole("button", { name: "음소거 해제" });
    expect(unmute.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(unmute);
    expect(actions.toggleMuted).toHaveBeenCalledOnce();

    mocks.usePlayer.mockReturnValue({ ...player, muted: false });
    rerender(<OtwPlayPlayerQueuePanel />);
    expect(volume.value).toBe("64");
    expect(volume.getAttribute("aria-valuetext")).toBe("64%");
    fireEvent.change(volume, { target: { value: "100" } });
    expect(actions.setVolume).toHaveBeenLastCalledWith(100);
  });

  it.each([
    ["off", "반복 꺼짐", "all", "전체 반복"],
    ["all", "전체 반복", "one", "한 곡 반복"],
    ["one", "한 곡 반복", "off", "반복 꺼짐"],
  ] as const)("labels the %s repeat state and requests the next mode", (repeat, label, next, nextLabel) => {
    mocks.usePlayer.mockReturnValue({
      ...emptyPlayer,
      queue: {
        ...emptyPlayer.queue,
        items: [{ id: "item-1", performanceId: "performance-1", sourceId: "source-1" }],
        currentIndex: 0,
        repeat,
      },
      currentTrack: track,
    });
    render(<OtwPlayPlayerQueuePanel />);

    fireEvent.click(screen.getByRole("button", { name: "Now Playing 화면 열기" }));
    const button = screen.getByRole("button", {
      name: `${label}; ${nextLabel}으로 변경`,
    });
    expect(button.textContent).toBe("");
    expect(button.getAttribute("aria-pressed")).toBe(String(repeat !== "off"));
    fireEvent.click(button);
    expect(actions.setRepeat).toHaveBeenCalledWith(next);
  });

  it("always shows the queue with direct delete and no queue toggle or popup menus", () => {
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
      playbackIntentVersion: 1,
      trackForItem: () => track,
    });

    render(<OtwPlayPlayerQueuePanel />);

    expect(screen.getByRole("region", { name: "모바일 플레이큐" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /플레이큐 (닫기|열기)/ })).toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByRole("link", { name: "곡 상세" })).toBeNull();
    expect(screen.queryByRole("link", { name: /YouTube에서/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "재생 중인 노래 재생목록에서 삭제" }));
    expect(actions.remove).toHaveBeenCalledWith("item-1");
    expect(actions.pause).not.toHaveBeenCalled();

  });

  it("keeps playback running when collapsing a 640-1279px full player", () => {
    createMatchMediaController({
      [MINI_PLAYER_QUERY]: true,
      [PHONE_PLAYER_QUERY]: false,
      [DESKTOP_PLAYER_QUERY]: false,
    });
    const player = {
      ...emptyPlayer,
      queue: {
        items: [{ id: "item-1", performanceId: "performance-1", sourceId: "source-1" }],
        currentIndex: 0,
        repeat: "off",
        shuffled: false,
      },
      currentItem: { id: "item-1", performanceId: "performance-1", sourceId: "source-1" },
      currentTrack: track,
      playbackIntentVersion: 1,
      status: "playing",
      trackForItem: () => track,
    };
    mocks.usePlayer.mockReturnValue(player);

    const { rerender } = render(<OtwPlayPlayerQueuePanel />);
    const playerRegion = screen.getByLabelText("OTW Play 재생 플레이어");
    const playerHost = screen.getByLabelText("YouTube 영상 플레이어");

    expect(playerRegion.getAttribute("data-player-presentation")).toBe("full");
    fireEvent.click(screen.getByRole("button", { name: "카탈로그로 돌아가기" }));

    expect(actions.pause).not.toHaveBeenCalled();
    expect(playerRegion.getAttribute("data-player-presentation")).toBe("launcher");
    expect(screen.getByLabelText("YouTube 영상 플레이어")).toBe(playerHost);
    expect(screen.getAllByLabelText("YouTube 영상 플레이어")).toHaveLength(1);
    expect(screen.getByRole("region", { name: "소형 플레이어" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "미니 플레이어 일시정지" }));
    expect(actions.pause).toHaveBeenCalledOnce();

    mocks.usePlayer.mockReturnValue({
      ...player,
      currentItem: { id: "item-2", performanceId: "performance-2", sourceId: "source-2" },
      currentTrack: {
        ...track,
        song: { ...track.song, id: "song-2", slug: "song-2", title: "다음 노래" },
        performance: { ...track.performance, id: "performance-2" },
        source: { ...track.source, sourceId: "source-2" },
      },
    });
    rerender(<OtwPlayPlayerQueuePanel />);
    expect(playerRegion.getAttribute("data-player-presentation")).toBe("launcher");

    fireEvent.click(screen.getByRole("button", { name: "Now Playing 화면 열기" }));
    expect(playerRegion.getAttribute("data-player-presentation")).toBe("full");
    expect(actions.resume).not.toHaveBeenCalled();
    expect(screen.getByLabelText("YouTube 영상 플레이어")).toBe(playerHost);
  });

  it.each([PHONE_PLAYER_QUERY, MINI_PLAYER_QUERY])("syncs compact controls and waveform with playback without expanding at %s", (query) => {
    createMatchMediaController({ [query]: true });
    const player = {
      ...emptyPlayer,
      queue: { items: [{ id: "item-1", performanceId: "performance-1", sourceId: "source-1" }], currentIndex: 0, repeat: "off", shuffled: false },
      currentItem: { id: "item-1", performanceId: "performance-1", sourceId: "source-1" },
      currentTrack: track, status: "playing", playbackIntentVersion: 1, trackForItem: () => track,
    };
    mocks.usePlayer.mockReturnValue(player);
    const { rerender } = render(<OtwPlayPlayerQueuePanel />);
    const host = screen.getByLabelText("YouTube 영상 플레이어");
    fireEvent.click(screen.getByRole("button", { name: "카탈로그로 돌아가기" }));
    const compact = screen.getByRole("region", { name: "소형 플레이어" });
    expect(within(compact).getByRole("img", { name: "재생 중" }).getAttribute("data-playing")).toBe("true");
    fireEvent.click(within(compact).getByRole("button", { name: "미니 플레이어 일시정지" }));
    expect(actions.pause).toHaveBeenCalledOnce();
    mocks.usePlayer.mockReturnValue({ ...player, status: "paused" });
    rerender(<OtwPlayPlayerQueuePanel />);
    expect(within(compact).getByRole("img", { name: "일시정지" }).getAttribute("data-playing")).toBe("false");
    fireEvent.click(within(compact).getByRole("button", { name: "미니 플레이어 재생" }));
    expect(actions.resume).toHaveBeenCalledOnce();
    mocks.usePlayer.mockReturnValue({ ...player, playbackIntentVersion: 2 });
    rerender(<OtwPlayPlayerQueuePanel />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("YouTube 영상 플레이어")).toBe(host);
    expect(within(compact).getByRole("button", { name: "미니 플레이어 일시정지" })).toBeTruthy();
    // A later explicit catalog selection still opens the full player.
    mocks.usePlayer.mockReturnValue({ ...player, playbackIntentVersion: 3 });
    rerender(<OtwPlayPlayerQueuePanel />);
    expect(screen.getByRole("dialog", { name: "OTW Play 재생 플레이어" })).toBeTruthy();
  });

  it("shows actual mini playback status and preserves the full title", () => {
    createMatchMediaController({
      [MINI_PLAYER_QUERY]: true,
      [PHONE_PLAYER_QUERY]: false,
      [DESKTOP_PLAYER_QUERY]: false,
    });
    const player = {
      ...emptyPlayer,
      queue: { items: [{ id: "item-1", performanceId: "performance-1", sourceId: "source-1" }], currentIndex: 0, repeat: "off", shuffled: false },
      currentItem: { id: "item-1", performanceId: "performance-1", sourceId: "source-1" },
      currentTrack: track, playbackIntentVersion: 1, trackForItem: () => track,
    };
    mocks.usePlayer.mockReturnValue({ ...player, status: "paused" });
    const { rerender } = render(<OtwPlayPlayerQueuePanel />);
    fireEvent.click(screen.getByRole("button", { name: "카탈로그로 돌아가기" }));
    const controls = screen.getByRole("region", { name: "소형 플레이어" });
    for (const [status, label] of Object.entries({ playing: "재생 중", paused: "일시정지", loading: "불러오는 중", error: "재생 오류", idle: "재생 대기", blocked: "재생 대기" })) {
      mocks.usePlayer.mockReturnValue({ ...player, status });
      rerender(<OtwPlayPlayerQueuePanel />);
      expect(within(controls).getByRole("img", { name: label })).toBeTruthy();
      expect(controls.textContent).toContain(track.song.title);
    }
    fireEvent.click(screen.getByRole("button", { name: "Now Playing 화면 열기" }));
    expect(screen.getByTestId("otw-play-track-title").textContent).toBe(track.song.title);
  });

  it("keeps the same compact bar when resizing between tablet and phone", () => {
    const media = createMatchMediaController({
      [MINI_PLAYER_QUERY]: true,
      [PHONE_PLAYER_QUERY]: false,
      [DESKTOP_PLAYER_QUERY]: false,
    });
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
      playbackIntentVersion: 1,
      status: "playing",
      trackForItem: () => track,
    });

    render(<OtwPlayPlayerQueuePanel />);
    const playerRegion = screen.getByLabelText("OTW Play 재생 플레이어");
    fireEvent.click(screen.getByRole("button", { name: "카탈로그로 돌아가기" }));
    expect(playerRegion.getAttribute("data-player-presentation")).toBe("launcher");
    expect(actions.pause).not.toHaveBeenCalled();

    act(() => {
      media.set(MINI_PLAYER_QUERY, false);
      media.set(PHONE_PLAYER_QUERY, true);
    });

    expect(playerRegion.getAttribute("data-player-presentation")).toBe("launcher");
    expect(actions.pause).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "소형 플레이어" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("reopens a phone launcher only after a new explicit playback intent", () => {
    createMatchMediaController({
      [MINI_PLAYER_QUERY]: false,
      [PHONE_PLAYER_QUERY]: true,
      [DESKTOP_PLAYER_QUERY]: false,
    });
    const player = {
      ...emptyPlayer,
      queue: {
        items: [{ id: "item-1", performanceId: "performance-1", sourceId: "source-1" }],
        currentIndex: 0,
        repeat: "off",
        shuffled: false,
      },
      currentItem: { id: "item-1", performanceId: "performance-1", sourceId: "source-1" },
      currentTrack: track,
      playbackIntentVersion: 1,
      trackForItem: () => track,
    };
    mocks.usePlayer.mockReturnValue(player);

    const { rerender } = render(<OtwPlayPlayerQueuePanel />);
    const playerRegion = screen.getByLabelText("OTW Play 재생 플레이어");
    fireEvent.click(screen.getByRole("button", { name: "카탈로그로 돌아가기" }));
    expect(playerRegion.getAttribute("data-player-presentation")).toBe("launcher");

    mocks.usePlayer.mockReturnValue({ ...player, playbackIntentVersion: 2 });
    rerender(<OtwPlayPlayerQueuePanel />);
    expect(playerRegion.getAttribute("data-player-presentation")).toBe("full");
  });

  it("exposes the phone full player as a modal dialog and closes it with Escape", () => {
    createMatchMediaController({
      [MINI_PLAYER_QUERY]: false,
      [PHONE_PLAYER_QUERY]: true,
      [DESKTOP_PLAYER_QUERY]: false,
    });
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
      playbackIntentVersion: 1,
      trackForItem: () => track,
    });

    render(<OtwPlayPlayerQueuePanel />);
    const dialog = screen.getByRole("dialog", {
      name: "OTW Play 재생 플레이어",
    });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(dialog);

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(actions.pause).not.toHaveBeenCalled();
    expect(dialog.getAttribute("data-player-presentation")).toBe("launcher");
    expect(actions.setPlaybackSurfaceActive).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Now Playing 화면 열기" }));
    expect(actions.resume).not.toHaveBeenCalled();
  });

  it("shows blocked playback recovery actions without hiding the current source", () => {
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
      playbackIntentVersion: 1,
      status: "blocked",
      trackForItem: () => track,
    });

    render(<OtwPlayPlayerQueuePanel />);
    expect(screen.getByRole("alert").textContent).toContain("자동 재생을 차단");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(actions.retryPlayback).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("YouTube 영상 플레이어")).toBeTruthy();
  });

  it("keeps queue announcements available to assistive tech without a visible footer", () => {
    mocks.usePlayer.mockReturnValue({
      ...emptyPlayer,
      announcement: "대기열에 추가했습니다.",
    });

    render(<OtwPlayPlayerQueuePanel />);

    expect(screen.getByText("대기열에 추가했습니다.").className).toContain("sr-only");
  });

  it("keeps a restored queue reachable and retryable when hydration fails", () => {
    mocks.usePlayer.mockReturnValue({
      ...emptyPlayer,
      queue: {
        items: [{ id: "item-1", performanceId: "performance-1", sourceId: "source-1" }],
        currentIndex: 0,
        repeat: "off",
        shuffled: false,
      },
      currentItem: { id: "item-1", performanceId: "performance-1", sourceId: "source-1" },
      retryableItemIds: new Set(["item-1"]),
    });

    render(<OtwPlayPlayerQueuePanel />);

    const playerRegion = screen.getByLabelText("OTW Play 재생 플레이어");
    expect(playerRegion.getAttribute("data-player-presentation")).toBe("launcher");
    expect(screen.getByRole("button", { name: "Now Playing 화면 열기" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Now Playing 화면 열기" }));
    expect(playerRegion.getAttribute("data-player-presentation")).toBe("full");
    expect(screen.getByText("가창 정보를 불러오지 못했습니다")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "가창 정보 다시 불러오기" })[0]);
    expect(actions.retry).toHaveBeenCalledWith("item-1");

    fireEvent.click(screen.getByRole("button", { name: "카탈로그로 돌아가기" }));
    expect(screen.getByRole("button", { name: "Now Playing 화면 열기" })).toBeTruthy();
  });
});
