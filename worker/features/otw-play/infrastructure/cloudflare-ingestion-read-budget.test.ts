import { describe, expect, it, vi } from "vitest";
import { CloudflareIngestionReadBudget } from "./cloudflare-ingestion-read-budget";

const NOW = Date.UTC(2026, 8, 23, 23, 59);
const payload = (rowsRead: number) => ({ data: { viewer: { accounts: [{ usage: [{ sum: { rowsRead } }] }] } } });

describe("account-wide ingestion read admission", () => {
  it.each([[3_999_999, "available"], [4_000_000, "blocked"]])("uses the UTC account total at %i rows", async (rows, status) => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(payload(rows as number)));
    const reader = new CloudflareIngestionReadBudget("account", "token", undefined, fetcher, () => NOW, null);
    expect(await reader.read()).toMatchObject({ status, rowsRead: rows, resetAt: "2026-09-24T00:00:00.000Z" });
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.variables).toEqual({ accountTag: "account", filter: {
      datetimeHour_geq: "2026-09-23T00:00:00.000Z", datetimeHour_leq: new Date(NOW).toISOString(),
    } });
    expect(body.query).not.toContain("databaseId");
  });

  it("separates cache by account, UTC day and target, and rechecks after midnight", async () => {
    const entries = new Map<string, Response>();
    const cache = { match: vi.fn(async (key: RequestInfo | URL) => entries.get((key as Request).url)?.clone()),
      put: vi.fn(async (key: RequestInfo | URL, value: Response) => { entries.set((key as Request).url, value.clone()); }) };
    let now = NOW;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(payload(4_100_000))).mockResolvedValueOnce(Response.json(payload(0)));
    const reader = new CloudflareIngestionReadBudget("account", "token", "4000000", fetcher, () => now, cache);
    expect((await reader.read()).status).toBe("blocked");
    expect((await reader.read()).status).toBe("blocked");
    expect(fetcher).toHaveBeenCalledTimes(1);
    now += 60_000;
    expect((await reader.read()).status).toBe("available");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(cache.put.mock.calls[0][1].headers.get("Cache-Control")).toBe("max-age=60");
  });

  it("does not reinterpret stale blocked data as zero usage after upstream failure", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const old = { status: "blocked", rowsRead: 4_500_000, dailyTarget: 4_000_000,
      measuredAt: new Date(NOW - 120_001).toISOString(), resetAt: "2026-09-24T00:00:00.000Z", reason: "daily_read_target" };
    const reader = new CloudflareIngestionReadBudget("account", "token", undefined,
      vi.fn(async () => { throw new Error("timeout"); }), () => NOW,
      { match: async () => Response.json(old), put: async () => {} });
    expect(await reader.read()).toMatchObject({ status: "unavailable", rowsRead: null, reason: "upstream_error" });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it.each([{ errors: [{ message: "denied" }], ...payload(0) }, {}, { data: { viewer: { accounts: [] } } }])("rejects incomplete analytics instead of admitting on fabricated zero", async body => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const reader = new CloudflareIngestionReadBudget("account", "token", undefined, async () => Response.json(body), () => NOW, null);
    expect(await reader.read()).toMatchObject({ status: "unavailable", rowsRead: null });
    warn.mockRestore();
  });
});
