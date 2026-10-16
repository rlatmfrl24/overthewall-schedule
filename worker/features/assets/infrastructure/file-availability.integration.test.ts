import {catalogImportProjection} from "../../otw-play";
import { applyD1Migrations,env,type D1Migration } from "cloudflare:test";
import { beforeAll,beforeEach,expect,it,vi } from "vitest";
import { D1TransitionRepository } from "../../content-transition";
import type { FileAvailabilityContext } from "../../content-transition";
import { classifiedTables } from "../../content-transition/infrastructure/manifest-statements";
import { keySql } from "../../content-transition/infrastructure/capture-graph";
import { D1FileAvailability } from "./d1-file-availability";
import { D1R2FileStore,hashFileBytes } from "./d1-r2-file-store";
import type { TransitionPlan } from "@contracts/content-transition";
import {buildAssetFileStore} from "../../../app/assets";
import type {Env} from "../../../platform/types";
import {D1MemberReader} from "../../members";
import {getDb} from "../../../platform/db";
import {R2AssetReader} from "./r2-asset-reader";

const runtime=env as unknown as {otw_db:D1Database;transition_target_db:D1Database;ASSET_BUCKET:R2Bucket;TRANSITION_TARGET_BUCKET:R2Bucket;SOURCE_ASSETS:Fetcher;TARGET_ASSETS:Fetcher;CHANGED_ASSETS:Fetcher;MISSING_MANIFEST_ASSETS:Fetcher;CONTENT_TRANSITION_MIGRATIONS:D1Migration[]};
const sourceDb=runtime.otw_db,targetDb=runtime.transition_target_db;
const sourceAvailability=new D1FileAvailability(sourceDb,runtime.ASSET_BUCKET,runtime.SOURCE_ASSETS,"otw","otw-schedule");
const targetAvailability=new D1FileAvailability(targetDb,runtime.TRANSITION_TARGET_BUCKET,runtime.TARGET_ASSETS,"luvdia","luvdia-schedule");
const source=new D1TransitionRepository(sourceDb,"otw","otw-db","otw-schedule",sourceAvailability, catalogImportProjection);
const target=new D1TransitionRepository(targetDb,"luvdia","luvdia-db","luvdia-schedule",targetAvailability, catalogImportProjection);
beforeAll(async()=>{
  for(const db of [sourceDb,targetDb]) {
    for(const migration of runtime.CONTENT_TRANSITION_MIGRATIONS) {
      if(migration.name.startsWith("0030_")) await db.batch(["kurenai_natsuki","terri_nunna","bing_hayu","yang_mei","u_lili","on_haru","hane","kim_ate"].map((code,index)=>db.prepare("INSERT INTO members(uid,code,name,is_deprecated) VALUES(?,?,?,1)").bind(-10000-index,code,"migration bootstrap")));
      await applyD1Migrations(db,[migration]);
    }
    await db.batch([db.prepare("DELETE FROM member_links"),db.prepare("DELETE FROM music_entities"),db.prepare("DELETE FROM members")]);
  }
},120000);
beforeEach(async()=>{
  for(const db of [sourceDb,targetDb]) await db.batch([db.prepare("DELETE FROM content_transitions"),db.prepare("DELETE FROM schedules"),db.prepare("DELETE FROM notices"),db.prepare("DELETE FROM member_profile_images"),db.prepare("DELETE FROM asset_file_references"),db.prepare("DELETE FROM asset_file_versions"),db.prepare("DELETE FROM asset_file_cleanup"),db.prepare("DELETE FROM members")]);
  for(const bucket of [runtime.ASSET_BUCKET,runtime.TRANSITION_TARGET_BUCKET]) {const page=await bucket.list();if(page.objects.length) await bucket.delete(page.objects.map(object=>object.key));}
});

