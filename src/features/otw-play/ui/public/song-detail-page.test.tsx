// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ useSong: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/play/songs">{children}</a>,
}));
vi.mock("../../queries/use-public-catalog", () => ({
  useOtwPlaySong: mocks.useSong,
}));
vi.mock("../../player/play-player-context", () => ({
  useOtwPlayPlayer: () => ({
    play: vi.fn(),
    enqueue: vi.fn(),
    playNext: vi.fn(),
    queue: { items: [] },
  }),
}));

import { OtwPlaySongDetailPage } from "./song-detail-page";

const performance = (id: string) => ({
  id,
  relation: "cover" as const,
  releaseType: "official_video" as const,
  participation: "solo" as const,
  releasedAt: null,
  participants: [],
  selectedSource: null,
  sourceCount: 0,
  playable: false,
  usingFallback: false,
  sources: [],
});

describe("OtwPlaySongDetailPage", () => {
  afterEach(cleanup);

  it("highlights the performance selected by the direct-link query", () => {
    mocks.useSong.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        data: {
          id: "song-1",
          slug: "song-1",
          title: "Song",
          isOtwOriginal: false,
          originalReleaseDate: null,
          originalReleasePrecision: "unknown",
          originalArtists: [],
          performanceCount: 2,
          playable: false,
          performances: [performance("p1"), performance("p2")],
        },
      },
    });
    render(<OtwPlaySongDetailPage songSlug="song-1" highlightedPerformanceId="p2" />);
    expect(screen.getByRole("link", { name: "곡 검색" })).toBeTruthy();
    expect(screen.getByText("직접 링크로 선택됨")).toBeTruthy();
    expect(document.getElementById("performance-p2")?.className).toContain("ring-2");
    expect(document.getElementById("performance-p1")?.className).not.toContain("ring-2");
  });
});
