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
  it("canonicalizes YouTube without calling metadata", async () => {
    const repo = repository();
    const service = new MemberSubmissionService(repo, () => "proposal-1");
    await expect(
      service.preflight("user-1", {
        youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDfoo",
      }),
    ).resolves.toMatchObject({
      videoId: "dQw4w9WgXcQ",
      canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    });
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
