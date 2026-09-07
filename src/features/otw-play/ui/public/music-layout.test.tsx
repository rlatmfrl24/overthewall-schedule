// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OtwPlayPublicSongSummaryDto } from "@contracts/otw-play";

const mocks = vi.hoisted(() => ({
  useCatalog: vi.fn(),
  useFacets: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    search,
    className,
    "aria-label": ariaLabel,
  }: {
    children: React.ReactNode;
    to: string;
    search?: Record<string, unknown>;
    className?: string;
    "aria-label"?: string;
  }) => (
    <a
      href={to}
      data-search={JSON.stringify(search ?? {})}
      className={className}
      aria-label={ariaLabel}
    >
      {children}
    </a>
  ),
}));
vi.mock("../../queries/use-public-catalog", () => ({
  useOtwPlayCatalog: mocks.useCatalog,
  useOtwPlayFacets: mocks.useFacets,
}));
vi.mock("../../player/play-player-context", () => ({
  useOtwPlayPlayer: () => ({
    play: vi.fn(),
    enqueue: vi.fn(),
    queue: { items: [] },
  }),
}));
vi.mock("./catalog-components", () => ({
  OtwPlayPerformanceActions: ({ song }: { song: { title: string } }) => (
    <button type="button">{song.title} 재생</button>
  ),
  OtwPlayParticipantChip: ({ participant }: { participant: { displayName: string } }) => (
    <span>{participant.displayName}</span>
  ),
  OtwPlaySongTags: ({ tags }: { tags: string[] }) => <span>{tags.join(", ")}</span>,
  OtwPlayPerformanceTags: ({ tags }: { tags: string[] }) => (
    <span aria-label="커버 영상 라벨">{tags.join(", ")}</span>
  ),
  OtwPlayPerformanceMetadata: () => <span>가창 분류</span>,
  relationLabel: { original: "오리지널", cover: "공식 커버" },
}));

import { OtwPlayHomePage } from "./home-page";

const song: OtwPlayPublicSongSummaryDto = {
  id: "song-1",
  slug: "first-song",
  title: "첫 번째 노래",
  isOtwOriginal: false,
  originalReleaseDate: null,
  originalReleasePrecision: "unknown",
  originalArtists: [
    { entityId: "artist-1", slug: "artist", displayName: "원곡 가수", kind: "person" },
  ],
  tags: ["K-POP"],
  representativePerformance: {
    id: "performance-1",
    relation: "cover",
    releaseType: "official_video",
    participation: "duet",
    releasedAt: "2026-08-18T00:00:00.000Z",
    tags: ["라이브"],
    participants: [
      {
        entityId: "member-1",
        slug: "member",
        displayName: "멤버 이름",
        role: "vocal",
        creditOrder: 0,
        kind: "current_member",
        uid: 1,
        code: "member",
        oshiMark: null,
        unitName: null,
      },
    ],
    selectedSource: {
      sourceId: "source-1",
      provider: "youtube",
      externalId: "dQw4w9WgXcQ",
      title: "영상",
      thumbnailUrl: "https://example.com/thumbnail.jpg",
      durationSeconds: 180,
      providerPublishedAt: null,
      availability: "playable",
      sourceRole: "official",
      startSeconds: 0,
      endSeconds: null,
      priority: 0,
      isPrimary: true,
      playable: true,
      channel: { id: "channel-1", displayName: "공식 채널", role: "member_main" },
    },
    sourceCount: 1,
    playable: true,
    usingFallback: false,
  },
  performanceCount: 1,
  playable: true,
};

const catalogResult = {
  data: { pages: [{ data: { items: [song, { ...song, id: "song-2", slug: "second", title: "두 번째 노래" }] } }] },
  isPending: false,
  isError: false,
  error: null,
  hasNextPage: false,
  isFetchingNextPage: false,
  isFetchNextPageError: false,
  fetchNextPage: vi.fn(),
  refetch: vi.fn(),
};

let intersectionCallback: IntersectionObserverCallback | null = null;
let observedTarget: Element | null = null;

class TestIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "320px 0px";
  readonly thresholds = [0];

  constructor(callback: IntersectionObserverCallback) {
    intersectionCallback = callback;
  }

  disconnect = vi.fn();
  observe = vi.fn((target: Element) => {
    observedTarget = target;
  });
  takeRecords = vi.fn(() => []);
  unobserve = vi.fn();
}

const memberFacet = (uid: number) => ({
  memberUid: uid,
  code: `member-${uid}`,
  displayName: `멤버 ${uid}`,
  oshiMark: uid === 1 ? "🌙" : null,
  unitName: null,
});

