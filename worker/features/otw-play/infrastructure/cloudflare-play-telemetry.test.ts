import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlayTelemetryEvent } from "../application/ports/play-telemetry";
import {
  CloudflarePlayTelemetryWriter,
  shouldWritePlayCustomLog,
  toPlayAnalyticsDataPoint,
} from "./cloudflare-play-telemetry";

const event = (overrides: Partial<Parameters<typeof createPlayTelemetryEvent>[0]> = {}) =>
  createPlayTelemetryEvent({
    event: "play.catalog.read",
    occurredAt: "2026-08-20T00:00:00.000Z",
    requestId: "request-1",
    cfRay: "ray-1",
    routeId: "otw-play.public.catalog",
    trigger: "GET",
    status: 200,
    durationMs: 12,
    cacheStatus: "hit",
    d1RowsRead: 3,
    d1RowsWritten: null,
    ...overrides,
  });

afterEach(() => vi.restoreAllMocks());

describe("Cloudflare OTW Play telemetry", () => {
  it("maps only fixed safe slots and preserves unknown D1 metadata as -1", () => {
    const point = toPlayAnalyticsDataPoint(
      event({
        resourceId: "unsafe query=value",
        errorCode: "PLAY_SAFE_ERROR",
        d1RowsRead: null,
      }),
    );
    expect(point.blobs).toEqual([
      "play.catalog.read",
      "otw-play.public.catalog",
      "GET",
      "hit",
      "PLAY_SAFE_ERROR",
      "",
      "",
      "",
      "request-1",
      "ray-1",
      "domain",
    ]);
    expect(point.doubles).toEqual([200, 12, -1, -1, 1]);
  });

  it("deterministically samples only successful catalog custom logs", () => {
    const outcomes = Array.from({ length: 100 }, (_, index) =>
      shouldWritePlayCustomLog(event({ requestId: `request-${index}` })),
    );
    expect(outcomes.filter(Boolean).length).toBeGreaterThanOrEqual(5);
    expect(outcomes.filter(Boolean).length).toBeLessThanOrEqual(15);
    expect(
      Array.from({ length: 100 }, (_, index) =>
        shouldWritePlayCustomLog(event({ requestId: `request-${index}` })),
      ),
    ).toEqual(outcomes);
    expect(
      shouldWritePlayCustomLog(
        event({ requestId: "not-sampled", status: 503 }),
      ),
    ).toBe(true);
    expect(
      shouldWritePlayCustomLog(
        event({ event: "play.release.updated", requestId: "not-sampled" }),
      ),
    ).toBe(true);
  });

  it("writes every datapoint while redacting unsafe log resource values", () => {
    const writeDataPoint = vi.fn();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const writer = new CloudflarePlayTelemetryWriter({
      writeDataPoint,
    } as unknown as AnalyticsEngineDataset);
    writer.write(
      event({
        event: "play.release.updated",
        resourceId: "secret?token=value",
        transition: "enable_public_read",
      }),
    );
    expect(writeDataPoint).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledOnce();
    const logged = info.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(logged).not.toHaveProperty("resourceId");
    expect(JSON.stringify(logged)).not.toContain("token=value");
  });
});
