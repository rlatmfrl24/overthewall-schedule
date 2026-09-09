import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import * as schema from "@db/schema";
import { describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/d1";
import { D1DDayRepository } from "./d1-dday-repository";

const database = env.otw_db;
const migrations = (env as Env & { DDAY_SCHEMA_MIGRATIONS: D1Migration[] }).DDAY_SCHEMA_MIGRATIONS;
const repository = () => new D1DDayRepository(drizzle(database, { schema }));
const input = { title: "Anniversary", date: "2026-09-09", description: null, color: "#123456", type: "birthday" };

describe("D-Day canonical schema", () => {
  it("migration 적용 후 type을 실제 저장하고 수정한다", async () => {
    await applyD1Migrations(database, migrations);
    await repository().create(input);
    const rows = await repository().list();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("birthday");
    await repository().update(rows[0].id, { ...input, type: "debut" });
    expect((await repository().list())[0].type).toBe("debut");
    await repository().remove(rows[0].id);
    expect(await repository().list()).toEqual([]);
  });

  it("이전 migration의 type 누락 시 데이터 생략 저장을 하지 않는다", async () => {
    await database.prepare("DROP TABLE IF EXISTS ddays").run();
    const original = migrations.find(m => m.name.startsWith("0004_"))!;
    await database.batch(original.queries.map(query => database.prepare(query)));
    await expect(repository().list()).rejects.toThrow();
    await expect(repository().create(input)).rejects.toThrow();
    expect((await database.prepare("SELECT COUNT(*) AS count FROM ddays").first<{ count: number }>())?.count).toBe(0);
    await database.prepare("INSERT INTO ddays (title, date) VALUES ('unchanged', '2026-09-09')").run();
    const row = await database.prepare("SELECT id FROM ddays").first<{ id: number }>();
    await expect(repository().update(row!.id, input)).rejects.toThrow();
    expect((await database.prepare("SELECT title FROM ddays").first<{ title: string }>())?.title).toBe("unchanged");
  });
});
