import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { D1OperationsApplication } from "../infrastructure/operations-application";
import { createOperationsHandler } from "./handler";
import type { Env } from "../../../platform/types";

type AdminResult =
  | { ok: true; user: { id: string } }
  | { ok: false; response: Response };
const requireAdminUserMock = vi.hoisted(() =>
  vi.fn(
    async (): Promise<AdminResult> => ({
      ok: true,
      user: { id: "admin" },
    }),
  ),
);
const collectNaverCafePostsForSourcesMock = vi.hoisted(() => vi.fn());
const getDbMock = vi.hoisted(() => vi.fn());
const getDataRetentionStatusMock = vi.hoisted(() => vi.fn());
const runDataRetentionPruneMock = vi.hoisted(() => vi.fn());

vi.mock("../../../platform/auth", () => ({
  requireAdminUser: requireAdminUserMock,
}));

vi.mock("../../../platform/db", () => ({
  getDb: getDbMock,
}));

vi.mock("../infrastructure/data-retention", () => ({
  getDataRetentionStatus: getDataRetentionStatusMock,
  runDataRetentionPrune: runDataRetentionPruneMock,
}));

const handleOperations = createOperationsHandler({
  getApplication: (env) =>
    new D1OperationsApplication(
      env,
      collectNaverCafePostsForSourcesMock,
    ),
});

const makeStatement = <T,>(rows: T[]) => {
  const statement = {
    bind: vi.fn(() => statement),
    all: vi.fn(async () => ({ results: rows })),
  };
  return statement;
};

