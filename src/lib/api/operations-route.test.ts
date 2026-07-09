import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleOperations } from "../../../worker/routes/operations";
import type { Env } from "../../../worker/types";

const requireAdminUserMock = vi.hoisted(() =>
  vi.fn(async () => ({ ok: true, user: { id: "admin" } })),
);
const fetchNaverCafePostsForSourcesMock = vi.hoisted(() => vi.fn());
const getDbMock = vi.hoisted(() => vi.fn());

vi.mock("../../../worker/auth", () => ({
  requireAdminUser: requireAdminUserMock,
}));

vi.mock("../../../worker/db", () => ({
  getDb: getDbMock,
}));

vi.mock("../../../worker/services/naver-cafe", () => {
  class MockNaverCafeApiError extends Error {
    status: number;
    diagnostics: unknown[];

    constructor(message: string, status: number, diagnostics: unknown[] = []) {
      super(message);
      this.name = "NaverCafeApiError";
      this.status = status;
      this.diagnostics = diagnostics;
    }
  }

  return {
    fetchNaverCafePostsForSources: fetchNaverCafePostsForSourcesMock,
    NaverCafeApiError: MockNaverCafeApiError,
  };
});

const makeStatement = <T,>(rows: T[]) => {
  const statement = {
    bind: vi.fn(() => statement),
    all: vi.fn(async () => ({ results: rows })),
  };
  return statement;
};

