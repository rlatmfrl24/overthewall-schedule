// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  OtwPlayPublicParticipantDto,
  OtwPlayPublicSongSummaryDto,
} from "@contracts/otw-play";

const mocks = vi.hoisted(() => ({
  usePlayer: vi.fn(),
}));

vi.mock("../../player/play-player-context", () => ({
  useOtwPlayPlayer: mocks.usePlayer,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, search }: { children: React.ReactNode; search?: unknown }) => (
    <a href="/play/songs" data-search={JSON.stringify(search)}>{children}</a>
  ),
}));

import {
  OtwPlayParticipantChip,
  OtwPlayParticipantCreditGroups,
  OtwPlayParticipantSummary,
  OtwPlaySongRow,
} from "./catalog-components";

const base = {
  entityId: "entity-1",
  slug: "external-singer",
  displayName: "Singer",
  role: "vocal" as const,
  creditOrder: 0,
};

describe("OtwPlayParticipantChip", () => {
  beforeEach(() => {
    mocks.usePlayer.mockReturnValue({
      queue: { items: [] },
      play: vi.fn(),
      enqueue: vi.fn(),
      playNext: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it.each([
    [
      { ...base, kind: "current_member", uid: 7, code: "singer", oshiMark: "🎵", unitName: null },
      { member: "7", participantRole: "vocal" },
    ],
    [
      { ...base, kind: "external" },
      { participant: "external-singer" },
    ],
    [
      { ...base, kind: "group", groupKey: "g1_opaque" },
      { group: "g1_opaque" },
    ],
  ])("uses the server-provided exact filter for %o", (participant, expectedSearch) => {
    render(<OtwPlayParticipantChip participant={participant as OtwPlayPublicParticipantDto} />);
    expect(screen.getByRole("link").getAttribute("data-search")).toBe(
      JSON.stringify(expectedSearch),
    );
  });

  it("presents catalog metadata as separate top chips without a visible artist label", () => {
    const song: OtwPlayPublicSongSummaryDto = {
      id: "song-1",
      slug: "song-1",
      title: "검색 결과 노래",
      isOtwOriginal: false,
      originalReleaseDate: null,
      originalReleasePrecision: "unknown",
      originalArtists: [
        {
          entityId: "artist-1",
          slug: "yorushika",
          displayName: "요루시카",
          kind: "group",
        },
      ],
      tags: ["J-POP"],
      representativePerformance: {
        id: "performance-1",
        relation: "cover",
        releaseType: "official_video",
        participation: "solo",
        releasedAt: "2026-08-18T00:00:00.000Z",
        tags: ["어쿠스틱"],
        participants: [
          {
            ...base,
            entityId: "member-1",
            slug: "member-1",
            displayName: "참여 멤버",
            kind: "current_member",
            uid: 1,
            code: "member-1",
            oshiMark: null,
            unitName: null,
          },
        ],
        selectedSource: {
          sourceId: "source-1",
          provider: "youtube",
          externalId: "video-1",
          title: "공식 영상",
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
          channel: {
            id: "channel-1",
            displayName: "공식 채널",
            role: "member_main",
          },
        },
        sourceCount: 1,
        playable: true,
        usingFallback: false,
      },
      performanceCount: 1,
      playable: true,
    };

    render(<OtwPlaySongRow song={song} />);

    const metadata = screen.getByLabelText("가창 및 공개 정보");
    const title = screen.getByRole("link", { name: "검색 결과 노래" });
    expect(metadata.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(metadata).getByText("공식 커버").className).toContain("rounded-full");
    expect(within(metadata).getByText("공식 영상").className).toContain("rounded-full");
    expect(within(metadata).getByText("솔로").className).toContain("rounded-full");
    expect(within(metadata).getByLabelText(/^게시일 /).className).toContain("rounded-full");
    expect(screen.getByText("요루시카")).toBeTruthy();
    expect(screen.queryByText(/^원곡 가수/)).toBeNull();
  });

  it("keeps supporting credits out of compact summaries", () => {
    const participants = [
      { ...base, entityId: "chorus", slug: "chorus", displayName: "코러스 멤버", role: "chorus" as const, kind: "external" as const },
      { ...base, entityId: "main", slug: "main", displayName: "메인 멤버", role: "vocal" as const, kind: "external" as const, creditOrder: 1 },
      { ...base, entityId: "sub", slug: "sub", displayName: "피처링 멤버", role: "featured_vocal" as const, kind: "external" as const, creditOrder: 2 },
    ];
    render(
      <OtwPlayParticipantSummary
        participants={participants}
      />,
    );

    expect(screen.getByRole("link", { name: /메인 멤버/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /코러스 멤버/ })).toBeNull();
    expect(screen.queryByText("코러스")).toBeNull();
  });

  it("shows every credit under an explicit role on song detail", () => {
    render(
      <OtwPlayParticipantCreditGroups
        participants={[
          { ...base, entityId: "chorus", slug: "chorus", displayName: "코러스 멤버", role: "chorus", kind: "external" },
          { ...base, entityId: "main", slug: "main", displayName: "메인 멤버", role: "vocal", kind: "external", creditOrder: 1 },
          { ...base, entityId: "featured", slug: "featured", displayName: "피처링 멤버", role: "featured_vocal", kind: "external", creditOrder: 2 },
        ]}
      />,
    );

    expect(within(screen.getByRole("group", { name: "메인 보컬" })).getByRole("link", { name: /메인 멤버/ })).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "피처링 보컬" })).getByRole("link", { name: /피처링 멤버/ })).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "코러스" })).getByRole("link", { name: /코러스 멤버/ })).toBeTruthy();
  });
});
