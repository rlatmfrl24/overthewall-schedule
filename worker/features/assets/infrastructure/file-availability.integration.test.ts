import { applyD1Migrations,env,type D1Migration } from "cloudflare:test";
import { beforeAll,expect,it } from "vitest";
import { D1TransitionRepository } from "../../content-transition";
import type { FileAvailabilityContext } from "../../content-transition";
import { classifiedTables } from "../../content-transition/infrastructure/manifest-statements";
import { keySql } from "../../content-transition/infrastructure/capture-graph";
import { D1FileAvailability } from "./d1-file-availability";
import { D1R2FileStore,hashFileBytes } from "./d1-r2-file-store";
import type { TransitionPlan } from "@contracts/content-transition";
import {buildAssetFileStore} from "../../../app/assets";
import type {Env} from "../../../platform/types";

const runtime=env as unknown as {otw_db:D1Database;transition_target_db:D1Database;ASSET_BUCKET:R2Bucket;TRANSITION_TARGET_BUCKET:R2Bucket;SOURCE_ASSETS:Fetcher;TARGET_ASSETS:Fetcher;CHANGED_ASSETS:Fetcher;MISSING_MANIFEST_ASSETS:Fetcher;CONTENT_TRANSITION_MIGRATIONS:D1Migration[]};
const sourceDb=runtime.otw_db,targetDb=runtime.transition_target_db;
const sourceAvailability=new D1FileAvailability(sourceDb,runtime.ASSET_BUCKET,runtime.SOURCE_ASSETS,"otw","otw-schedule");
const targetAvailability=new D1FileAvailability(targetDb,runtime.TRANSITION_TARGET_BUCKET,runtime.TARGET_ASSETS,"luvdia","luvdia-schedule");
const source=new D1TransitionRepository(sourceDb,"otw","otw-db","otw-schedule",sourceAvailability);
const target=new D1TransitionRepository(targetDb,"luvdia","luvdia-db","luvdia-schedule",targetAvailability);
beforeAll(async()=>{
  for(const db of [sourceDb,targetDb]) {
    for(const migration of runtime.CONTENT_TRANSITION_MIGRATIONS) {
      if(migration.name.startsWith("0030_")) await db.batch(["kurenai_natsuki","terri_nunna","bing_hayu","yang_mei","u_lili","on_haru","hane","kim_ate"].map((code,index)=>db.prepare("INSERT INTO members(uid,code,name,is_deprecated) VALUES(?,?,?,1)").bind(-10000-index,code,"migration bootstrap")));
      await applyD1Migrations(db,[migration]);
    }
    await db.batch([db.prepare("DELETE FROM member_links"),db.prepare("DELETE FROM music_entities"),db.prepare("DELETE FROM members")]);
  }
},120000);

