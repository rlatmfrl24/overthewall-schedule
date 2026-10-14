import {applyD1Migrations,env,type D1Migration} from "cloudflare:test";
import {expect,it} from "vitest";

it("preserves populated ordinary raw rows through inventory migrations and rolls back a failed apply",async()=>{
  const runtime=env as unknown as {otw_db:D1Database;CONTENT_TRANSITION_MIGRATIONS:D1Migration[]},db=runtime.otw_db;
  const added=runtime.CONTENT_TRANSITION_MIGRATIONS.filter(m=>m.name>="0113_");
  for(const migration of runtime.CONTENT_TRANSITION_MIGRATIONS.filter(m=>m.name<"0113_")) {
    if(migration.name.startsWith("0030_")) await db.batch(["kurenai_natsuki","terri_nunna","bing_hayu","yang_mei","u_lili","on_haru","hane","kim_ate"].map((code,index)=>db.prepare("INSERT INTO members(uid,code,name,is_deprecated) VALUES(?,?,?,1)").bind(-10000-index,code,"migration bootstrap")));
    await applyD1Migrations(db,[migration]);
  }
  await db.prepare("INSERT INTO notices(id,content,image_urls) VALUES(91043,'Original raw legacy','[\"https://otw-schedule.info/profile//bing_hayu.webp\"]')").run();
  const before=await db.prepare("SELECT * FROM notices WHERE id=91043").first();
  await expect(db.batch([...added.flatMap(m=>m.queries.map(query=>db.prepare(query))),db.prepare("SELECT deliberately_missing FROM notices")])).rejects.toThrow();
  expect(await db.prepare("SELECT * FROM notices WHERE id=91043").first()).toEqual(before);
  expect(await db.prepare("SELECT 1 FROM sqlite_master WHERE name='content_transition_file_inventories'").first()).toBeNull();
  await applyD1Migrations(db,added);
  expect(await db.prepare("SELECT * FROM notices WHERE id=91043").first()).toEqual(before);
  expect(await db.prepare("SELECT path FROM asset_file_reference_paths WHERE row_table='notices' AND row_key='[91043]'").first("path")).toBe("/profile//bing_hayu.webp");
  await db.prepare("UPDATE notices SET image_urls='[\"/profile/%62ing_hayu.webp?x=1\"]' WHERE id=91043").run();
  expect(await db.prepare("SELECT path FROM asset_file_reference_paths WHERE row_table='notices' AND row_key='[91043]'").first("path")).toBe("/profile/bing_hayu.webp");
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
},120000);
