import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../platform/types";

const mocks = vi.hoisted(() => ({
  order: [] as string[],
  runSourceHealth: vi.fn(),
  runXCollection: vi.fn(),
  runNaverCafeCollection: vi.fn(),
  runAutoUpdate: vi.fn(),
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
vi.mock("../features/x-posts", () => ({
  runScheduledXCollection: () => mocks.runXCollection(),
}));
vi.mock("../features/naver-cafe", () => ({
  runScheduledNaverCafeCollection: () => mocks.runNaverCafeCollection(),
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
vi.mock("../features/schedules", () => ({
  runAutoUpdateWithHistory: (...args: unknown[]) => mocks.runAutoUpdate(...args),
}));
vi.mock("../platform/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: async () => [
          { key: "auto_update_enabled", value: "true" },
          { key: "auto_update_interval_hours", value: "6" },
          { key: "auto_update_last_run", value: "0" },
          { key: "auto_update_range_days", value: "3" },
        ],
      }),
    }),
  }),
}));
vi.mock("../platform/http-helpers", () => ({
  updateSetting: vi.fn(async () => undefined),
}));

import { handleScheduled, runIndependentScheduledTasks } from "./scheduled";

describe("scheduled OTW Play source health", () => {
  beforeEach(() => {
    mocks.order.length = 0;
    mocks.runSourceHealth.mockReset();
    mocks.runSourceHealth.mockResolvedValue({ claimed: 0 });
    mocks.runXCollection.mockReset().mockResolvedValue({
      skipped: true,
      elapsedMs: 0,
      intervalHours: 1,
    });
    mocks.runNaverCafeCollection.mockReset().mockResolvedValue({
      skipped: true,
      elapsedMs: 0,
      intervalHours: 1,
    });
    mocks.runAutoUpdate.mockReset().mockResolvedValue({ success: true });
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

  it("keeps OTW Play source health without scheduling public cache warmup", async () => {
    await runIndependentScheduledTasks({} as Env);
    expect(mocks.runSourceHealth).toHaveBeenCalledOnce();
    expect(mocks.order).toContain("source-health");
    expect(mocks.order).not.toContain("youtube-warmup");
  });

  it("starts X and Naver Cafe collection without either source starving the other", async () => {
    let releaseXCollection: (() => void) | undefined;
    mocks.runXCollection.mockImplementationOnce(
      () => new Promise<void>((resolve) => {
        releaseXCollection = resolve;
      }),
    );

    const scheduledTasks = runIndependentScheduledTasks({} as Env);

    await vi.waitFor(() => {
      expect(mocks.runXCollection).toHaveBeenCalledOnce();
      expect(mocks.runNaverCafeCollection).toHaveBeenCalledOnce();
      expect(mocks.runSourceHealth).toHaveBeenCalledOnce();
    });

    releaseXCollection?.();
    await scheduledTasks;
  });

  it("does not let unrelated maintenance starve OTW Play source health", async () => {
    let releasePolling: (() => void) | undefined;
    mocks.runDue.mockImplementationOnce(
      () => new Promise<void>((resolve) => {
        releasePolling = resolve;
      }),
    );

    const scheduledTasks = runIndependentScheduledTasks({} as Env);

    await vi.waitFor(() => expect(mocks.runSourceHealth).toHaveBeenCalledOnce());
    releasePolling?.();
    await scheduledTasks;
  });

  it("starts auto update independently from slower external maintenance", async () => {
    let releaseSourceHealth: (() => void) | undefined;
    mocks.runSourceHealth.mockImplementationOnce(
      () => new Promise<void>((resolve) => {
        releaseSourceHealth = resolve;
      }),
    );

    const scheduled = handleScheduled(
      {} as ScheduledController,
      {} as Env,
    );

    await vi.waitFor(() => expect(mocks.runAutoUpdate).toHaveBeenCalledOnce());
    releaseSourceHealth?.();
    await scheduled;
  });

  it("isolates a shared source-health failure from later scheduled tasks", async () => {
    mocks.runSourceHealth.mockRejectedValueOnce(new Error("credential failure"));
    await runIndependentScheduledTasks({} as Env);
    expect(mocks.runXCollection).toHaveBeenCalledOnce();
    expect(mocks.runNaverCafeCollection).toHaveBeenCalledOnce();
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
