import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DATA_RETENTION_POLICIES,
  getDataRetentionStatus,
  runDataRetentionPrune,
  runScheduledDataRetentionPrune,
} from "./data-retention";
import type { Env } from "../../../platform/types";

type TableRow = Record<string, number | string | null>;

type FakeD1State = {
  tables: Record<string, TableRow[]>;
  settings: Map<string, string>;
  retentionRuns?: Array<Record<string, unknown>>;
  retentionItems?: Array<Record<string, unknown>>;
};

const getPolicyForSql = (sql: string) =>
  DATA_RETENTION_POLICIES.find(
    (policy) =>
      sql.includes(`FROM ${policy.table}`) ||
      sql.includes(`DELETE FROM ${policy.table}`),
  );

const isPrunableRow = (
  row: TableRow,
  policy: (typeof DATA_RETENTION_POLICIES)[number],
  cutoff: number,
) => {
  const value = row[policy.timestampColumn];
  if (policy.timestampKind === "sqlite_datetime") {
    const timestamp = Date.parse(String(value));
    return Number.isFinite(timestamp) && Math.floor(timestamp / 1000) < cutoff;
  }
  return Number(value) < cutoff;
};

const makeEnv = (state: FakeD1State): Env =>
  ({
    otw_db: {
      prepare: (sql: string) => {
        let params: unknown[] = [];
        const statement = {
          bind: (...values: unknown[]) => {
            params = values;
            return statement;
          },
          first: async <T,>() => {
            if (sql.includes("SELECT value FROM settings")) {
              return {
                value: state.settings.get(String(params[0])) ?? null,
              } as T;
            }
            const policy = getPolicyForSql(sql);
            if (!policy) return null as T;
            const cutoff = Number(params[0]);
            const count = (state.tables[policy.table] ?? []).filter((row) =>
              isPrunableRow(row, policy, cutoff),
            ).length;
            return { count } as T;
          },
          all: async <T,>() => {
            if (sql.includes("FROM scheduled_job_runs")) {
              return { results: (state.retentionRuns ?? []) as T[] };
            }
            if (sql.includes("FROM scheduled_job_items")) {
              return {
                results: (state.retentionItems ?? []).filter((item) =>
                  !params[0] || item.run_id === params[0]
                ) as T[],
              };
            }
            return { results: [] as T[] };
          },
          run: async () => {
            if (sql.includes("INSERT INTO settings")) {
              state.settings.set(String(params[0]), String(params[1]));
              return { meta: { changes: 1 } };
            }
            const policy = getPolicyForSql(sql);
            if (!policy) return { meta: { changes: 0 } };
            const cutoff = Number(params[0]);
            const rows = state.tables[policy.table] ?? [];
            const kept = rows.filter(
              (row) => !isPrunableRow(row, policy, cutoff),
            );
            state.tables[policy.table] = kept;
            return { meta: { changes: rows.length - kept.length } };
          },
        };
        return statement;
      },
    },
  }) as Env;

describe("data retention service", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("보존 기간이 지난 usage events, collection runs, logs 대상을 계산한다", async () => {
    const now = Date.UTC(2026, 6, 9, 0, 0, 0);
    const state: FakeD1State = {
      settings: new Map(),
      tables: {
        x_api_usage_events: [
          { id: 1, created_at: now - 91 * 24 * 60 * 60_000 },
          { id: 2, created_at: now - 10 * 24 * 60 * 60_000 },
        ],
        x_collection_runs: [
          { id: 1, started_at: now - 181 * 24 * 60 * 60_000 },
          { id: 2, started_at: now - 7 * 24 * 60 * 60_000 },
        ],
        update_logs: [
          { id: 1, created_at: "2025-07-01 00:00:00" },
          { id: 2, created_at: "2026-07-01 00:00:00" },
        ],
      },
    };

    const result = await getDataRetentionStatus(makeEnv(state), now);

    expect(result.totalPrunableRows).toBe(3);
    expect(result.totalDeletedRows).toBe(0);
    expect(state.tables.x_api_usage_events).toHaveLength(2);
    expect(
      result.policies.find((policy) => policy.id === "x-api-usage-events")
        ?.retentionDays,
    ).toBe(90);
    expect(
      result.policies.find((policy) => policy.id === "x-collection-runs")
        ?.retentionDays,
    ).toBe(180);
    expect(
      result.policies.find((policy) => policy.id === "update-logs")
        ?.retentionDays,
    ).toBe(365);
  });

  it("prune 실행 시 cutoff 이전 행만 삭제한다", async () => {
    const now = Date.UTC(2026, 6, 9, 0, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const state: FakeD1State = {
      settings: new Map(),
      tables: {
        youtube_api_usage_events: [
          { id: 1, created_at: now - 91 * 24 * 60 * 60_000 },
          { id: 2, created_at: now - 89 * 24 * 60 * 60_000 },
        ],
        admin_audit_logs: [
          { id: 1, created_at: now - 366 * 24 * 60 * 60_000 },
          { id: 2, created_at: now - 10 * 24 * 60 * 60_000 },
        ],
      },
    };

    const result = await runDataRetentionPrune(makeEnv(state), {
      source: "manual",
    });

    expect(result.totalPrunableRows).toBe(2);
    expect(result.totalDeletedRows).toBe(2);
    expect(state.tables.youtube_api_usage_events).toEqual([
      { id: 2, created_at: now - 89 * 24 * 60 * 60_000 },
    ]);
    expect(state.tables.admin_audit_logs).toEqual([
      { id: 2, created_at: now - 10 * 24 * 60 * 60_000 },
    ]);
    expect(state.settings.has("data_retention_last_prune")).toBe(false);
  });

  it("scheduled prune은 하루에 한 번만 실행한다", async () => {
    const now = Date.UTC(2026, 6, 9, 0, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const state: FakeD1State = {
      settings: new Map([
        ["data_retention_last_prune", String(now - 60 * 60_000)],
      ]),
      tables: {
        x_api_usage_events: [
          { id: 1, created_at: now - 91 * 24 * 60 * 60_000 },
        ],
      },
    };

    const result = await runScheduledDataRetentionPrune(makeEnv(state));

    expect(result.skipped).toBe(true);
    expect(state.tables.x_api_usage_events).toHaveLength(1);
  });

  it("기존 prune item 결과도 최근 이력의 삭제 합계로 제공한다", async () => {
    const now = Date.UTC(2026, 6, 9, 0, 0, 0);
    const state: FakeD1State = {
      settings: new Map(),
      tables: {},
      retentionRuns: [{
        id: "run-legacy",
        source: "manual",
        status: "succeeded",
        started_at: now - 1_000,
        finished_at: now,
        summary_json: null,
      }],
      retentionItems: [{
        run_id: "run-legacy",
        target_key: "x-api-usage-events",
        result_json: JSON.stringify({
          policyId: "x-api-usage-events",
          deletedRows: 16,
          hasMore: false,
        }),
      }],
    };

    const result = await getDataRetentionStatus(makeEnv(state), now);

    expect(result.recentRuns[0]).toMatchObject({
      runId: "run-legacy",
      totalDeletedRows: 16,
      verification: "unavailable",
    });
  });
});
