import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../platform/types";

const mocks = vi.hoisted(() => ({
  order: [] as string[],
  runSourceHealth: vi.fn(),
  runWarmup: vi.fn(),
  clearExpiredApiData: vi.fn(),
  requeuePending: vi.fn(),
  runDue: vi.fn(),
  runRecentDue: vi.fn(),
  recoverPending: vi.fn(),
  cleanupInvalidSubscriptions: vi.fn(),
  recoverStaleIntents: vi.fn(),
  renewDue: vi.fn(),
}));

vi.mock("../features/otw-play", () => ({
  CloudflarePlayTelemetryWriter: class {},
  D1SourceHealthRepository: class {},
  YouTubeOtwPlayMetadataReader: class {},
  SourceHealthService: class {
    runScheduled() {
      mocks.order.push("source-health");
      return mocks.runSourceHealth();
    }
  },
}));
vi.mock("../features/youtube", () => ({
  runScheduledYouTubeWarmup: () => {
    mocks.order.push("youtube-warmup");
    return mocks.runWarmup();
  },
}));
vi.mock("../features/x-posts", () => ({
  runScheduledXCollection: vi.fn(async () => ({
    skipped: true,
    elapsedMs: 0,
    intervalHours: 1,
  })),
}));
vi.mock("../features/naver-cafe", () => ({
  runScheduledNaverCafeCollection: vi.fn(async () => ({
    skipped: true,
    elapsedMs: 0,
    intervalHours: 1,
  })),
}));
vi.mock("../features/operations", () => ({
  runScheduledDataRetentionPrune: vi.fn(async () => ({
    skipped: true,
    lastRun: null,
    nextEligibleAt: null,
  })),
}));
vi.mock("./ingestion", () => ({
  createOtwPlayIngestionService: () => ({
    clearExpiredApiData: () => mocks.clearExpiredApiData(),
    requeuePending: () => mocks.requeuePending(),
  }),
}));
vi.mock("./channel-monitors", () => ({
  createOtwPlayChannelMonitorService: () => ({
    runDue: () => {
      mocks.order.push("channel-polling");
      return mocks.runDue();
    },
    runRecentDue: () => {
      mocks.order.push("channel-recent");
      return mocks.runRecentDue();
    },
  }),
}));
vi.mock("./websub", () => ({
  createOtwPlayWebsubService: () => ({
    recoverPending: () => {
      mocks.order.push("websub-recovery");
      return mocks.recoverPending();
    },
    cleanupInvalidSubscriptions: () => {
      mocks.order.push("websub-cleanup");
      return mocks.cleanupInvalidSubscriptions();
    },
    recoverStaleIntents: () => {
      mocks.order.push("websub-intent-recovery");
      return mocks.recoverStaleIntents();
    },
    renewDue: () => {
      mocks.order.push("websub-renewal");
      return mocks.renewDue();
    },
  }),
}));

import { runIndependentScheduledTasks } from "./scheduled";

describe("scheduled OTW Play source health", () => {
  beforeEach(() => {
    mocks.order.length = 0;
    mocks.runSourceHealth.mockReset();
    mocks.runWarmup.mockReset();
    mocks.runSourceHealth.mockResolvedValue({ claimed: 0 });
    mocks.runWarmup.mockResolvedValue({ status: "skipped", error: "empty" });
    mocks.clearExpiredApiData.mockReset().mockResolvedValue(0);
    mocks.requeuePending.mockReset().mockResolvedValue(0);
    mocks.runDue.mockReset().mockResolvedValue([]);
    mocks.runRecentDue.mockReset().mockResolvedValue([]);
    mocks.recoverPending.mockReset().mockResolvedValue(0);
    mocks.cleanupInvalidSubscriptions.mockReset().mockResolvedValue([]);
    mocks.recoverStaleIntents.mockReset().mockResolvedValue([]);
    mocks.renewDue.mockReset().mockResolvedValue([]);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("runs source health before the general YouTube warmup", async () => {
    await runIndependentScheduledTasks({} as Env);
    expect(mocks.order.indexOf("source-health"))
      .toBeLessThan(mocks.order.indexOf("youtube-warmup"));
    expect(mocks.runSourceHealth).toHaveBeenCalledOnce();
    expect(mocks.runWarmup).toHaveBeenCalledOnce();
  });

  it("isolates a shared source-health failure from later scheduled tasks", async () => {
    mocks.runSourceHealth.mockRejectedValueOnce(new Error("credential failure"));
    await runIndependentScheduledTasks({} as Env);
    expect(mocks.runWarmup).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledWith(
      "[scheduled] OTW Play source health failed",
      expect.any(Error),
    );
  });

  it("runs polling fallback, daily recent reconciliation, recovery, and renewal independently", async () => {
    mocks.runDue.mockRejectedValueOnce(new Error("polling failed"));

    await runIndependentScheduledTasks({} as Env);

    expect(mocks.runDue).toHaveBeenCalledOnce();
    expect(mocks.runRecentDue).toHaveBeenCalledOnce();
    expect(mocks.recoverPending).toHaveBeenCalledOnce();
    expect(mocks.cleanupInvalidSubscriptions).toHaveBeenCalledOnce();
    expect(mocks.recoverStaleIntents).toHaveBeenCalledOnce();
    expect(mocks.renewDue).toHaveBeenCalledOnce();
    expect(mocks.order).toEqual(expect.arrayContaining([
      "channel-polling",
      "channel-recent",
      "websub-recovery",
      "websub-cleanup",
      "websub-intent-recovery",
      "websub-renewal",
    ]));
    expect(console.error).toHaveBeenCalledWith(
      "[scheduled] OTW Play channel reconciliation failed",
      expect.any(Error),
    );
  });
});
