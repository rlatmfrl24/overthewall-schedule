import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleSettings } from "../../../worker/routes/settings";
import type { Env } from "../../../worker/types";

type FakeSettingRow = {
  key: string;
  value: string | null;
  updated_at?: string | null;
};

const fakeDbContext = vi.hoisted(() => {
  const state = {
    rows: [] as FakeSettingRow[],
    writes: [] as Array<{ key: string; value: string }>,
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
        values(value: FakeSettingRow) {
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

vi.mock("../../../worker/auth", () => ({
  requireAdminUser: vi.fn(async () => ({
    ok: true,
    user: {
      id: "admin",
      displayName: "Admin User",
    },
  })),
}));

vi.mock("../../../worker/db", () => ({
  getDb: () => fakeDbContext.db,
}));

const makeEnv = (): Env =>
  ({
    YOUTUBE_API_KEY: "",
    X_BEARER_TOKEN: "token",
    otw_db: {} as D1Database,
  }) as Env;

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
  });

  it("X 수집 설정 기본값과 읽기 전용 last_run을 반환한다", async () => {
    const response = await handleSettings(
      new Request("https://example.com/api/settings"),
      makeEnv(),
    );
    const body = (await response.json()) as Record<string, string | null>;

    expect(response.status).toBe(200);
    expect(body.x_collection_interval_hours).toBe("6");
    expect(body.x_collection_last_run).toBeNull();
    expect(fakeDbContext.state.writes).toContainEqual({
      key: "x_collection_interval_hours",
      value: "6",
    });
  });

  it("허용된 X 수집 주기를 저장한다", async () => {
    const response = await handleSettings(
      makeJsonRequest({ x_collection_interval_hours: "12" }),
      makeEnv(),
    );

    expect(response.status).toBe(200);
    expect(fakeDbContext.state.writes).toEqual([
      { key: "x_collection_interval_hours", value: "12" },
    ]);
  });

  it("잘못된 X 수집 주기를 거부한다", async () => {
    const response = await handleSettings(
      makeJsonRequest({ x_collection_interval_hours: "3" }),
      makeEnv(),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Invalid x_collection_interval_hours");
    expect(fakeDbContext.state.writes).toEqual([]);
  });

  it("클라이언트가 보낸 x_collection_last_run은 저장하지 않는다", async () => {
    const response = await handleSettings(
      makeJsonRequest({
        x_collection_interval_hours: "24",
        x_collection_last_run: "9999999999999",
      }),
      makeEnv(),
    );

    expect(response.status).toBe(200);
    expect(fakeDbContext.state.writes).toEqual([
      { key: "x_collection_interval_hours", value: "24" },
    ]);
  });
});
