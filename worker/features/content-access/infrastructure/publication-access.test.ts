import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { publicationHiddenSql } from "./publication-access";

afterEach(() => vi.restoreAllMocks());

it("keeps ownerless public rows visible while hiding selected member relations at the cutoff", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE members(uid INTEGER PRIMARY KEY,code TEXT);
      INSERT INTO members VALUES(1,'bing_hayu'),(2,'ordinary');
      CREATE TABLE notices(id INTEGER PRIMARY KEY,publisher_member_uid INTEGER,related_member_uids TEXT);
      INSERT INTO notices VALUES(1,NULL,NULL),(2,NULL,'[]'),(3,NULL,'[1]'),(4,1,NULL),(5,2,NULL),(6,2,'[1]'),(7,NULL,'[2]');
      CREATE TABLE naver_cafe_posts(id TEXT PRIMARY KEY,member_uid INTEGER);
      INSERT INTO naver_cafe_posts VALUES('global',NULL),('ordinary',2),('selected',1)`);
    const read = (table: string, site: "otw" | "luvdia", now: string) => db.prepare(
      `SELECT id FROM ${table} a WHERE NOT (${publicationHiddenSql(table, "a", site, String(Date.parse(now) / 1000))}) ORDER BY id`,
    ).all().map(row => row.id);
    const before = "2026-10-18T14:59:59Z", cutoff = "2026-10-18T15:00:00Z";
    expect(read("notices", "otw", before)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(read("notices", "otw", cutoff)).toEqual([1, 2, 5, 7]);
    expect(read("notices", "luvdia", cutoff)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(read("naver_cafe_posts", "otw", cutoff)).toEqual(["global", "ordinary"]);
  } finally {
    db.close();
  }
});

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
