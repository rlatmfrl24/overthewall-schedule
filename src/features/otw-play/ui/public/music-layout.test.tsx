// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OtwPlayPublicSongSummaryDto } from "@contracts/otw-play";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  useCatalog: vi.fn(),
  useFacets: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => mocks.navigate,
}));
vi.mock("../../queries/use-public-catalog", () => ({
  useOtwPlayCatalog: mocks.useCatalog,
  useOtwPlayFacets: mocks.useFacets,
}));
vi.mock("../../model/public-discover", () => ({
  assembleOtwPlayCollaborationSongs: (groups: OtwPlayPublicSongSummaryDto[][]) =>
    groups.flat().slice(0, 1),
}));
vi.mock("../../player/play-player-context", () => ({
  useOtwPlayPlayer: () => ({ play: vi.fn(), enqueue: vi.fn() }),
}));
vi.mock("./catalog-components", () => ({
  OtwPlayPerformanceActions: ({ song }: { song: { title: string } }) => (
    <button type="button">{song.title} 재생</button>
  ),
  OtwPlayParticipantChip: ({ participant }: { participant: { displayName: string } }) => (
    <span>{participant.displayName}</span>
  ),
  relationLabel: { original: "오리지널", cover: "공식 커버" },
}));

import { OtwPlayDiscoverPage } from "./discover-page";
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
  representativePerformance: {
    id: "performance-1",
    relation: "cover",
    releaseType: "official_video",
    participation: "duet",
    releasedAt: "2026-08-18T00:00:00.000Z",
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
  refetch: vi.fn(),
};

describe("OTW Play home and discover layouts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useCatalog.mockReturnValue(catalogResult);
    mocks.useFacets.mockReturnValue({
      data: {
        data: {
          members: [
            { memberUid: 1, code: "member", displayName: "멤버 이름", oshiMark: null, unitName: null },
          ],
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
  afterEach(cleanup);

  it("uses the new home as a search-led featured entry point", () => {
    render(<OtwPlayHomePage />);

    expect(screen.getByRole("heading", { name: "첫 번째 노래" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "멤버로 시작하기" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("OTW Play 곡 검색"), {
      target: { value: "  커버 검색  " },
    });
    fireEvent.submit(screen.getByRole("search"));
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/play/songs",
      search: { q: "커버 검색" },
    });
  });

  it("rearranges discover into featured, songs, videos, and members", () => {
    render(<OtwPlayDiscoverPage />);

    expect(screen.getByText("FEATURED")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "새로 등록된 곡" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "함께 부른 노래" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "멤버로 찾기" })).toBeTruthy();
  });
});
