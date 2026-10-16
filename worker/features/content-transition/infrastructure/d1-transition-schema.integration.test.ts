import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { expect, it } from "vitest";
import { D1AdminCatalogRepository } from "../../otw-play";
import { projectCapturedRecord } from "../domain/projected-content";
import { historicalStatements } from "./historical-statements";

const bindings = env as typeof env & { CONTENT_TRANSITION_MIGRATIONS: D1Migration[] };
const db = bindings.otw_db;
const name = "0102_content_transition_foundation.sql";

it("preserves populated canonical roots and proposal credits, rolls back a failed migration, and enforces historical provenance", async () => {
  const codes = ["kurenai_natsuki", "terri_nunna", "bing_hayu", "yang_mei", "u_lili", "on_haru", "hane", "kim_ate"];
  for (const migration of bindings.CONTENT_TRANSITION_MIGRATIONS.filter(m => m.name < name)) {
    if (migration.name.startsWith("0030_")) await db.batch(codes.map((code, index) => db.prepare("INSERT INTO members(uid,code,name,is_deprecated) VALUES(?,?,?,1)").bind(-10000-index, code, "migration bootstrap")));
    await applyD1Migrations(db, [migration]);
  }
  await db.batch([
    db.prepare("INSERT INTO members(uid,code,name) VALUES(1,'bing_hayu','Bing'),(2,'u_lili','Lili'),(3,'yang_mei','Mei'),(4,'other','Other')"),
    db.prepare("INSERT INTO music_entities(id,member_uid,entity_kind,display_name,normalized_name,slug,created_at,updated_at) VALUES('singer',1,'person','Bing','bing','bing',1,1)"),
    db.prepare("INSERT INTO music_songs(id,slug,title,normalized_title,dedupe_key,is_otw_original,created_at,updated_at) VALUES('song','song','Song','song','song',0,1,1)"),
    db.prepare("INSERT INTO music_performances(id,song_id,dedupe_key,relation_type,release_type,participation_type,created_at,updated_at) VALUES('performance','song','performance','cover','official_video','solo',1,1)"),
    db.prepare("INSERT INTO music_performance_participants(performance_id,entity_id,participant_role,credit_order,credit_name_snapshot) VALUES('performance','singer','vocal',0,'Bing')"),
    db.prepare(`INSERT INTO music_cover_proposals(id,submitted_by_user_id,idempotency_key,submitted_url,youtube_video_id,submitted_title,status,reviewed_by_user_id,reviewed_at,approved_performance_id,created_at,updated_at)
      VALUES('proposal','local-user','request','https://youtu.be/AAAAAAAAAAA','AAAAAAAAAAA','Song','approved','local-admin',1,'performance',1,1)`),
    db.prepare("INSERT INTO music_cover_proposal_participants(proposal_id,credit_order,resolved_entity_id,submitted_member_uid,submitted_name_snapshot,participant_role) VALUES('proposal',0,'singer',1,'Bing','vocal')"),
    db.prepare("INSERT INTO music_cover_proposal_original_artists(proposal_id,credit_order,resolved_entity_id,submitted_member_uid,submitted_name_snapshot) VALUES('proposal',0,'singer',1,'Bing')"),
  ]);
  const tables = ["members", "music_entities", "music_songs", "music_performances", "music_performance_participants", "music_cover_proposals", "music_cover_proposal_participants", "music_cover_proposal_original_artists"];
  const before = new Map(await Promise.all(tables.map(async table => [table, (await db.prepare(`SELECT * FROM ${table}`).all()).results] as const)));
  const migration = bindings.CONTENT_TRANSITION_MIGRATIONS.find(m => m.name === name)!;
  await expect(db.batch([...migration.queries.map(query => db.prepare(query)), db.prepare("SELECT definitely_missing FROM members")])).rejects.toThrow();
  for (const table of tables) expect((await db.prepare(`SELECT * FROM ${table}`).all()).results).toEqual(before.get(table));
  expect(await db.prepare("SELECT name FROM sqlite_master WHERE name='content_transitions'").first()).toBeNull();
  await applyD1Migrations(db, [migration]);
  for (const table of tables) {
    const expected = before.get(table)!.map(row => table === "music_cover_proposals"
      ? { ...row, content_access: "normal", historical_source_site: null, historical_source_record_id: null, historical_review: 0 }
      : ["members", "music_performances"].includes(table) ? { ...row, content_access: "normal" } : row);
    expect((await db.prepare(`SELECT * FROM ${table}`).all()).results).toEqual(expected);
  }
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  await expect(db.prepare("UPDATE members SET content_access='invented' WHERE uid=1").run()).rejects.toThrow();
  await expect(db.prepare("UPDATE music_cover_proposals SET submitted_by_user_id=NULL WHERE id='proposal'").run()).rejects.toThrow();
  await expect(db.prepare("UPDATE music_cover_proposals SET reviewed_by_user_id=NULL WHERE id='proposal'").run()).rejects.toThrow();
  await db.prepare(`INSERT INTO music_cover_proposals(id,submitted_by_user_id,historical_source_site,historical_source_record_id,historical_review,idempotency_key,submitted_url,youtube_video_id,submitted_title,status,reviewed_at,review_note,created_at,updated_at)
    VALUES('imported',NULL,'otw','source-proposal',1,'imported','https://youtu.be/BBBBBBBBBBB','BBBBBBBBBBB','Historical','rejected',2,'Original review note',1,2)`).run();
  await expect(db.prepare("UPDATE music_cover_proposals SET reviewed_by_user_id='invented-admin' WHERE id='imported'").run()).rejects.toThrow();
  const event=await projectCapturedRecord("music_catalog_events",'["old-event"]',{id:"old-event",aggregate_type:"review_proposal",aggregate_id:"imported",event_type:"proposal.rejected",actor_kind:"admin",actor_user_id:"old-admin",created_at:2,detail_json:'{"reviewNote":"Original decision material"}'},{sourceSite:"otw",members:[]});
  await db.batch(historicalStatements(db,event!,[{table:"music_cover_proposals",key:'["imported"]'}]));
  const [historical] = (await new D1AdminCatalogRepository(db).readProposals("rejected")).filter(row => row.id === "imported");
  expect(historical).toMatchObject({ submittedByUserId: null, reviewedByUserId: null, historicalReview: true, historicalProvenance: { sourceSite: "otw", sourceRecordId: "source-proposal" }, reviewedAt: 2, reviewNote: "Original review note" });
  expect(historical.historicalMaterials).toHaveLength(1);
  expect(JSON.stringify(historical.historicalMaterials)).toContain("Original decision material");
  expect(JSON.stringify(historical.historicalMaterials)).not.toContain("old-admin");
  await db.prepare("UPDATE music_cover_proposals SET historical_review=0,reviewed_by_user_id='actual-target-admin',reviewed_at=3,updated_at=3 WHERE id='imported'").run();
  expect(await db.prepare("SELECT submitted_by_user_id,historical_source_record_id,reviewed_by_user_id,historical_review FROM music_cover_proposals WHERE id='imported'").first()).toEqual({ submitted_by_user_id: null, historical_source_record_id: "source-proposal", reviewed_by_user_id: "actual-target-admin", historical_review: 0 });
}, 120000);
