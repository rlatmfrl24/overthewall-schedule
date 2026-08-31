import { describe, expect, it, vi } from "vitest";
import {
  createYouTubeCacheTelemetryWriter,
  toYouTubeCacheAnalyticsDataPoint,
  type YouTubeCacheTelemetryEvent,
} from "./youtube-cache-telemetry";

const event = (
  overrides: Partial<YouTubeCacheTelemetryEvent> = {},
): YouTubeCacheTelemetryEvent => ({
  event: "youtube.cache.request",
  source: "official",
  origin: "demand",
  state: "stale",
  outcome: "served",
  status: 200,
  durationMs: 8,
  targetCount: 3,
  availableCount: 2,
  refreshCount: 1,
  pendingCount: 1,
  ...overrides,
});

describe("YouTube cache telemetry", () => {
  it("maps request, cache outcome, and refresh metrics to fixed dimensions", () => {
    expect(toYouTubeCacheAnalyticsDataPoint(event())).toEqual({
      indexes: ["youtube.cache.request|official|demand"],
      blobs: [
        "youtube.cache.request",
        "official",
        "demand",
        "stale",
        "served",
        "v2",
      ],
      doubles: [200, 8, 3, 2, 1, 1, 1],
    });

    expect(
      toYouTubeCacheAnalyticsDataPoint(
        event({
          event: "youtube.cache.refresh",
          source: "kirinuki",
          origin: "manual",
          state: "fresh",
          outcome: "refreshed",
          durationMs: 1_250,
        }),
      ),
    ).toMatchObject({
      indexes: ["youtube.cache.refresh|kirinuki|manual"],
      blobs: [
        "youtube.cache.refresh",
        "kirinuki",
        "manual",
        "fresh",
        "refreshed",
        "v2",
      ],
      doubles: [200, 1_250, 3, 2, 1, 1, 1],
    });
  });

  it("never serializes query, IP, user, channel, video, or title data", () => {
    const unsafeRuntimeEvent = {
      ...event(),
      query: "?token=secret-query",
      ip: "203.0.113.10",
      userId: "secret-user",
      channelId: "secret-channel",
      videoId: "secret-video",
      title: "secret-title",
    } as YouTubeCacheTelemetryEvent;

    const serialized = JSON.stringify(
      toYouTubeCacheAnalyticsDataPoint(unsafeRuntimeEvent),
    );
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("203.0.113.10");
  });

  it("replaces invalid runtime dimensions and numbers instead of emitting them", () => {
    const point = toYouTubeCacheAnalyticsDataPoint({
      ...event(),
      event: "?token=secret" as YouTubeCacheTelemetryEvent["event"],
      source: "secret-channel" as YouTubeCacheTelemetryEvent["source"],
      origin: "secret-user" as YouTubeCacheTelemetryEvent["origin"],
      state: "secret-title" as YouTubeCacheTelemetryEvent["state"],
      outcome: "secret-video" as YouTubeCacheTelemetryEvent["outcome"],
      status: Number.NaN,
      durationMs: -1,
    });

    expect(point.indexes).toEqual(["unknown|unknown|unknown"]);
    expect(point.blobs).toEqual([
      "unknown",
      "unknown",
      "unknown",
      "unknown",
      "unknown",
      "v2",
    ]);
    expect(point.doubles.slice(0, 2)).toEqual([0, 0]);
    expect(JSON.stringify(point)).not.toContain("secret");
  });

  it("is a no-op without a dataset", () => {
    expect(() =>
      createYouTubeCacheTelemetryWriter().write(event()),
    ).not.toThrow();
  });

  it("fails open when Analytics Engine rejects a datapoint", () => {
    const writeDataPoint = vi.fn(() => {
      throw new Error("analytics unavailable");
    });
    const writer = createYouTubeCacheTelemetryWriter({
      writeDataPoint,
    } as unknown as AnalyticsEngineDataset);

    expect(() => writer.write(event())).not.toThrow();
    expect(writeDataPoint).toHaveBeenCalledOnce();
  });
});
