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
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
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
  remove: vi.fn(),
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

  it("keeps the desktop player placeholder above an explicit empty queue", () => {
    render(<OtwPlayPlayerQueuePanel />);

    expect(screen.getByText("플레이큐가 비어 있습니다")).toBeTruthy();
    expect(screen.getByText("재생할 곡을 선택하세요")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "재생 컨트롤" })).toBeNull();
  });

  it("renders one player above the desktop queue and a mobile-first player", () => {
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
      panelExpanded: true,
      trackForItem: () => track,
    });

    render(<OtwPlayPlayerQueuePanel />);

    expect(screen.getAllByText("재생 중인 노래").length).toBeGreaterThan(0);
    const combinedRail = screen.getByRole("complementary", {
      name: "OTW Play 재생 및 플레이큐",
    });
    expect(combinedRail.className).toContain("xl:w-[380px]");
    expect(combinedRail.className).toContain("xl:h-full");
    expect(combinedRail.className).toContain("xl:min-h-0");
    expect(combinedRail.className).toContain("xl:overflow-hidden");
    const playbackRegion = screen.getByLabelText("OTW Play 재생 플레이어");
    expect(playbackRegion.className).toContain("xl:border-b");

    expect(screen.getAllByLabelText("YouTube 영상 플레이어")).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: /재생 상세 (접기|펼치기)/ }),
    ).toBeNull();
    expect(screen.getByRole("region", { name: "모바일 플레이큐" })).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "모바일 플레이큐" }).className,
    ).toContain("xl:hidden");
    expect(screen.queryByRole("slider", { name: "재생 볼륨" })).toBeNull();
    expect(
      within(screen.getByRole("region", { name: "플레이큐" }))
        .queryByLabelText("YouTube 영상 플레이어"),
    ).toBeNull();
    expect(screen.getByRole("heading", { name: "재생 중인 노래" })).toBeTruthy();
    const title = screen.getByTestId("otw-play-track-title");
    const identityActions = screen.getByTestId("otw-play-identity-actions");
    const metadata = screen.getByTestId("otw-play-track-metadata");
    const progress = screen.getByTestId("otw-play-playback-progress");
    const transportControls = screen.getByTestId("otw-play-transport-controls");
    expect(title.compareDocumentPosition(identityActions)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(identityActions.compareDocumentPosition(metadata)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(metadata.compareDocumentPosition(progress)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(progress.compareDocumentPosition(transportControls)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(within(metadata).getByText("J-POP")).toBeTruthy();
    expect(within(metadata).getByText("어쿠스틱")).toBeTruthy();
    expect(within(metadata).getByText("공식 커버")).toBeTruthy();
    expect(metadata.className).toContain("flex-nowrap");
    expect(metadata.className).toContain("overflow-x-auto");
    expect(metadata.className).not.toContain("overflow-hidden");
    expect(
      within(metadata).getByLabelText("음악 분류").className,
    ).toContain("flex-nowrap");
    expect(
      within(metadata).getByLabelText("가창 및 공개 정보").className,
    ).toContain("flex-nowrap");
    expect(within(metadata).getByText("공식 커버").className).toContain("rounded-full");
    expect(within(metadata).getByText("공식 영상").className).toContain("rounded-full");
    expect(within(metadata).getByLabelText(/^게시일 /).className).toContain("rounded-full");
    expect(screen.getByText("OTW 공식 채널")).toBeTruthy();
    expect(screen.queryByText("재생 대기")).toBeNull();
    expect(screen.queryByText("재생 중")).toBeNull();
    expect(within(transportControls).getByRole("button", { name: "이전 항목" })).toBeTruthy();
    expect(within(transportControls).getByRole("button", { name: /반복 꺼짐/ })).toBeTruthy();
    fireEvent.click(
      within(transportControls).getByRole("button", {
        name: "볼륨 조절, 현재 100%",
      }),
    );
    const volumeControls = screen.getByLabelText("볼륨 컨트롤");
    const volumeSlider = within(volumeControls).getByRole("slider", {
      name: "재생 볼륨",
    });
    expect(volumeSlider.getAttribute("aria-orientation")).toBe("vertical");
    expect(volumeSlider.style.writingMode).toBe("vertical-lr");
    expect(volumeSlider.className).toContain("h-28");
    fireEvent.change(volumeSlider, { target: { value: "42" } });
    expect(actions.setVolume).toHaveBeenCalledWith(42);
    fireEvent.click(
      within(volumeControls).getByRole("button", { name: "음소거" }),
    );
    expect(actions.toggleMuted).toHaveBeenCalledOnce();
    fireEvent.keyDown(volumeControls, { key: "Escape" });
    expect(screen.queryByRole("slider", { name: "재생 볼륨" })).toBeNull();
    expect(
      within(identityActions).getByRole("link", { name: "YouTube에서 열기" }),
    ).toBeTruthy();
    expect(within(identityActions).getByRole("link", { name: "곡 상세" })).toBeTruthy();
    expect(
      screen
        .getByTestId("otw-play-participant-identity")
        .querySelector('img[src="/profile/member.webp"]'),
    ).toBeTruthy();
    expect(screen.getByTestId("otw-play-participants").className).not.toContain(
      "[@media_(min-width:1280px)_and_(max-height:719px)]:hidden",
    );
    expect(screen.getByTestId("otw-play-participants").className).toContain("truncate");
    expect(screen.getByTestId("otw-play-participants").textContent).toContain("참여 멤버");
    expect(screen.getByTestId("otw-play-participants").textContent).not.toContain("+1");
    expect(
      within(screen.getByTestId("otw-play-participant-identity")).queryByText(
        "코러스",
      ),
    ).toBeNull();
    const publisherIdentity = screen.getByTestId("otw-play-publisher-identity");
    expect(publisherIdentity.className).toContain(
      "[@media_(min-width:1280px)_and_(max-height:719px)]:hidden",
    );
    expect(within(publisherIdentity).getByText("게시 채널")).toBeTruthy();
    expect(within(publisherIdentity).queryByRole("link")).toBeNull();
    expect(screen.getByLabelText("진행 시간").textContent).toBe("1:05");
    expect(screen.getByLabelText("남은 시간").textContent).toBe("-1:59");
    fireEvent.change(screen.getByRole("slider", { name: "재생 위치" }), {
      target: { value: "90" },
    });
    expect(actions.seek).toHaveBeenCalledWith(90);
    expect(screen.getByRole("link", { name: "곡 상세" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "카탈로그로 돌아가기" }));
    expect(actions.pause).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Now Playing 화면 열기" }));
    expect(actions.resume).toHaveBeenCalledOnce();

    fireEvent.click(screen.getAllByRole("button", { name: "다음 항목" })[0]);
    expect(actions.next).toHaveBeenCalledOnce();
  });

  it("keeps the iframe mounted while a short desktop rail switches between player details and queue", () => {
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

    const switcher = screen.getByRole("group", {
      name: "낮은 화면 재생 영역 전환",
    });
    const playerButton = within(switcher).getByRole("button", {
      name: "현재 재생",
    });
    const queueButton = within(switcher).getByRole("button", {
      name: "플레이큐 1",
    });
    const playerDetails = screen.getByTestId("otw-play-player-details");
    const queue = screen.getByTestId("otw-play-desktop-queue");

    expect(playerButton.getAttribute("aria-pressed")).toBe("true");
    expect(queueButton.getAttribute("aria-pressed")).toBe("false");
    expect(queue.className).toContain(
      "[@media_(min-width:1280px)_and_(max-height:639px)]:!hidden",
    );
    expect(screen.getAllByLabelText("YouTube 영상 플레이어")).toHaveLength(1);

    fireEvent.click(queueButton);

    expect(playerButton.getAttribute("aria-pressed")).toBe("false");
    expect(queueButton.getAttribute("aria-pressed")).toBe("true");
    expect(playerDetails.className).toContain(
      "[@media_(min-width:1280px)_and_(max-height:639px)]:!hidden",
    );
    expect(queue.className).not.toContain(
      "[@media_(min-width:1280px)_and_(max-height:639px)]:!hidden",
    );
    expect(screen.getAllByLabelText("YouTube 영상 플레이어")).toHaveLength(1);
    expect(actions.pause).not.toHaveBeenCalled();

    fireEvent.click(playerButton);
    expect(playerButton.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByLabelText("YouTube 영상 플레이어")).toHaveLength(1);
    expect(actions.pause).not.toHaveBeenCalled();
  });

  it("pauses before moving a 640-1279px full player into the visible mini presentation", () => {
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

    expect(actions.pause).toHaveBeenCalledOnce();
    expect(playerRegion.getAttribute("data-player-presentation")).toBe("mini");
    expect(screen.getByLabelText("YouTube 영상 플레이어")).toBe(playerHost);
    expect(screen.getAllByLabelText("YouTube 영상 플레이어")).toHaveLength(1);
    expect(screen.getByTestId("otw-play-mini-player-controls")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "미니 플레이어 일시정지" }));
    expect(actions.pause).toHaveBeenCalledTimes(2);

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
    expect(playerRegion.getAttribute("data-player-presentation")).toBe("mini");

    fireEvent.click(screen.getByRole("button", { name: "전체 Now Playing 열기" }));
    expect(playerRegion.getAttribute("data-player-presentation")).toBe("full");
    expect(actions.resume).not.toHaveBeenCalled();
    expect(screen.getByLabelText("YouTube 영상 플레이어")).toBe(playerHost);
  });

  it("reopens the full player if a visible mini player crosses below 640px", () => {
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
    expect(playerRegion.getAttribute("data-player-presentation")).toBe("mini");
    expect(actions.pause).toHaveBeenCalledOnce();

    act(() => {
      media.set(MINI_PLAYER_QUERY, false);
      media.set(PHONE_PLAYER_QUERY, true);
    });

    expect(playerRegion.getAttribute("data-player-presentation")).toBe("full");
    expect(actions.pause).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "카탈로그로 돌아가기" }));
    expect(actions.pause).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Now Playing 화면 열기" })).toBeTruthy();
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
    expect(actions.pause).toHaveBeenCalledOnce();
    expect(dialog.getAttribute("data-player-presentation")).toBe("launcher");
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
    expect(screen.getAllByRole("link", { name: /YouTube에서 열기/ }).length).toBeGreaterThan(0);
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