const makeStatusD1 = (
  settingOverrides: Record<string, string> = {},
  xRunsOverride?: Array<Record<string, unknown>>,
) => {
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
        { key: "x_posts_visibility", value: "members" },
        { key: "naver_cafe_posts_enabled", value: "true" },
        { key: "naver_cafe_posts_visibility", value: "members" },
        { key: "naver_cafe_collection_last_run", value: String(now - 45 * 60_000) },
      ].map((setting) => ({
        ...setting,
        value: settingOverrides[setting.key] ?? setting.value,
      })));
    }
    if (sql.includes("FROM schedule_candidate_rejections")) {
      return makeStatement([{ total: 3 }]);
    }
    if (sql.includes("FROM pending_schedules")) {
      return makeStatement([
        {
          total: 2,
          create_count: 1,
          update_count: 1,
        },
      ]);
    }
    if (sql.includes("FROM update_logs")) {
      return makeStatement([]);
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
          rejected_suppressed_count: 3,
          duplicate_pending_count: 1,
          actor_id: null,
          actor_name: null,
          actor_ip: null,
          error: null,
        },
      ]);
    }
    if (sql.includes("FROM x_collection_runs")) {
      return makeStatement(xRunsOverride ?? [
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
          operation: "timeline",
          endpoint: "/users/1/tweets",
          resource_count: 2,
          estimated_cost_micros: 1000,
          status: 200,
          created_at: now - 30 * 60_000,
          detail: JSON.stringify({
            posts: 1,
            users: 0,
            media: 1,
            source: "scheduled",
            forceRefreshPath: "collection:scheduled",
          }),
        },
        {
          operation: "user_lookup",
          endpoint: "/users/by?usernames=otw",
          resource_count: 1,
          estimated_cost_micros: 1000,
          status: 429,
          created_at: now - 20 * 60_000,
          detail: JSON.stringify({
            posts: 0,
            users: 1,
            media: 0,
            source: "member-posts:admin",
            forceRefreshPath: "member-posts:admin",
          }),
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
    collectNaverCafePostsForSourcesMock.mockReset();
    getDbMock.mockReset();
    getDataRetentionStatusMock.mockReset();
    runDataRetentionPruneMock.mockReset();
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
      xCollection: {
        lastRun: number | null;
        feed: {
          visibility: string;
          monitorPath: string;
          apiPath: string;
        };
        usage: {
          apiCalls: number;
          rateLimitCount: number;
          daily: Array<{ day: string; apiCalls: number }>;
          byOperation: Array<{ operation: string; apiCalls: number }>;
          forceRefreshPaths: Array<{ path: string; apiCalls: number }>;
        };
      };
      naverCafe: {
        visibility: string;
        monitorPath: string;
        apiPath: string;
        collection: {
          intervalHours: number;
          lastRun: number | null;
          nextEligibleAt: number | null;
        };
        sourceCount: number;
        disabledSourceCount: number;
        sources: Array<{
          lastSuccessAt: number | null;
          latestError: string | null;
          disabledReason: string | null;
          stale: boolean;
        }>;
      };
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.summary.status).toBe("warning");
    expect(body.autoUpdate.pending.total).toBe(2);
    expect(body.xCollection.usage.apiCalls).toBe(2);
    expect(body.xCollection.lastRun).toBe(Date.now() - 29 * 60_000);
    expect(body.xCollection.feed).toMatchObject({
      visibility: "members",
      monitorPath: "/admin/member-posts",
      apiPath: "/api/member-posts?sources=x&admin=1",
    });
    expect(body.xCollection.usage.rateLimitCount).toBe(1);
    expect(body.xCollection.usage.daily[0]).toMatchObject({
      day: "2026-07-08",
      apiCalls: 2,
    });
    expect(body.xCollection.usage.byOperation.map((item) => item.operation))
      .toContain("timeline");
    expect(body.xCollection.usage.forceRefreshPaths).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "collection:scheduled", apiCalls: 2 }),
        expect.objectContaining({ path: "member-posts:admin", apiCalls: 1 }),
      ]),
    );
    expect(body.naverCafe.sourceCount).toBe(1);
    expect(body.naverCafe).toMatchObject({
      visibility: "members",
      monitorPath: "/admin/member-posts",
      apiPath: "/api/member-posts?sources=naver-cafe&admin=1",
    });
    expect(body.naverCafe.collection).toMatchObject({
      intervalHours: 1,
      lastRun: Date.now() - 10 * 60_000,
      nextEligibleAt: Date.now() + 15 * 60_000,
    });
    expect(body.naverCafe.disabledSourceCount).toBe(0);
    expect(body.naverCafe.sources[0]).toMatchObject({
      lastSuccessAt: Date.now() - 10 * 60_000,
      latestError: null,
      disabledReason: null,
      stale: false,
    });
    expect(collectNaverCafePostsForSourcesMock).not.toHaveBeenCalled();
  });

  it("모든 핸들이 쿨다운 중인 정상 no-op을 최근 X 수집으로 인정한다", async () => {
    const healthyNoOpAt = Date.now() - 30 * 60_000;
    const response = await handleOperations(
      new Request("https://example.com/api/operations/status?windowHours=24"),
      makeEnv(
        makeStatusD1({}, [
          {
            id: 3,
            source: "manual",
            started_at: healthyNoOpAt - 1000,
            finished_at: healthyNoOpAt,
            checked_handles: 8,
            refreshed_handles: 0,
            posts_returned: 0,
            posts_stored: 0,
            api_calls: 0,
            estimated_cost_micros: 0,
            status: "skipped",
            error: "all_handles_cooldown",
          },
          {
            id: 2,
            source: "scheduled",
            started_at: Date.now() - 12 * 60 * 60_000,
            finished_at: Date.now() - 12 * 60 * 60_000 + 1000,
            checked_handles: 8,
            refreshed_handles: 8,
            posts_returned: 20,
            posts_stored: 20,
            api_calls: 8,
            estimated_cost_micros: 40_000,
            status: "success",
            error: null,
          },
        ]),
      ),
    );
    const body = (await response.json()) as {
      summary: { issues: Array<{ code: string }> };
      xCollection: { lastRun: number | null };
    };

    expect(response.status).toBe(200);
    expect(body.xCollection.lastRun).toBe(healthyNoOpAt);
    expect(body.summary.issues.map((issue) => issue.code)).not.toContain(
      "x_collection_stale",
    );
  });

  it("pending은 과거 처리 로그 추정 없이 실제 행을 경고 대상으로 집계한다", async () => {
    const now = Date.now();
    const updateLogsStatement = makeStatement([
      {
        id: 301,
        schedule_id: null,
        member_uid: 1,
        schedule_date: "2026-07-09",
        action: "approve",
        title: null,
        previous_status: "pending:101",
        created_at: "2026-07-09 00:10:00",
      },
    ]);
    let updateLogsSql = "";
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
          { key: "x_posts_visibility", value: "members" },
          { key: "naver_cafe_posts_enabled", value: "true" },
          { key: "naver_cafe_posts_visibility", value: "members" },
          { key: "naver_cafe_collection_last_run", value: String(now - 45 * 60_000) },
        ]);
      }
      if (sql.includes("FROM pending_schedules")) {
        return makeStatement([
          {
            total: 1,
            create_count: 1,
            update_count: 0,
          },
        ]);
      }
      if (sql.includes("FROM schedule_candidate_rejections")) {
        return makeStatement([{ total: 0 }]);
      }
      if (sql.includes("FROM update_logs")) {
        updateLogsSql = sql;
        return updateLogsStatement;
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
            rejected_suppressed_count: 0,
            duplicate_pending_count: 0,
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
            operation: "timeline",
            endpoint: "/users/1/tweets",
            resource_count: 2,
            estimated_cost_micros: 2000,
            status: 200,
            created_at: now - 30 * 60_000,
            detail: JSON.stringify({
              posts: 1,
              users: 0,
              media: 1,
              source: "scheduled",
              forceRefreshPath: "collection:scheduled",
            }),
          },
        ]);
      }
      if (sql.includes("FROM naver_cafe_sources")) {
        return makeStatement([]);
      }
      if (sql.includes("FROM naver_cafe_source_checks")) {
        return makeStatement([]);
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const response = await handleOperations(
      new Request("https://example.com/api/operations/status?windowHours=24"),
      makeEnv({ prepare } as unknown as D1Database),
    );
    const body = (await response.json()) as {
      summary: { status: string; issues: Array<{ code: string }> };
      autoUpdate: { pending: { total: number } };
    };

    expect(response.status).toBe(200);
    expect(body.autoUpdate.pending.total).toBe(1);
    expect(updateLogsSql).toBe("");
    expect(updateLogsStatement.bind).not.toHaveBeenCalled();
    expect(body.summary.issues.map((issue) => issue.code)).toContain(
      "pending_schedule_backlog",
    );
  });

  it("제목만 같은 과거 처리 로그는 새 pending을 경고 대상에서 제외하지 않는다", async () => {
    const baseDb = makeStatusD1({ naver_cafe_posts_enabled: "false" }) as D1Database & {
      prepare: (sql: string) => ReturnType<typeof makeStatement>;
    };
    const updateLogsStatement = makeStatement([
      {
        id: 301,
        schedule_id: null,
        member_uid: 1,
        schedule_date: "2026-07-09",
        action: "approve",
        title: "반복 방송",
        previous_status: null,
        created_at: "2026-07-09 00:10:00",
      },
    ]);
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("FROM pending_schedules")) {
        return makeStatement([
          {
            total: 1,
            create_count: 1,
            update_count: 0,
          },
        ]);
      }
      if (sql.includes("FROM update_logs")) {
        return updateLogsStatement;
      }
      return baseDb.prepare(sql);
    });

    const response = await handleOperations(
      new Request("https://example.com/api/operations/status?windowHours=24"),
      makeEnv({ prepare } as unknown as D1Database),
    );
    const body = (await response.json()) as {
      summary: { issues: Array<{ code: string }> };
      autoUpdate: { pending: { total: number } };
    };

    expect(response.status).toBe(200);
    expect(body.autoUpdate.pending.total).toBe(1);
    expect(body.summary.issues.map((issue) => issue.code)).toContain(
      "pending_schedule_backlog",
    );
  });

  it("네이버 표시가 꺼져도 소스별 오류와 stale 상태를 반환한다", async () => {
    const now = Date.now();
    const baseDb = makeStatusD1() as D1Database & {
      prepare: (sql: string) => ReturnType<typeof makeStatement>;
    };
    const prepare = vi.fn((sql: string) => {
      if (sql.includes("FROM naver_cafe_sources")) {
        return makeStatement([
          {
            id: 10,
            name: "오류 게시판",
            cafe_id: "cafe",
            menu_id: "error",
            cafe_url: "https://cafe.example.com/error",
            member_uid: null,
            enabled: 1,
            sort_order: 0,
          },
          {
            id: 11,
            name: "비활성 게시판",
            cafe_id: "cafe",
            menu_id: "disabled",
            cafe_url: "https://cafe.example.com/disabled",
            member_uid: null,
            enabled: 0,
            sort_order: 1,
          },
          {
            id: 12,
            name: "오래된 게시판",
            cafe_id: "cafe",
            menu_id: "stale",
            cafe_url: "https://cafe.example.com/stale",
            member_uid: null,
            enabled: 1,
            sort_order: 2,
          },
          {
            id: 13,
            name: "미수집 게시판",
            cafe_id: "cafe",
            menu_id: "never-collected",
            cafe_url: "https://cafe.example.com/never-collected",
            member_uid: null,
            enabled: 1,
            sort_order: 3,
          },
        ]);
      }
      if (sql.includes("FROM naver_cafe_source_checks")) {
        return makeStatement([
          {
            id: 21,
            source_id: 10,
            source_name: "오류 게시판",
            cafe_id: "cafe",
            menu_id: "error",
            trigger: "manual",
            status: "private",
            checked_at: now - 5 * 60_000,
            duration_ms: 80,
            post_count: 0,
            error: "비공개 게시판입니다.",
          },
          {
            id: 20,
            source_id: 10,
            source_name: "오류 게시판",
            cafe_id: "cafe",
            menu_id: "error",
            trigger: "manual",
            status: "ok",
            checked_at: now - 2 * 60 * 60_000,
            duration_ms: 120,
            post_count: 3,
            error: null,
          },
          {
            id: 22,
            source_id: 12,
            source_name: "오래된 게시판",
            cafe_id: "cafe",
            menu_id: "stale",
            trigger: "manual",
            status: "ok",
            checked_at: now - 25 * 60 * 60_000,
            duration_ms: 100,
            post_count: 2,
            error: null,
          },
        ]);
      }
      return baseDb.prepare(sql);
    });

    const response = await handleOperations(
      new Request("https://example.com/api/operations/status?windowHours=24"),
      makeEnv({ prepare } as unknown as D1Database),
    );
    const body = (await response.json()) as {
      naverCafe: {
        disabledSourceCount: number;
        staleSourceCount: number;
        failingSourceCount: number;
        sources: Array<{
          sourceName: string;
          latestError: string | null;
          disabledReason: string | null;
          lastSuccessAt: number | null;
          stale: boolean;
        }>;
      };
    };

    expect(response.status).toBe(200);
    expect(body.naverCafe.disabledSourceCount).toBe(1);
    expect(body.naverCafe.staleSourceCount).toBe(2);
    expect(body.naverCafe.failingSourceCount).toBe(1);
    expect(body.naverCafe.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceName: "오류 게시판",
          latestError: "비공개 게시판입니다.",
          lastSuccessAt: now - 2 * 60 * 60_000,
        }),
        expect.objectContaining({
          sourceName: "비활성 게시판",
          disabledReason: "소스가 비활성화되어 점검 대상에서 제외됩니다.",
        }),
        expect.objectContaining({
          sourceName: "오래된 게시판",
          stale: true,
          lastSuccessAt: now - 25 * 60 * 60_000,
        }),
        expect.objectContaining({
          sourceName: "미수집 게시판",
          latestError: "수집 실행 이력이 없습니다.",
          stale: true,
          lastSuccessAt: null,
        }),
      ]),
    );
  });

  it("네이버 카페 수동 점검을 비동기 operation으로 접수한다", async () => {
    const createRun = vi.fn(async () => ({
      runId: "run-naver",
      jobType: "naver_cafe_collection",
      status: "queued" as const,
      acceptedAt: 1,
      idempotencyKey: "manual:naver:test",
      statusUrl: "/api/operations/runs/run-naver",
    }));
    const asyncHandler = createOperationsHandler({
      getApplication: () => ({ createRun }) as never,
    });
    const response = await asyncHandler(
      new Request("https://example.com/api/operations/naver-cafe/check-now", {
        method: "POST",
      }),
      makeEnv(),
    );
    expect(response.status).toBe(202);
    expect(response.headers.get("Location")).toBe(
      "/api/operations/runs/run-naver",
    );
    expect(await response.json()).toMatchObject({ runId: "run-naver" });
    expect(createRun).toHaveBeenCalledWith(
      "naver_cafe_collection",
      expect.objectContaining({ actorId: "admin" }),
      null,
    );
  });

  it("terminal operation retry는 현재 상태와 함께 409를 반환한다", async () => {
    const retryRun = vi.fn(async () => ({
      kind: "not_retryable" as const,
      status: "succeeded" as const,
    }));
    const retryHandler = createOperationsHandler({
      getApplication: () => ({ retryRun }) as never,
    });

    const response = await retryHandler(
      new Request("https://example.com/api/operations/runs/run-1/retry", {
        method: "POST",
      }),
      makeEnv(),
    );

    expect(response.status).toBe(409);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: "operation_run_not_retryable",
      status: "succeeded",
    });
    expect(retryRun).toHaveBeenCalledWith("run-1");
  });

  it("D1 데이터 보존 상태를 no-store로 반환한다", async () => {
    const env = makeEnv();
    getDataRetentionStatusMock.mockResolvedValueOnce({
      source: "manual",
      dryRun: true,
      startedAt: Date.now(),
      finishedAt: Date.now(),
      totalPrunableRows: 2,
      totalDeletedRows: 0,
      policies: [],
    });

    const response = await handleOperations(
      new Request("https://example.com/api/operations/data-retention/status"),
      env,
    );
    const body = (await response.json()) as { totalPrunableRows: number };

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.totalPrunableRows).toBe(2);
    expect(getDataRetentionStatusMock).toHaveBeenCalledWith(env);
  });

  it("D1 데이터 prune은 dryRun 값을 검증한다", async () => {
    const response = await handleOperations(
      new Request(
        "https://example.com/api/operations/data-retention/prune?dryRun=maybe",
        { method: "POST" },
      ),
      makeEnv(),
    );

    expect(response.status).toBe(400);
    expect(runDataRetentionPruneMock).not.toHaveBeenCalled();
  });

  it("D1 데이터 prune은 dryRun 명시를 요구한다", async () => {
    const response = await handleOperations(
      new Request("https://example.com/api/operations/data-retention/prune", {
        method: "POST",
      }),
      makeEnv(),
    );

    expect(response.status).toBe(400);
    expect(runDataRetentionPruneMock).not.toHaveBeenCalled();
  });

  it("D1 데이터 prune 실행을 비동기 operation으로 접수한다", async () => {
    const createRun = vi.fn(async () => ({
      runId: "run-retention",
      jobType: "retention_prune",
      status: "queued" as const,
      acceptedAt: 1,
      idempotencyKey: "manual:retention:test",
      statusUrl: "/api/operations/runs/run-retention",
    }));
    const asyncHandler = createOperationsHandler({
      getApplication: () => ({ createRun }) as never,
    });
    const response = await asyncHandler(
      new Request(
        "https://example.com/api/operations/data-retention/prune?dryRun=false",
        { method: "POST" },
      ),
      makeEnv(),
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ runId: "run-retention" });
    expect(createRun).toHaveBeenCalledWith(
      "retention_prune",
      expect.objectContaining({ actorId: "admin" }),
      null,
    );
  });
});
