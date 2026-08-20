import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../platform/types";

const mocks = vi.hoisted(() => ({
  order: [] as string[],
  runSourceHealth: vi.fn(),
  runWarmup: vi.fn(),
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

import { runIndependentScheduledTasks } from "./scheduled";

describe("scheduled OTW Play source health", () => {
  beforeEach(() => {
    mocks.order.length = 0;
    mocks.runSourceHealth.mockReset();
    mocks.runWarmup.mockReset();
    mocks.runSourceHealth.mockResolvedValue({ claimed: 0 });
    mocks.runWarmup.mockResolvedValue({ status: "skipped", error: "empty" });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("runs source health before the general YouTube warmup", async () => {
    await runIndependentScheduledTasks({} as Env);
    expect(mocks.order).toEqual(["source-health", "youtube-warmup"]);
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
});
