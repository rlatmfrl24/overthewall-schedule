import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import { SettingsService } from "../application/settings-service";
import { DrizzleSettingsAudit } from "../infrastructure/settings-audit";
import { DrizzleSettingsRepository } from "../infrastructure/settings-repository";
import { createAdminSettingsHandler } from "./settings-handler";

type FakeSettingRow = {
  key: string;
  value: string | null;
  updated_at?: string | null;
};
type FakeAuditRow = Record<string, unknown> & {
  event_type: string;
  actor_id: string | null;
  detail: string | null;
};

const fakeDbContext = vi.hoisted(() => {
  const state = {
    rows: [] as FakeSettingRow[],
    writes: [] as Array<{ key: string; value: string }>,
    auditLogs: [] as FakeAuditRow[],
  };

  const makeResult = <T,>(rows: T[]) => ({
    limit: (limit: number) => Promise.resolve(rows.slice(0, limit)),
    then: Promise.resolve(rows).then.bind(Promise.resolve(rows)),
  });

  const db = {
    select() {
      return {
        from() {
          return {
            where() {
              return makeResult(state.rows);
            },
          };
        },
      };
    },
    insert() {
      return {
        values(value: FakeSettingRow | FakeAuditRow) {
          if ("event_type" in value) {
            state.auditLogs.push(value);
            return Promise.resolve({ success: true });
          }
          return {
            async onConflictDoUpdate() {
              const next = {
                key: value.key,
                value: value.value ?? null,
                updated_at: value.updated_at ?? null,
              };
              const existingIndex = state.rows.findIndex(
                (row) => row.key === next.key,
              );
              if (existingIndex >= 0) {
                state.rows[existingIndex] = next;
              } else {
                state.rows.push(next);
              }
              state.writes.push({
                key: next.key,
                value: next.value ?? "",
              });
            },
          };
        },
      };
    },
  };

  return { state, db };
});

vi.mock("../../../platform/auth", () => ({
  requireAdminUser: vi.fn(async () => ({
    ok: true,
    user: {
      id: "admin",
      displayName: "Admin User",
    },
  })),
}));

const makeEnv = (): Env =>
  ({
    YOUTUBE_API_KEY: "",
    X_BEARER_TOKEN: "token",
    otw_db: {} as D1Database,
  }) as Env;
const handleSettings = createAdminSettingsHandler(
  () =>
    new SettingsService(
      new DrizzleSettingsRepository(fakeDbContext.db as never),
      new DrizzleSettingsAudit(fakeDbContext.db as never),
    ),
);

