import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import { createPlayObservabilityHandler } from "./observability-handler";

const requireAdminUserMock = vi.hoisted(() => vi.fn());
vi.mock("../../../platform/auth", () => ({
  requireAdminUser: requireAdminUserMock,
}));

const env = {} as Env;

describe("OTW Play observability handler", () => {
  beforeEach(() => {
    requireAdminUserMock.mockReset();
    requireAdminUserMock.mockResolvedValue({
      ok: true,
      user: { id: "admin", displayName: "Admin", claims: {}, sessionId: null },
    });
  });

  it("authenticates and returns a no-store partial DTO as HTTP 200", async () => {
    const read24Hours = vi.fn(async () => ({
      status: "unconfigured" as const,
      generatedAt: "2026-08-20T00:00:00.000Z",
      windowHours: 24 as const,
      summary: {
        requestCount: 0,
        errorCount: 0,
        errorRate: 0,
        cacheHit: 0,
        cacheMiss: 0,
        cacheBypass: 0,
        p95DurationMs: null,
        d1RowsRead: null,
        d1RowsWritten: null,
      },
      routes: [],
      events: [],
      reasonCode: "analytics_unconfigured" as const,
    }));
    const handler = createPlayObservabilityHandler(() => ({ read24Hours }));
    const response = await handler(
      new Request("https://example.com/api/play/admin/observability"),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(requireAdminUserMock).toHaveBeenCalledOnce();
    expect(read24Hours).toHaveBeenCalledOnce();
  });

  it("rejects query parameters and non-GET methods", async () => {
    const handler = createPlayObservabilityHandler(() => ({
      read24Hours: vi.fn(),
    }));
    const query = await handler(
      new Request("https://example.com/api/play/admin/observability?window=7d"),
      env,
    );
    expect(query.status).toBe(400);
    expect(query.headers.get("Cache-Control")).toBe("no-store");
    expect(requireAdminUserMock).not.toHaveBeenCalled();

    const method = await handler(
      new Request("https://example.com/api/play/admin/observability", {
        method: "POST",
      }),
      env,
    );
    expect(method.status).toBe(405);
    expect(method.headers.get("Allow")).toBe("GET");
  });
});
