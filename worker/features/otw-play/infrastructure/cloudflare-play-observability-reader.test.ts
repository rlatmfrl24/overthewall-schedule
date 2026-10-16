import { describe, expect, it, vi } from "vitest";
import {
  CloudflarePlayObservabilityReader,
} from "./cloudflare-play-observability-reader";

const row = (
  rowKind: "summary" | "route" | "event",
  rowKey: string,
  overrides: Record<string, number> = {},
) => ({
  row_kind: rowKind,
  row_key: rowKey,
  request_count: 10,
  error_count: 2,
  cache_hit: 4,
  cache_miss: 3,
  cache_bypass: 3,
  p95_duration_ms: 120,
  d1_rows_read: 42,
  d1_rows_read_known: 8,
  d1_rows_written: 2,
  d1_rows_written_known: 1,
  event_count: 0,
  ...overrides,
});

describe("Cloudflare OTW Play observability reader", () => {
  it("returns an HTTP-independent unconfigured partial when credentials are absent", async () => {
    const fetcher = vi.fn();
    const result = await new CloudflarePlayObservabilityReader(
      undefined,
      undefined,
      "otw_play_events",
      fetcher as typeof fetch,
      () => 1_787_184_000_000,
    ).read24Hours();
    expect(result).toMatchObject({
      status: "unconfigured",
      windowHours: 24,
      reasonCode: "analytics_unconfigured",
      routes: [],
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses fixed SQL with sample intervals and validates aggregate rows", async () => {
    const receivers: unknown[] = [];
    const fetcher = vi.fn(
      async function (this: unknown, _input: RequestInfo | URL, init?: RequestInit) {
        receivers.push(this);
        const body = init?.body;
        const data =
          String(body).includes("'summary' AS row_kind")
            ? [row("summary", "")]
            : String(body).includes("'route' AS row_kind")
              ? [row("route", "otw-play.public.catalog")]
              : [row("event", "play.catalog.read", { event_count: 12 })];
        return Response.json({
          data,
        });
      },
    );
    const result = await new CloudflarePlayObservabilityReader(
      "account",
      "read-token",
      "otw_play_events",
      fetcher as typeof fetch,
      () => 1_787_184_000_000,
    ).read24Hours();
    expect(result).toMatchObject({
      status: "available",
      windowHours: 24,
      summary: {
        requestCount: 10,
        errorCount: 2,
        errorRate: 0.2,
        p95DurationMs: 120,
        d1RowsRead: 42,
      },
      routes: [{ routeId: "otw-play.public.catalog", requestCount: 10 }],
      events: [{ event: "play.catalog.read", count: 12 }],
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(receivers).toEqual([undefined, undefined, undefined]);
    const requests = fetcher.mock.calls.map(([, init]) => init);
    for (const init of requests) {
      expect(init?.body).toContain("FROM otw_play_events");
      expect(init?.body).toContain("_sample_interval");
      expect(init?.body).toContain("INTERVAL '24' HOUR");
      expect(init?.body).toContain("FORMAT JSON");
      expect(init?.body).not.toContain("UNION");
      expect(JSON.stringify(init)).not.toContain("query=");
    }
    expect(String(fetcher.mock.calls[2]?.[1]?.body)).toContain(
      "blob11 != 'request'",
    );
    expect(String(requests[0]?.body)).toContain(
      "quantileExactWeighted(0.95)",
    );
  });

  it.each([429, 500])("isolates upstream %s as an unavailable partial", async (status) => {
    const fetcher = vi.fn(async () => new Response("secret", { status }));
    const result = await new CloudflarePlayObservabilityReader(
      "account",
      "read-token",
      "otw_play_events",
      fetcher as typeof fetch,
    ).read24Hours();
    expect(result).toMatchObject({
      status: "unavailable",
      reasonCode: "analytics_unavailable",
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("rejects malformed successful responses without exposing them", async () => {
    const fetcher = vi.fn(async () => Response.json({ data: [{ nope: true }] }));
    const result = await new CloudflarePlayObservabilityReader(
      "account",
      "read-token",
      "otw_play_events",
      fetcher as typeof fetch,
    ).read24Hours();
    expect(result.status).toBe("unavailable");
  });
});

it("queries only the injected dataset in all three SQL requests", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ data: [] }));
  await new CloudflarePlayObservabilityReader("same-account", "read-token", "luvdia_play_events", fetcher).read24Hours();
  expect(fetcher).toHaveBeenCalledTimes(3);
  for (const [, init] of fetcher.mock.calls) {
    expect(init?.body).toContain("FROM luvdia_play_events");
    expect(init?.body).not.toContain("otw_play_events");
  }
  expect(() => new CloudflarePlayObservabilityReader("account", "token", "events; DROP TABLE secrets", fetcher)).toThrow(/dataset/);
});
