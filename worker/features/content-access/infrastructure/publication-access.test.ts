import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { publicationHiddenSql } from "./publication-access";

afterEach(() => vi.restoreAllMocks());

it("applies the operator-confirmed D-day cutoff without an active transfer workspace", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE content_transitions(id TEXT,local_site TEXT,source_site TEXT,aborted_at INTEGER,plan_json TEXT); CREATE TABLE content_transition_membership(transition_id TEXT,row_table TEXT,row_key TEXT); CREATE TABLE ddays(id INTEGER PRIMARY KEY); INSERT INTO ddays VALUES(4),(9),(10),(11),(90)");
    const read = (site: "otw" | "luvdia", now: string) => {
      vi.spyOn(Date, "now").mockReturnValue(Date.parse(now));
      const sql = publicationHiddenSql("ddays", "d", site, String(Date.parse(now) / 1000));
      return db.prepare(`SELECT id FROM ddays d WHERE NOT (${sql}) ORDER BY id`).all().map(row => row.id);
    };
    expect(read("otw", "2026-10-18T14:59:59Z")).toEqual([4, 9, 10, 11, 90]);
    expect(read("otw", "2026-10-18T15:00:00Z")).toEqual([90]);
    expect(read("luvdia", "2026-10-18T15:00:00Z")).toEqual([4, 9, 10, 11, 90]);
  } finally {
    db.close();
  }
});