const makeStatusD1 = () => {
  const now = Date.now();
  const prepare = vi.fn((sql: string) => {
    if (sql.includes("FROM settings")) {
      return makeStatement([
        { key: "auto_update_enabled", value: "true" },
        { key: "auto_update_interval_hours", value: "6" },
        { key: "auto_update_last_run", value: String(now - 60 * 60_000) },
        { key: "auto_update_range_days", value: "3" },
        { key: "x_collection_enabled", value: "true" },
        { key: "x_collection_interval_hours", value: "2" },
        { key: "x_collection_last_run", value: String(now - 30 * 60_000) },
        { key: "x_collection_daily_budget_cents", value: "100" },
        { key: "naver_cafe_posts_enabled", value: "true" },
        { key: "naver_cafe_posts_visibility", value: "members" },
      ]);
    }
    if (sql.includes("FROM pending_schedules")) {
      return makeStatement([{ total: 2, create_count: 1, update_count: 1 }]);
    }
    if (sql.includes("FROM auto_update_runs")) {
      return makeStatement([
        {
          id: 1,
          source: "scheduled",
          status: "success",
          started_at: now - 60 * 60_000,
          finished_at: now - 59 * 60_000,
          range_days: 3,
          checked_count: 4,
          updated_count: 1,
          created_count: 1,
          existing_count: 2,
          pending_created_count: 2,
          actor_id: null,
          actor_name: null,
          actor_ip: null,
          error: null,
        },
      ]);
    }
    if (sql.includes("FROM x_collection_runs")) {
      return makeStatement([
        {
          id: 2,
          source: "scheduled",
          started_at: now - 30 * 60_000,
          finished_at: now - 29 * 60_000,
          checked_handles: 5,
          refreshed_handles: 2,
          posts_returned: 3,
          posts_stored: 3,
          api_calls: 2,
          estimated_cost_micros: 2000,
          status: "success",
          error: null,
        },
      ]);
    }
    if (sql.includes("FROM x_api_usage_events")) {
      return makeStatement([
        {
          api_calls: 2,
          estimated_cost_micros: 2000,
          success_count: 2,
          failure_count: 0,
          rate_limit_count: 0,
        },
      ]);
    }
    if (sql.includes("FROM naver_cafe_sources")) {
      return makeStatement([
        {
          id: 10,
          name: "팬카페",
          cafe_id: "cafe",
          menu_id: "menu",
          cafe_url: "https://cafe.example.com",
          member_uid: null,
          enabled: 1,
          sort_order: 0,
        },
      ]);
    }
    if (sql.includes("FROM naver_cafe_source_checks")) {
      return makeStatement([
        {
          id: 20,
          source_id: 10,
          source_name: "팬카페",
          cafe_id: "cafe",
          menu_id: "menu",
          trigger: "manual",
          status: "ok",
          checked_at: now - 10 * 60_000,
          duration_ms: 120,
          post_count: 5,
          error: null,
        },
      ]);
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  return { prepare } as unknown as D1Database;
};

const makeEnv = (db: D1Database = makeStatusD1()): Env =>
  ({
    YOUTUBE_API_KEY: "youtube-key",
    X_BEARER_TOKEN: "x-token",
    otw_db: db,
  }) as Env;

describe("operations worker route", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-09T00:00:00.000Z"));
    requireAdminUserMock.mockReset();
    requireAdminUserMock.mockResolvedValue({ ok: true, user: { id: "admin" } });
    fetchNaverCafePostsForSourcesMock.mockReset();
    getDbMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("/api/operations/status는 관리자 인증을 요구한다", async () => {
    requireAdminUserMock.mockResolvedValueOnce({
      ok: false,
      response: new Response("Unauthorized", { status: 401 }),
    });

    const response = await handleOperations(
      new Request("https://example.com/api/operations/status"),
      makeEnv(),
    );

    expect(response.status).toBe(401);
  });

  it("windowHours 범위를 벗어나면 400을 반환한다", async () => {
    const response = await handleOperations(
      new Request("https://example.com/api/operations/status?windowHours=999"),
      makeEnv(),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe(
      "windowHours must be an integer between 1 and 168",
    );
  });

  it("status는 저장된 운영 이력만 집계하고 no-store로 반환한다", async () => {
    const response = await handleOperations(
      new Request("https://example.com/api/operations/status?windowHours=24"),
      makeEnv(),
    );
    const body = (await response.json()) as {
      summary: { status: string };
      autoUpdate: { pending: { total: number } };
      xCollection: { usage: { apiCalls: number } };
      naverCafe: { sourceCount: number };
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.summary.status).toBe("warning");
    expect(body.autoUpdate.pending.total).toBe(2);
    expect(body.xCollection.usage.apiCalls).toBe(2);
    expect(body.naverCafe.sourceCount).toBe(1);
    expect(fetchNaverCafePostsForSourcesMock).not.toHaveBeenCalled();
  });

  it("네이버 카페 수동 점검은 source별 결과를 기록한다", async () => {
    const sources = [
      {
        id: 10,
        name: "팬카페",
        cafe_id: "cafe",
        menu_id: "menu",
        cafe_url: "https://cafe.example.com",
        member_uid: null,
        enabled: true,
        sort_order: 0,
      },
    ];
    const valuesMock = vi.fn(async () => undefined);
    getDbMock.mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: async () => sources,
          }),
        }),
      }),
      insert: () => ({
        values: valuesMock,
      }),
    });
    fetchNaverCafePostsForSourcesMock.mockResolvedValueOnce({
      posts: [],
      sources: [
        {
          id: 10,
          name: "팬카페",
          cafeId: "cafe",
          menuId: "menu",
          cafeUrl: "https://cafe.example.com",
          memberUid: null,
          enabled: true,
          sortOrder: 0,
          status: "ok",
          error: null,
          postCount: 5,
          stale: false,
        },
      ],
    });

    const response = await handleOperations(
      new Request("https://example.com/api/operations/naver-cafe/check-now", {
        method: "POST",
      }),
      makeEnv(),
    );
    const body = (await response.json()) as { success: boolean };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(fetchNaverCafePostsForSourcesMock).toHaveBeenCalledWith(sources, {
      size: 5,
    });
    expect(valuesMock).toHaveBeenCalledWith([
      expect.objectContaining({
        source_id: 10,
        source_name: "팬카페",
        status: "ok",
        post_count: 5,
      }),
    ]);
  });
});