it("installs pre-transition immutable bytes and real source/target static ASSETS only with captured reference and exact body/resource/fence proof",async()=>{
  const members=[{code:"bing_hayu",uid:1,targetUid:11},{code:"u_lili",uid:2,targetUid:12},{code:"yang_mei",uid:3,targetUid:13}];
  await sourceDb.batch(members.map(member=>sourceDb.prepare("INSERT INTO members(uid,code,name) VALUES(?,?,?)").bind(member.uid,member.code,member.code)));
  const ordinary=new D1R2FileStore(sourceDb,runtime.ASSET_BUCKET,"otw","otw-schedule");
  const bytes=new Uint8Array([82,73,70,70,12,23,34]);
  const uploaded=await ordinary.put({operationId:"before-transition",logicalKey:"members/bing_hayu/backgrounds/main/original.webp",contentType:"image/webp",bytes});
  const classifications:TransitionPlan["classifications"][number][]=[];
  for(const table of classifiedTables) for(const row of (await sourceDb.prepare(`SELECT ${keySql(table,"a")} identity FROM "${table}" a`).all<{identity:string}>()).results) classifications.push({table,key:row.identity,disposition:"exclude",reason:"Unrelated fixture configuration"});
  const plan:TransitionPlan={id:"availability",sourceSite:"otw",targetSite:"luvdia",sourceResource:"otw-db",targetResource:"luvdia-db",generation:2,protocol:1,manifestDigest:"reviewed-assets",assetBuckets:{source:"otw-schedule",target:"luvdia-schedule"},members,classifications};
  await source.prepare(plan);await target.prepare(plan);
  await source.protect(plan.id,{receiptId:"hold",protocol:1,manifestDigest:plan.manifestDigest});
  const sourceStore=buildAssetFileStore({...runtime,SITE_ID:"otw",SITE_D1_DATABASE_NAME:"otw-db",SITE_ASSET_BUCKET_NAME:"otw-schedule"} as unknown as Env);
  const pendingInput={operationId:"transfer-pending",logicalKey:uploaded.logicalKey,contentType:"image/webp",bytes:new Uint8Array([9,8,7,6])};
  const pending=await sourceStore.begin(pendingInput);
  const pendingObservation=await sourceStore.verifyPut(pending,pendingInput.bytes);
  await source.beginCopy(plan.id);await source.beginReplay(plan.id);
  await source.acknowledgeIngress(await target.openIngress(plan.id,"ready",Date.now()+60_000),Date.now());
  const fence=await source.freeze(plan.id,Date.now());await target.installFence(fence);
  await expect(sourceStore.commitReference(pending,pendingObservation)).rejects.toThrow(/owner|fenced/);
  for(const operation of await source.exportFrozenOperations(plan.id)) await target.receiveOperation(operation);
  for(const intent of await source.exportFrozenFileIntents(plan.id)) await target.receiveFileIntent(intent);
  const header=await source.describeBaseline(plan.id);await target.beginBaseline(header);
  let cursor:Awaited<ReturnType<typeof source.exportBaselinePage>>["next"]|0=0;
  do{const page=await source.exportBaselinePage(header,cursor);await target.stageBaselinePage(page);cursor=page.next;}while(cursor.ordinal<header.rows);
  while(await target.materializeBaselinePage(plan.id)){ /* bounded normal installer */ }
  await target.finalizeBaseline(plan.id);
  const manifestRevision=await sourceDb.prepare("SELECT manifest_revision FROM content_transitions WHERE id=?").bind(plan.id).first<number>("manifest_revision");
  const context:FileAvailabilityContext={plan,manifestRevision:manifestRevision!,fence};
  expect((await (await runtime.CHANGED_ASSETS.fetch("https://selected-assets.invalid/profile/bing_hayu.webp")).arrayBuffer()).byteLength).toBe(41);
  await expect(new D1FileAvailability(targetDb,runtime.TRANSITION_TARGET_BUCKET,runtime.CHANGED_ASSETS,"luvdia","luvdia-schedule").assertAvailable(context)).rejects.toThrow(/body\/hash\/size mismatch/);
  await expect(new D1FileAvailability(targetDb,runtime.TRANSITION_TARGET_BUCKET,runtime.MISSING_MANIFEST_ASSETS,"luvdia","luvdia-schedule").assertAvailable(context)).rejects.toThrow(/Missing static artifact/);
  await expect(target.installCommittedState(plan.id)).rejects.toThrow(/source static.*proof/);
  const staticProof=await sourceAvailability.observeStatic(context);
  expect(staticProof).toHaveLength(6);
  await expect(targetAvailability.receiveSourceStatic(context,{...staticProof[0],resource:"luvdia:ASSETS"})).rejects.toThrow(/identity/);
  await expect(targetAvailability.receiveSourceStatic(context,{...staticProof[0],generation:1})).rejects.toThrow(/identity/);
  await expect(targetAvailability.receiveSourceStatic(context,{...staticProof[0],path:"/profile/other.webp"})).rejects.toThrow(/identity/);
  await expect(targetAvailability.receiveSourceStatic(context,{...staticProof[0],fence:{...fence,boundary:fence.boundary+1}})).rejects.toThrow(/identity/);
  for(const observation of staticProof) await targetAvailability.receiveSourceStatic(context,observation);
  await expect(target.installCommittedState(plan.id)).rejects.toThrow(/Missing committed immutable R2 body/);
  const r2Proof=await sourceAvailability.observeCommittedR2(context,uploaded.logicalKey);
  await expect(targetAvailability.receiveSourceCommittedR2(context,{...r2Proof,resource:"otw-wrong"})).rejects.toThrow(/identity/);
  await expect(targetAvailability.receiveSourceCommittedR2(context,{...r2Proof,versionKey:"_versions/otw/wrong.webp"})).rejects.toThrow(/identity/);
  await expect(targetAvailability.receiveSourceCommittedR2(context,{...r2Proof,hash:"0".repeat(64)})).rejects.toThrow(/identity/);
  await targetAvailability.receiveSourceCommittedR2(context,r2Proof);
  await runtime.TRANSITION_TARGET_BUCKET.put(uploaded.versionKey,new Uint8Array([0]));
  await expect(target.installCommittedState(plan.id)).rejects.toThrow(/body|hash|proof/);
  await runtime.TRANSITION_TARGET_BUCKET.put(uploaded.versionKey,bytes);
  await target.installCommittedState(plan.id);
  const actual=await runtime.TRANSITION_TARGET_BUCKET.get(uploaded.versionKey);
  expect(await hashFileBytes(new Uint8Array(await actual!.arrayBuffer()))).toBe(uploaded.hash);
  expect(actual!.version).not.toBe(r2Proof.objectVersion);
  expect(await targetDb.prepare("SELECT version_key,hash,size FROM asset_file_references WHERE logical_key=?").bind(uploaded.logicalKey).first()).toEqual({version_key:uploaded.versionKey,hash:uploaded.hash,size:bytes.length});
  expect(await targetDb.prepare("SELECT installation_json FROM content_transitions WHERE id=?").bind(plan.id).first<string>("installation_json")).toContain('"committedFilesAvailable":true');
  await expect(targetAvailability.assertAvailable({...context,fence:{...fence,boundary:fence.boundary+1}})).rejects.toThrow(/Stale/);
  await target.activate(plan.id);
  const targetStore=buildAssetFileStore({...runtime,otw_db:targetDb,ASSET_BUCKET:runtime.TRANSITION_TARGET_BUCKET,SITE_ID:"luvdia",SITE_D1_DATABASE_NAME:"luvdia-db",SITE_ASSET_BUCKET_NAME:"luvdia-schedule"} as unknown as Env);
  const resumed=await targetStore.put({...pendingInput,bytes:new Uint8Array(await (await runtime.ASSET_BUCKET.get(pending.versionKey))!.arrayBuffer())});
  expect(resumed).toMatchObject({versionKey:pending.versionKey,memberUid:11,transitionId:plan.id});
  expect((await runtime.TRANSITION_TARGET_BUCKET.head(pending.versionKey))!.version).not.toBe(pendingObservation.objectVersion);
  expect(await targetDb.prepare("SELECT version_key FROM asset_file_references WHERE logical_key=?").bind(uploaded.logicalKey).first("version_key")).toBe(pending.versionKey);
  expect(await target.exportFileIntent(plan.id,pending.operationId)).toMatchObject({status:"intent",outcome:{outcome:"committed",sideEffectReconciled:true}});
  for(const kind of ["operation","file"] as const) await target.confirmOutcomeAcknowledgement(await source.acknowledgeOutcome(await target.readOutcomeReceipt(plan.id,kind,pending.operationId)));
  expect(await sourceDb.prepare("SELECT outcome_acknowledged FROM content_transition_file_intents WHERE intent_id=?").bind(pending.operationId).first("outcome_acknowledged")).toBe(1);
},120000);
