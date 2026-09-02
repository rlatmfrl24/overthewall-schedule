import { describe, expect, it, vi } from "vitest";
import {
  classifyD1WriteQueryForTest,
  CloudflareD1ObservabilityReader,
  D1_OBSERVABILITY_GRAPHQL,
} from "./cloudflare-d1-observability-reader";

const NOW = Date.parse("2026-09-03T08:00:00.000Z");

const payload = {
  data: {
    viewer: {
      accounts: [{
        daily: [
          {
            sum: {
              readQueries: 100,
              writeQueries: 20,
              rowsRead: 400_000,
              rowsWritten: 15_000,
            },
            dimensions: {
              datetimeHour: "2026-09-03T06:00:00.000Z",
              databaseId: "database",
            },
          },
          {
            sum: {
              readQueries: 20,
              writeQueries: 20,
              rowsRead: 100_000,
              rowsWritten: 5_000,
            },
            dimensions: {
              datetimeHour: "2026-09-03T07:00:00.000Z",
              databaseId: "database",
            },
          },
        ],
        queries: [
          {
            sum: { rowsWritten: 600 },
            count: 12,
            dimensions: {
              query: "INSERT INTO scheduled_job_items (id) VALUES (?)",
            },
          },
          {
            sum: { rowsWritten: 400 },
            count: 2,
            dimensions: {
              query: "DELETE FROM x_api_usage_events WHERE created_at < ?",
            },
          },
        ],
      }],
    },
  },
};

describe("Cloudflare D1 observability reader", () => {
  it("returns an unconfigured read without making an external request", async () => {
    const fetcher = vi.fn();
    const result = await new CloudflareD1ObservabilityReader(
      "account",
      "database",
      undefined,
      fetcher as typeof fetch,
      () => NOW,
      null,
    ).read7Days();

    expect(result).toMatchObject({
      status: "unconfigured",
      reasonCode: "token_unconfigured",
      currentDay: null,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reads UTC daily metrics and returns categorized workloads without raw SQL", async () => {
    const fetcher = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => {
      void _input;
      void _init;
      return Response.json(payload);
    });
    const result = await new CloudflareD1ObservabilityReader(
      "account",
      "database",
      "analytics-token",
      fetcher as typeof fetch,
      () => NOW,
      null,
    ).read7Days();

    expect(result).toMatchObject({
      status: "available",
      timezone: "UTC",
      windowDays: 7,
      currentDay: {
        day: "2026-09-03",
        rowsRead: 500_000,
        rowsWritten: 20_000,
        rowsReadPercent: 10,
        rowsWrittenPercent: 20,
      },
      topWriteWorkloads: [
        {
          key: "scheduled_operations",
          rowsWritten: 600,
          queryCount: 12,
          sharePercent: 60,
        },
        {
          key: "retention",
          rowsWritten: 400,
          queryCount: 2,
          sharePercent: 40,
        },
      ],
    });
    expect(result.daily).toHaveLength(7);
    expect(JSON.stringify(result)).not.toContain("scheduled_job_items");
    expect(fetcher).toHaveBeenCalledOnce();
    const [endpoint, init] = fetcher.mock.calls[0];
    expect(endpoint).toBe("https://api.cloudflare.com/client/v4/graphql");
    const request = JSON.parse(String(init?.body)) as {
      query: string;
      variables: Record<string, unknown>;
    };
    expect(request.query).toBe(D1_OBSERVABILITY_GRAPHQL);
    expect(request.variables).toMatchObject({
      accountTag: "account",
      dailyFilter: {
        AND: [{
          datetimeHour_geq: "2026-08-28T00:00:00.000Z",
          datetimeHour_leq: "2026-09-03T08:00:00.000Z",
          databaseId: "database",
        }],
      },
    });
  });

  it.each([401, 403])("maps upstream %s to a permission error", async (status) => {
    const fetcher = vi.fn(async () => new Response("secret", { status }));
    const result = await new CloudflareD1ObservabilityReader(
      "account",
      "database",
      "token",
      fetcher as typeof fetch,
      () => NOW,
      null,
    ).read7Days();

    expect(result).toMatchObject({
      status: "unavailable",
      reasonCode: "permission_denied",
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("maps malformed provider JSON to an invalid response", async () => {
    const fetcher = vi.fn(async () => new Response("not-json"));
    const result = await new CloudflareD1ObservabilityReader(
      "account",
      "database",
      "token",
      fetcher as typeof fetch,
      () => NOW,
      null,
    ).read7Days();

    expect(result).toMatchObject({
      status: "unavailable",
      reasonCode: "invalid_response",
    });
    expect(JSON.stringify(result)).not.toContain("not-json");
  });

  it("maps an aborted request to a timeout without exposing the error", async () => {
    const fetcher = vi.fn(async () => {
      throw new DOMException("provider detail", "AbortError");
    });
    const result = await new CloudflareD1ObservabilityReader(
      "account",
      "database",
      "token",
      fetcher as typeof fetch,
      () => NOW,
      null,
    ).read7Days();

    expect(result).toMatchObject({
      status: "unavailable",
      reasonCode: "upstream_timeout",
    });
    expect(JSON.stringify(result)).not.toContain("provider detail");
  });

  it("uses the Workers cache without a second GraphQL request", async () => {
    const cached = {
      status: "available",
      generatedAt: "2026-09-03T07:58:00.000Z",
      cacheAgeSeconds: 0,
      timezone: "UTC",
      windowDays: 7,
      currentDay: {
        day: "2026-09-03",
        rowsRead: 1,
        rowsWritten: 2,
        readQueries: 1,
        writeQueries: 1,
        rowsReadLimit: 5_000_000,
        rowsWrittenLimit: 100_000,
        rowsReadPercent: 0,
        rowsWrittenPercent: 0,
      },
      daily: [],
      topWriteWorkloads: [],
    } as const;
    const cache = {
      match: vi.fn(async () => Response.json(cached)),
      put: vi.fn(),
    };
    const fetcher = vi.fn();
    const result = await new CloudflareD1ObservabilityReader(
      "account",
      "database",
      "token",
      fetcher as typeof fetch,
      () => NOW,
      cache as unknown as Pick<Cache, "match" | "put">,
    ).read7Days();

    expect(result.cacheAgeSeconds).toBe(120);
    expect(fetcher).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("classifies known write sources without leaking query strings", () => {
    expect(classifyD1WriteQueryForTest("INSERT INTO music_search_grams VALUES (?)"))
      .toBe("search_index");
    expect(classifyD1WriteQueryForTest("DELETE FROM music_search_grams WHERE song_id = ?"))
      .toBe("search_index");
    expect(classifyD1WriteQueryForTest("UPDATE youtube_api_usage_events SET status = ?"))
      .toBe("youtube_usage");
    expect(classifyD1WriteQueryForTest("INSERT INTO naver_cafe_source_checks VALUES (?)"))
      .toBe("naver_collection");
    expect(classifyD1WriteQueryForTest("ALTER TABLE settings ADD COLUMN sample"))
      .toBe("maintenance");
  });
});
