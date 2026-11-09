import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, expect, it } from "vitest";
import { getDb } from "../../../platform/db";
import type { Env } from "../../../platform/types";
import { readSiteSchemaMigrations } from "../../../test-support/site-schema";
import { D1MemberReader } from "../../members/infrastructure/d1-member-reader";
import { D1NoticeGateway } from "../../notices";
import { D1R2FileStore } from "./d1-r2-file-store";

const runtime = env as unknown as Env;
const db = runtime.otw_db;
const database = getDb(runtime);
const path = (key: string) => `/r2-assets/notices/thumbnails/${key}.webp`;

beforeAll(async () => {
  for (const migration of await readSiteSchemaMigrations()) {
    if (migration.name.startsWith("0030_")) await db.batch(["kurenai_natsuki", "terri_nunna", "bing_hayu", "yang_mei", "u_lili", "on_haru", "hane", "kim_ate"].map((code, index) => db.prepare("INSERT INTO members(uid,code,name,is_deprecated) VALUES(?,?,?,1)").bind(-10000 - index, code, "migration bootstrap")));
    await applyD1Migrations(db, [migration]);
  }
}, 120_000);

const retention = (key: string) => db.prepare("SELECT held FROM asset_file_retention_releases WHERE logical_key=?").bind(`notices/thumbnails/${key}.webp`).first("held");

it("edits and removes a notice with images through the owning gateway", async () => {
  const bucket = runtime.ASSET_BUCKET!;
  const store = new D1R2FileStore(db, bucket, "otw", "otw-schedule");
  const gateway = new D1NoticeGateway(database, bucket, false, store);
  const replacementKey = "notices/thumbnails/notice-after.webp";
  await store.put({ operationId: "notice-write-compat", logicalKey: replacementKey, contentType: "image/webp", bytes: new Uint8Array([82, 73, 70, 70]) });
  const input = { content: "Before image update", links: [], imageUrls: [path("notice-before")], relatedMemberUids: [], type: "notice" as const, isActive: true, startedAt: null, endedAt: null };
  expect(await gateway.create(input)).toEqual({ status: "success" });
  const id = (await db.prepare("SELECT id FROM notices WHERE content=?").bind(input.content).first<number>("id"))!;
  expect(await gateway.update(id, { ...input, content: "After image update", imageUrls: [path("notice-after")] })).toEqual({ status: "success" });
  expect((await gateway.list({ includeInactive: false, type: null, today: "2026-11-09" })).find(notice => notice.id === id))
    .toMatchObject({ content: "After image update", image_urls: [path("notice-after")] });
  expect(await retention("notice-before")).toBe(0);
  expect(await gateway.remove(id)).toEqual({ status: "success" });
  expect(await db.prepare("SELECT released_at FROM asset_file_versions WHERE logical_key=?").bind(replacementKey).first("released_at")).toBeGreaterThan(0);
  expect(await db.prepare("SELECT 1 FROM asset_file_references WHERE logical_key=?").bind(replacementKey).first()).toBeNull();
});

it("updates a member image, projects the replacement, and reads it on the profile", async () => {
  await db.batch([
    db.prepare("INSERT INTO members(uid,code,name) VALUES(99177,'profile_write_compat','Profile write compatibility')"),
    db.prepare("INSERT INTO member_profile_images(id,member_uid,image_url) VALUES(99177,99177,?)").bind(path("profile-before")),
  ]);
  await db.prepare("UPDATE member_profile_images SET image_url=? WHERE id=99177").bind(path("profile-after")).run();
  const profile = await new D1MemberReader(database).findProfileByCode("profile_write_compat", false);
  expect(profile?.profileImages).toEqual([expect.objectContaining({ id: 99177, imageUrl: path("profile-after") })]);
  expect(await retention("profile-before")).toBe(0);
  expect(await retention("profile-after")).toBe(1);
  await db.prepare("DELETE FROM member_profile_images WHERE id=99177").run();
  expect(await retention("profile-after")).toBe(0);
});

it("keeps notice text edits bounded on the affected D1 runtime", async () => {
  await db.prepare("INSERT INTO notices(id,content,image_urls) VALUES(99200,'before',?)").bind(JSON.stringify([path("edit-cost")])).run();
  const update = db.prepare("UPDATE notices SET content=? WHERE id=99200");
  const small = await update.bind("small edit").run();
  await db.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<1000) INSERT INTO notices(id,content,image_urls) SELECT x+100000,'unrelated',json_array('/r2-assets/notices/thumbnails/other-'||x||'.webp') FROM n").run();
  const large = await update.bind("large edit").run();
  expect(large.meta.rows_written).toBe(small.meta.rows_written);
  expect(large.meta.rows_read).toBeLessThanOrEqual(small.meta.rows_read + 10);
});
