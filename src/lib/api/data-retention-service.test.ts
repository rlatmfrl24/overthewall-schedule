import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DATA_RETENTION_POLICIES,
  getDataRetentionStatus,
  runDataRetentionPrune,
  runScheduledDataRetentionPrune,
} from "../../../worker/services/data-retention";
import type { Env } from "../../../worker/types";

type TableRow = Record<string, number | string | null>;

type FakeD1State = {
  tables: Record<string, TableRow[]>;
  settings: Map<string, string>;
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
});
