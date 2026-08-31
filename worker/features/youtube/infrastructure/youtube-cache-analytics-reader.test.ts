import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildYouTubeCacheAnalyticsSql,
  clearYouTubeCacheAnalyticsReaderCacheForTests,
  CloudflareYouTubeCacheAnalyticsReader,
} from "./youtube-cache-analytics-reader";

const row = (
  event: "youtube.cache.request" | "youtube.cache.refresh",
  source: "official" | "kirinuki",
  origin: "demand" | "manual",
  outcome: string,
  values: Partial<{
    event_count: number;
    target_count: number;
    available_count: number;
    refresh_count: number;
    observed_since_unix: number;
  }> = {},
) => ({
  event,
  source,
  origin,
  outcome,
  event_count: 1,
  target_count: 0,
  available_count: 0,
  refresh_count: 0,
  observed_since_unix: 1_787_875_200,
  ...values,
});

describe("Cloudflare YouTube cache analytics reader", () => {
  beforeEach(() => clearYouTubeCacheAnalyticsReaderCacheForTests());

  it("returns an explicit unconfigured result without querying Analytics Engine", async () => {
    const fetcher = vi.fn();
    const result = await new CloudflareYouTubeCacheAnalyticsReader(
      undefined,
      undefined,
      fetcher as typeof fetch,
      () => 1_788_134_400_000,
    ).read(168);

    expect(result).toMatchObject({
      status: "unconfigured",
      windowHours: 168,
      schemaVersion: "v2",
      sampled: true,
      observedSince: null,
      coverageHours: null,
      reasonCode: "analytics_unconfigured",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses one sampled, v2-only SQL query and aggregates request and ID-change outcomes", async () => {
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return Response.json({
        data: [
          row("youtube.cache.request", "official", "demand", "served_non_blocking", {
            event_count: 8,
            target_count: 16,
            available_count: 16,
          }),
          row("youtube.cache.request", "kirinuki", "demand", "served_after_refresh", {
            event_count: 2,
            target_count: 4,
            available_count: 2,
          }),
          row("youtube.cache.refresh", "official", "demand", "changed", {
            event_count: 1,
            refresh_count: 1,
          }),
          row("youtube.cache.refresh", "official", "demand", "unchanged", {
            event_count: 3,
            refresh_count: 3,
          }),
          row("youtube.cache.refresh", "kirinuki", "manual", "baseline", {
            event_count: 2,
            refresh_count: 2,
          }),
        ],
        });
      },
    );
    const reader = new CloudflareYouTubeCacheAnalyticsReader(
      "account/id",
      "read-token",
      fetcher as typeof fetch,
      () => 1_788_134_400_000,
    );

    const result = await reader.read(168);

    expect(result).toMatchObject({
      status: "available",
      reasonCode: null,
      observedSince: "2026-08-28T00:00:00.000Z",
      coverageHours: 72,
      summary: {
        requestCount: 10,
        nonBlockingServeCount: 8,
        requestedTargetCount: 20,
        immediateAvailableCount: 18,
        refreshCount: 6,
        baselineCount: 2,
        changedCount: 1,
        unchangedCount: 3,
      },
    });
    expect(result.byOrigin).toContainEqual(
      expect.objectContaining({
        origin: "demand",
        requestCount: 10,
        changedCount: 1,
        unchangedCount: 3,
      }),
    );
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toContain("accounts/account%2Fid/analytics_engine/sql");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer read-token",
      "Content-Type": "text/plain; charset=utf-8",
    });
    expect(init?.body).toContain("_sample_interval");
    expect(init?.body).toContain(
      "toUnixTimestamp(min(timestamp)) AS observed_since_unix",
    );
    expect(init?.body).toContain("INTERVAL '168' HOUR");
    expect(init?.body).toContain("blob6 = 'v2'");
    expect(init?.body).not.toContain("query=");

    await reader.read(168);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("distinguishes an available empty window from unavailable coverage", async () => {
    const fetcher = vi.fn(async () => Response.json({ data: [] }));
    const result = await new CloudflareYouTubeCacheAnalyticsReader(
      "account",
      "token",
      fetcher as typeof fetch,
      () => 1_788_134_400_000,
    ).read(24);

    expect(result).toMatchObject({
      status: "available",
      observedSince: null,
      coverageHours: 0,
      summary: { requestCount: 0, changedCount: 0 },
    });
  });

  it("uses the earliest grouped event and caps the event-backed coverage at the requested window", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        data: [
          row("youtube.cache.request", "official", "demand", "served_non_blocking", {
            observed_since_unix: 1_788_048_000,
          }),
          row("youtube.cache.refresh", "kirinuki", "manual", "unchanged", {
            observed_since_unix: 1_787_875_200,
          }),
        ],
      }),
    );
    const result = await new CloudflareYouTubeCacheAnalyticsReader(
      "account",
      "token",
      fetcher as typeof fetch,
      () => 1_788_134_400_000,
    ).read(24);

    expect(result).toMatchObject({
      status: "available",
      observedSince: "2026-08-28T00:00:00.000Z",
      coverageHours: 24,
    });
  });

  it("rejects an observed event beyond the tolerated Worker clock skew", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        data: [
          row("youtube.cache.request", "official", "demand", "served_non_blocking", {
            observed_since_unix: 1_788_134_520,
          }),
        ],
      }),
    );
    const result = await new CloudflareYouTubeCacheAnalyticsReader(
      "account",
      "token",
      fetcher as typeof fetch,
      () => 1_788_134_400_000,
    ).read(24);

    expect(result).toMatchObject({
      status: "unavailable",
      observedSince: null,
      coverageHours: null,
      reasonCode: "analytics_unavailable",
    });
  });

  it.each([429, 500])("fails open on Analytics Engine HTTP %s", async (status) => {
    const fetcher = vi.fn(async () => new Response("secret", { status }));
    const result = await new CloudflareYouTubeCacheAnalyticsReader(
      "account",
      "token",
      fetcher as typeof fetch,
    ).read(24);

    expect(result).toMatchObject({
      status: "unavailable",
      reasonCode: "analytics_unavailable",
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("rejects malformed responses and unsafe windows", async () => {
    const fetcher = vi.fn(async () => Response.json({ data: [{ nope: true }] }));
    const reader = new CloudflareYouTubeCacheAnalyticsReader(
      "account",
      "token",
      fetcher as typeof fetch,
    );
    await expect(reader.read(24)).resolves.toMatchObject({
      status: "unavailable",
    });
    expect(() => buildYouTubeCacheAnalyticsSql(169)).toThrow(
      "windowHours must be an integer between 1 and 168",
    );
  });
});
