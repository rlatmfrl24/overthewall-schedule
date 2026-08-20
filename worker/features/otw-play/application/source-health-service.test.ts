import { describe, expect, it, vi } from "vitest";
import type {
  SourceHealthRepository,
  SourceHealthTarget,
} from "./ports/source-health-repository";
import {
  OtwPlayYouTubeMetadataError,
  type OtwPlayYouTubeBatchMetadataReader,
} from "./ports/youtube-metadata";
import { SourceHealthService } from "./source-health-service";

const NOW = Date.UTC(2026, 7, 20);
const target: SourceHealthTarget = {
  id: "source-1",
  provider: "youtube",
  externalId: "dQw4w9WgXcQ",
  channelId: "channel-1",
  externalChannelId: `UC${"A".repeat(22)}`,
  title: "Stored title",
  thumbnailUrl: null,
  durationSeconds: 180,
  providerPublishedAt: NOW - 1_000,
  availabilityStatus: "playable",
  lastCheckedAt: NOW - 60_000,
  nextCheckAt: NOW - 1,
  version: 3,
};

const checkedResponse = {
  data: { ...target },
  catalogRevision: 1,
  check: {
    status: "checked" as const,
    previousAvailability: "playable" as const,
    currentAvailability: "deleted" as const,
    changed: true,
    checkedAt: NOW,
    nextCheckAt: NOW + 7 * 24 * 60 * 60_000,
  },
};

const retryResponse = {
  data: { ...target, nextCheckAt: NOW + 30 * 60_000, version: 4 },
  catalogRevision: 1,
  check: {
    status: "retry_scheduled" as const,
    currentAvailability: "playable" as const,
    retryCode: "timeout" as const,
    nextCheckAt: NOW + 30 * 60_000,
  },
};

const repositoryOf = (overrides: Partial<SourceHealthRepository> = {}) =>
  ({
    claimDueSources: vi.fn(async () => []),
    readTarget: vi.fn(async () => target),
    applyObservation: vi.fn(async () => ({
      kind: "applied" as const,
      response: checkedResponse,
    })),
    scheduleRetry: vi.fn(async () => ({
      kind: "applied" as const,
      response: retryResponse,
    })),
    readDashboard: vi.fn(),
    ...overrides,
  }) as SourceHealthRepository;

const readerOf = (
  readVideos: ReturnType<typeof vi.fn>,
): OtwPlayYouTubeBatchMetadataReader => ({
  readChannel: vi.fn(),
  readVideo: vi.fn(),
  readVideos: readVideos as OtwPlayYouTubeBatchMetadataReader["readVideos"],
});

