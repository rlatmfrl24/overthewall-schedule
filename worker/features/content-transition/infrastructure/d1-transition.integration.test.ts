import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { D1TransitionRepository } from "./d1-transition-repository";
import { projectCapturedRecord } from "../domain/projected-content";
import { historicalStatements } from "./historical-statements";
import { D1IngestionRepository } from "../../otw-play/infrastructure/d1-ingestion-repository";
import { classifiedTables } from "./manifest-statements";
import { keySql } from "./capture-graph";
import type { TransitionPlan } from "../../../../contracts/content-transition";
import {D1FileAvailability} from "../../assets/infrastructure/d1-file-availability";
import type {FileAvailabilityContext} from "../application/ports/file-availability";

const bindings = env as typeof env & { transition_target_db: D1Database; CONTENT_TRANSITION_MIGRATIONS: D1Migration[]; ASSET_BUCKET:R2Bucket;TRANSITION_TARGET_BUCKET:R2Bucket;SOURCE_ASSETS:Fetcher;TARGET_ASSETS:Fetcher };
const sourceDb = bindings.otw_db;
const targetDb = bindings.transition_target_db;
const fixtureClassifications: Array<TransitionPlan["classifications"][number]>=[];
const plan = {
  id: "move", sourceSite: "otw", targetSite: "luvdia", sourceResource: "source-db", targetResource: "target-db",
  generation: 2, protocol: 1, manifestDigest: "reviewed-manifest",assetBuckets:{source:"otw-bucket",target:"luvdia-bucket"}, members: [
    { code: "bing_hayu", uid: 1, targetUid:1 }, { code: "u_lili", uid: 2, targetUid:2 }, { code: "yang_mei", uid: 3, targetUid:3 },
  ], classifications: fixtureClassifications,
} as const;
const sourceAvailability=new D1FileAvailability(sourceDb,bindings.ASSET_BUCKET,bindings.SOURCE_ASSETS,"otw","otw-bucket");
const targetAvailability=new D1FileAvailability(targetDb,bindings.TRANSITION_TARGET_BUCKET,bindings.TARGET_ASSETS,"luvdia","luvdia-bucket");
const source = new D1TransitionRepository(sourceDb, "otw", "source-db","otw-bucket",sourceAvailability);
const target = new D1TransitionRepository(targetDb, "luvdia", "target-db","luvdia-bucket",targetAvailability);
const now = 100;
const admission = (id: string, hash = id) => ({
  codec:{id:"schedules.save",version:1},
  transitionId: plan.id, operationId: id, payloadHash: hash, idempotencyKey: id, kind: "content_edit" as const,
  subject: { table: "schedules", key: "[1]" }, expectedVersion: null,
  validation: { contract: 1, validatedAt: now }, payload: {id:1,member_uid:1,date:"2026-10-14",start_time:null,title:"accepted edit",status:"방송"}, admittedAt: now,
});

async function migrate(db: D1Database) {
  const codes = ["kurenai_natsuki", "terri_nunna", "bing_hayu", "yang_mei", "u_lili", "on_haru", "hane", "kim_ate"];
  for (const migration of bindings.CONTENT_TRANSITION_MIGRATIONS) {
    if (migration.name.startsWith("0030_")) {
      await db.batch(codes.map((code, index) => db.prepare("INSERT INTO members(uid,code,name,is_deprecated) VALUES(?,?,?,1)").bind(-10000-index, code, "migration bootstrap")));
    }
    try { await applyD1Migrations(db, [migration]); }
    catch (error) { throw new Error(`Actual chain failed at ${migration.name}`, { cause: error }); }
  }
  await db.batch([
    db.prepare("DELETE FROM member_links WHERE member_uid BETWEEN -10007 AND -10000"),
    db.prepare("DELETE FROM members WHERE uid BETWEEN -10007 AND -10000"),
  ]);
}

beforeAll(async () => {
  await migrate(sourceDb); await migrate(targetDb);
  for(const table of classifiedTables) {
    const rows=(await sourceDb.prepare(`SELECT ${keySql(table,"a")} identity FROM "${table}" a`).all<{identity:string}>()).results;
    fixtureClassifications.push(...rows.map(row=>({table,key:row.identity,disposition:"exclude" as const,reason:"Fixture-approved unrelated site configuration"})));
  }
}, 120000);
beforeEach(async () => {
  for (const db of [sourceDb, targetDb]) {
    await db.batch([
      db.prepare("DELETE FROM content_transitions"),
      db.prepare("DELETE FROM content_historical_relations"),
      db.prepare("DELETE FROM content_historical_records"),
      db.prepare("DELETE FROM notices"),db.prepare("DELETE FROM member_profile_images"),
      db.prepare("DELETE FROM schedules"),
      db.prepare("DELETE FROM ddays WHERE id=900"),
      db.prepare("DELETE FROM music_ingestion_candidates"),
      db.prepare("DELETE FROM music_performances"),
      db.prepare("DELETE FROM music_songs"),
      db.prepare("DELETE FROM music_entities"),
      db.prepare("DELETE FROM x_post_facts"),db.prepare("DELETE FROM x_post_references"),db.prepare("DELETE FROM x_posts"),db.prepare("DELETE FROM x_post_sources"),
      db.prepare("DELETE FROM members WHERE uid=90"),
      ...(db===sourceDb?plan.members.map(member => db.prepare("INSERT OR IGNORE INTO members(uid,code,name) VALUES(?,?,?)").bind(member.uid, member.code, member.code)):[db.prepare("DELETE FROM members")]),
    ]);
  }
  await source.prepare(plan);
  await target.prepare(plan);
});

it("projects an approved absolute asset origin into target-relative references while preserving sealed source bytes",async()=>{
  await sourceDb.prepare("DELETE FROM content_transitions").run();await targetDb.prepare("DELETE FROM content_transitions").run();
  const raw="https://otw-schedule.info/profile/%62ing_hayu.webp?revision=1#image";
  await sourceDb.prepare("INSERT INTO notices(id,content,related_member_uids,image_urls) VALUES(901,'origin reference','[1]',?)").bind(JSON.stringify([raw])).run();
  await expect(source.prepare(plan)).rejects.toThrow(/classification/);
  const ownPlan:TransitionPlan={...plan,fileOrigins:[{kind:"site",origin:"https://otw-schedule.info",site:"otw"}]};
  await source.prepare(ownPlan);await target.prepare(ownPlan);
  await ready();
  const header=await source.describeBaseline(plan.id);await target.beginBaseline(header);
  let cursor:Awaited<ReturnType<typeof source.exportBaselinePage>>["next"]|0=0;
  do {const page=await source.exportBaselinePage(header,cursor);await target.stageBaselinePage(page);cursor=page.next;}while(cursor.ordinal<header.rows);
  while(await target.materializeBaselinePage(plan.id)){ /* normal bounded installer */ }
  await target.finalizeBaseline(plan.id);
  expect(await targetDb.prepare("SELECT image_urls FROM notices WHERE id=901").first("image_urls")).toBe('["/profile/bing_hayu.webp"]');
  expect(await targetDb.prepare("SELECT raw_url FROM asset_file_reference_paths WHERE row_table='notices' AND row_key='[901]'").first("raw_url")).toBe("/profile/bing_hayu.webp");
  const sealed=await sourceDb.prepare("SELECT image_json FROM content_transition_images WHERE row_table='notices' AND row_key='[901]'").first<string>("image_json");
  expect(sealed).toContain(raw);
  expect(await sourceDb.prepare("SELECT image_urls FROM notices WHERE id=901").first("image_urls")).toBe(JSON.stringify([raw]));
  const beforeHeader=await source.describeBaseline(plan.id);
  await source.admit(admission("unknown-origin"));
  await source.commit(plan.id,"unknown-origin",1,[sourceDb.prepare("UPDATE notices SET image_urls=? WHERE id=901").bind('["https://new-origin.example/profile/bing_hayu.webp"]')]);
  expect(await sourceDb.prepare("SELECT image_urls FROM notices WHERE id=901").first("image_urls")).toContain("new-origin.example");
  await expect(source.freeze(plan.id,now)).rejects.toThrow(/manifest/);
  await expect(source.exportProjectedCommits(plan.id,header.boundary)).rejects.toThrow(/classification/);
  const parent={revision:0,digest:plan.manifestDigest},protection={receiptId:"origin-review",protocol:1,manifestDigest:"origin-v2"};
  const originAddition=[{kind:"external" as const,origin:"https://new-origin.example",reason:"Reviewed remote external-only reference"}];
  const revision=await source.appendClassifications(plan.id,parent,[],"origin-v2",protection,originAddition);
  expect(await source.appendClassifications(plan.id,parent,[],"origin-v2",protection,originAddition)).toEqual(revision);
  await expect(source.appendClassifications(plan.id,parent,[],"origin-v2",protection,[{...originAddition[0],reason:"different"}])).rejects.toThrow(/conflict/i);
  await target.acceptManifestRevision(revision);
  await expect(target.acceptManifestRevision({...revision,plan:{...revision.plan,fileOrigins:[{kind:"site",site:"otw",origin:"https://foreign.example"},...originAddition]}})).rejects.toThrow(/conflict/i);
  expect(await source.describeBaseline(plan.id)).toEqual(beforeHeader);
  await source.acknowledgeIngress(await target.openIngress(plan.id,"origin-v2-ready",1000),now);
  const fence=await source.freeze(plan.id,now);await target.installFence(fence);
  for(const commit of await source.exportProjectedCommits(plan.id,header.boundary)) await target.installProjectedCommit(commit);
  expect(await targetDb.prepare("SELECT image_urls FROM notices WHERE id=901").first("image_urls")).toBe('["https://new-origin.example/profile/bing_hayu.webp"]');
  await expect(source.appendClassifications(plan.id,{revision:1,digest:"origin-v2"},[],"origin-v3",{...protection,manifestDigest:"origin-v3"},[{kind:"external",origin:"https://later.example",reason:"late"}])).rejects.toThrow(/frozen/);
});