describe("OTW Play discover layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    intersectionCallback = null;
    observedTarget = null;
    vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
    mocks.useCatalog.mockReturnValue(catalogResult);
    mocks.useFacets.mockReturnValue({
      data: {
        data: {
          members: Array.from({ length: 9 }, (_, index) => memberFacet(index + 1)),
          groups: [],
          originalArtists: [],
        },
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("uses discovery as a compact featured entry point", () => {
    render(<OtwPlayHomePage />);

    expect(screen.getByRole("heading", { name: "첫 번째 노래" })).toBeTruthy();
    expect(screen.getAllByLabelText("커버 영상 라벨").length).toBeGreaterThan(0);
    expect(screen.getAllByText("라이브").length).toBeGreaterThan(0);
    const heroImageFrame = screen
      .getByRole("heading", { name: "첫 번째 노래" })
      .closest("article")
      ?.querySelector("img")
      ?.parentElement;
    expect(heroImageFrame?.className).toContain("w-full");
    expect(heroImageFrame?.className).toContain("aspect-video");
    expect(heroImageFrame?.className).not.toContain("h-[clamp(");
    expect(screen.getAllByRole("link", { name: "곡 검색" }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "다음 추천곡" }));
    expect(screen.getByRole("heading", { name: "두 번째 노래" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "이전 추천곡" }));
    expect(screen.getByRole("heading", { name: "첫 번째 노래" })).toBeTruthy();

    const carousel = screen.getByRole("region", { name: "추천 배너" });
    fireEvent.wheel(carousel, { deltaX: 120, deltaY: 0 });
    expect(screen.getByRole("heading", { name: "두 번째 노래" })).toBeTruthy();
    fireEvent.keyDown(carousel, { key: "ArrowLeft" });
    expect(screen.getByRole("heading", { name: "첫 번째 노래" })).toBeTruthy();

    const membersHeading = screen.getByRole("heading", { name: "멤버로 찾기" });
    const latestHeading = screen.getByRole("heading", { name: "최근 공개된 곡" });
    expect(
      membersHeading.compareDocumentPosition(latestHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText("멤버 9")).toBeTruthy();
    const memberLink = screen.getByRole("link", {
      name: "멤버 1 메인 보컬 곡 보기",
    });
    expect(JSON.parse(memberLink.dataset.search ?? "{}")).toEqual({
      member: "1",
      participantRole: "vocal",
    });
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "첫 번째 노래" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "두 번째 노래" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("columnheader", { name: "곡" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "작업" })).toBeTruthy();
  });

  it("loads the next latest-song page without extending the featured carousel", () => {
    const fetchNextPage = vi.fn();
    const firstPageSongs = Array.from({ length: 8 }, (_, index) => ({
      ...song,
      id: `song-${index + 1}`,
      slug: `song-${index + 1}`,
      title: `${index + 1}번째 노래`,
    }));
    const ninthSong = {
      ...song,
      id: "song-9",
      slug: "song-9",
      title: "9번째 노래",
    };
    mocks.useCatalog.mockReturnValue({
      ...catalogResult,
      data: {
        pages: [
          { data: { items: firstPageSongs } },
          { data: { items: [ninthSong] } },
        ],
      },
      hasNextPage: true,
      fetchNextPage,
    });

    render(<OtwPlayHomePage />);

    expect(screen.getAllByRole("link", { name: "9번째 노래" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "9번째 추천곡 보기" })).toBeNull();
    expect(observedTarget).not.toBeNull();

    act(() => {
      intersectionCallback?.(
        [
          {
            isIntersecting: true,
            target: observedTarget,
          } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
      intersectionCallback?.(
        [
          {
            isIntersecting: true,
            target: observedTarget,
          } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    });

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it.each(["pending", "error"])(
    "starts observing when facets recover from %s after the catalog has loaded",
    (state) => {
      const fetchNextPage = vi.fn();
      mocks.useCatalog.mockReturnValue({ ...catalogResult, hasNextPage: true, fetchNextPage });
      const loadedFacets = mocks.useFacets();
      mocks.useFacets.mockReturnValue({
        ...loadedFacets, data: undefined,
        isPending: state === "pending", isError: state === "error",
        error: state === "error" ? new Error("facets unavailable") : null,
      });
      const view = render(<OtwPlayHomePage />);
      expect(observedTarget).toBeNull();
      mocks.useFacets.mockReturnValue(loadedFacets);
      view.rerender(<OtwPlayHomePage />);
      expect(observedTarget).not.toBeNull();
      act(() => intersectionCallback?.(
        [{ isIntersecting: true, target: observedTarget } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ));
      expect(fetchNextPage).toHaveBeenCalledOnce();
    },
  );

  it("ignores queued observer callbacks after the sentinel is removed", () => {
    const fetchNextPage = vi.fn();
    mocks.useCatalog.mockReturnValue({ ...catalogResult, hasNextPage: true, fetchNextPage });
    const view = render(<OtwPlayHomePage />);
    const callback = intersectionCallback;
    const target = observedTarget;
    view.unmount();
    act(() => callback?.(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    ));
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("stops automatic loading after a next-page error and exposes retry", () => {
    const fetchNextPage = vi.fn();
    mocks.useCatalog.mockReturnValue({
      ...catalogResult,
      isError: true,
      hasNextPage: true,
      isFetchNextPageError: true,
      fetchNextPage,
    });

    render(<OtwPlayHomePage />);

    expect(intersectionCallback).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      name: "while another page is loading",
      query: { hasNextPage: true, isFetchingNextPage: true },
    },
    {
      name: "after the final page",
      query: { hasNextPage: false, isFetchingNextPage: false },
    },
  ])("does not observe the sentinel $name", ({ query }) => {
    mocks.useCatalog.mockReturnValue({
      ...catalogResult,
      ...query,
    });

    render(<OtwPlayHomePage />);

    expect(intersectionCallback).toBeNull();
  });

  it("keeps manual pagination when IntersectionObserver is unavailable", () => {
    const fetchNextPage = vi.fn();
    vi.stubGlobal("IntersectionObserver", undefined);
    mocks.useCatalog.mockReturnValue({
      ...catalogResult,
      hasNextPage: true,
      fetchNextPage,
    });

    render(<OtwPlayHomePage />);
    fireEvent.click(screen.getByRole("button", { name: "더 불러오기" }));

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

});
