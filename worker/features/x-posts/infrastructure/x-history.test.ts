import { describe, expect, it } from "vitest";
import {
  parseComplianceResultIds,
  redactXPostHistory,
  runXMetricRefresh,
} from "./x-history";

describe("X Compliance result parsing", () => {
  it("redacts only removal events and ignores geo-only or edit events", () => {
    const result = [
      { id: "1", action: "delete", reason: "deleted" },
      { tweet_id: "2", action: "delete", reason: "protected" },
      { id: "3", action: "delete", reason: "scrub_geo" },
      { id: "4", action: "tweet_edit", reason: "edited" },
      { id: "5", action: "delete", reason: "suspended" },
    ].map((row) => JSON.stringify(row)).join("\n");

    expect(parseComplianceResultIds(result)).toEqual(["1", "2", "5"]);
  });

  it("ignores malformed and identifier-free result lines", () => {
    expect(parseComplianceResultIds([
      "not-json",
      JSON.stringify({ action: "delete", reason: "deleted" }),
      "",
    ].join("\n"))).toEqual([]);
  });
});

describe("X history D1 bind limits", () => {
  it("records a 100-post metric failure without exceeding 100 bindings", async () => {
    const timestamp = Date.parse("2026-09-02T00:33:00Z");
    const dueRows = Array.from({ length: 100 }, (_, index) => ({
      post_id: `post-${index}`,
      member_uid: 1,
      member_name_snapshot: "Member",
      post_type: "post",
      created_at: timestamp - 24 * 60 * 60_000,
      first_seen_at: timestamp - 24 * 60 * 60_000,
      media_count: 0,
      link_count: 0,
      hidden_at: null,
      hidden_reason: null,
      initial_snapshot_completed_at: null,
      after_24h_snapshot_completed_at: null,
      next_metrics_at: timestamp - 1,
      last_metrics_error: null,
    }));
    const errorUpdateBindCounts: number[] = [];
    const db = {
      prepare: (sql: string) => ({
        bind: (...values: unknown[]) => ({
          first: async () => {
            if (sql.includes("SELECT value FROM settings")) {
              return { value: "true" };
            }
            throw new Error(`Unexpected first query: ${sql}`);
          },
          all: async () => {
            if (sql.includes("FROM x_post_facts WHERE hidden_at IS NULL")) {
              return { results: dueRows };
            }
            throw new Error(`Unexpected all query: ${sql}`);
          },
          run: async () => {
            if (sql.includes("SET last_metrics_error")) {
              errorUpdateBindCounts.push(values.length);
              return { success: true };
            }
            throw new Error(`Unexpected run query: ${sql}`);
          },
        }),
      }),
    } as unknown as Pick<D1Database, "prepare">;

    const result = await runXMetricRefresh(
      db,
      async () => {
        throw new Error("budget_exceeded");
      },
      timestamp,
    );

    expect(result).toMatchObject({
      status: "failed",
      attempted: 100,
      failed: 100,
      errorCode: "budget_exceeded",
    });
    expect(errorUpdateBindCounts).toEqual([100, 6]);
    expect(Math.max(...errorUpdateBindCounts)).toBeLessThanOrEqual(100);
  });

  it("chunks Compliance aggregate rebuild reads at 100 post ids", async () => {
    const selectBindCounts: number[] = [];
    const db = {
      prepare: (sql: string) => ({
        bind: (...values: unknown[]) => ({
          run: async () => ({ success: true }),
          all: async () => {
            if (sql.includes("SELECT member_uid, created_at")) {
              selectBindCounts.push(values.length);
              return { results: [] };
            }
            throw new Error(`Unexpected all query: ${sql}`);
          },
        }),
      }),
    } as unknown as Pick<D1Database, "prepare">;
    const ids = Array.from({ length: 205 }, (_, index) => `post-${index}`);

    await redactXPostHistory(db, ids, "compliance", 1_788_307_200_000);

    expect(selectBindCounts).toEqual([100, 100, 5]);
    expect(Math.max(...selectBindCounts)).toBeLessThanOrEqual(100);
  });
});