it("fix1 holds legacy bytes before baseline and atomically rejects stale inventory without pausing ordinary writes",async()=>{
  const members=[{code:"bing_hayu",uid:1,targetUid:11},{code:"u_lili",uid:2,targetUid:12},{code:"yang_mei",uid:3,targetUid:13}];
  await sourceDb.batch(members.map(member=>sourceDb.prepare("INSERT INTO members(uid,code,name) VALUES(?,?,?)").bind(member.uid,member.code,member.code)));
  const key="notices/thumbnails/armed.webp",next="notices/thumbnails/next.webp",bytes=new Uint8Array([1,3,5]);
  const original=(await runtime.ASSET_BUCKET.put(key,bytes))!;await runtime.ASSET_BUCKET.put(next,bytes);
  await sourceDb.prepare("INSERT INTO notices(id,content,related_member_uids,image_urls) VALUES(90,'armed','[1]',?)").bind(JSON.stringify([`/r2-assets/${key}`])).run();
  const classifications:TransitionPlan["classifications"][number][]=[];
  for(const table of classifiedTables) for(const row of (await sourceDb.prepare(`SELECT ${keySql(table,"a")} identity FROM "${table}" a`).all<{identity:string}>()).results) if(table!=="notices") classifications.push({table,key:row.identity,disposition:"exclude",reason:"Unrelated fixture"});
  const plan:TransitionPlan={id:"arm-race",sourceSite:"otw",targetSite:"luvdia",sourceResource:"otw-db",targetResource:"luvdia-db",generation:2,protocol:1,manifestDigest:"arm-approved",assetBuckets:{source:"otw-schedule",target:"luvdia-schedule"},members,classifications};
  await source.prepare(plan);
  await sourceDb.prepare("INSERT INTO asset_file_cleanup(object_key,logical_key,site_id,resource,object_version,hash,size,generation,claimed_at) VALUES(?,?,'otw','otw-schedule',?,?,?,1,1)").bind(key,key,original.version,await hashFileBytes(bytes),bytes.length).run();
  await expect(source.armFileInventory(plan.id,"blocked")).rejects.toThrow(/cleanup/);
  expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_file_inventories WHERE transition_id=?").bind(plan.id).first("n")).toBe(0);
  // Remove only this test's fabricated unfinished claim after proving rollback.
  await sourceDb.prepare("DELETE FROM asset_file_cleanup WHERE object_key=?").bind(key).run();
  await source.armFileInventory(plan.id,"original");
  await sourceAvailability.observeArmedInventory(plan.id,"original");
  let competed=false;
  const concurrent=new Proxy(sourceDb,{get(db,property){
    if(property==="batch") return async(statements:D1PreparedStatement[])=>{if(!competed){competed=true;await db.prepare("UPDATE notices SET image_urls=? WHERE id=90").bind(JSON.stringify([`/r2-assets/${next}`])).run();}return db.batch(statements);};
    const value=Reflect.get(db,property);return typeof value==="function"?value.bind(db):value;
  }});
  await expect(new D1TransitionRepository(concurrent,"otw","otw-db","otw-schedule",sourceAvailability, catalogImportProjection).protect(plan.id,{receiptId:"race",protocol:1,manifestDigest:plan.manifestDigest,inventoryId:"original"})).rejects.toThrow(/Protection failed/);
  expect(await sourceDb.prepare("SELECT phase FROM content_transitions WHERE id=?").bind(plan.id).first("phase")).toBe("prepared");
  expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_commits WHERE transition_id=?").bind(plan.id).first("n")).toBe(0);
  await expect(sourceAvailability.observeArmedInventory(plan.id,"original")).rejects.toThrow(/Stale/);
  const ordinary=buildAssetFileStore({...runtime,SITE_ID:"otw",SITE_D1_DATABASE_NAME:"otw-db",SITE_ASSET_BUCKET_NAME:"otw-schedule"} as unknown as Env);
  await ordinary.put({operationId:"independent-new",logicalKey:"notices/thumbnails/independent.webp",contentType:"image/webp",bytes});
  vi.useFakeTimers();vi.setSystemTime(original.uploaded.getTime()+24*60*60_000);
  try {await ordinary.releaseNoticeReference(key);expect(await ordinary.retention(key,key,original.uploaded.getTime())).toMatchObject({recoveryHeld:true,cleanupEligible:false});expect(await ordinary.cleanupNoticeObject(key,key)).toBe(false);expect((await runtime.ASSET_BUCKET.head(key))?.version).toBe(original.version);} finally {vi.useRealTimers();}
  await source.armFileInventory(plan.id,"current");await sourceAvailability.observeArmedInventory(plan.id,"current");
  const cost=await source.protect(plan.id,{receiptId:"current",protocol:1,manifestDigest:plan.manifestDigest,inventoryId:"current"});
  expect(await sourceDb.prepare("SELECT count(*) n FROM content_transition_file_inventories WHERE transition_id=?").bind(plan.id).first("n")).toBe(2);
  expect(await sourceDb.prepare("SELECT state FROM content_transition_file_inventories WHERE transition_id=? AND inventory_id='original'").bind(plan.id).first("state")).toBe("observed");
  console.info("fix1 inventory protect actual cost",cost);
},120000);