async function capturing() {
  await source.armFileInventory(plan.id,"files");await sourceAvailability.observeArmedInventory(plan.id,"files");
  const cost=await source.protect(plan.id, { receiptId: "protection", protocol: 1, manifestDigest: plan.manifestDigest,inventoryId:"files" });
  await source.beginCopy(plan.id);
  await source.beginReplay(plan.id);
  return cost;
}
it.each(["correct","delete"])("fix1 rejects unresolved sealed file history after current notice %s and replays the same history after origin approval",async(mode)=>{
  await sourceDb.prepare("INSERT INTO notices(id,content,related_member_uids,image_urls) VALUES(905,'history','[1]','[\"/profile/bing_hayu.webp\"]')").run();
  await ready();
  const header=await source.describeBaseline(plan.id);
  await source.admit(admission("history-unknown"));
  await source.commit(plan.id,"history-unknown",1,[sourceDb.prepare("UPDATE notices SET image_urls='[\"https://history.example/profile/bing_hayu.webp\"]' WHERE id=905")]);
  await source.admit(admission("history-fix"));
  await source.commit(plan.id,"history-fix",1,[sourceDb.prepare(mode==="delete"?"DELETE FROM notices WHERE id=905":"UPDATE notices SET image_urls='[\"/profile/bing_hayu.webp\"]' WHERE id=905")]);
  const sealed=await sourceDb.prepare("SELECT before_json,after_json FROM content_transition_journal WHERE row_table='notices' AND row_key='[905]' ORDER BY seq").all();
  await expect(source.freeze(plan.id,now)).rejects.toThrow(/manifest/);
  await expect(source.exportProjectedCommits(plan.id,header.boundary)).rejects.toThrow(/classification/);
  const revision=await source.appendClassifications(plan.id,{revision:0,digest:plan.manifestDigest},[],"history-approved",{receiptId:"history-reviewed",protocol:1,manifestDigest:"history-approved"},[{kind:"external",origin:"https://history.example",reason:"Approved external-only original history"}]);
  await target.acceptManifestRevision(revision);
  await source.acknowledgeIngress(await target.openIngress(plan.id,"history-ready",2000),now);
  await target.installFence(await source.freeze(plan.id,now));
  await target.beginBaseline(header);
  let cursor:Awaited<ReturnType<typeof source.exportBaselinePage>>["next"]|0=0;
  do{const page=await source.exportBaselinePage(header,cursor);await target.stageBaselinePage(page);cursor=page.next;}while(cursor.ordinal<header.rows);
  while(await target.materializeBaselinePage(plan.id)){ /* actual bounded installer */ }
  await target.finalizeBaseline(plan.id);
  expect((await source.describeBaseline(plan.id)).fileInventory).toEqual(header.fileInventory);
  await transferStaticProof();
  expect(await targetDb.prepare("SELECT plan_json,manifest_revision,expected_digest FROM content_transition_file_inventories WHERE transition_id=? AND state='received'").bind(plan.id).first()).toEqual({plan_json:JSON.stringify(header.fileInventory!.plan),manifest_revision:header.fileInventory!.manifestRevision,expected_digest:header.fileInventory!.digest});
  for(const commit of await source.exportProjectedCommits(plan.id,header.boundary)) await target.installProjectedCommit(commit);
  expect(await targetDb.prepare("SELECT image_urls FROM notices WHERE id=905").first("image_urls")).toBe(mode==="delete"?null:'["/profile/bing_hayu.webp"]');
  expect((await sourceDb.prepare("SELECT before_json,after_json FROM content_transition_journal WHERE row_table='notices' AND row_key='[905]' ORDER BY seq").all()).results).toEqual(sealed.results);
});
it.each(["/profile//bing_hayu.webp","/profile/bing_hayu.webp/","/r2-assets/notices//thumbnails/a.webp"])("fix1 rejects noncanonical slash path at the actual final fence: %s",async(raw)=>{
  await ready();
  await source.admit(admission("slash"));
  await source.commit(plan.id,"slash",1,[sourceDb.prepare("INSERT INTO notices(id,content,related_member_uids,image_urls) VALUES(906,'slash','[1]',?)").bind(JSON.stringify([raw]))]);
  await expect(source.freeze(plan.id,now)).rejects.toThrow(/manifest/);
});
async function ready() {
  await capturing();
  const receipt = await target.openIngress(plan.id, "ingress-1", 1000);
  await source.acknowledgeIngress(receipt, now);
  return receipt;
}
it.each(["/%GG%2f..%2fprofile/bing_hayu.webp","/%ff%2f..%2fprofile/bing_hayu.webp","/\\foreign.example/../../profile/bing_hayu.webp","/\t\\foreign.example/../../profile/bing_hayu.webp","/\n\\foreign.example/../../profile/bing_hayu.webp","/\r\\foreign.example/../../profile/bing_hayu.webp","/%5cforeign.example%2F..%2F..%2Fprofile/bing_hayu.webp","/%2fforeign.example%2F..%2F..%2Fprofile/bing_hayu.webp"].flatMap(raw=>["current","corrected history"].map(mode=>({raw,mode}))))("fix2 rejects an authority-changing path in actual D1 $mode $raw while source work continues",async({mode,raw})=>{
  await ready();
  await source.admit(admission("authority-path"));
  await source.commit(plan.id,"authority-path",1,[sourceDb.prepare("INSERT INTO notices(id,content,related_member_uids,image_urls) VALUES(908,'authority','[1]',?)").bind(JSON.stringify([raw]))]);
  if(mode==="corrected history") {
    await source.admit(admission("authority-correction"));
    await source.commit(plan.id,"authority-correction",1,[sourceDb.prepare("UPDATE notices SET image_urls='[]' WHERE id=908")]);
  }
  const original=(await sourceDb.prepare("SELECT * FROM content_transition_journal WHERE row_table='notices' AND row_key='[908]' ORDER BY seq").all()).results;
  const before=await sourceDb.prepare("SELECT * FROM content_transitions WHERE id=?").bind(plan.id).first();
  await expect(source.freeze(plan.id,now)).rejects.toThrow(/manifest/);
  expect(await sourceDb.prepare("SELECT * FROM content_transitions WHERE id=?").bind(plan.id).first()).toEqual(before);
  await source.admit(admission("ordinary-after-authority"));
  const command=await source.readExecutableCommand(plan.id,"ordinary-after-authority");
  await source.commit(plan.id,"ordinary-after-authority",1,[sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,start_time,title,status) VALUES(?,?,?,?,?,?)").bind(command.payload.id,command.payload.member_uid,command.payload.date,command.payload.start_time,command.payload.title,command.payload.status)]);
  expect(await sourceDb.prepare("SELECT title FROM schedules WHERE id=1").first("title")).toBe("accepted edit");
  expect((await sourceDb.prepare("SELECT * FROM content_transition_journal WHERE row_table='notices' AND row_key='[908]' ORDER BY seq").all()).results).toEqual(original);
});
async function installTail() {
  const header=await source.describeBaseline(plan.id);
  await target.beginBaseline(header);
  let cursor: Awaited<ReturnType<typeof source.exportBaselinePage>>["next"]|0=0;
  do { const page=await source.exportBaselinePage(header,cursor); await target.stageBaselinePage(page); cursor=page.next; } while(cursor.ordinal<header.rows);
  while(await target.materializeBaselinePage(plan.id)) { /* bounded pages */ }
  await target.finalizeBaseline(plan.id);
  const costs=[];
  for(const commit of await source.exportProjectedCommits(plan.id,header.boundary)) costs.push(await target.installProjectedCommit(commit));
  await transferStaticProof();
  return costs;
}
async function transferStaticProof() {
  const row=(await sourceDb.prepare("SELECT plan_json,manifest_revision,fence_json FROM content_transitions WHERE id=?").bind(plan.id).first<{plan_json:string;manifest_revision:number;fence_json:string}>())!;
  if(!row.fence_json) return; // Copy/replay may precede the final availability fence.
  const context:FileAvailabilityContext={plan:JSON.parse(row.plan_json),manifestRevision:row.manifest_revision,fence:JSON.parse(row.fence_json)};
  for(let offset=0;;) {const page=await sourceAvailability.exportInventoryPage(context,offset);await targetAvailability.receiveInventoryPage(context,page);offset=page.next.ordinal;if(offset===page.header.rows) break;}
  for(const observation of await sourceAvailability.observeStatic(context)) await targetAvailability.receiveSourceStatic(context,observation);
}
async function transferAndActivate() {
  const fence = await source.freeze(plan.id, now);
  await target.installFence(fence);
  for (const envelope of await source.exportFrozenOperations(plan.id)) await target.receiveOperation(envelope);
  for (const envelope of await source.exportFrozenFileIntents(plan.id)) await target.receiveFileIntent(envelope);
  await installTail();
  await target.installCommittedState(plan.id);
  await target.activate(plan.id);
  return fence;
}

/** Delay only the indicated real D1 write; all reads and both competing writes
 * still run through the actual repository and D1 runtime. */
function interleave(db:D1Database,match:string|"batch",competing:()=>Promise<unknown>):D1Database {
  let fired=false;
  const sqlByStatement=new WeakMap<D1PreparedStatement,string>();
  const before=async(sql:string)=>{if(!fired && (match==="batch" || sql.includes(match))) {fired=true;await competing();}};
  const statement=(value:D1PreparedStatement,sql:string):D1PreparedStatement=>{const wrapped=new Proxy(value,{get(target,key){
    if(key==="bind") return (...args:unknown[])=>statement(target.bind(...args),sql);
    if(key==="run") return async()=>{await before(sql);return target.run();};
    const member=Reflect.get(target,key);return typeof member==="function"?member.bind(target):member;
  }});sqlByStatement.set(wrapped,sql);return wrapped;};
  return new Proxy(db,{get(target,key){
    if(key==="prepare") return (sql:string)=>statement(target.prepare(sql),sql);
    if(key==="batch") return async(values:D1PreparedStatement[])=>{if(match==="batch") await before("");else for(const value of values) await before(sqlByStatement.get(value)??"");return target.batch(values);};
    const member=Reflect.get(target,key);return typeof member==="function"?member.bind(target):member;
  }});
}

it("fix1 reads late sealed file history inside the fence batch and rolls back all fence state",async()=>{
  await ready();
  const before=await sourceDb.prepare("SELECT phase,fence_json,manifest_revision,manifest_digest,readiness_json,checkpoint_revision FROM content_transitions WHERE id=?").bind(plan.id).first();
  const raced=new D1TransitionRepository(interleave(sourceDb,"batch",async()=>{
    await source.admit(admission("late-file"));
    await source.commit(plan.id,"late-file",1,[sourceDb.prepare("INSERT INTO notices(id,content,related_member_uids,image_urls) VALUES(907,'late history','[1]','[\"https://late.example/profile/bing_hayu.webp\"]')")]);
    await source.admit(admission("late-correction"));
    await source.commit(plan.id,"late-correction",1,[sourceDb.prepare("DELETE FROM notices WHERE id=907")]);
  }),"otw","source-db");
  await expect(raced.freeze(plan.id,now)).rejects.toThrow(/manifest/);
  expect(await sourceDb.prepare("SELECT phase,fence_json,manifest_revision,manifest_digest,readiness_json,checkpoint_revision FROM content_transitions WHERE id=?").bind(plan.id).first()).toEqual(before);
  expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_operations WHERE generation=1 AND outcome_json IS NOT NULL").first("n")).toBe(2);
  await source.admit(admission("ordinary-after-file-conflict"));
  await source.commit(plan.id,"ordinary-after-file-conflict",1,[sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,status) VALUES(1,1,'2026-10-14','방송')")]);
});

describe("real D1 transition control", () => {
  it("fix2 admits a known nonselected schedule into scope and transfers only its selected committed image",async()=>{
    for(const db of [sourceDb,targetDb]) await db.prepare("DELETE FROM content_transitions").run();
    const mapped={...plan,members:plan.members.map(member=>({...member,targetUid:member.uid+10}))};
    await source.prepare(mapped);await target.prepare(mapped);
    await sourceDb.batch([
      sourceDb.prepare("INSERT INTO members(uid,code,name) VALUES(90,'unrelated','Unrelated private member')"),
      sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(7,90,'2026-10-14','Private prior title','방송')"),
    ]);
    await ready();
    const requested={...admission("scope-entry"),subject:{table:"schedules",key:"[7]"},payload:{...admission("unused").payload,id:7,title:"Selected correction"}};
    const accepted=await source.admit(requested);
    expect(accepted.expectedState).toBeNull();
    expect(JSON.stringify(accepted)).not.toContain("Private prior title");
    expect(JSON.stringify(accepted)).not.toContain("sourceExpectedState");
    expect(accepted.payload.member_uid).toBe(11);
    const localState=await sourceDb.prepare("SELECT json_extract(envelope_json,'$.sourceExpectedState.member_uid') member_uid,json_extract(envelope_json,'$.sourceExpectedState.title') title FROM content_transition_operations WHERE operation_id='scope-entry'").first();
    expect(localState).toEqual({member_uid:90,title:"Private prior title"});
    const command=await source.readExecutableCommand(plan.id,"scope-entry");
    await source.commit(plan.id,"scope-entry",1,[sourceDb.prepare("UPDATE schedules SET member_uid=?,title=? WHERE id=?").bind(command.payload.member_uid,command.payload.title,command.payload.id)]);
    expect(await sourceDb.prepare("SELECT member_uid,title FROM schedules WHERE id=7").first()).toEqual({member_uid:1,title:"Selected correction"});
    await transferAndActivate();
    expect(await targetDb.prepare("SELECT member_uid,title FROM schedules WHERE id=7").first()).toEqual({member_uid:11,title:"Selected correction"});
    expect((await targetDb.prepare("SELECT uid FROM members ORDER BY uid").all()).results).toEqual([{uid:11},{uid:12},{uid:13}]);
    expect(JSON.stringify(await target.exportOperation(plan.id,"scope-entry"))).not.toContain("Private prior title");
  });
  it("fix2 preserves held scope-entry absence across source progress and conflicts with a newer native target edit",async()=>{
    for(const db of [sourceDb,targetDb]) await db.prepare("DELETE FROM content_transitions").run();
    const mapped={...plan,members:plan.members.map(member=>({...member,targetUid:member.uid+10}))};
    await source.prepare(mapped);await target.prepare(mapped);
    await sourceDb.batch([
      sourceDb.prepare("INSERT INTO members(uid,code,name) VALUES(90,'unrelated','Unrelated')"),
      sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(7,90,'2026-10-14','Outside scope','방송')"),
    ]);
    await ready();
    const held={...admission("held-entry"),subject:{table:"schedules",key:"[7]"},payload:{...admission("unused").payload,id:7,title:"Held correction"}};
    const original=await source.admit(held);
    await source.admit({...held,operationId:"source-entry",idempotencyKey:"source-entry",payload:{...held.payload,title:"Source correction"}});
    await source.commit(plan.id,"source-entry",1,[sourceDb.prepare("UPDATE schedules SET member_uid=1,title='Source correction' WHERE id=7")]);
    expect(await source.admit(held)).toEqual(original);
    await transferAndActivate();
    const current={...held,operationId:"native-edit",idempotencyKey:"native-edit",payload:{...held.payload,member_uid:11,title:"New target edit"}};
    const native=await target.admit(current);
    expect(native.expectedState).toMatchObject({member_uid:11,title:"Source correction"});
    await target.commit(plan.id,"native-edit",2,[targetDb.prepare("UPDATE schedules SET title='New target edit' WHERE id=7")]);
    const executable=await target.readExecutableCommand(plan.id,"held-entry");
    await expect(target.commit(plan.id,"held-entry",2,[targetDb.prepare("UPDATE schedules SET member_uid=?,title=? WHERE id=?").bind(executable.payload.member_uid,executable.payload.title,executable.payload.id)])).rejects.toThrow(/Expected/);
    expect(await targetDb.prepare("SELECT member_uid,title FROM schedules WHERE id=7").first()).toEqual({member_uid:11,title:"New target edit"});
    expect((await target.exportOperation(plan.id,"held-entry")).expectedState).toBeNull();
    expect((await target.exportOperation(plan.id,"held-entry")).outcome?.outcome).toBe("conflicted");
    expect(await targetDb.prepare("SELECT count(*) FROM members").first("count(*)")).toBe(3);
  });
  it.each(["unknown-member","unsupported-image"] as const)("fix2 never interprets %s as valid prior absence",async(kind)=>{
    if(kind==="unsupported-image") await sourceDb.prepare("INSERT INTO members(uid,code,name) VALUES(90,'unrelated','Unrelated')").run();
    await sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(7,90,'2026-10-14',?,'방송')").bind(kind==="unsupported-image"?new Uint8Array([0,1]).buffer:"Valid text").run();
    await ready();
    await expect(source.admit({...admission("invalid-entry"),subject:{table:"schedules",key:"[7]"},payload:{...admission("unused").payload,id:7}})).rejects.toThrow();
    expect(await source.readOperation(plan.id,"invalid-entry")).toBeNull();
  });
  it("fix1 merges source progress after early operation and file reception without re-execution",async()=>{
    await ready();
    await source.admit(admission("early"));
    await source.recordFileIntent(plan.id,"early",{intentId:"early-file",logicalKey:"file",versionKey:"v/file",previousVersion:null,hash:null,size:null,status:"unknown"});
    const early=await source.exportOperation(plan.id,"early"),earlyFile=await source.exportFileIntent(plan.id,"early-file");
    await target.receiveOperation(early);await target.receiveFileIntent(earlyFile);
    await source.recordAttempt(plan.id,"early",{identity:"provider-early",status:"completed"});
    await source.recordFileObservation(plan.id,"early-file",{transitionId:plan.id,intentId:"early-file",generation:1,site:"otw",resource:"otw-bucket",objectVersion:null,copiedFromEvidenceId:null,evidenceId:"absent",versionKey:"v/file",result:"absent",hash:null,size:null,observedAt:101});
    await source.recordFileOutcome(plan.id,"early-file","absent","failed","Upload was absent");
    await source.commit(plan.id,"early",1,[sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(1,1,'2026-10-14','Completed on source','방송')")]);
    await transferAndActivate();
    expect((await target.exportOperation(plan.id,"early")).attempt).toEqual({identity:"provider-early",status:"completed"});
    expect((await target.exportOperation(plan.id,"early")).outcome).toMatchObject({outcome:"committed",sideEffectReconciled:true});
    expect((await target.exportFileIntent(plan.id,"early-file")).outcome).toEqual({outcome:"failed",detail:"Upload was absent",sideEffectReconciled:true});
    await target.receiveOperation(early);await target.receiveFileIntent(earlyFile);
    await expect(target.readExecutableCommand(plan.id,"early")).rejects.toThrow(/terminal/);
    expect(await targetDb.prepare("SELECT title FROM schedules WHERE id=1").first("title")).toBe("Completed on source");
  });
  it("fix1 requires a frozen source export after an early transfer before activating",async()=>{
    await ready();await source.admit(admission("early-pending"));
    const early=await source.exportOperation(plan.id,"early-pending");await target.receiveOperation(early);
    await target.installFence(await source.freeze(plan.id,now));await installTail();await target.installCommittedState(plan.id);
    await target.receiveOperation(early);
    await expect(target.activate(plan.id)).rejects.toThrow(/transferred/);
    await target.receiveOperation(await source.exportOperation(plan.id,"early-pending"));await target.activate(plan.id);
    await target.recordAttempt(plan.id,"early-pending",{identity:"target-attempt",status:"completed"});
    await target.recordOutcome(plan.id,"early-pending",{outcome:"failed",detail:"Target handled",sideEffectReconciled:true});
    await target.receiveOperation(early);
    expect((await target.exportOperation(plan.id,"early-pending")).attempt?.identity).toBe("target-attempt");
    expect((await target.exportOperation(plan.id,"early-pending")).outcome?.detail).toBe("Target handled");
  });
  it("fix1 preserves a schedule save expected state across handoff and rejects a late overwrite",async()=>{
    await sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(1,1,'2026-10-14','Original','방송')").run();
    await ready();await source.admit(admission("held-schedule"));await transferAndActivate();
    await target.admit({...admission("new-schedule"),payload:{...admission("x").payload,title:"New edit"}});
    await target.commit(plan.id,"new-schedule",2,[targetDb.prepare("UPDATE schedules SET title='New edit' WHERE id=1")]);
    const accepted=await target.exportOperation(plan.id,"new-schedule");
    expect(await target.admit({...admission("new-schedule"),payload:{...admission("x").payload,title:"New edit"}})).toEqual(accepted);
    await expect(target.commit(plan.id,"held-schedule",2,[targetDb.prepare("UPDATE schedules SET title='Old held save' WHERE id=1")])).rejects.toThrow(/Expected/);
    expect(await targetDb.prepare("SELECT title FROM schedules WHERE id=1").first("title")).toBe("New edit");
    expect((await target.exportOperation(plan.id,"held-schedule")).outcome?.outcome).toBe("conflicted");
  });
  it("fix1 requires a final file seal and preserves target outcome against stale file retransmission",async()=>{
    await ready();await source.admit(admission("file-seal"));
    await source.recordFileIntent(plan.id,"file-seal",{intentId:"sealed-file",logicalKey:"image",versionKey:"version/image",previousVersion:null,hash:null,size:null,status:"unknown"});
    await target.receiveOperation(await source.exportOperation(plan.id,"file-seal"));
    const early=await source.exportFileIntent(plan.id,"sealed-file");await target.receiveFileIntent(early);
    const fence=await source.freeze(plan.id,now);await target.installFence(fence);
    await target.receiveOperation(await source.exportOperation(plan.id,"file-seal"));
    await installTail();await target.installCommittedState(plan.id);
    await expect(target.activate(plan.id)).rejects.toThrow(/transferred/);
    const sealed=await source.exportFileIntent(plan.id,"sealed-file");
    await expect(target.receiveFileIntent({...sealed,sourceFence:{...fence,boundary:fence.boundary+1}})).rejects.toThrow(/fence/);
    expect(await targetDb.prepare("SELECT transferred FROM content_transition_file_intents WHERE intent_id='sealed-file'").first("transferred")).toBe(0);
    await target.receiveFileIntent(sealed);await target.activate(plan.id);
    await target.recordFileObservation(plan.id,"sealed-file",{transitionId:plan.id,intentId:"sealed-file",generation:1,site:"luvdia",resource:"luvdia-bucket",objectVersion:null,copiedFromEvidenceId:null,evidenceId:"target-absent",versionKey:"version/image",result:"absent",hash:null,size:null,observedAt:101});
    await target.recordFileOutcome(plan.id,"sealed-file","target-absent","failed","Target confirmed absent");
    await target.receiveFileIntent(early);await target.receiveFileIntent(sealed);
    expect((await target.exportFileIntent(plan.id,"sealed-file")).outcome).toEqual({outcome:"failed",detail:"Target confirmed absent",sideEffectReconciled:true});
  });
  it.each([false,true])("fix1 renews expired readiness with prior source ACK=%s",async(acknowledged)=>{
    await capturing();const old=await target.openIngress(plan.id,"expiring",101);
    if(acknowledged) await source.acknowledgeIngress(old,100);
    await expect(source.acknowledgeIngress(old,102)).rejects.toThrow(/expired/);
    const renewed=await target.openIngress(plan.id,"renewed",1000);
    expect(renewed.receiptId).toBe("renewed");
    expect(await target.openIngress(plan.id,"renewed",1000)).toEqual(renewed);
    await source.acknowledgeIngress(renewed,102);
    expect(await source.readReadiness(plan.id)).toEqual(renewed);
    await expect(source.acknowledgeIngress(old,100)).rejects.toThrow();
    expect((await source.freeze(plan.id,102)).manifestDigest).toBe(plan.manifestDigest);
  });
  it.each(["ack","freeze"] as const)("fix1 rejects stale %s after a classification revision without fencing source",async(action)=>{
    const old=await ready();
    await sourceDb.prepare("INSERT INTO ddays(id,title,date) VALUES(900,'Ambiguous','2026-10-14')").run();
    const concurrent=async()=>{
      const revision=await source.appendClassifications(plan.id,{revision:0,digest:plan.manifestDigest},[{table:"ddays",key:"[900]",disposition:"exclude",reason:"Reviewed unrelated"}],"next-manifest",{receiptId:"next-protection",protocol:1,manifestDigest:"next-manifest"});
      await target.acceptManifestRevision(revision);
      if(action==="freeze") await source.acknowledgeIngress(await target.openIngress(plan.id,"next-ready",2000),now);
    };
    // For ACK, renew the old manifest receipt so this is a real replacement.
    const receipt=action==="ack"?await target.openIngress(plan.id,"old-renewal",1500):old;
    const raced=new D1TransitionRepository(interleave(sourceDb,action==="ack"?"SET phase='target_ingress_ready'":"SET phase=iif",concurrent),"otw","source-db");
    await expect(action==="ack"?raced.acknowledgeIngress(receipt,now):raced.freeze(plan.id,now)).rejects.toThrow();
    expect(await sourceDb.prepare("SELECT fence_json FROM content_transitions WHERE id='move'").first("fence_json")).toBeNull();
    expect((await source.readTransition(plan.id)).manifestDigest).toBe("next-manifest");
    await source.admit(admission("after-race"));await source.commit(plan.id,"after-race",1,[sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,status) VALUES(1,1,'2026-10-14','방송')")]);
    await source.acknowledgeIngress(await target.openIngress(plan.id,"next-ready",2000),now);
    const fence=await source.freeze(plan.id,now);expect(fence.manifestDigest).toBe("next-manifest");await target.installFence(fence);
  });
  it("fix1 rejects target renewal when a classification revision wins the write race",async()=>{
    await ready();await target.admit(admission("target-accepted"));
    await sourceDb.prepare("INSERT INTO ddays(id,title,date) VALUES(900,'Ambiguous','2026-10-14')").run();
    const revision=await source.appendClassifications(plan.id,{revision:0,digest:plan.manifestDigest},[{table:"ddays",key:"[900]",disposition:"exclude",reason:"Reviewed unrelated"}],"renewal-revision",{receiptId:"renewal-protection",protocol:1,manifestDigest:"renewal-revision"});
    const raced=new D1TransitionRepository(interleave(targetDb,"SET phase='target_ingress_ready'",()=>target.acceptManifestRevision(revision)),"luvdia","target-db");
    await expect(raced.openIngress(plan.id,"stale-renewal",1500)).rejects.toThrow(/race/);
    expect(await target.readReadiness(plan.id)).toBeNull();
    expect((await target.exportOperation(plan.id,"target-accepted")).outcome).toBeNull();
    const fresh=await target.openIngress(plan.id,"fresh-revision",2000);await source.acknowledgeIngress(fresh,now);
    expect((await source.freeze(plan.id,now)).manifestDigest).toBe("renewal-revision");
  });
  it("fix1 retains terminal attempt state when a stale callback writes after completion",async()=>{
    await ready();await source.admit(admission("attempt-race"));
    await source.recordAttempt(plan.id,"attempt-race",{identity:"same",status:"unknown"});
    const raced=new D1TransitionRepository(interleave(sourceDb,"SET attempt_json=?",()=>source.recordAttempt(plan.id,"attempt-race",{identity:"same",status:"completed"})),"otw","source-db");
    await expect(raced.recordAttempt(plan.id,"attempt-race",{identity:"same",status:"unknown"})).rejects.toThrow();
    expect((await source.exportOperation(plan.id,"attempt-race")).attempt?.status).toBe("completed");
  });
  it("fix1 derives committed reconciliation from the attempt in the actual business transaction",async()=>{
    await ready();await source.admit(admission("commit-race"));
    const raced=new D1TransitionRepository(interleave(sourceDb,"batch",()=>source.recordAttempt(plan.id,"commit-race",{identity:"arriving",status:"unknown"})),"otw","source-db");
    await raced.commit(plan.id,"commit-race",1,[sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,status) VALUES(1,1,'2026-10-14','방송')")]);
    const actual=await source.exportOperation(plan.id,"commit-race");
    expect(actual.attempt?.status).toBe("unknown");expect(actual.outcome?.sideEffectReconciled).toBe(false);
    await transferAndActivate();await expect(target.readOutcomeReceipt(plan.id,"operation","commit-race")).rejects.toThrow(/reconciled/);
    await expect(target.complete(plan.id)).rejects.toThrow();
  });
  it("fix1 refuses reconciled disposition when an unknown attempt arrives before its write",async()=>{
    await ready();await source.admit(admission("outcome-race"));
    const raced=new D1TransitionRepository(interleave(sourceDb,"SET outcome_json=?",()=>source.recordAttempt(plan.id,"outcome-race",{identity:"arriving",status:"unknown"})),"otw","source-db");
    await expect(raced.recordOutcome(plan.id,"outcome-race",{outcome:"failed",detail:"No effect",sideEffectReconciled:true})).rejects.toThrow();
    expect((await source.exportOperation(plan.id,"outcome-race")).outcome).toBeNull();
  });
  it("keeps sanitized source command coordinates local and executes the projected command only under target ownership",async()=>{
    for(const db of [sourceDb,targetDb]) await db.prepare("DELETE FROM content_transitions").run();
    const mapped={...plan,members:plan.members.map(member=>({...member,targetUid:member.uid+10}))};
    await source.prepare(mapped);await target.prepare(mapped);
    await sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(7,1,'2026-10-14','Source held','방송')").run();
    await ready();
    const operation={...admission("real-schedule-command"),subject:{table:"schedules",key:"[7]"},payload:{...admission("unused").payload,id:7,title:"Projected actual edit",actorUserId:"private-source-actor"}};
    await source.admit(operation);
    const local=await source.readExecutableCommand(plan.id,operation.operationId);
    expect(local.payload.member_uid).toBe(1);
    expect(JSON.stringify(local)).not.toContain("private-source-actor");
    const wire=await source.exportOperation(plan.id,operation.operationId);
    expect(wire.payload.member_uid).toBe(11);
    expect(JSON.stringify(wire)).not.toContain("sourceCommand");
    await target.receiveOperation(wire);
    await expect(target.readExecutableCommand(plan.id,operation.operationId)).rejects.toThrow(/fenced/);
    await transferAndActivate();
    await expect(source.readExecutableCommand(plan.id,operation.operationId)).rejects.toThrow(/fenced/);
    const command=await target.readExecutableCommand(plan.id,operation.operationId);
    await target.commit(plan.id,operation.operationId,2,[targetDb.prepare("UPDATE schedules SET member_uid=?,title=? WHERE id=?").bind(command.payload.member_uid as number,command.payload.title as string,command.payload.id as number)]);
    expect(await targetDb.prepare("SELECT member_uid,title FROM schedules WHERE id=7").first()).toEqual({member_uid:11,title:"Projected actual edit"});
    expect(await sourceDb.prepare("SELECT member_uid,title FROM schedules WHERE id=7").first()).toEqual({member_uid:1,title:"Source held"});
  });
  it("rejects forged identity proofs and normalized name/alias ambiguity without closing source work",async()=>{
    await sourceDb.batch([
      sourceDb.prepare("INSERT INTO members(uid,code,name) VALUES(90,'other','Ｋａｙ！')"),
      sourceDb.prepare("INSERT INTO music_ingestion_candidates(id,external_video_id,first_discovered_at,last_discovered_at,retention_expires_at,created_at,updated_at,review_input_json) VALUES('identity-conflict','abcdefghijk',1,1,999,1,1,?)").bind(JSON.stringify({participants:[{subject:{kind:"member",memberUid:1}},{subject:{kind:"member",memberUid:90}},{subject:{kind:"entity",entityId:"different-kay"}}]})),
      sourceDb.prepare("INSERT INTO music_entities(id,entity_kind,display_name,normalized_name,slug,created_at,updated_at) VALUES('different-kay','person','Kay','kay','different-kay',1,1)"),
    ]);
    await ready();
    await expect(source.validateIdentityProjection(plan.id)).rejects.toThrow(/identity\/name\/alias/);
    await expect(source.freeze(plan.id,now)).rejects.toThrow(/manifest/i);
    await source.admit(admission("forged-identity"));
    const tail=await sourceDb.prepare("SELECT max(seq) n FROM content_transition_journal").first("n");
    await expect(source.commit(plan.id,"forged-identity",1,[sourceDb.prepare("UPDATE schedules SET title='should rollback'"),sourceDb.prepare("UPDATE content_transition_identity_proofs SET normalized_name='forged' WHERE member_uid=90")])).rejects.toThrow(/internal_proof|binding_immutable/);
    expect(await sourceDb.prepare("SELECT max(seq) n FROM content_transition_journal").first("n")).toBe(tail);
    expect(await sourceDb.prepare("SELECT normalized_name FROM content_transition_identity_proofs WHERE member_uid=90").first("normalized_name")).toBe("kay");
    await source.admit(admission("resolve-name"));
    await source.commit(plan.id,"resolve-name",1,[sourceDb.prepare("UPDATE music_entities SET display_name='Distinct person',normalized_name='distinct person' WHERE id='different-kay'"),sourceDb.prepare("INSERT INTO music_entity_aliases(entity_id,alias,normalized_alias) VALUES('different-kay','Kay!','kay')")]);
    await expect(source.validateIdentityProjection(plan.id)).rejects.toThrow(/identity\/name\/alias/);
    await expect(source.freeze(plan.id,now)).rejects.toThrow(/manifest/i);
    await source.admit(admission("resolve-alias"));
    await source.commit(plan.id,"resolve-alias",1,[sourceDb.prepare("DELETE FROM music_entity_aliases WHERE entity_id='different-kay'")]);
    expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_identity_conflicts WHERE reason='ambiguous historical alias'").first<number>("n")).toBeGreaterThan(0);
    await expect(source.validateIdentityProjection(plan.id)).rejects.toThrow(/normalized external name collision/);
    await expect(source.freeze(plan.id,now)).rejects.toThrow(/immutable identity.*commit_seq.*row_key/);
    expect((await source.readTransition(plan.id)).phase).toBe("target_ingress_ready");
    await source.admit(admission("after-immutable-conflict"));
    await source.commit(plan.id,"after-immutable-conflict",1,[sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,status) VALUES(9,1,'2026-10-14','방송')")]);
  });
  it("binds external member persona to sealed facts across canonical entity appearance and deletion",async()=>{
    await sourceDb.batch([
      sourceDb.prepare("INSERT INTO members(uid,code,name) VALUES(90,'other','Ｋａｙ！')"),
      sourceDb.prepare("INSERT INTO music_ingestion_candidates(id,external_video_id,first_discovered_at,last_discovered_at,retention_expires_at,created_at,updated_at,review_input_json) VALUES('persona-candidate','abcdefghijk',1,1,999,1,1,?)").bind(JSON.stringify({participants:[{subject:{kind:"member",memberUid:1}},{subject:{kind:"member",memberUid:90}}]})),
    ]);
    await ready();
    await expect(source.freeze(plan.id,now)).rejects.toThrow(/identity|manifest/);
    await source.validateIdentityProjection(plan.id);
    await installTail();
    const projected=JSON.parse((await targetDb.prepare("SELECT review_input_json FROM music_ingestion_candidates WHERE id='persona-candidate'").first<string>("review_input_json"))!);
    const entityId=projected.participants[1].subject.entityId;
    expect(entityId).toMatch(/^external-[a-f0-9]{64}$/);
    expect(await targetDb.prepare("SELECT member_uid,display_name,normalized_name FROM music_entities WHERE id=?").bind(entityId).first()).toEqual({member_uid:null,display_name:"Ｋａｙ！",normalized_name:"kay"});
    await source.admit(admission("canonical-appears"));
    await source.commit(plan.id,"canonical-appears",1,[sourceDb.prepare("INSERT INTO music_entities(id,member_uid,entity_kind,display_name,normalized_name,slug,created_at,updated_at) VALUES('later-canonical',90,'person','Canonical Kay','canonical kay','later-canonical',1,1)"),sourceDb.prepare("INSERT INTO music_entity_aliases(entity_id,alias,normalized_alias) VALUES('later-canonical','Kay alias','kay alias')")]);
    await installTail();
    expect(await targetDb.prepare("SELECT display_name FROM music_entities WHERE id=?").bind(entityId).first("display_name")).toBe("Canonical Kay");
    expect(await targetDb.prepare("SELECT entity_id FROM music_entity_aliases WHERE normalized_alias='kay alias'").first("entity_id")).toBe(entityId);
    await source.admit(admission("canonical-deleted"));
    await source.commit(plan.id,"canonical-deleted",1,[sourceDb.prepare("DELETE FROM music_entities WHERE id='later-canonical'")]);
    await installTail();
    expect(await targetDb.prepare("SELECT display_name FROM music_entities WHERE id=?").bind(entityId).first("display_name")).toBe("Ｋａｙ！");
    expect(await targetDb.prepare("SELECT count(*) n FROM music_entity_aliases WHERE entity_id=?").bind(entityId).first("n")).toBe(0);
    await source.admit(admission("persona-change"));
    await source.commit(plan.id,"persona-change",1,[sourceDb.prepare("UPDATE members SET name='Kay current' WHERE uid=90")]);
    await expect(source.freeze(plan.id,now)).rejects.toThrow(/identity|manifest/);
    await source.admit(admission("source-still-writable"));
    await source.commit(plan.id,"source-still-writable",1,[sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,status) VALUES(9,1,'2026-10-14','방송')")]);
    await source.validateIdentityProjection(plan.id);
    const identityCost=await sourceDb.prepare("SELECT * FROM content_transition_identity_conflicts WHERE transition_id=?").bind(plan.id).all();
    expect(identityCost.results).toEqual([]);
    console.info("actual identity history validation",JSON.stringify(identityCost.meta));
    await target.installFence(await source.freeze(plan.id,now));
    await installTail();
    expect(await targetDb.prepare("SELECT count(*) n FROM members").first("n")).toBe(3);
    expect(await targetDb.prepare("SELECT display_name FROM music_entities WHERE id=?").bind(entityId).first("display_name")).toBe("Kay current");
  });
  it("keeps immutable invalid JSON history fenced from handoff after current source work is corrected", async () => {
    const known={participants:[{subject:{kind:"member",memberUid:1},participantRole:"vocal",creditOrder:0,creditNameSnapshot:"Bing"}]};
    const unknown={...known,futureExecutionPayload:{actor:"private"}};
    await sourceDb.prepare("INSERT INTO music_ingestion_candidates(id,external_video_id,first_discovered_at,last_discovered_at,retention_expires_at,created_at,updated_at,review_input_json) VALUES('unknown-json','abcdefghijk',1,1,999,1,1,?)").bind(JSON.stringify(unknown)).run();
    await expect(source.prepare(plan)).rejects.toThrow(/JSON|shape|reference|manifest/i);
    await expect(capturing()).rejects.toThrow(/JSON|shape|reference|manifest/i);
    await sourceDb.prepare("UPDATE music_ingestion_candidates SET review_input_json=? WHERE id='unknown-json'").bind(JSON.stringify(known)).run();
    await ready();
    await source.admit(admission("missing-member-reference"));
    await source.commit(plan.id,"missing-member-reference",1,[sourceDb.prepare("UPDATE music_ingestion_candidates SET review_input_json=? WHERE id='unknown-json'").bind(JSON.stringify({participants:[...known.participants,{subject:{kind:"member",memberUid:999},participantRole:"vocal",creditOrder:1,creditNameSnapshot:"Unknown"}]}))]);
    await expect(source.freeze(plan.id,now)).rejects.toThrow(/JSON|shape|reference|manifest/i);
    await source.admit(admission("unknown-reference"));
    await source.commit(plan.id,"unknown-reference",1,[sourceDb.prepare("UPDATE music_ingestion_candidates SET review_input_json=? WHERE id='unknown-json'").bind(JSON.stringify({...known,song:{kind:"existing",songId:"missing-song"}}))]);
    await expect(source.freeze(plan.id,now)).rejects.toThrow(/JSON|shape|reference|manifest/i);
    await source.admit(admission("new-json"));
    await source.commit(plan.id,"new-json",1,[sourceDb.prepare("UPDATE music_ingestion_candidates SET review_input_json=? WHERE id='unknown-json'").bind(JSON.stringify(unknown))]);
    await expect(source.freeze(plan.id,now)).rejects.toThrow(/JSON|shape|reference|manifest/i);
    await source.admit(admission("resolve-json"));
    await source.commit(plan.id,"resolve-json",1,[sourceDb.prepare("UPDATE music_ingestion_candidates SET review_input_json=? WHERE id='unknown-json'").bind(JSON.stringify(known))]);
    await expect(source.freeze(plan.id,now)).rejects.toThrow(/immutable JSON.*commit_seq.*unknown-json/);
    expect((await source.readTransition(plan.id)).phase).toBe("target_ingress_ready");
    await source.admit(admission("source-after-json-conflict"));
    await source.commit(plan.id,"source-after-json-conflict",1,[sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,status) VALUES(9,1,'2026-10-14','방송')")]);
  });
  it("prepares an empty new target and materializes only its three approved owned member identities", async () => {
    expect(await targetDb.prepare("SELECT count(*) n FROM members").first("n")).toBe(0);
    await target.prepare(plan);
    await ready();
    await target.installFence(await source.freeze(plan.id,now));
    await installTail();
    expect((await targetDb.prepare("SELECT uid,code FROM members ORDER BY uid").all()).results).toEqual(plan.members.map(({code,targetUid})=>({uid:targetUid,code})));
    expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_baseline_rows WHERE row_table='members' AND installed=1").first("n")).toBe(3);
    await target.prepare(plan);
    expect(await targetDb.prepare("SELECT count(*) n FROM members").first("n")).toBe(3);
  });
  it("rejects a pre-existing target roster instead of adopting it as identity bootstrap", async () => {
    await targetDb.prepare("DELETE FROM content_transitions").run();
    await targetDb.prepare("INSERT INTO members(uid,code,name) VALUES(1,'bing_hayu','Unowned')").run();
    await expect(target.prepare(plan)).rejects.toThrow(/unowned|roster/);
    expect(await targetDb.prepare("SELECT count(*) n FROM content_transitions").first("n")).toBe(0);
  });
  it("captures known JSON dependencies and selected X handles without requiring a derived fact", async () => {
    const review={song:{kind:"existing",songId:"json-song"},participants:[{subject:{kind:"member",memberUid:1},participantRole:"vocal",creditOrder:0,creditNameSnapshot:"Bing"},{subject:{kind:"entity",entityId:"json-entity"},participantRole:"vocal",creditOrder:1,creditNameSnapshot:"External"}]};
    await sourceDb.batch([
      sourceDb.prepare("UPDATE members SET url_twitter='https://www.x.com/Hayu?lang=ko' WHERE uid=1"),
      sourceDb.prepare("UPDATE members SET url_twitter='@Lili' WHERE uid=2"),
      sourceDb.prepare("INSERT INTO music_entities(id,entity_kind,display_name,normalized_name,slug,created_at,updated_at) VALUES('json-entity','person','External','external','json-entity',1,1),('actor-private-entity','person','Actor private entity','actor private entity','actor-private-entity',1,1)"),
      sourceDb.prepare("INSERT INTO music_songs(id,slug,title,normalized_title,dedupe_key,is_otw_original,created_at,updated_at) VALUES('json-song','json-song','JSON Song','json song','json-song',0,1,1)"),
      sourceDb.prepare("INSERT INTO music_ingestion_candidates(id,external_video_id,first_discovered_at,last_discovered_at,retention_expires_at,created_at,updated_at,review_input_json) VALUES('json-candidate','abcdefghijk',1,1,999,1,1,?)").bind(JSON.stringify(review)),
      sourceDb.prepare("INSERT INTO music_catalog_events(id,aggregate_type,aggregate_id,event_type,actor_kind,actor_user_id,detail_json,created_at) VALUES('private-json-event','song','json-song','song.updated','admin','private-scalar',?,1)").bind(JSON.stringify({songId:"json-song",actorUserId:{privateValue:"private-nested",entityId:"actor-private-entity"}})),
      sourceDb.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,fetched_at) VALUES('held-post','hayu','hayu',?,'2026-10-14',1)").bind(JSON.stringify({id:"held-post",text:"Held without fact",username:"hayu"})),
      sourceDb.prepare("INSERT INTO x_post_sources(handle,last_checked_at,updated_at,sync_pagination_token,sync_base_post_id,sync_newest_post_id,next_check_at) VALUES('hayu',1,1,'page','base','newest',123),('lili',1,1,'next','other-base','other-newest',456)"),
    ]);
    await ready();
    const journal=await source.readJournal(plan.id);
    expect(journal.some(row=>row.table==="music_songs" && row.row_key==='["json-song"]')).toBe(true);
    expect(journal.some(row=>row.table==="music_entities" && row.row_key==='["json-entity"]')).toBe(true);
    expect(journal.filter(row=>row.table==="x_post_sources")).toHaveLength(2);
    expect(journal.some(row=>row.table==="x_posts")).toBe(true);
    await target.installFence(await source.freeze(plan.id,now));
    await installTail();
    expect(await targetDb.prepare("SELECT sync_pagination_token,sync_base_post_id,sync_newest_post_id,next_check_at FROM x_post_sources WHERE handle='hayu'").first()).toEqual({sync_pagination_token:"page",sync_base_post_id:"base",sync_newest_post_id:"newest",next_check_at:123});
    expect(await targetDb.prepare("SELECT title FROM music_songs WHERE id='json-song'").first("title")).toBe("JSON Song");
    expect(await targetDb.prepare("SELECT display_name FROM music_entities WHERE id='json-entity'").first("display_name")).toBe("External");
    expect(await targetDb.prepare("SELECT id FROM music_entities WHERE id='actor-private-entity'").first()).toBeNull();
    expect(JSON.stringify((await targetDb.prepare("SELECT record_json FROM content_historical_records").all()).results)).not.toContain("private-nested");
    const validation=await sourceDb.prepare("SELECT count(*) n FROM content_transition_invalid_json WHERE transition_id=?").bind(plan.id).all();
    expect(validation.results).toEqual([{n:0}]);
    console.info("actual selected JSON validation",JSON.stringify(validation.meta));
  });
  it("materializes an encoded baseline row above 1.5MB within the documented D1 row bound", async () => {
    const title="a".repeat(1_700_000);
    await sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(1,1,'2026-10-14',?,'방송')").bind(title).run();
    await ready();
    await target.installFence(await source.freeze(plan.id,now));
    await installTail();
    expect(await targetDb.prepare("SELECT length(title) n FROM schedules WHERE id=1").first("n")).toBe(title.length);
    expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_baselines WHERE receipt_json IS NOT NULL").first("n")).toBe(1);
  },30000);
  it("archives only source-local access and rejects a mixed business write under an archive permit", async () => {
    await sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(1,1,'2026-10-14','original','방송')").run();
    await ready();
    await target.installFence(await source.freeze(plan.id,now));
    await installTail();
    const journal=await source.readJournal(plan.id);
    await expect(sourceDb.prepare("UPDATE schedules SET content_access='admin_archive' WHERE id=1").run()).rejects.toThrow(/archive_control_only/);
    await expect(sourceDb.batch([
      sourceDb.prepare("INSERT INTO content_transition_commits(transition_id,operation_id) VALUES('move','mixed-archive-probe')"),
      sourceDb.prepare("INSERT INTO content_transition_permits(id,transition_id,operation_id,generation,mode,commit_seq) SELECT 1,'move','mixed-archive-probe',1,'archive',seq FROM content_transition_commits WHERE operation_id='mixed-archive-probe'"),
      sourceDb.prepare("UPDATE schedules SET content_access='admin_archive',title='forbidden mixed edit' WHERE id=1"),
    ])).rejects.toThrow(/archive_control_only/);
    expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_permits").first("n")).toBe(0);
    const receipt=await source.archiveSource(plan.id);
    expect(receipt.archivedRoots).toBe(4);
    expect(await sourceDb.prepare("SELECT title,content_access FROM schedules WHERE id=1").first()).toEqual({title:"original",content_access:"admin_archive"});
    expect(await targetDb.prepare("SELECT title,content_access FROM schedules WHERE id=1").first()).toEqual({title:"original",content_access:"normal"});
    expect(await source.readJournal(plan.id)).toEqual(journal);
    await expect(sourceDb.prepare("UPDATE schedules SET title='late' WHERE id=1").run()).rejects.toThrow(/source_root_fenced/);
  });
  it("rejects an identical unowned target collision and rolls back a grouped 60-row delta", async () => {
    await capturing();
    await source.admit(admission("collision-bulk"));
    await source.commit(plan.id,"collision-bulk",1,[sourceDb.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<60) INSERT INTO schedules(id,member_uid,date,title,status) SELECT x,1,'2026-10-14','collision-'||x,'방송' FROM n")]);
    const existing=(await sourceDb.prepare("SELECT * FROM schedules WHERE id=60").first<Record<string,string|number|null>>())!;
    const columns=Object.keys(existing);
    await targetDb.prepare(`INSERT INTO schedules(${columns.map(column=>`"${column}"`).join(",")}) VALUES(${columns.map(()=>"?").join(",")})`).bind(...Object.values(existing)).run();
    await source.acknowledgeIngress(await target.openIngress(plan.id,"collision-ingress",1000),now);
    await target.installFence(await source.freeze(plan.id,now));
    await expect(installTail()).rejects.toThrow();
    expect(await targetDb.prepare("SELECT count(*) n FROM schedules").first("n")).toBe(1);
    expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_replay").first("n")).toBe(0);
    expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_permits").first("n")).toBe(0);
    expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_materialized_rows WHERE row_table='schedules'").first("n")).toBe(0);
  });
  it("refuses unresolved manifest rows before protection and atomically at the final fence", async () => {
    await sourceDb.prepare("INSERT INTO ddays(id,title,date,type) VALUES(900,'Unclassified','2026-10-14','event')").run();
    await expect(capturing()).rejects.toThrow(/manifest/i);
    expect((await source.readTransition(plan.id)).phase).toBe("prepared");
    await sourceDb.prepare("DELETE FROM ddays WHERE id=900").run();
    const oldReadiness=await ready();
    const header=await source.describeBaseline(plan.id);
    const page=await source.exportBaselinePage(header,0);
    await target.stageBaselinePage(page);
    const stagedBefore=(await targetDb.prepare("SELECT ordinal,row_digest,record_json FROM content_transition_baseline_rows ORDER BY ordinal").all()).results;
    await sourceDb.prepare("INSERT INTO ddays(id,title,date,type) VALUES(900,'Unclassified','2026-10-14','event')").run();
    await expect(source.freeze(plan.id,now)).rejects.toThrow(/manifest/i);
    expect((await source.readTransition(plan.id)).phase).toBe("target_ingress_ready");
    await source.admit(admission("still-active"));
    await source.commit(plan.id,"still-active",1,[sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,status) VALUES(1,1,'2026-10-14','방송')")]);
    const parent={revision:0,digest:plan.manifestDigest},additions=[{table:"ddays",key:"[900]",disposition:"include" as const,reason:"Approved selected anniversary"}];
    const protection={receiptId:"protection-v2",protocol:1,manifestDigest:"approved-v2"};
    const revision=await source.appendClassifications(plan.id,parent,additions,"approved-v2",protection);
    expect(await source.appendClassifications(plan.id,parent,additions,"approved-v2",protection)).toEqual(revision);
    await expect(source.appendClassifications(plan.id,parent,additions,"conflict",protection)).rejects.toThrow(/conflict/i);
    await expect(source.acknowledgeIngress(oldReadiness,now)).rejects.toThrow(/identity/);
    await target.acceptManifestRevision(revision);
    await target.acceptManifestRevision(revision);
    await expect(target.acceptManifestRevision({...revision,plan:{...revision.plan,manifestDigest:"conflict"}})).rejects.toThrow(/conflict/i);
    await target.stageBaselinePage(page);
    expect((await targetDb.prepare("SELECT ordinal,row_digest,record_json FROM content_transition_baseline_rows ORDER BY ordinal").all()).results).toEqual(stagedBefore);
    expect(await targetDb.prepare("SELECT manifest_digest FROM content_transition_baselines").first("manifest_digest")).toBe(plan.manifestDigest);
    await source.acknowledgeIngress(await target.openIngress(plan.id,"ingress-v2",1000),now);
    await target.installFence(await source.freeze(plan.id,now));
    await installTail();
    expect(await targetDb.prepare("SELECT title FROM ddays WHERE id=900").first("title")).toBe("Unclassified");
    expect(await targetDb.prepare("SELECT id FROM schedules WHERE id=1").first("id")).toBe(1);
    await expect(source.appendClassifications(plan.id,parent,additions,"approved-v2",protection)).rejects.toThrow(/frozen/);
  });
  it("replays more than 45 ordinary changed rows in one grouped atomic business commit", async () => {
    await ready();
    await source.admit(admission("bulk"));
    const sourceCost=await source.commit(plan.id,"bulk",1,[sourceDb.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<60) INSERT INTO schedules(id,member_uid,date,title,status) SELECT x,1,'2026-10-14','delta-'||x,'방송' FROM n")]);
    const fence=await source.freeze(plan.id,now);
    await target.installFence(fence);
    const targetCosts=await installTail();
    expect(await targetDb.prepare("SELECT count(*) n FROM schedules WHERE title LIKE 'delta-%'").first("n")).toBe(60);
    expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_replay").first("n")).toBe(1);
    expect((await targetDb.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
    expect(targetCosts[0]?.statements).toBe(11);
    console.info("actual grouped ordinary delta",JSON.stringify({rows:60,sourceCost,targetCosts}));
  });
  it("resumes a bounded baseline larger than 45 rows and rejects partial stage or digest drift", async () => {
    await sourceDb.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<60) INSERT INTO schedules(id,member_uid,date,title,status) SELECT x,1,'2026-10-14','row-'||x,'방송' FROM n").run();
    const sourceCost=await capturing();
    await source.acknowledgeIngress(await target.openIngress(plan.id,"baseline-ingress",1000),now);
    const fence=await source.freeze(plan.id,now);
    await target.installFence(fence);
    const header=await source.describeBaseline(plan.id);
    expect(header.rows).toBeGreaterThan(45);
    await target.beginBaseline(header);
    const first=await source.exportBaselinePage(header,0);
    const outOfOrder=await source.exportBaselinePage(header,first.next);
    await expect(target.stageBaselinePage(outOfOrder)).rejects.toThrow(/conflict/);
    expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_baseline_rows").first("n")).toBe(0);
    await target.stageBaselinePage(first);
    await target.stageBaselinePage(first);
    await expect(target.finalizeBaseline(plan.id)).rejects.toThrow(/incomplete/);
    await expect(target.installCommittedState(plan.id)).rejects.toThrow(/tail/);
    const resumed=new D1TransitionRepository(targetDb,"luvdia","target-db","luvdia-bucket",targetAvailability);
    for(let cursor=first.next;cursor.ordinal<header.rows;) {
      const page=await source.exportBaselinePage(header,cursor);
      await resumed.stageBaselinePage(page);
      cursor=page.next;
    }
    await expect(resumed.beginBaseline({...header,digest:"drift"})).rejects.toThrow(/conflict/);
    let batches=0;
    while(await resumed.materializeBaselinePage(plan.id)) batches++;
    expect(batches).toBeGreaterThan(1);
    const receipt=await resumed.finalizeBaseline(plan.id);
    expect(receipt.rows).toBe(header.rows);
    expect(await targetDb.prepare("SELECT count(*) n FROM schedules").first("n")).toBe(60);
    await transferStaticProof();
    await resumed.installCommittedState(plan.id);
    await resumed.activate(plan.id);
    console.info("actual selected baseline",JSON.stringify({rows:header.rows,batches,receipt,sourceCost}));
  });
  it("opens ownership only after actual projected target materialization and durable replay readback", async () => {
    await sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(1,1,'2026-10-14','committed source','방송')").run();
    await ready();
    const fence=await source.freeze(plan.id,now);
    await target.installFence(fence);
    await expect(target.installCommittedState(plan.id)).rejects.toThrow(/tail/);
    const commits=await source.exportProjectedCommits(plan.id,0);
    await expect(target.installProjectedCommit({...commits[0]})).rejects.toThrow(/projection/);
    await installTail();
    expect(await targetDb.prepare("SELECT title FROM schedules WHERE id=1").first("title")).toBe("committed source");
    await target.installCommittedState(plan.id);
    await target.activate(plan.id);
    expect((await target.readTransition(plan.id)).phase).toBe("target_owned");
  });
  it("preserves non-executing origin, event and AI material through the existing admin list and detail", async () => {
    await targetDb.prepare("INSERT INTO music_ingestion_candidates(id,external_video_id,status,classification,title,first_discovered_at,last_discovered_at,retention_expires_at,created_at,updated_at) VALUES('candidate','abcdefghijk','needs_input','eligible','Historic candidate',1,2,1000,1,2)").run();
    const context = {sourceSite:"otw" as const,members:[{uid:1,targetUid:1,name:"Bing",externalEntityId:null}]};
    const fixtures = [
      ["music_ingestion_candidate_origins", "origin", {job_id:"old-job",candidate_id:"candidate",discovered_at:2,playlist_position:3}],
      ["music_ingestion_jobs","old-job",{id:"old-job",actor_user_id:"private-actor",status:"completed",created_at:1,completed_at:3}],
      ["music_ingestion_events", "event", {id:"event",job_id:"old-job",candidate_id:"candidate",actor_user_id:"private-actor",event_type:"review_updated",created_at:3,detail_json:JSON.stringify({status:"ready",title:"Original input"})}],
      ["music_ai_review_batches", "batch", {id:"batch",actor:"private-actor",request_key:"private-request",created_at:4,selection_json:JSON.stringify({candidates:[{id:"candidate",version:0}]})}],
      ["music_ai_review_batch_items","batch-item",{id:"batch-item",batch_id:"batch",candidate_id:"candidate",review_id:"review",status:"saved",created_at:4,updated_at:6}],
      ["music_ai_reviews", "review", {id:"review",candidate_id:"candidate",status:"succeeded",created_at:4,updated_at:6,input_json:JSON.stringify({candidateKind:"official_video",members:[{name:"Bing",aliases:[]}]}),result_json:JSON.stringify({videoAnalyzed:true,warnings:[],songs:[{values:{song:{title:"Original result",originalArtists:[{name:"Original artist"}]},participants:[{name:"Bing"}]},warnings:[]}]})}],
      ["music_ai_review_attempts", "private-token", {token:"private-token",review_id:"review",started_at:4,finished_at:6,outcome:"succeeded",usage_json:'{"inputTokens":100}'}],
    ] as const;
    for (const [table,id,value] of fixtures) {
      const record = await projectCapturedRecord(table,JSON.stringify([id]),value,context);
      await targetDb.batch(historicalStatements(targetDb,record!,"candidate_id" in value?[{table:"music_ingestion_candidates",key:'["candidate"]'}]:[]));
    }
    const repository=new D1IngestionRepository(targetDb);
    const detail=await repository.readReviewCandidate(null,"candidate");
    const page=await repository.listReviewItems({status:"pending",source:"playlist"});
    expect(detail?.historicalMaterials).toHaveLength(7);
    expect(page.items[0]?.candidate?.historicalMaterials).toEqual(detail?.historicalMaterials);
    expect(page.items[0]?.sources).toContain("playlist");
    const json=JSON.stringify(detail?.historicalMaterials);
    for(const text of ["Original input","Original result","Original artist","succeeded","Bing"]) expect(json).toContain(text);
    for(const text of ["private-actor","private-token","private-request","inputTokens"]) expect(json).not.toContain(text);
    for(const table of ["music_ingestion_jobs","music_ingestion_events","music_ai_review_batches","music_ai_review_attempts"]) expect(await targetDb.prepare(`SELECT count(*) AS n FROM ${table}`).first("n")).toBe(0);
    expect((await targetDb.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
    const deleted=await projectCapturedRecord("music_catalog_events",'["deleted"]',{id:"deleted",aggregate_type:"review_candidate",aggregate_id:"candidate",event_type:"review_item.deleted",actor_kind:"admin",actor_user_id:"private-actor",created_at:7,detail_json:"{}"},context);
    await targetDb.batch(historicalStatements(targetDb,deleted!,[{table:"music_ingestion_candidates",key:'["candidate"]'}]));
    expect((await repository.listReviewItems({status:"pending",source:"playlist"})).items).toEqual([]);
    await expect(repository.readReviewCandidate(null,"candidate")).rejects.toThrow(/not found/);
  });
  it("fences selected roots while remaining OTW content can edit shared dependencies after handoff", async () => {
    await sourceDb.batch([
      sourceDb.prepare("INSERT INTO music_songs(id,slug,title,normalized_title,dedupe_key,is_otw_original,created_at,updated_at) VALUES('shared','shared','Original','original','shared',0,1,1)"),
      sourceDb.prepare("INSERT INTO music_entities(id,member_uid,entity_kind,display_name,normalized_name,slug,created_at,updated_at) VALUES('singer',1,'person','Bing','bing','bing',1,1),('other',NULL,'person','Other','other','other',1,1)"),
      sourceDb.prepare("INSERT INTO music_performances(id,song_id,dedupe_key,relation_type,release_type,participation_type,created_at,updated_at) VALUES('selected','shared','selected','cover','official_video','solo',1,1),('remaining','shared','remaining','cover','official_video','solo',1,1)"),
      sourceDb.prepare("INSERT INTO music_performance_participants(performance_id,entity_id,participant_role,credit_order,credit_name_snapshot) VALUES('selected','singer','vocal',0,'Bing'),('remaining','other','vocal',0,'Other')"),
    ]);
    await ready();
    const fence=await source.freeze(plan.id,now);
    const frozen=await source.readJournal(plan.id);
    await sourceDb.batch([
      sourceDb.prepare("UPDATE music_songs SET title='Remaining OTW edit',version=version+1 WHERE id='shared'"),
      sourceDb.prepare("UPDATE music_performances SET internal_note='Remaining owner edit',version=version+1 WHERE id='remaining'"),
      sourceDb.prepare("UPDATE music_performance_participants SET credit_name_snapshot='Corrected other name' WHERE performance_id='remaining'"),
    ]);
    await expect(sourceDb.prepare("UPDATE music_performances SET internal_note='late selected edit' WHERE id='selected'").run()).rejects.toThrow(/source_root_fenced/);
    await expect(sourceDb.prepare("UPDATE music_performance_participants SET credit_name_snapshot='late selected credit' WHERE performance_id='selected'").run()).rejects.toThrow(/source_root_fenced/);
    expect(await source.readJournal(plan.id)).toEqual(frozen);
    expect((await source.freeze(plan.id,now)).boundary).toBe(fence.boundary);
    expect(frozen.find(row=>row.table==='music_songs')?.after_json).toContain('Original');
    expect(await sourceDb.prepare("SELECT title FROM music_songs WHERE id='shared'").first("title")).toBe('Remaining OTW edit');
  });
  it("keeps a value edit independent of unrelated source-row volume", async () => {
    await sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(1,1,'2026-10-14','initial','방송')").run();
    await capturing();
    await source.admit({ ...admission("small"), expectedVersion: null });
    const small = await source.commit(plan.id,"small",1,[sourceDb.prepare("UPDATE schedules SET title='small' WHERE id=1")]);
    // Unrelated writes remain permitted; this setup also exercises that fence.
    await sourceDb.prepare("WITH RECURSIVE numbers(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM numbers WHERE n<1000) INSERT INTO schedules(id,member_uid,date,title,status) SELECT 100+n,90,'2026-10-14','unrelated','방송' FROM numbers").run();
    await source.admit({ ...admission("large"), expectedVersion: null });
    const large = await source.commit(plan.id,"large",1,[sourceDb.prepare("UPDATE schedules SET title='large' WHERE id=1")]);
    expect(large?.rowsWritten).toBe(small?.rowsWritten);
    expect(large!.rowsRead).toBeLessThanOrEqual(small!.rowsRead + 10);
    expect(large?.statements).toBe(15);
    console.info("actual canonical D1 capture cost",JSON.stringify({small,large,unrelatedRows:1000}));
  });
  it("captures large selected fan-out as relational rows and keeps later growth atomic", async () => {
    await sourceDb.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<1000) INSERT INTO schedules(id,member_uid,date,title,status) SELECT x,1,'2026-10-14','selected-'||x,'방송' FROM n").run();
    const cost=await capturing();
    expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_images WHERE row_table='schedules'").first("n")).toBe(1000);
    console.info("actual 1000 selected baseline",JSON.stringify(cost));
    await sourceDb.prepare("DELETE FROM content_transitions").run();
    await source.prepare(plan);
    await sourceDb.batch([
      sourceDb.prepare("INSERT INTO music_entities(id,member_uid,entity_kind,display_name,normalized_name,slug,created_at,updated_at) VALUES('singer',1,'person','Bing','bing','bing',1,1)"),
      sourceDb.prepare("INSERT INTO music_songs(id,slug,title,normalized_title,dedupe_key,is_otw_original,created_at,updated_at) VALUES('large-song','large-song','Large','large','large-song',0,1,1)"),
      sourceDb.prepare("INSERT INTO music_performances(id,song_id,dedupe_key,relation_type,release_type,participation_type,created_at,updated_at) VALUES('large-performance','large-song','large-performance','cover','official_video','solo',1,1)"),
      sourceDb.prepare("INSERT INTO music_performance_participants(performance_id,entity_id,participant_role,credit_order,credit_name_snapshot) VALUES('large-performance','singer','vocal',0,'Bing')"),
      sourceDb.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<1000) INSERT INTO music_song_aliases(song_id,alias,normalized_alias) SELECT 'large-song',printf('%02100d',x),printf('%02100d',x) FROM n"),
    ]);
    const fanout=await capturing();
    expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_images WHERE row_table='music_song_aliases'").first("n")).toBe(1000);
    await source.admit({...admission("fanout-growth"),expectedVersion:null});
    const growth=await source.commit(plan.id,"fanout-growth",1,[sourceDb.prepare("INSERT INTO music_song_aliases(song_id,alias,normalized_alias) VALUES('large-song','new alias','new alias')")]);
    expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_images WHERE row_table='music_song_aliases'").first("n")).toBe(1001);
    const journal=await source.readJournal(plan.id);
    await source.admit({...admission("fanout-failed"),expectedVersion:null});
    await expect(source.commit(plan.id,"fanout-failed",1,[sourceDb.prepare("DELETE FROM music_song_aliases WHERE song_id='large-song'"),sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(1,1,'2026-10-14','duplicate','방송')")])).rejects.toThrow();
    expect(await sourceDb.prepare("SELECT count(*) n FROM music_song_aliases WHERE song_id='large-song'").first("n")).toBe(1001);
    expect(await source.readJournal(plan.id)).toEqual(journal);
    expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_permits").first("n")).toBe(0);
    console.info("actual relational fanout capture",JSON.stringify({fanout,growth,aliasKeyBytes:2100,aliasCount:1001}));
  },30000);
  it("captures canonical mixed credits, newly referenced unchanged parents, key moves, scope exit and cascades at committed boundaries", async () => {
    await sourceDb.batch([
      sourceDb.prepare("INSERT INTO members(uid,code,name) VALUES(90,'other','Other')"),
      sourceDb.prepare("INSERT INTO music_entities(id,member_uid,entity_kind,display_name,normalized_name,slug,created_at,updated_at) VALUES('singer',1,'person','Bing','bing','bing',1,1),('other',90,'person','Other','other','other',1,1),('external',NULL,'person','External','external','external',1,1)"),
      sourceDb.prepare("INSERT INTO music_songs(id,slug,title,normalized_title,dedupe_key,is_otw_original,created_at,updated_at) VALUES('song','song','Song','song','song',0,1,1),('unchanged','unchanged','Unchanged parent','unchanged','unchanged',0,1,1)"),
      sourceDb.prepare("INSERT INTO music_performances(id,song_id,dedupe_key,relation_type,release_type,participation_type,created_at,updated_at) VALUES('mixed','song','mixed','cover','official_video','external_collab',1,1),('unrelated','song','unrelated','cover','official_video','solo',1,1)"),
      sourceDb.prepare("INSERT INTO music_performance_participants(performance_id,entity_id,participant_role,credit_order,credit_name_snapshot) VALUES('mixed','singer','vocal',0,'Bing'),('mixed','other','vocal',1,'Other'),('unrelated','other','vocal',0,'Other')"),
    ]);
    expect(await sourceDb.prepare("SELECT count(*) FROM content_transition_journal").first("count(*)")).toBe(0);
    await capturing();
    const baseline = await source.readJournal(plan.id);
    expect(baseline.some(row => row.table==='music_performance_participants' && row.row_key==='["mixed","other"]')).toBe(true);
    expect(baseline.some(row => row.table==='music_performances' && row.row_key==='["unrelated"]')).toBe(false);
    const apply = async (id: string, sql: string[]) => {
      await source.admit({ ...admission(id), expectedVersion: null });
      await source.commit(plan.id,id,1,sql.map(statement => sourceDb.prepare(statement)));
    };
    await apply("move",["UPDATE music_performances SET song_id='unchanged' WHERE id='mixed'", "UPDATE music_performance_participants SET entity_id='external',credit_name_snapshot='External' WHERE performance_id='mixed' AND entity_id='other'"]);
    const delta = (await source.readJournal(plan.id)).filter(row => row.seq > (baseline.at(-1)?.seq ?? 0));
    expect(new Set(delta.map(row => row.commit_seq)).size).toBe(1);
    expect(delta.find(row => row.table==='music_songs' && row.row_key==='["unchanged"]')?.after_json).toContain('Unchanged parent');
    expect(delta.find(row => row.table==='music_performance_participants' && row.row_key==='["mixed","other"]')?.after_json).toBeNull();
    expect(delta.find(row => row.table==='music_performance_participants' && row.row_key==='["mixed","external"]')?.after_json).toContain('External');
    await apply("leave",["DELETE FROM music_performance_participants WHERE performance_id='mixed' AND entity_id='singer'"]);
    expect(await sourceDb.prepare("SELECT count(*) FROM content_transition_images WHERE row_table='music_performances'").first("count(*)")).toBe(0);
    await apply("enter",["INSERT INTO music_performance_participants(performance_id,entity_id,participant_role,credit_order,credit_name_snapshot) VALUES('mixed','singer','vocal',0,'Bing')"]);
    await apply("cascade",["DELETE FROM music_performances WHERE id='mixed'"]);
    expect(await sourceDb.prepare("SELECT count(*) FROM content_transition_images WHERE row_table='music_performance_participants'").first("count(*)")).toBe(0);
    expect(await sourceDb.prepare("SELECT id FROM music_performances WHERE id='unrelated'").first("id")).toBe('unrelated');
    await source.acknowledgeIngress(await target.openIngress(plan.id,"mixed-ready",1000),now);
    await source.validateIdentityProjection(plan.id);
    await target.installFence(await source.freeze(plan.id,now));
    await installTail();
    expect(await targetDb.prepare("SELECT id FROM music_performances WHERE id='mixed'").first()).toBeNull();
    expect(await targetDb.prepare("SELECT id FROM music_performances WHERE id='unrelated'").first()).toBeNull();
    expect((await targetDb.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });
  it("rejects missing, stale and wrong readiness without stopping source writes", async () => {
    await capturing();
    await expect(source.freeze(plan.id, now)).rejects.toThrow();
    const receipt = await target.openIngress(plan.id, "ingress", 101);
    await expect(source.acknowledgeIngress({ ...receipt, generation: 3 }, now)).rejects.toThrow();
    await expect(source.acknowledgeIngress(receipt, 102)).rejects.toThrow();
    await source.admit(admission("save"));
    await source.commit(plan.id, "save", 1, [sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,status) VALUES(1,1,'2026-10-14','방송')")]);
    expect(await sourceDb.prepare("SELECT id FROM schedules WHERE id=1").first()).not.toBeNull();
  });

  it("durably admits target requests and due identities throughout fence/activation but rejects early final writes", async () => {
    await ready();
    await target.admit(admission("before"));
    await expect(target.commit(plan.id, "before", 2, [targetDb.prepare("INSERT INTO schedules(id,member_uid,date,status) VALUES(1,1,'2026-10-14','방송')")])).rejects.toThrow();
    const fence = await source.freeze(plan.id, now);
    await target.admit({ ...admission("due"), kind: "collection_due", subject:{table:"source_checkpoints",key:JSON.stringify(["x:hayu"])}, codec:{id:"source.checkpoint_due",version:1}, payload: { sourceKey: "x:hayu", checkpointGeneration: 7, scheduledDue: 90 } });
    await target.installFence(fence);
    await target.admit(admission("during"));
    await installTail();
  await target.installCommittedState(plan.id);
    await target.activate(plan.id);
    await target.admit(admission("after"));
    expect((await target.readOperation(plan.id, "due"))?.payload).toEqual({ sourceKey: "x:hayu", checkpointGeneration: 7, scheduledDue: 90 });
    expect(await targetDb.prepare("SELECT id FROM schedules WHERE id=1").first()).toBeNull();
  });

  it("transfers unknown provider/R2 intent and commits unrelated new work without outcome acknowledgements", async () => {
    await ready();
    await source.admit(admission("old"));
    await source.recordAttempt(plan.id, "old", { identity: "provider-attempt", status: "unknown" });
    await source.recordFileIntent(plan.id, "old", { intentId: "put", logicalKey: "profile.webp", versionKey: "versions/put.webp", previousVersion: null, hash: null, size: null, status: "unknown" });
    await transferAndActivate();
    await target.admit(admission("new"));
    await target.commit(plan.id, "new", 2, [targetDb.prepare("INSERT INTO schedules(id,member_uid,date,status) VALUES(2,2,'2026-10-14','방송')")]);
    expect((await target.readOperation(plan.id, "old"))?.attempt?.status).toBe("unknown");
    expect(await targetDb.prepare("SELECT id FROM schedules WHERE id=2").first()).not.toBeNull();
    await expect(target.complete(plan.id)).rejects.toThrow();
  });
  it("reconciles immutable late evidence under the original attempt after a committed business outcome", async () => {
    await ready();
    await source.admit(admission("old-effect"));
    await source.recordAttempt(plan.id,"old-effect",{identity:"original-attempt",status:"unknown"});
    await source.commit(plan.id,"old-effect",1,[sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,status) VALUES(1,1,'2026-10-14','방송')")]);
    await transferAndActivate();
    await expect(target.readOutcomeReceipt(plan.id,"operation","old-effect")).rejects.toThrow(/reconciled/);
    const evidence={evidenceId:"late-result",attemptIdentity:"original-attempt",result:"completed" as const,observedAt:now+1};
    await source.recordEvidence(plan.id,"old-effect",evidence);
    await target.recordEvidence(plan.id,"old-effect",evidence);
    await target.reconcileEvidence(plan.id,"old-effect",evidence.evidenceId);
    await target.reconcileEvidence(plan.id,"old-effect",evidence.evidenceId);
    const receipt=await target.readOutcomeReceipt(plan.id,"operation","old-effect");
    await target.confirmOutcomeAcknowledgement(await source.acknowledgeOutcome(receipt));
    await target.acknowledgeSourceArchive(await source.archiveSource(plan.id));
    await target.complete(plan.id);
    expect((await target.readOperation(plan.id,"old-effect"))?.outcome).toMatchObject({outcome:"committed",sideEffectReconciled:true});
    await expect(source.reconcileEvidence(plan.id,"old-effect",evidence.evidenceId)).rejects.toThrow(/owner/);
  });
  it("keeps file observation separate from reference commit and atomically records the final file outcome", async () => {
    await ready();
    await source.admit(admission("file-save"));
    await source.recordFileIntent(plan.id,"file-save",{intentId:"file",logicalKey:"logical.webp",versionKey:"immutable/file.webp",previousVersion:null,hash:null,size:null,status:"unknown"});
    await transferAndActivate();
    const envelope=await source.exportFileIntent(plan.id,"file");
    const reference=[{intentId:"file",evidenceId:"put-observed"}];
    const write=targetDb.prepare("INSERT INTO schedules(id,member_uid,date,title,status) VALUES(1,1,'2026-10-14','reference committed','방송')");
    await expect(target.commit(plan.id,"file-save",2,[write],reference)).rejects.toThrow();
    expect(await targetDb.prepare("SELECT id FROM schedules WHERE id=1").first()).toBeNull();
    const observation={transitionId:plan.id,intentId:"file",generation:1,site:"otw" as const,resource:"otw-bucket",objectVersion:"source-upload-random-version",copiedFromEvidenceId:null,evidenceId:"put-observed",versionKey:envelope.versionKey,result:"present" as const,hash:"a".repeat(64),size:24,observedAt:now+1};
    await expect(target.recordFileObservation(plan.id,"file",{...observation,generation:2})).rejects.toThrow(/identity/);
    await expect(target.recordFileObservation(plan.id,"file",{...observation,versionKey:"wrong-version"})).rejects.toThrow(/identity/);
    await source.recordFileObservation(plan.id,"file",observation);
    await target.recordFileObservation(plan.id,"file",observation);
    await expect(target.commit(plan.id,"file-save",2,[write],reference)).rejects.toThrow();
    const targetObservation={...observation,evidenceId:"target-observed",site:"luvdia" as const,resource:"luvdia-bucket",objectVersion:"different-target-upload-version",copiedFromEvidenceId:observation.evidenceId};
    await expect(target.recordFileObservation(plan.id,"file",{...targetObservation,size:25})).rejects.toThrow(/byte identity/);
    await target.recordFileObservation(plan.id,"file",targetObservation);
    reference[0].evidenceId="target-observed";
    await expect(target.recordFileObservation(plan.id,"file",{...observation,size:25})).rejects.toThrow(/immutable/);
    await expect(target.readOutcomeReceipt(plan.id,"file","file")).rejects.toThrow(/terminal/);
    await expect(target.commit(plan.id,"file-save",2,[write,write],reference)).rejects.toThrow();
    expect((await target.exportFileIntent(plan.id,"file")).outcome).toBeNull();
    await target.commit(plan.id,"file-save",2,[write],reference);
    await target.receiveFileIntent(envelope);
    for(const [kind,id] of [["operation","file-save"],["file","file"]] as const) await target.confirmOutcomeAcknowledgement(await source.acknowledgeOutcome(await target.readOutcomeReceipt(plan.id,kind,id)));
    await target.acknowledgeSourceArchive(await source.archiveSource(plan.id));
    await target.complete(plan.id);
    expect((await target.exportFileIntent(plan.id,"file")).outcome?.outcome).toBe("committed");
  });

  it("serializes the final-write/fence race and rejects late source business writes", async () => {
    await ready();
    await source.admit(admission("racer"));
    const raced = await Promise.allSettled([
      source.commit(plan.id, "racer", 1, [sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,status) VALUES(1,1,'2026-10-14','방송')")]),
      source.freeze(plan.id, now),
    ]);
    const fenceResult = raced[1];
    expect(fenceResult.status).toBe("fulfilled");
    const journal = await source.readJournal(plan.id);
    if (raced[0].status === "fulfilled") expect(journal.some(row => row.table === "schedules")).toBe(true);
    else expect(await sourceDb.prepare("SELECT id FROM schedules WHERE id=1").first()).toBeNull();
    await expect(source.commit(plan.id, "racer", 1, [sourceDb.prepare("UPDATE schedules SET title='late' WHERE id=1")])).rejects.toThrow();
  });
  it("keeps late source side effects as immutable evidence without changing frozen business or attempt state", async () => {
    await ready();
    await source.admit(admission("old"));
    await source.recordAttempt(plan.id,"old",{identity:"provider-identity",status:"unknown"});
    await source.freeze(plan.id,now);
    const journal=await source.readJournal(plan.id);
    const evidence={evidenceId:"provider-result",attemptIdentity:"provider-identity",result:"completed" as const,observedAt:102};
    await source.recordEvidence(plan.id,"old",evidence);
    await source.recordEvidence(plan.id,"old",evidence);
    await expect(source.recordEvidence(plan.id,"old",{...evidence,result:"failed"})).rejects.toThrow(/immutable/);
    await expect(source.recordAttempt(plan.id,"old",{identity:"provider-identity",status:"completed"})).rejects.toThrow(/owner/);
    expect((await source.readOperation(plan.id,"old"))?.attempt?.status).toBe("unknown");
    expect(await source.readJournal(plan.id)).toEqual(journal);
    expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_evidence").first("n")).toBe(1);
  });

  it("preserves an old expected version and records conflict after a newer target edit", async () => {
    await ready();
    const versioned=(id:string)=>({...admission(id),codec:{id:"otw-play.song.update",version:1},subject:{table:"music_songs",key:'["song"]'},expectedVersion:0,payload:{id:"song",expectedVersion:0,slug:"song",title:"Held song save",isOtwOriginal:false,originalReleaseDate:null,originalReleasePrecision:"unknown",aliases:[],originalArtists:[{subject:{kind:"member",memberUid:1},creditOrder:0,isPrimary:true}]}});
    await source.admit(versioned("old"));
    await transferAndActivate();
    await targetDb.prepare("INSERT INTO music_songs(id,slug,title,normalized_title,dedupe_key,is_otw_original,created_at,updated_at) VALUES('song','song','initial','initial','song',0,1,1)").run();
    await target.admit(versioned("new"));
    await target.commit(plan.id, "new", 2, [targetDb.prepare("UPDATE music_songs SET title='new',version=version+1 WHERE id='song'")]);
    expect((await target.readOperation(plan.id, "old"))?.expectedVersion).toBe(0);
    await expect(target.commit(plan.id,"old",2,[targetDb.prepare("UPDATE music_songs SET title='old' WHERE id='song'")])).rejects.toThrow(/version/);
    expect(await targetDb.prepare("SELECT title FROM music_songs WHERE id='song'").first("title")).toBe("new");
    expect((await target.readOperation(plan.id, "old"))?.outcome?.outcome).toBe("conflicted");
  });

  it("deduplicates transfer after lost ACK and rejects hash changes without inventing an outcome", async () => {
    await ready();
    await source.admit(admission("old"));
    await source.recordAttempt(plan.id, "old", { identity: "provider-attempt", status: "unknown" });
    const envelope = await source.exportOperation(plan.id, "old");
    const first = await target.receiveOperation(envelope);
    expect(await target.receiveOperation(envelope)).toEqual(first);
    await expect(target.receiveOperation({ ...envelope, payloadHash: "different" })).rejects.toThrow();
    expect((await target.readOperation(plan.id, "old"))?.outcome).toBeNull();
    expect((await target.readOperation(plan.id, "old"))?.attempt?.identity).toBe("provider-attempt");
    await expect(target.receiveOperation({...envelope,validation:{...envelope.validation,actorUserId:"private"} as typeof envelope.validation})).rejects.toThrow(/allowlist/);
    await expect(target.receiveOperation({...envelope,attempt:{...envelope.attempt!,token:"private"} as NonNullable<typeof envelope.attempt>})).rejects.toThrow(/allowlist/);
    await expect(target.receiveOperation({...envelope,subject:{table:"members",key:"[1]"}})).rejects.toThrow(/subject/);
    await expect(target.receiveOperation({...envelope,codec:{id:"unknown",version:1}})).rejects.toThrow(/registered/);
    await expect(target.receiveOperation({...envelope,payload:{...envelope.payload,actorUserId:"source-private-actor"}})).rejects.toThrow(/allowlist/);
  });

  it("resumes durable fence/install/ownership crash points without reopening source", async () => {
    await ready();
    const fence = await source.freeze(plan.id, now);
    expect(await source.freeze(plan.id, now)).toEqual(fence);
    await target.admit(admission("after-source-crash"));
    await target.installFence(fence);
    await target.installFence(fence);
    await installTail();
  await target.installCommittedState(plan.id);
    await target.activate(plan.id);
    await target.activate(plan.id);
    await expect(source.admit(admission("stale"))).rejects.toThrow();
    await expect(source.beginReplay(plan.id)).rejects.toThrow();
  });

  it("preserves exact cadence and mixed source identity rather than running create/resume helpers", async () => {
    await ready();
    const checkpoint = { sourceKey: "x:hayu", revision: 9, state: { watermark: "101", pageToken: "next", baseId: "97", newestId: "103", nextDue: 91, candidateId: "candidate-9", intervalMinutes: 60 } };
    await source.saveCheckpoint(plan.id, checkpoint);
    await source.admit({ ...admission("due"), kind: "collection_due", subject:{table:"source_checkpoints",key:JSON.stringify([checkpoint.sourceKey])}, codec:{id:"source.checkpoint_due",version:1}, payload: { sourceKey: checkpoint.sourceKey, checkpointGeneration: 9, scheduledDue: 91 } });
    const fence = await source.freeze(plan.id, now);
    expect(fence.checkpoints).toEqual([checkpoint]);
    await target.installFence(fence);
    await target.receiveOperation(await source.exportOperation(plan.id, "due"));
    expect((await target.readOperation(plan.id, "due"))?.payload).toEqual({ sourceKey: "x:hayu", checkpointGeneration: 9, scheduledDue: 91 });
    await sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,status) VALUES(90,90,'2026-10-14','방송')").run();
    expect(await sourceDb.prepare("SELECT id FROM schedules WHERE id=90").first()).not.toBeNull();
  });

  it("completes the frozen finite set while new target backlog remains", async () => {
    await ready();
    await source.admit(admission("old"));
    await transferAndActivate();
    await target.admit(admission("ongoing-new"));
    await expect(target.complete(plan.id)).rejects.toThrow();
    await target.recordOutcome(plan.id, "old", { outcome: "conflicted", sideEffectReconciled: true, detail: "version conflict" });
    await target.acknowledgeSourceArchive(await source.archiveSource(plan.id));
    await expect(target.complete(plan.id)).rejects.toThrow();
    const receipt=await target.readOutcomeReceipt(plan.id,"operation","old");
    const acknowledgement=await source.acknowledgeOutcome(receipt);
    expect(await source.acknowledgeOutcome(receipt)).toEqual(acknowledgement);
    await target.confirmOutcomeAcknowledgement(acknowledgement);
    await target.complete(plan.id);
    expect((await target.readOperation(plan.id, "ongoing-new"))?.outcome).toBeNull();
    expect((await target.readTransition(plan.id)).phase).toBe("complete");
  });

  it("rolls back a failed business batch with its capture, permit and outcome", async () => {
    await capturing();
    await source.admit(admission("save"));
    const before = await source.readJournal(plan.id);
    await expect(source.commit(plan.id, "save", 1, [
      sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,status) VALUES(1,1,'2026-10-14','방송')"),
      sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,status) VALUES(1,1,'2026-10-14','방송')"),
    ])).rejects.toThrow();
    expect(await sourceDb.prepare("SELECT id FROM schedules WHERE id=1").first()).toBeNull();
    expect(await source.readJournal(plan.id)).toEqual(before);
    expect((await source.readOperation(plan.id, "save"))?.outcome).toBeNull();
    expect(await sourceDb.prepare("SELECT count(*) FROM content_transition_permits").first("count(*)")).toBe(0);
  });
});
