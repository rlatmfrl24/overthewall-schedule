import { readSiteSchemaMigrations } from "../../../test-support/site-schema";
import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, expect, it } from "vitest";
import { commitPublicationBatch } from "../../content-access";
import { SITE_OPENS_AT } from "@contracts/site-publication";

const runtime = env as unknown as { otw_db: D1Database; };
const db = runtime.otw_db;
let protectedRules: unknown[];
const readProtectedRules = async () => (await db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND (name GLOB 'asset_*' AND name NOT GLOB 'asset_file_projection_*' OR name GLOB 'x_*') ORDER BY name").all()).results;

beforeAll(async () => {
  for (const migration of (await readSiteSchemaMigrations())) {
    if (migration.name.startsWith("0030_")) await db.batch(["kurenai_natsuki", "terri_nunna", "bing_hayu", "yang_mei", "u_lili", "on_haru", "hane", "kim_ate"].map((code, index) => db.prepare("INSERT INTO members(uid,code,name,is_deprecated) VALUES(?,?,?,1)").bind(-10000 - index, code, "migration bootstrap")));
    if (Number(migration.name.slice(0, 4)) > 140 && !protectedRules) {
      protectedRules = await readProtectedRules();
      await db.prepare("INSERT INTO notices(id,content,image_urls) VALUES(905,'preserved original','[\"/r2-assets/notices/thumbnails/%6F riginal.webp\"]')").run();
      const rules = (await db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all()).results;
      await db.prepare("INSERT INTO content_transitions(id,source_site,target_site,source_resource,target_resource,local_site,local_resource,generation,protocol,manifest_digest,plan_json,phase) VALUES('retirement-held','otw','luvdia','otw-db','luvdia-db','otw','otw-db',2,1,'held','{}','protected')").run();
      await expect(applyD1Migrations(db, [migration])).rejects.toThrow();
      expect((await db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all()).results).toEqual(rules);
      await db.prepare("DELETE FROM content_transitions WHERE id='retirement-held'").run();
      await expect(db.batch([...migration.queries.slice(0, 30).map(sql => db.prepare(sql)), db.prepare("SELECT json('rollback_after_DDL')")])).rejects.toThrow();
      expect((await db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all()).results).toEqual(rules);
    }
    await applyD1Migrations(db, [migration]);
  }
}, 120000);

it("retires only transfer triggers after installing the nine owning file projection triggers", async () => {
  const names = (await db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name GLOB 'asset_file_projection_*' ORDER BY name").all<{ name: string }>()).results;
  expect(names).toHaveLength(9);
  expect(await db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND (name GLOB 'ct_*' OR name GLOB 'maintenance_*' OR name GLOB 'content_*')").first("n")).toBe(0);
  expect(await readProtectedRules()).toEqual(protectedRules);
  expect(await db.prepare("SELECT content,image_urls FROM notices WHERE id=905").first()).toEqual({ content: "preserved original", image_urls: '["/r2-assets/notices/thumbnails/%6F riginal.webp"]' });
});

it.each(["member_profile_images", "naver_cafe_posts"] as const)("preserves %s projection, old-file retention and atomic rollback", async table => {
  const raw = "/r2-assets/notices/thumbnails/" + table + ".webp";
  if (table === "member_profile_images") await db.prepare("INSERT INTO member_profile_images(id,member_uid,image_url) VALUES(907,1,?)").bind(raw).run();
  else await db.batch([
    db.prepare("INSERT INTO naver_cafe_sources(id,name,cafe_url,cafe_id,menu_id,enabled) VALUES(907,'Cafe','https://cafe.naver.com/test','123','1',0)"),
    db.prepare("INSERT INTO naver_cafe_posts(id,article_id,source_id,source_name,cafe_id,menu_id,title,summary,created_at,url,fetched_at,thumbnail_url) VALUES('907',907,907,'Cafe','123','1','Image','Image summary','2026-10-16','https://cafe.naver.com/test/907',1,?)").bind(raw),
  ]);
  const key = JSON.stringify([table === "member_profile_images" ? 907 : "907"]);
  const read = () => db.prepare("SELECT raw_url,path FROM asset_file_reference_paths WHERE row_table=? AND row_key=?").bind(table, key).first();
  expect(await read()).toEqual({ raw_url: raw, path: raw });
  const column = table === "member_profile_images" ? "image_url" : "thumbnail_url";
  await expect(db.batch([db.prepare(`UPDATE ${table} SET ${column}=? WHERE id=907`).bind(raw.replace(".webp", "-new.webp")), db.prepare("SELECT json('rollback_owner_image')")])).rejects.toThrow();
  expect(await read()).toEqual({ raw_url: raw, path: raw });
  await db.prepare(`DELETE FROM ${table} WHERE id=907`).run();
  expect(await read()).toBeNull();
  expect(await db.prepare("SELECT held,released_at FROM asset_file_retention_releases WHERE logical_key=?").bind(raw.slice("/r2-assets/".length)).first()).toMatchObject({ held: 0, released_at: expect.any(Number) });
});

it("keeps reference projection and retention changes in the original notice transaction", async () => {
  await db.prepare("INSERT INTO notices(id,content,image_urls) VALUES(906,'owning write','[\"/r2-assets/notices/thumbnails/%6Cegacy.webp?version=1\"]')").run();
  const read = () => db.prepare("SELECT raw_url,path FROM asset_file_reference_paths WHERE row_table='notices' AND row_key='[906]'").first();
  const original = await read();
  expect(original).toEqual({ raw_url: "/r2-assets/notices/thumbnails/%6Cegacy.webp?version=1", path: "/r2-assets/notices/thumbnails/legacy.webp" });
  await expect(db.batch([
    db.prepare("UPDATE notices SET image_urls='[\"/r2-assets/notices/thumbnails/new.webp\"]' WHERE id=906"),
    db.prepare("SELECT json('owning_batch_failed')"),
  ])).rejects.toThrow();
  expect(await read()).toEqual(original);
  expect(await db.prepare("SELECT 1 FROM asset_file_retention_releases WHERE logical_key='notices/thumbnails/new.webp'").first()).toBeNull();
  await db.prepare("UPDATE notices SET image_urls='[]' WHERE id=906").run();
  expect(await read()).toBeNull();
  expect(await db.prepare("SELECT held,released_at FROM asset_file_retention_releases WHERE logical_key='notices/thumbnails/legacy.webp'").first()).toMatchObject({ held: 0, released_at: expect.any(Number) });
});

it("rolls back every owned write when D1 time crosses publication inside the batch", async () => {
  const cutoff = Date.parse(SITE_OPENS_AT) / 1000;
  await db.batch([
    db.prepare("CREATE TABLE publication_clock(epoch INTEGER NOT NULL)"),
    db.prepare("INSERT INTO publication_clock VALUES(?)").bind(cutoff - 1),
  ]);
  const memberUid = await db.prepare("SELECT uid FROM members WHERE code='bing_hayu'").first<number>("uid");
  expect(memberUid).not.toBeNull();
  // Only the database clock input changes; both guards and all writes execute in real D1.
  const controlled = new Proxy(db, { get(target, property) {
    if (property === "prepare") return (sql: string) => target.prepare(sql.replaceAll("unixepoch()", "(SELECT epoch FROM publication_clock)"));
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  await expect(commitPublicationBatch(controlled, "otw", [memberUid!], [
    db.prepare("INSERT INTO notices(id,content,image_urls) VALUES(908,'late owning response','[\"/r2-assets/notices/thumbnails/late.webp\"]')"),
    db.prepare("UPDATE publication_clock SET epoch=?").bind(cutoff),
  ])).rejects.toThrow();
  expect(await db.prepare("SELECT 1 FROM notices WHERE id=908").first()).toBeNull();
  expect(await db.prepare("SELECT 1 FROM asset_file_reference_paths WHERE row_table='notices' AND row_key='[908]'").first()).toBeNull();
  expect(await db.prepare("SELECT epoch FROM publication_clock").first("epoch")).toBe(cutoff - 1);
  const normal = await commitPublicationBatch(controlled, "otw", [], [db.prepare("UPDATE publication_clock SET epoch=?").bind(cutoff)]);
  expect(normal).toHaveLength(1);
});