it.each(["notice","implicit background"])("fix1 covers a real unmanaged %s from the existing logical-key reader",async(kind)=>{
  const members=[{code:"bing_hayu",uid:1,targetUid:11},{code:"u_lili",uid:2,targetUid:12},{code:"yang_mei",uid:3,targetUid:13}];
  await sourceDb.batch(members.map(member=>sourceDb.prepare("INSERT INTO members(uid,code,name) VALUES(?,?,?)").bind(member.uid,member.code,member.code)));
  const key=kind==="notice"?"notices/thumbnails/legacy.webp":"members/bing_hayu/backgrounds/legacy/original.webp";
  const bytes=new Uint8Array([71,65,76,69,67,89]);
  await runtime.ASSET_BUCKET.put(key,bytes);
  if(kind==="notice") await sourceDb.prepare("INSERT INTO notices(id,content,related_member_uids,image_urls) VALUES(99,'legacy','[1]',?)").bind(JSON.stringify([`/r2-assets/${key}`])).run();
  if(kind==="notice") await sourceDb.batch(Array.from({length:16},(_,index)=>sourceDb.prepare("INSERT INTO notices(id,content,related_member_uids,image_urls) VALUES(?,'legacy page','[1]',?)").bind(100+index,JSON.stringify([`/r2-assets/${key}`]))));
  expect(await sourceDb.prepare("SELECT count(*) n FROM asset_file_references").first("n")).toBe(0);
  const classifications:TransitionPlan["classifications"][number][]=[];
  for(const table of classifiedTables) for(const row of (await sourceDb.prepare(`SELECT ${keySql(table,"a")} identity FROM "${table}" a`).all<{identity:string}>()).results) if(table!=="notices") classifications.push({table,key:row.identity,disposition:"exclude",reason:"Unrelated fixture configuration"});
  const plan:TransitionPlan={id:"legacy-availability",sourceSite:"otw",targetSite:"luvdia",sourceResource:"otw-db",targetResource:"luvdia-db",generation:2,protocol:1,manifestDigest:"reviewed-legacy",assetBuckets:{source:"otw-schedule",target:"luvdia-schedule"},members,classifications};
  await source.prepare(plan);await target.prepare(plan);
  await expect(source.protect(plan.id,{receiptId:"legacy-hold",protocol:1,manifestDigest:plan.manifestDigest})).rejects.toThrow(/Explicit observed/);
  await source.armFileInventory(plan.id,"legacy-inventory");
  await sourceAvailability.observeArmedInventory(plan.id,"legacy-inventory");
  await sourceAvailability.observeArmedInventory(plan.id,"legacy-inventory");
  await source.protect(plan.id,{receiptId:"legacy-hold",protocol:1,manifestDigest:plan.manifestDigest,inventoryId:"legacy-inventory"});
  await source.beginCopy(plan.id);await source.beginReplay(plan.id);
  const header=await source.describeBaseline(plan.id);
  await expect(target.beginBaseline({...header,fileInventory:undefined})).rejects.toThrow(/seal/);
  await expect(target.beginBaseline({...header,fileInventory:{...header.fileInventory!,plan:{...plan,fileOrigins:[{kind:"external",origin:"https://forged.example",reason:"Unapproved fixture origin"}]}}})).rejects.toThrow(/plan conflict/);
  await expect(target.beginBaseline({...header,fileInventory:{...header.fileInventory!,manifestRevision:1}})).rejects.toThrow(/revision/);
  await target.beginBaseline(header);
  await expect(target.beginBaseline({...header,fileInventory:{...header.fileInventory!,inventoryId:"different-baseline"}})).rejects.toThrow(/seal/);
  let cursor:Awaited<ReturnType<typeof source.exportBaselinePage>>["next"]|0=0;
  do{const page=await source.exportBaselinePage(header,cursor);await target.stageBaselinePage(page);cursor=page.next;}while(cursor.ordinal<header.rows);
  while(await target.materializeBaselinePage(plan.id)){ /* actual installer */ }
  await target.finalizeBaseline(plan.id);
  await source.acknowledgeIngress(await target.openIngress(plan.id,"legacy-ready",Date.now()+60000),Date.now());
  const fence=await source.freeze(plan.id,Date.now());await target.installFence(fence);
  const context:FileAvailabilityContext={plan,manifestRevision:0,fence};
  for(const proof of await sourceAvailability.observeStatic(context)) await targetAvailability.receiveSourceStatic(context,proof);
  await expect(target.installCommittedState(plan.id)).rejects.toThrow(/Missing.*inventory/);
  const firstInventoryPage=await sourceAvailability.exportInventoryPage(context,0);
  for(let offset=0;;) {
    const page=await sourceAvailability.exportInventoryPage(context,offset);
    await expect(targetAvailability.receiveInventoryPage(context,{...page,header:{...page.header,plan:{...page.header.plan,assetBuckets:{source:"otw-wrong",target:"luvdia-schedule"}}}})).rejects.toThrow(/resource/);
    await expect(targetAvailability.receiveInventoryPage(context,{...page,header:{...page.header,inventoryId:"replacement"}})).rejects.toThrow(/baseline seal/);
    await expect(targetAvailability.receiveInventoryPage(context,{...page,header:{...page.header,manifestRevision:1}})).rejects.toThrow(/baseline seal/);
    await expect(targetAvailability.receiveInventoryPage(context,{...page,header:{...page.header,digest:"0".repeat(64)}})).rejects.toThrow(/baseline seal/);
    await expect(targetAvailability.receiveInventoryPage(context,{...page,header:{...page.header,coverage:[]}})).rejects.toThrow(/coverage/);
    await expect(targetAvailability.receiveInventoryPage({...context,fence:{...fence,boundary:fence.boundary+1}},page)).rejects.toThrow(/Stale/);
    const object=page.records.find(record=>record.kind==="object");
    if(object) {
      const wrong={...object,value:JSON.stringify({...JSON.parse(object.value),objectVersion:"forged-version"})};
      await expect(targetAvailability.receiveInventoryPage(context,{...page,records:page.records.map(record=>record===object?wrong:record)})).rejects.toThrow(/digest/);
    }
    await targetAvailability.receiveInventoryPage(context,page);await targetAvailability.receiveInventoryPage(context,page);
    offset=page.next.ordinal;if(offset===page.header.rows) break;
  }
  const progress=await targetDb.prepare("SELECT * FROM content_transition_file_inventories WHERE transition_id=?").bind(plan.id).first();
  const writes=vi.fn();
  const readOnlyTarget=new Proxy(targetDb,{get(db,property){
    if(property==="batch") return (...args:Parameters<D1Database["batch"]>)=>{writes();return db.batch(...args);};
    if(property==="prepare") return (sql:string)=>{if(/^\s*(INSERT|UPDATE|DELETE|REPLACE)/i.test(sql)) writes();return db.prepare(sql);};
    const value=Reflect.get(db,property);return typeof value==="function"?value.bind(db):value;
  }});
  await new D1FileAvailability(readOnlyTarget,runtime.TRANSITION_TARGET_BUCKET,runtime.TARGET_ASSETS,"luvdia","luvdia-schedule").receiveInventoryPage(context,firstInventoryPage);
  expect(writes).not.toHaveBeenCalled();
  expect(await targetDb.prepare("SELECT * FROM content_transition_file_inventories WHERE transition_id=?").bind(plan.id).first()).toEqual(progress);
  await expect(targetAvailability.receiveInventoryPage(context,{...firstInventoryPage,records:firstInventoryPage.records.slice(1)})).rejects.toThrow(/bounds/);
  await expect(targetAvailability.receiveInventoryPage(context,{...firstInventoryPage,start:{ordinal:300,digest:"0"}})).rejects.toThrow(/bounds/);
  if(firstInventoryPage.next.ordinal<firstInventoryPage.header.rows) {
    const changed=structuredClone(firstInventoryPage);
    changed.records[0].value=JSON.stringify({...JSON.parse(changed.records[0].value),objectVersion:"different-upload-version"});
    let digest=changed.start.digest;
    for(const record of changed.records) digest=await hashFileBytes(new TextEncoder().encode(digest+await hashFileBytes(new TextEncoder().encode(JSON.stringify(record)))));
    changed.next.digest=digest;
    await expect(targetAvailability.receiveInventoryPage(context,changed)).rejects.toThrow(/replayed page row conflict/);
  }
  await expect(target.installCommittedState(plan.id)).rejects.toThrow(/Missing inventory R2 body/);
  await runtime.TRANSITION_TARGET_BUCKET.put(key,new Uint8Array([0]));
  await expect(target.installCommittedState(plan.id)).rejects.toThrow(/body\/hash\/size/);
  await runtime.TRANSITION_TARGET_BUCKET.put(key,bytes);
  await expect(target.installCommittedState(plan.id)).resolves.toBeUndefined();
  const readable=await new R2AssetReader(runtime.TRANSITION_TARGET_BUCKET,targetDb).read(key);
  expect(await hashFileBytes(new Uint8Array(await new Response(readable!.body).arrayBuffer()))).toBe(await hashFileBytes(bytes));
  if(kind==="implicit background") expect((await new D1MemberReader(getDb({...runtime,otw_db:targetDb} as unknown as Env),runtime.TRANSITION_TARGET_BUCKET,true).findProfileByCode("bing_hayu"))?.backgroundImages).toEqual([expect.objectContaining({id:"legacy"})]);
  expect(await targetDb.prepare("SELECT installation_json FROM content_transitions WHERE id=?").bind(plan.id).first("installation_json")).toBeTruthy();
  const proofs=(await targetDb.prepare("SELECT observation_json FROM content_transition_file_availability_evidence WHERE json_extract(observation_json,'$.kind')='legacy_r2'").all<{observation_json:string}>()).results.map(row=>JSON.parse(row.observation_json));
  expect(proofs.at(-1)).toMatchObject({logicalKey:key,hash:await hashFileBytes(bytes),size:bytes.byteLength,objectVersion:(await runtime.TRANSITION_TARGET_BUCKET.head(key))!.version});
  expect(await sourceDb.prepare("SELECT count(*) n FROM asset_file_references").first("n")).toBe(0);
  await runtime.ASSET_BUCKET.put(key,bytes);
  await expect(sourceAvailability.exportInventoryPage(context)).rejects.toThrow(/version/);
},120000);