describe("SourceHealthService", () => {
  it("uses the same observation path for manual checks and validates stored identity", async () => {
    const applyObservation = vi.fn(async () => ({
      kind: "applied" as const,
      response: checkedResponse,
    }));
    const repository = repositoryOf({ applyObservation });
    const readVideos = vi.fn(async () => [{
      videoId: target.externalId,
      availabilityStatus: "deleted" as const,
      video: {
        videoId: target.externalId,
        channelId: target.externalChannelId,
        channelTitle: "Official",
        title: "Deleted video",
        thumbnailUrl: null,
        durationSeconds: 180,
        publishedAt: null,
        availabilityStatus: "deleted" as const,
      },
    }]);
    const service = new SourceHealthService(
      repository,
      readerOf(readVideos),
      () => "event-1",
      () => NOW,
    );

    await expect(service.recheckSource(target.id, {
      expectedVersion: target.version,
      youtubeUrl: `https://youtu.be/${target.externalId}`,
      channelId: target.channelId,
    })).resolves.toEqual(checkedResponse);
    expect(readVideos).toHaveBeenCalledWith([target.externalId]);
    expect(applyObservation).toHaveBeenCalledWith(expect.objectContaining({
      target,
      actor: { kind: "admin" },
      eventId: "event-1",
      checkedAt: NOW,
    }));
  });

  it("returns HTTP-safe retry data while preserving the target status and last check", async () => {
    const scheduleRetry = vi.fn(async () => ({
      kind: "applied" as const,
      response: retryResponse,
    }));
    const service = new SourceHealthService(
      repositoryOf({ scheduleRetry }),
      readerOf(vi.fn(async () => {
        throw new OtwPlayYouTubeMetadataError(
          "provider detail",
          "timeout",
          true,
        );
      })),
      () => "event-retry",
      () => NOW,
    );

    await expect(service.recheckSource(target.id, {
      expectedVersion: target.version,
      youtubeUrl: `https://youtu.be/${target.externalId}`,
      channelId: target.channelId,
    })).resolves.toEqual(retryResponse);
    expect(scheduleRetry).toHaveBeenCalledWith(expect.objectContaining({
      target,
      retryCode: "timeout",
      nextCheckAt: NOW + 30 * 60_000,
    }));
    expect(target.availabilityStatus).toBe("playable");
    expect(target.lastCheckedAt).toBe(NOW - 60_000);
  });

  it("claims at most 50 and counts changes, recoveries, retries, and stale writes", async () => {
    const recovered = {
      ...target,
      id: "source-2",
      externalId: "aaaaaaaaaaa",
      availabilityStatus: "unavailable" as const,
    };
    const stale = {
      ...target,
      id: "source-3",
      externalId: "bbbbbbbbbbb",
    };
    const applyObservation = vi
      .fn()
      .mockResolvedValueOnce({ kind: "applied", response: checkedResponse })
      .mockResolvedValueOnce({
        kind: "applied",
        response: {
          ...checkedResponse,
          check: {
            ...checkedResponse.check,
            previousAvailability: "unavailable",
            currentAvailability: "playable",
          },
        },
      })
      .mockResolvedValueOnce({ kind: "stale" });
    const claimDueSources = vi.fn(async () => [target, recovered, stale]);
    const repository = repositoryOf({ claimDueSources, applyObservation });
    const write = vi.fn();
    const readVideos = vi.fn(async () => [target, recovered, stale].map((item) => ({
      videoId: item.externalId,
      availabilityStatus: item.id === "source-1" ? "deleted" as const : "playable" as const,
      video: {
        videoId: item.externalId,
        channelId: item.externalChannelId,
        channelTitle: "Official",
        title: "Video",
        thumbnailUrl: null,
        durationSeconds: 180,
        publishedAt: null,
        availabilityStatus: item.id === "source-1" ? "deleted" as const : "playable" as const,
      },
    })));
    const service = new SourceHealthService(
      repository,
      readerOf(readVideos),
      () => crypto.randomUUID(),
      () => NOW,
      { write },
    );

    await expect(service.runScheduled()).resolves.toEqual({
      claimed: 3,
      checked: 2,
      changed: 2,
      recovered: 1,
      retryScheduled: 0,
      staleSkipped: 1,
    });
    expect(claimDueSources).toHaveBeenCalledWith(
      NOW,
      NOW + 30 * 60_000,
      50,
    );
    expect(readVideos).toHaveBeenCalledTimes(1);
    expect(readVideos).toHaveBeenCalledWith([
      target.externalId,
      recovered.externalId,
      stale.externalId,
    ]);
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "play.source.unavailable",
        resourceId: "source-1",
        transition: "playable:deleted",
        trigger: "scheduled",
      }),
    );
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "play.source.recovered",
        resourceId: "source-2",
      }),
    );
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "play.concurrent_write_conflict",
        resourceId: "source-3",
        status: 409,
      }),
    );
  });

  it("schedules every claimed source on a retryable shared outage", async () => {
    const second = { ...target, id: "source-2", externalId: "aaaaaaaaaaa" };
    const scheduleRetry = vi
      .fn()
      .mockResolvedValueOnce({ kind: "applied", response: retryResponse })
      .mockResolvedValueOnce({ kind: "stale" });
    const service = new SourceHealthService(
      repositoryOf({
        claimDueSources: vi.fn(async () => [target, second]),
        scheduleRetry,
      }),
      readerOf(vi.fn(async () => {
        throw new OtwPlayYouTubeMetadataError(
          "rate limited",
          "rate_limited",
          true,
          1,
        );
      })),
      () => crypto.randomUUID(),
      () => NOW,
    );

    await expect(service.runScheduled()).resolves.toEqual({
      claimed: 2,
      checked: 0,
      changed: 0,
      recovered: 0,
      retryScheduled: 1,
      staleSkipped: 1,
    });
    expect(scheduleRetry).toHaveBeenCalledTimes(2);
    expect(scheduleRetry).toHaveBeenNthCalledWith(1, expect.objectContaining({
      nextCheckAt: NOW + 15 * 60_000,
    }));
  });
});
