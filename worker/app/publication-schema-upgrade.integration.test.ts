import { readSiteSchemaMigrations } from "../test-support/site-schema";
import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import { handleWorkerFetch } from "./fetch";
import { siteEnv } from "../test-support/site-env";
import type { Env } from "../platform/types";

const bindings = env as unknown as Env & { transition_target_db: D1Database };
let db = bindings.otw_db;
const number = (migration: D1Migration) => Number(migration.name.slice(0, 4));
const totals: Record<string, { rowsRead: number; rowsWritten: number }> = {};
const measured = () => new Proxy(db, { get(target, key) {
  if (key === "constructor") return target.constructor;
  if (key === "batch") return async (statements: D1PreparedStatement[]) => {
    const results = await target.batch(statements);
    const total = totals.current;
    if (total) for (const result of results) {
      total.rowsRead += result.meta.rows_read;
      total.rowsWritten += result.meta.rows_written;
    }
    return results;
  };
  const value = Reflect.get(target, key);
  return typeof value === "function" ? value.bind(target) : value;
} });

async function apply(migration: D1Migration) {
  if (number(migration) === 30) await db.batch(["kurenai_natsuki", "terri_nunna", "bing_hayu", "yang_mei", "u_lili", "on_haru", "hane", "kim_ate"].map((code, index) =>
    db.prepare("INSERT INTO members(uid,code,name,is_deprecated) VALUES(?,?,?,1)").bind(-10000 - index, code, "migration bootstrap")));
  totals.current = { rowsRead: 0, rowsWritten: 0 };
  await applyD1Migrations(measured(), [migration]);
  totals[migration.name] = { ...totals.current };
}

async function seed() {
  await db.batch([
    db.prepare("INSERT INTO members(uid,code,name) VALUES(900001,'release_owner','Release Owner')"),
    db.prepare("INSERT INTO music_entities(id,member_uid,entity_kind,display_name,normalized_name,slug,created_at,updated_at) VALUES('release-entity',900001,'person','Release Owner','release owner','release-owner',100,100)"),
    db.prepare("INSERT INTO music_cover_proposals(id,submitted_by_user_id,idempotency_key,submitted_url,youtube_video_id,submitted_title,created_at,updated_at) VALUES('release-proposal','original-user','original-key','https://youtu.be/AAAAAAAAAAA','AAAAAAAAAAA','Original proposal',100,100)"),
    db.prepare("INSERT INTO music_cover_proposal_participants(proposal_id,resolved_entity_id,submitted_name_snapshot,participant_role) VALUES('release-proposal','release-entity','Original participant','vocal')"),
    db.prepare("INSERT INTO music_cover_proposal_original_artists(proposal_id,resolved_entity_id,submitted_name_snapshot) VALUES('release-proposal','release-entity','Original artist')"),
    db.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,fetched_at) VALUES('101000000000000091','release_owner','release_owner',?,100,100)").bind(JSON.stringify({ id: "101000000000000091", username: "release_owner", text: "Original raw", createdAt: "2026-10-14T00:00:00Z", url: "https://x.com/release_owner/status/101000000000000091", media: [], links: [], metrics: { likeCount: 0, retweetCount: 0, replyCount: 0, quoteCount: 0 } })),
  ]);
}

it.each(["otw", "luvdia"] as const)("upgrades the actual %s migration order without losing legacy writes, proposal children or X repair state", async site => {
  db = site === "otw" ? bindings.otw_db : bindings.transition_target_db;
  for (const migration of (await readSiteSchemaMigrations()).filter(m => number(m) <= 101)) await apply(migration);
  await seed();
  const raw = await db.prepare("SELECT value FROM x_posts WHERE id='101000000000000091'").first("value");
  const participants = (await db.prepare("SELECT * FROM music_cover_proposal_participants WHERE proposal_id='release-proposal'").all()).results;
  const artists = (await db.prepare("SELECT * FROM music_cover_proposal_original_artists WHERE proposal_id='release-proposal'").all()).results;
  const next = (await readSiteSchemaMigrations()).filter(m => number(m) > 101);
  const order = site === "otw"
    ? [...next.filter(m => [137, 138].includes(number(m))), ...next.filter(m => ![137, 138].includes(number(m)))]
    : next;
  const alreadyApplied=(m:D1Migration)=>site==='otw'?[137,138].includes(number(m)):number(m)<=136;
  for(const migration of order.filter(alreadyApplied)) await apply(migration);
  for(const key of Object.keys(totals)) delete totals[key];
  for (const migration of order.filter(m=>!alreadyApplied(m))) await apply(migration);
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  expect((await db.prepare("SELECT * FROM music_cover_proposal_participants WHERE proposal_id='release-proposal'").all()).results).toEqual(participants);
  expect((await db.prepare("SELECT * FROM music_cover_proposal_original_artists WHERE proposal_id='release-proposal'").all()).results).toEqual(artists);
  expect(await db.prepare("SELECT value FROM x_posts WHERE id='101000000000000091'").first("value")).toBe(raw);
  expect(await db.prepare("SELECT facts_pending,references_pending FROM x_post_repair_work WHERE post_id='101000000000000091'").first()).toEqual({ facts_pending: 1, references_pending: 0 });
  await db.prepare("UPDATE music_cover_proposals SET submitted_title='Legacy writer still works',updated_at=101 WHERE id='release-proposal'").run();
  expect(await db.prepare("SELECT submitted_title FROM music_cover_proposals WHERE id='release-proposal'").first("submitted_title")).toBe("Legacy writer still works");
  const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-10-18T15:00:00Z'));
  const response = await handleWorkerFetch(new Request("http://localhost:5173/api/members"), { ...bindings, otw_db: db, ...siteEnv(site),SITE_PUBLIC_ORIGIN:'http://localhost:5173' } as Env);
  clock.mockRestore();
  expect(response.status).toBe(200);
  expect(await response.text()).toContain("release_owner");
  console.info("publication-upgrade-cost", JSON.stringify({ site, migrations: Object.fromEntries(Object.entries(totals).filter(([name]) => Number(name.slice(0,4)) >= 102)) }));
}, 120000);