it("copies the sealed legacy inventory and live replay before source fence through the baseline file ports",async()=>{
  const members=[{code:"bing_hayu",uid:1,targetUid:11},{code:"u_lili",uid:2,targetUid:12},{code:"yang_mei",uid:3,targetUid:13}];
  await sourceDb.batch(members.map(member=>sourceDb.prepare("INSERT INTO members(uid,code,name) VALUES(?,?,?)").bind(member.uid,member.code,member.code)));
  const keys=["notices/thumbnails/early.webp","members/bing_hayu/backgrounds/early/original.webp"];
  for(const key of keys) await runtime.ASSET_BUCKET.put(key,new TextEncoder().encode(`original ${key}`));
  await sourceDb.prepare("INSERT INTO notices(id,content,related_member_uids,image_urls) VALUES(99,'before copy','[1]',?)").bind(JSON.stringify([`/r2-assets/${keys[0]}`])).run();
  const classifications:TransitionPlan["classifications"][number][]=[];
  for(const table of classifiedTables) for(const row of (await sourceDb.prepare(`SELECT ${keySql(table,"a")} identity FROM "${table}" a`).all<{identity:string}>()).results) if(table!=="notices") classifications.push({table,key:row.identity,disposition:"exclude",reason:"Unrelated fixture configuration"});
  const plan:TransitionPlan={id:"early-inventory",sourceSite:"otw",targetSite:"luvdia",sourceResource:"otw-db",targetResource:"luvdia-db",generation:2,protocol:1,manifestDigest:"reviewed-early",assetBuckets:{source:"otw-schedule",target:"luvdia-schedule"},members,classifications};
  let early={plan,manifestRevision:0};
  await source.prepare(plan);await target.prepare(plan);
  await source.armFileInventory(plan.id,"early-original");await sourceAvailability.observeArmedInventory(plan.id,"early-original");
  await source.protect(plan.id,{receiptId:"hold",protocol:1,manifestDigest:plan.manifestDigest,inventoryId:"early-original"});
  await source.beginCopy(plan.id);
  await expect(target.openIngress(plan.id,"early-ready",Date.now()+60000)).rejects.toThrow(/baseline/);
  const header=await source.describeBaseline(plan.id);
  const page=await sourceAvailability.exportBaselineInventoryPage(early);
  await expect(targetAvailability.receiveBaselineInventoryPage(early,page)).rejects.toThrow(/[Bb]aseline/);
  await target.beginBaseline(header);
  await expect(targetAvailability.receiveBaselineInventoryPage(early,{...page,header:{...page.header,inventoryId:"forged"}})).rejects.toThrow(/seal/);
  await expect(targetAvailability.receiveBaselineInventoryPage({...early,manifestRevision:1},page)).rejects.toThrow(/Stale/);
  await expect(new D1FileAvailability(targetDb,runtime.TRANSITION_TARGET_BUCKET,runtime.TARGET_ASSETS,"luvdia","luvdia-other").receiveBaselineInventoryPage(early,page)).rejects.toThrow(/resource/);
  const revision=await source.appendClassifications(plan.id,{revision:0,digest:plan.manifestDigest},[],"reviewed-early-v2",{receiptId:"early-v2",protocol:1,manifestDigest:"reviewed-early-v2"},[{kind:"external",origin:"https://approved-external.example",reason:"Approved additional origin"}]);
  let raced=false;
  const concurrent=new Proxy(targetDb,{get(db,property){
    if(property==="batch") return async(statements:D1PreparedStatement[])=>{if(!raced){raced=true;await target.acceptManifestRevision(revision);}return db.batch(statements);};
    const value=Reflect.get(db,property);return typeof value==="function"?value.bind(db):value;
  }});
  await expect(new D1FileAvailability(concurrent,runtime.TRANSITION_TARGET_BUCKET,runtime.TARGET_ASSETS,"luvdia","luvdia-schedule").receiveBaselineInventoryPage(early,page)).rejects.toThrow(/context/);
  expect(await targetDb.prepare("SELECT staged_rows FROM content_transition_file_inventories WHERE transition_id=?").bind(plan.id).first("staged_rows")).toBe(0);
  expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_file_inventory_rows WHERE transition_id=?").bind(plan.id).first("n")).toBe(0);
  await expect(sourceAvailability.exportBaselineInventoryPage(early)).rejects.toThrow(/Stale/);
  early={plan:revision.plan,manifestRevision:revision.revision};
  expect(await source.describeBaseline(plan.id)).toEqual(header);
  expect((await sourceAvailability.exportBaselineInventoryPage(early)).header).toEqual(page.header);
  await target.beginBaseline(header);
  await targetAvailability.receiveBaselineInventoryPage(early,page);
  await targetAvailability.receiveBaselineInventoryPage(early,page);
  await expect(targetAvailability.verifyBaselineInventory(early)).rejects.toThrow(/Missing inventory R2 body/);
  for(const record of page.records.filter(record=>record.kind==="object")) {
    const object=await runtime.ASSET_BUCKET.get(record.identity);
    await runtime.TRANSITION_TARGET_BUCKET.put(record.identity,await object!.arrayBuffer());
  }
  await targetAvailability.verifyBaselineInventory(early);
  await runtime.TRANSITION_TARGET_BUCKET.put(keys[0],new Uint8Array([0]));
  await expect(targetAvailability.verifyBaselineInventory(early)).rejects.toThrow(/hash\/size/);
  await runtime.TRANSITION_TARGET_BUCKET.put(keys[0],await (await runtime.ASSET_BUCKET.get(keys[0]))!.arrayBuffer());
  let cursor:Awaited<ReturnType<typeof source.exportBaselinePage>>["next"]|0=0;
  do{const baselinePage=await source.exportBaselinePage(header,cursor);await target.stageBaselinePage(baselinePage);cursor=baselinePage.next;}while(cursor.ordinal<header.rows);
  while(await target.materializeBaselinePage(plan.id)){ /* normal inactive baseline installer */ }
  await target.finalizeBaseline(plan.id);
  await target.openIngress(plan.id,"early-baseline-ready",Date.now()+60000);
  await source.beginReplay(plan.id);
  await source.admit({transitionId:plan.id,operationId:"early-live",idempotencyKey:"early-live",codec:{id:"schedules.save",version:1},kind:"content_edit",subject:{table:"schedules",key:"[200]"},expectedVersion:null,validation:{contract:1,validatedAt:Date.now()},admittedAt:Date.now(),payload:{id:200,member_uid:1,date:"2026-10-14",start_time:null,title:"ordinary live edit during copy",status:"방송"}});
  const command=await source.readExecutableCommand(plan.id,"early-live");
  await source.commit(plan.id,"early-live",1,[sourceDb.prepare("INSERT INTO schedules(id,member_uid,date,start_time,title,status) VALUES(?,?,?,?,?,?)").bind(command.payload.id,command.payload.member_uid,command.payload.date,command.payload.start_time,command.payload.title,command.payload.status)]);
  for(const commit of await source.exportProjectedCommits(plan.id,header.boundary)) await target.installProjectedCommit(commit);
  expect(await targetDb.prepare("SELECT title,member_uid FROM schedules WHERE id=200").first()).toEqual({title:"ordinary live edit during copy",member_uid:11});
  for(const db of [sourceDb,targetDb]) expect(await db.prepare("SELECT fence_json FROM content_transitions WHERE id=?").bind(plan.id).first("fence_json")).toBeNull();
  await targetAvailability.verifyBaselineInventory(early);
  await expect(target.installCommittedState(plan.id)).rejects.toThrow(/fence/);
  expect(await targetDb.prepare("SELECT count(*) n FROM content_transition_file_availability_evidence").first("n")).toBe(0);
  await source.acknowledgeIngress(await target.openIngress(plan.id,"early-v2-ready",Date.now()+60000),Date.now());
  const fence=await source.freeze(plan.id,Date.now());await target.installFence(fence);
  const context={...early,fence};
  await expect(sourceAvailability.exportBaselineInventoryPage(early)).rejects.toThrow(/fenced/);
  await expect(targetAvailability.receiveBaselineInventoryPage(early,page)).rejects.toThrow(/fenced/);
  for(const proof of await sourceAvailability.observeStatic(context)) await targetAvailability.receiveSourceStatic(context,proof);
  await target.installCommittedState(plan.id);
  for(const key of keys) {
    const actual=await new R2AssetReader(runtime.TRANSITION_TARGET_BUCKET,targetDb).read(key);
    expect(await new Response(actual!.body).text()).toBe(`original ${key}`);
  }
  expect(await targetDb.prepare("SELECT installation_json FROM content_transitions WHERE id=?").bind(plan.id).first("installation_json")).toContain('"committedFilesAvailable":true');
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
  await source.armFileInventory(plan.id,"managed-inventory");await sourceAvailability.observeArmedInventory(plan.id,"managed-inventory");
  await source.protect(plan.id,{receiptId:"hold",protocol:1,manifestDigest:plan.manifestDigest,inventoryId:"managed-inventory"});
  const sourceStore=buildAssetFileStore({...runtime,SITE_ID:"otw",SITE_D1_DATABASE_NAME:"otw-db",SITE_ASSET_BUCKET_NAME:"otw-schedule"} as unknown as Env);
  const pendingInput={operationId:"transfer-pending",logicalKey:uploaded.logicalKey,contentType:"image/webp",bytes:new Uint8Array([9,8,7,6])};
  const pending=await sourceStore.begin(pendingInput);
  const pendingObservation=await sourceStore.verifyPut(pending,pendingInput.bytes);
  await source.beginCopy(plan.id);await source.beginReplay(plan.id);
  const header=await source.describeBaseline(plan.id);await target.beginBaseline(header);
  let cursor:Awaited<ReturnType<typeof source.exportBaselinePage>>["next"]|0=0;
  do{const page=await source.exportBaselinePage(header,cursor);await target.stageBaselinePage(page);cursor=page.next;}while(cursor.ordinal<header.rows);
  while(await target.materializeBaselinePage(plan.id)){ /* bounded normal installer */ }
  await target.finalizeBaseline(plan.id);
  await source.acknowledgeIngress(await target.openIngress(plan.id,"ready",Date.now()+60_000),Date.now());
  const fence=await source.freeze(plan.id,Date.now());await target.installFence(fence);
  await expect(sourceStore.commitReference(pending,pendingObservation)).rejects.toThrow(/owner|fenced/);
  for(const operation of await source.exportFrozenOperations(plan.id)) await target.receiveOperation(operation);
  for(const intent of await source.exportFrozenFileIntents(plan.id)) await target.receiveFileIntent(intent);
  const manifestRevision=await sourceDb.prepare("SELECT manifest_revision FROM content_transitions WHERE id=?").bind(plan.id).first<number>("manifest_revision");
  const context:FileAvailabilityContext={plan,manifestRevision:manifestRevision!,fence};
  for(let offset=0;;) {const page=await sourceAvailability.exportInventoryPage(context,offset);await targetAvailability.receiveInventoryPage(context,page);offset=page.next.ordinal;if(offset===page.header.rows) break;}
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
