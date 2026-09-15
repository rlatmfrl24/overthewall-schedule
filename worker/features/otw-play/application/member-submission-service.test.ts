import { describe, expect, it, vi } from "vitest";
import { MemberSubmissionService, getKstDayBounds } from "./member-submission-service";
import type { MemberSubmissionRepository } from "./ports/member-submission-repository";

const repository = () =>
  ({
    preflight: vi.fn(async () => ({ duplicate: null, songCandidates: [] })),
    create: vi.fn(),
    findReplay: vi.fn(async () => null),
    listMine: vi.fn(async () => ({ items: [], hasMore: false })),
    readMine: vi.fn(),
    update: vi.fn(),
    withdraw: vi.fn(),
  }) satisfies MemberSubmissionRepository;

describe("MemberSubmissionService", () => {
  it("canonicalizes YouTube and verifies metadata once while song search skips the provider", async () => {
    const repo = repository();
    const youtube = { readChannel: vi.fn(), readVideo: vi.fn(async () => ({ videoId: "dQw4w9WgXcQ", title: "영상 제목", channelId: "channel", channelTitle: "클리퍼", thumbnailUrl: null, durationSeconds: 180, publishedAt: null, availabilityStatus: "playable" as const })) };
    const service = new MemberSubmissionService(repo, () => "proposal-1", Date.now, youtube);
    await expect(
      service.preflight("user-1", {
        youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDfoo",
      }),
    ).resolves.toMatchObject({
      video: { title: "영상 제목", channelName: "클리퍼", durationSeconds: 180 },
      videoId: "dQw4w9WgXcQ",
      canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    });
    await service.preflight("user-1", { youtubeUrl: "https://youtu.be/dQw4w9WgXcQ", title: "곡 검색" });
    expect(youtube.readVideo).toHaveBeenCalledTimes(1);
  });

  it("uses KST calendar-day bounds", () => {
    expect(getKstDayBounds(Date.UTC(2026, 7, 19, 14, 59))).toEqual({
      dayStart: Date.UTC(2026, 7, 18, 15),
      dayEnd: Date.UTC(2026, 7, 19, 15),
    });
    expect(getKstDayBounds(Date.UTC(2026, 7, 19, 15))).toEqual({
      dayStart: Date.UTC(2026, 7, 19, 15),
      dayEnd: Date.UTC(2026, 7, 20, 15),
    });
  });

  it("canonicalizes edited videos and passes CAS commands to the repository", async () => {
    const repo = repository();
    const service = new MemberSubmissionService(
      repo,
      () => "event-1",
      () => 123,
    );
    await service.update("user-1", "proposal-1", {
      expectedVersion: 2,
      youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
      title: "Cover",
      originalArtists: [{ kind: "external", displayName: "Artist" }],
      participants: [{ kind: "member", memberUid: 1 }],
    });
    expect(repo.update).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      proposalId: "proposal-1",
      eventId: "event-1",
      videoId: "dQw4w9WgXcQ",
      canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      now: 123,
    }));

    await service.withdraw("user-1", "proposal-1", { expectedVersion: 2 });
    expect(repo.withdraw).toHaveBeenCalledWith({
      userId: "user-1",
      proposalId: "proposal-1",
      eventId: "event-1",
      expectedVersion: 2,
      now: 123,
    });
  });
});