const makeJsonRequest = (body: Record<string, unknown>) =>
  new Request("https://example.com/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("settings worker route", () => {
  beforeEach(() => {
    fakeDbContext.state.rows = [];
    fakeDbContext.state.writes = [];
    fakeDbContext.state.auditLogs = [];
  });

  it("백그라운드 수집/예열 설정 기본값과 읽기 전용 last_run을 쓰기 없이 반환한다", async () => {
    const response = await handleSettings(
      new Request("https://example.com/api/settings"),
      makeEnv(),
    );
    const body = (await response.json()) as Record<string, string | null>;

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.auto_update_enabled).toBeNull();
    expect(body.auto_update_interval_hours).toBe("6");
    expect(body.auto_update_last_run).toBeNull();
    expect(body.live_schedule_auto_fill_enabled).toBe("true");
    expect(body.x_collection_interval_hours).toBe("2");
    expect(body.x_collection_last_run).toBeNull();
    expect(body.youtube_warmup_enabled).toBe("true");
    expect(body.youtube_warmup_interval_hours).toBe("1");
    expect(body.youtube_warmup_daily_quota_units).toBe("1000");
    expect(body.youtube_warmup_official_enabled).toBe("true");
    expect(body.youtube_warmup_kirinuki_enabled).toBe("true");
    expect(body.youtube_warmup_last_run).toBeNull();
    expect(fakeDbContext.state.writes).toEqual([]);
  });

  it("허용된 X 수집 주기를 저장한다", async () => {
    const response = await handleSettings(
      makeJsonRequest({ x_collection_interval_hours: "2" }),
      makeEnv(),
    );

    expect(response.status).toBe(200);
    expect(fakeDbContext.state.writes).toEqual([
      { key: "x_collection_interval_hours", value: "2" },
    ]);
    expect(fakeDbContext.state.auditLogs).toEqual([
      expect.objectContaining({
        event_type: "settings.update",
        resource_type: "settings",
        action: "update",
        status: "success",
        actor_id: "admin",
      }),
    ]);
    expect(JSON.parse(fakeDbContext.state.auditLogs[0].detail ?? "{}")).toEqual({
      changes: [
        {
          key: "x_collection_interval_hours",
          previousValue: null,
          nextValue: "2",
        },
      ],
    });
  });

  it("자동 업데이트 활성화 설정은 boolean 문자열만 저장한다", async () => {
    const validResponse = await handleSettings(
      makeJsonRequest({ auto_update_enabled: "true" }),
      makeEnv(),
    );

    expect(validResponse.status).toBe(200);
    expect(fakeDbContext.state.writes).toEqual([
      { key: "auto_update_enabled", value: "true" },
    ]);

    fakeDbContext.state.writes = [];
    const invalidResponse = await handleSettings(
      makeJsonRequest({ auto_update_enabled: "1" }),
      makeEnv(),
    );

    expect(invalidResponse.status).toBe(400);
    expect(await invalidResponse.text()).toBe("Invalid auto_update_enabled");
    expect(fakeDbContext.state.writes).toEqual([]);
  });

  it("malformed JSON은 설정과 감사 로그를 쓰지 않고 400을 반환한다", async () => {
    const response = await handleSettings(
      new Request("https://example.com/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
      makeEnv(),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Malformed JSON");
    expect(fakeDbContext.state.writes).toEqual([]);
    expect(fakeDbContext.state.auditLogs).toEqual([]);
  });

  it("자동 업데이트 검색 범위를 저장한다", async () => {
    const response = await handleSettings(
      makeJsonRequest({ auto_update_range_days: "5" }),
      makeEnv(),
    );

    expect(response.status).toBe(200);
    expect(fakeDbContext.state.writes).toEqual([
      { key: "auto_update_range_days", value: "5" },
    ]);
  });

  it("지원하지 않는 자동 업데이트 검색 범위를 거부한다", async () => {
    const response = await handleSettings(
      makeJsonRequest({ auto_update_range_days: "invalid" }),
      makeEnv(),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Invalid auto_update_range_days");
    expect(fakeDbContext.state.writes).toEqual([]);
  });

  it("라이브 스케줄 자동 입력 설정은 boolean 문자열만 저장한다", async () => {
    const validResponse = await handleSettings(
      makeJsonRequest({ live_schedule_auto_fill_enabled: "false" }),
      makeEnv(),
    );

    expect(validResponse.status).toBe(200);
    expect(fakeDbContext.state.writes).toEqual([
      { key: "live_schedule_auto_fill_enabled", value: "false" },
    ]);

    fakeDbContext.state.writes = [];
    const invalidResponse = await handleSettings(
      makeJsonRequest({ live_schedule_auto_fill_enabled: "yes" }),
      makeEnv(),
    );

    expect(invalidResponse.status).toBe(400);
    expect(await invalidResponse.text()).toBe(
      "Invalid live_schedule_auto_fill_enabled",
    );
    expect(fakeDbContext.state.writes).toEqual([]);
  });

  it("잘못된 X 수집 주기를 거부한다", async () => {
    const response = await handleSettings(
      makeJsonRequest({ x_collection_interval_hours: "1" }),
      makeEnv(),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Invalid x_collection_interval_hours");
    expect(fakeDbContext.state.writes).toEqual([]);
  });

  it("허용된 YouTube 예열 설정을 저장한다", async () => {
    const response = await handleSettings(
      makeJsonRequest({
        youtube_warmup_enabled: "false",
        youtube_warmup_interval_hours: "6",
        youtube_warmup_daily_quota_units: "500",
        youtube_warmup_official_enabled: "true",
        youtube_warmup_kirinuki_enabled: "false",
      }),
      makeEnv(),
    );

    expect(response.status).toBe(200);
    expect(fakeDbContext.state.writes).toEqual([
      { key: "youtube_warmup_enabled", value: "false" },
      { key: "youtube_warmup_interval_hours", value: "6" },
      { key: "youtube_warmup_daily_quota_units", value: "500" },
      { key: "youtube_warmup_official_enabled", value: "true" },
      { key: "youtube_warmup_kirinuki_enabled", value: "false" },
    ]);
  });

  it("잘못된 YouTube 예열 설정을 거부한다", async () => {
    const invalidEnabled = await handleSettings(
      makeJsonRequest({ youtube_warmup_enabled: "yes" }),
      makeEnv(),
    );
    const invalidInterval = await handleSettings(
      makeJsonRequest({ youtube_warmup_interval_hours: "3" }),
      makeEnv(),
    );
    const invalidQuota = await handleSettings(
      makeJsonRequest({ youtube_warmup_daily_quota_units: "0" }),
      makeEnv(),
    );

    expect(invalidEnabled.status).toBe(400);
    expect(await invalidEnabled.text()).toBe("Invalid youtube_warmup_enabled");
    expect(invalidInterval.status).toBe(400);
    expect(await invalidInterval.text()).toBe(
      "Invalid youtube_warmup_interval_hours",
    );
    expect(invalidQuota.status).toBe(400);
    expect(await invalidQuota.text()).toBe(
      "Invalid youtube_warmup_daily_quota_units",
    );
    expect(fakeDbContext.state.writes).toEqual([]);
  });

  it("클라이언트가 보낸 last_run 설정은 저장하지 않는다", async () => {
    const response = await handleSettings(
      makeJsonRequest({
        auto_update_enabled: "false",
        auto_update_last_run: "9999999999999",
        x_collection_interval_hours: "24",
        x_collection_last_run: "9999999999999",
        youtube_warmup_interval_hours: "12",
        youtube_warmup_last_run: "9999999999999",
      }),
      makeEnv(),
    );

    expect(response.status).toBe(200);
    expect(fakeDbContext.state.writes).toEqual([
      { key: "auto_update_enabled", value: "false" },
      { key: "x_collection_interval_hours", value: "24" },
      { key: "youtube_warmup_interval_hours", value: "12" },
    ]);
  });

});
