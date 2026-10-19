import { meterD1 } from "../../../test-support/d1-meter";
import { D1MemberReader } from "../../members/infrastructure/d1-member-reader";
import { getDb } from "../../../platform/db";
import { readSiteSchemaMigrations } from "../../../test-support/site-schema";
import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it } from "vitest";
import { D1R2FileStore } from "./d1-r2-file-store";
import { buildAssetFileStore } from "../../../app/assets";
import type { Env } from "../../../platform/types";
import {filePathSql,fileOriginSql} from "./file-reference-index";
import {classifyFileReference,ownedFilePathSql} from "../domain/file-reference";
import {D1AssetAccessReader} from "./d1-asset-access-reader";

const runtime = env as unknown as { otw_db:D1Database; ASSET_BUCKET:R2Bucket; };
const db = runtime.otw_db;
const bucket = runtime.ASSET_BUCKET;
const store = new D1R2FileStore(db, bucket, "otw", "otw-schedule");
const input = (operationId:string, bytes = new Uint8Array([82,73,70,70,255])) => ({ operationId, logicalKey:"notices/thumbnails/recover.webp", contentType:"image/webp", bytes });
let migrationPreserved=false;
beforeAll(async () => {
  for(const migration of (await readSiteSchemaMigrations())) {
    if(migration.name.startsWith("0030_")) await db.batch(["kurenai_natsuki","terri_nunna","bing_hayu","yang_mei","u_lili","on_haru","hane","kim_ate"].map((code,index)=>db.prepare("INSERT INTO members(uid,code,name,is_deprecated) VALUES(?,?,?,1)").bind(-10000-index,code,"migration bootstrap")));
    if(migration.name.startsWith("0111_")) await db.prepare("INSERT INTO notices(id,content,image_urls) VALUES(995,'migration preservation','[\"/r2-assets/notices/thumbnails/%6Cegacy.webp?version=1\"]')").run();
    await applyD1Migrations(db,[migration]);
  }
  const notice=await db.prepare("SELECT content,image_urls FROM notices WHERE id=995").first();
  const path=await db.prepare("SELECT raw_url,path FROM asset_file_reference_paths WHERE row_table='notices' AND row_key='[995]'").first();
  migrationPreserved=JSON.stringify(notice)===JSON.stringify({content:"migration preservation",image_urls:'["/r2-assets/notices/thumbnails/%6Cegacy.webp?version=1"]'}) && JSON.stringify(path)===JSON.stringify({raw_url:"/r2-assets/notices/thumbnails/%6Cegacy.webp?version=1",path:"/r2-assets/notices/thumbnails/legacy.webp"});
},120000);
beforeEach(async()=>{
  await db.batch([db.prepare("DELETE FROM content_transitions"),db.prepare("DELETE FROM content_historical_records"),db.prepare("DELETE FROM notices"),db.prepare("DELETE FROM asset_file_references"),db.prepare("DELETE FROM asset_file_versions"),db.prepare("DELETE FROM asset_file_cleanup"),db.prepare("DELETE FROM asset_file_retention_releases")]);
  const page=await bucket.list();
  if(page.objects.length) await bucket.delete(page.objects.map(object=>object.key));
});
it("preserves populated raw references during incremental migration and rolls back index/release changes with a failed owning batch",async()=>{
  expect(migrationPreserved).toBe(true);
  const raw="/r2-assets/notices/thumbnails/rollback.webp";
  await db.prepare("INSERT INTO notices(id,content,image_urls) VALUES(994,'rollback',?)").bind(JSON.stringify([raw])).run();
  const read=async()=>({notice:await db.prepare("SELECT image_urls FROM notices WHERE id=994").first(),index:(await db.prepare("SELECT * FROM asset_file_reference_paths WHERE row_table='notices' AND row_key='[994]'").all()).results,release:(await db.prepare("SELECT * FROM asset_file_retention_releases").all()).results});
  const before=await read();
  await expect(db.batch([db.prepare("UPDATE notices SET image_urls='[]' WHERE id=994"),db.prepare("INSERT INTO asset_file_reference_paths(row_table,row_key,field,raw_url,path) VALUES('notices','[994]','thumbnail_url','forged','/profile/forged.webp')")])).rejects.toThrow(/index_identity/);
  expect(await read()).toEqual(before);
});
it("keeps SQL URL identity equal to the owning parser for encoded path delimiters",async()=>{
  const plan={sourceSite:"otw",targetSite:"luvdia",assetBuckets:{source:"otw-schedule",target:"luvdia-schedule"}} as Parameters<typeof classifyFileReference>[1];
  for(const raw of ["/%C2%A2%2f..%2fprofile/bing_hayu.webp","/%E0%A0%80%2f..%2fprofile/bing_hayu.webp","/%ED%9F%BF%2f..%2fprofile/bing_hayu.webp","/%F0%90%80%80%2f..%2fprofile/bing_hayu.webp","/%F4%8F%BF%BF%2f..%2fprofile/bing_hayu.webp","/%GG/../profile/bing_hayu.webp","/%ff/../profile/bing_hayu.webp","/%E0%80%80%2f..%2fprofile/bing_hayu.webp","/%ED%A0%80%2f..%2fprofile/bing_hayu.webp","/%F0%80%80%80%2f..%2fprofile/bing_hayu.webp","/%F4%90%80%80%2f..%2fprofile/bing_hayu.webp","/%C2%2f..%2fprofile/bing_hayu.webp","/%GG%2f..%2fprofile/bing_hayu.webp","/%ff%2f..%2fprofile/bing_hayu.webp","/\\foreign.example/../../profile/bing_hayu.webp","/\t\\foreign.example/../../profile/bing_hayu.webp","/\n\\foreign.example/../../profile/bing_hayu.webp","/\r\\foreign.example/../../profile/bing_hayu.webp","/%5cforeign.example%2F..%2F..%2Fprofile/bing_hayu.webp","/%2fforeign.example%2F..%2F..%2Fprofile/bing_hayu.webp","/profile/bi\tng_hayu.webp","/%5cforeign.example/../../profile/bing_hayu.webp","/%2fforeign.example/../../profile/bing_hayu.webp","/profile//bing_hayu.webp","/profile/bing_hayu.webp/","/r2-assets/notices//thumbnails/a.webp","/r2-assets/notices/thumbnails/recover.webp%23ignored","/r2-assets/notices%5Cthumbnails/recover.webp","/r2-assets/notices/thumbnails/recover.webp%3Fcache=1","/r2-assets/notices/old/%2e%2e/thumbnails/%72ecover.webp?cache=1#fragment"]) {
    let accepted=true;try{classifyFileReference(raw,plan);}catch{accepted=false;}
    const sqlPath=await db.prepare(`WITH input AS (SELECT ? raw) SELECT ${filePathSql("raw")} path FROM input`).bind(raw).first<string>("path");
    expect(await db.prepare(`SELECT ${ownedFilePathSql("?")} ok`).bind(sqlPath).first("ok"),raw).toBe(accepted?1:0);
    if(!accepted) continue;
    const parsed=classifyFileReference(raw,plan);
    const sql=await db.prepare(`WITH input AS (SELECT ? raw) SELECT ${filePathSql("raw")} path,${fileOriginSql("raw")} origin FROM input`).bind(raw).first();
    expect(sql).toEqual({path:parsed.kind==="owned"?parsed.path:null,origin:null});
  }
});
it("uses the same positive owned-path allowlist in real D1 and the owning parser",async()=>{
  const plan={sourceSite:"otw",targetSite:"luvdia",assetBuckets:{source:"otw-schedule",target:"luvdia-schedule"}} as Parameters<typeof classifyFileReference>[1];
  for(const path of ["/profile/bing_hayu.webp","/profile/signatures/bing_hayu.png","/r2-assets/profile/bing_hayu.webp","/r2-assets/profile/signatures/bing_hayu.png","/r2-assets/members/bing_hayu/backgrounds/default/original.webp","/r2-assets/members/Bing_hayu/backgrounds/default/w960.webp","/r2-assets/notices/thumbnails/a-B_0.jpeg","/profile/__artifact.json","/profile/.webp","/profile/nested/name.webp","/r2-assets/notices/thumbnails/-bad.webp","/r2-assets/notices/thumbnails/a/b.webp","/r2-assets/members/a/backgrounds/_bad/original.webp","/r2-assets/PROFILE/a.webp","/r2-assets/notices/thumbnails/a.svg","/unrecognized/file.webp"]) {
    let valid=true;try{classifyFileReference(path,plan);}catch{valid=false;}
    expect(await db.prepare(`WITH input AS (SELECT ? path) SELECT ${ownedFilePathSql("input.path")} valid FROM input`).bind(path).first("valid"),path).toBe(valid?1:0);
  }
});
it("maintains the derived index on JSON replacement and key move, rejects forgery, and rebuilds a missing row from current raw input",async()=>{
  const raw="/r2-assets/notices/thumbnails/%72ecover.webp?cache=1";
  await store.put(input("index-held"));
  await db.prepare("INSERT INTO notices(id,content,image_urls) VALUES(999,'index',?)").bind(JSON.stringify([raw])).run();
  const select="SELECT row_key,field,raw_url,origin,path FROM asset_file_reference_paths WHERE row_table='notices'";
  expect((await db.prepare(select).all()).results).toEqual([{row_key:"[999]",field:"image_urls.0",raw_url:raw,origin:null,path:"/r2-assets/notices/thumbnails/recover.webp"}]);
  await expect(db.prepare("UPDATE asset_file_reference_paths SET path='/r2-assets/notices/thumbnails/forged.webp'").run()).rejects.toThrow(/index_identity/);
  await expect(db.prepare("DELETE FROM asset_file_reference_paths WHERE row_table='notices'").run()).rejects.toThrow(/current_reference/);
  const reader=new D1AssetAccessReader(db,"https://otw-schedule.info");
  expect((await reader.readAccess("/r2-assets/notices/thumbnails/recover.webp")).restricted).toBe(false);
  const guard=(await db.prepare("SELECT sql FROM sqlite_schema WHERE name='asset_file_path_delete'").first<string>("sql"))!;
  // Deliberate derived-cache corruption in this disposable database: authority remains the business row.
  await db.prepare("DROP TRIGGER asset_file_path_delete").run();
  try { await db.prepare("DELETE FROM asset_file_reference_paths WHERE row_table='notices'").run(); } finally { await db.prepare(guard).run(); }
  expect((await reader.readAccess("/r2-assets/notices/thumbnails/recover.webp")).restricted).toBe(true);
  expect(await store.releaseNoticeReference(input("index-held").logicalKey)).toBe(false);
  await db.prepare("UPDATE notices SET content='rebuild current input' WHERE id=999").run();
  expect((await reader.readAccess("/r2-assets/notices/thumbnails/recover.webp")).restricted).toBe(false);
  await db.prepare("UPDATE notices SET id=1001,image_urls=? WHERE id=999").bind(JSON.stringify(["https://foreign.example/r2-assets/notices/thumbnails/recover.webp"])).run();
  expect((await db.prepare(select).all()).results).toEqual([{row_key:"[1001]",field:"image_urls.0",raw_url:"https://foreign.example/r2-assets/notices/thumbnails/recover.webp",origin:"https://foreign.example",path:"/r2-assets/notices/thumbnails/recover.webp"}]);
  expect((await reader.readAccess("/r2-assets/notices/thumbnails/recover.webp")).restricted).toBe(true);
  expect(await store.releaseNoticeReference(input("index-held").logicalKey)).toBe(false);
  await db.prepare("DELETE FROM notices WHERE id=1001").run();
  expect((await db.prepare(select).all()).results).toEqual([]);
});
it("keeps ordinary file-reference writes bounded with 1000 unrelated references",async()=>{
  await db.prepare("INSERT INTO notices(id,content,image_urls) VALUES(1,'small','[\"/r2-assets/notices/thumbnails/recover.webp\"]')").run();
  const small=await db.prepare("UPDATE notices SET content='small edit' WHERE id=1").run();
  await db.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<1000) INSERT INTO notices(id,content,image_urls) SELECT x+10,'unrelated',json_array('/r2-assets/notices/thumbnails/unrelated-'||x||'.webp') FROM n").run();
  const large=await db.prepare("UPDATE notices SET content='large edit' WHERE id=1").run();
  expect(large.meta.rows_written).toBe(small.meta.rows_written);
  expect(large.meta.rows_read).toBeLessThanOrEqual(small.meta.rows_read+10);
  expect(await db.prepare("SELECT count(*) n FROM asset_file_reference_paths WHERE row_table='notices'").first("n")).toBe(1001);
  console.info("actual file index ordinary costs",JSON.stringify({small:small.meta,large:large.meta}));
});
it("keeps asset authorization reads bounded with unrelated file references",async()=>{
  await db.batch([
    db.prepare("INSERT INTO members(uid,code,name) VALUES(90001,'asset_cost_public','Asset cost public')"),
    db.prepare("INSERT INTO member_profile_images(id,member_uid,image_url) VALUES(90001,90001,'/profile/asset_cost_public.webp')"),
    db.prepare("INSERT INTO notices(id,content,image_urls) VALUES(1,'public asset','[\"/r2-assets/notices/thumbnails/access-cost.webp\"]')"),
    db.prepare("INSERT INTO naver_cafe_sources(id,name,cafe_id,menu_id,cafe_url) VALUES(90001,'Asset cost','90001','1','https://cafe.naver.com/asset-cost')"),
    db.prepare("INSERT INTO naver_cafe_posts(id,article_id,source_id,source_name,cafe_id,menu_id,member_uid,title,summary,created_at,url,fetched_at,thumbnail_url) VALUES('asset-cost-target',1,90001,'Asset cost','90001','1',90001,'Asset cost','','2026-10-19','https://cafe.naver.com/asset-cost/1',1,'/r2-assets/notices/thumbnails/cafe-access-cost.webp')"),
  ]);
  const paths=["/profile/asset_cost_public.webp","/r2-assets/notices/thumbnails/access-cost.webp","/r2-assets/notices/thumbnails/missing.webp","/r2-assets/notices/thumbnails/cafe-access-cost.webp"];
  const costs:number[][][]=[];
  for(const size of [10,1000]) {
    await db.batch([
      db.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<?) INSERT OR IGNORE INTO notices(id,content,image_urls) SELECT x+10,'unrelated',json_array('/r2-assets/notices/thumbnails/unrelated-'||x||'.webp') FROM n").bind(size),
      db.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<?) INSERT OR IGNORE INTO member_profile_images(id,member_uid,image_url) SELECT 100000+x,90001,'/r2-assets/members/asset_cost_public/backgrounds/unrelated-'||x||'.webp' FROM n").bind(size),
      db.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<?) INSERT OR IGNORE INTO naver_cafe_posts(id,article_id,source_id,source_name,cafe_id,menu_id,member_uid,title,summary,created_at,url,fetched_at,thumbnail_url) SELECT 'asset-cost-cafe-'||x,x+10,90001,'Asset cost','90001','1',90001,'Unrelated','','2026-10-19','https://cafe.naver.com/asset-cost/'||(x+10),1,'/r2-assets/notices/thumbnails/unrelated-cafe-'||x||'.webp' FROM n").bind(size),
    ]);
    const snapshots:number[][]=[];
    for(const analyzed of [false,true]) {
      if(analyzed) await db.prepare("ANALYZE").run();
      const reads:Array<{sql:string;args:unknown[];rowsRead:number;rowsWritten:number}>=[];
      const measured=new Proxy(db,{get(database,key){
        if(key==="prepare") return (sql:string)=>{
          const wrap=(statement:D1PreparedStatement,args:unknown[]=[]):D1PreparedStatement=>new Proxy(statement,{get(target,method){
            if(method==="bind")return(...values:unknown[])=>wrap(target.bind(...values),values);
            if(method==="all" || method==="first")return async(column?:string)=>{
              const result=await target.all();
              reads.push({sql,args,rowsRead:result.meta.rows_read,rowsWritten:result.meta.rows_written});
              const row=result.results[0];
              return method==="all"?result:column?row?.[column]??null:row??null;
            };
            const value=Reflect.get(target,method,target);return typeof value==="function"?value.bind(target):value;
          }});
          return wrap(database.prepare(sql));
        };
        const value=Reflect.get(database,key,database);return typeof value==="function"?value.bind(database):value;
      }});
      const reader=new D1AssetAccessReader(measured,"https://otw-schedule.info");
      const sample:number[]=[];
      const plans:Array<{path:string;plan:Array<{detail:string}>}>=[];
      for(const [index,path] of paths.entries()) {
        const start=reads.length;
        expect((await reader.readAccess(path)).restricted).toBe(index===2);
        sample.push(reads.slice(start).reduce((sum,entry)=>sum+entry.rowsRead,0));
        const query=reads[start];
        const plan=(await db.prepare(`EXPLAIN QUERY PLAN ${query.sql}`).bind(...query.args).all<{detail:string}>()).results;
        plans.push({path,plan});
        expect.soft(plan.some(row=>/^SCAN (?:p|n)(?: |$)/.test(row.detail)),JSON.stringify({size,analyzed,path,plan})).toBe(false);
      }
      expect(reads.every(entry=>entry.rowsWritten===0)).toBe(true);
      snapshots.push(sample);
      console.info("ASSET_ACCESS_READ_COST",JSON.stringify({size,analyzed,paths,rowsRead:sample,plans}));
    }
    costs.push(snapshots);
  }
  for(const analyzed of [0,1])for(const index of paths.keys())expect.soft(costs[1][analyzed][index],JSON.stringify({analyzed,paths,costs})).toBeLessThanOrEqual(costs[0][analyzed][index]+20);
});
it("validates current profile and text-key Cafe references after path lookup",async()=>{
  const path="/r2-assets/notices/thumbnails/shared-owner.webp";
  await db.batch([
    db.prepare("INSERT INTO members(uid,code,name) VALUES(90002,'asset_reference','Asset reference')"),
    db.prepare("INSERT INTO member_profile_images(id,member_uid,image_url) VALUES(90002,90002,?)").bind(path),
    db.prepare("INSERT INTO naver_cafe_sources(id,name,cafe_id,menu_id,cafe_url) VALUES(90002,'Asset reference','90002','1','https://cafe.naver.com/asset-reference')"),
    db.prepare("INSERT INTO naver_cafe_posts(id,article_id,source_id,source_name,cafe_id,menu_id,title,summary,created_at,url,fetched_at,thumbnail_url) VALUES('asset-reference-text-key',1,90002,'Asset reference','90002','1','Reference','','2026-10-19','https://cafe.naver.com/asset-reference/1',1,?)").bind(path),
  ]);
  const reader=new D1AssetAccessReader(db,"https://otw-schedule.info");
  expect((await reader.readAccess(path)).restricted).toBe(false);
  await db.prepare("UPDATE naver_cafe_posts SET content_access='admin_archive' WHERE id='asset-reference-text-key'").run();
  expect((await reader.readAccess(path)).restricted).toBe(false);
  await db.prepare("UPDATE members SET content_access='admin_archive' WHERE uid=90002").run();
  expect((await reader.readAccess(path)).restricted).toBe(true);
  await db.prepare("UPDATE naver_cafe_posts SET content_access='normal' WHERE id='asset-reference-text-key'").run();
  expect((await reader.readAccess(path)).restricted).toBe(false);
  await db.prepare("UPDATE naver_cafe_posts SET thumbnail_url=NULL WHERE id='asset-reference-text-key'").run();
  expect((await reader.readAccess(path)).restricted).toBe(true);
});
it("keeps R2 origin rebasing bound to the selected current owner",async()=>{
  const path="/r2-assets/notices/thumbnails/rebased-owner.webp";
  await db.batch([
    db.prepare("INSERT INTO members(uid,code,name) VALUES(90003,'asset_rebased','Asset rebased')"),
    db.prepare("INSERT INTO notices(id,content,related_member_uids,image_urls) VALUES(90003,'Rebased owner','[90003]','[\"https://approved-assets.example/notices/thumbnails/rebased-owner.webp\"]')"),
    db.prepare("INSERT INTO content_transitions(id,source_site,target_site,source_resource,target_resource,local_site,local_resource,generation,protocol,manifest_digest,plan_json) VALUES('asset-rebase','otw','luvdia','otw-db','luvdia-db','otw','otw-db',2,1,'asset-rebase',?)").bind(JSON.stringify({sourceSite:"otw",targetSite:"luvdia",members:[{uid:90003,targetUid:90003,code:"asset_rebased"}],classifications:[],fileOrigins:[{kind:"r2",site:"otw",resource:"otw-schedule",origin:"https://approved-assets.example"}]})),
  ]);
  const reader=new D1AssetAccessReader(db,"https://otw-schedule.info");
  expect((await reader.readAccess(path)).restricted).toBe(false);
  await db.prepare("UPDATE notices SET related_member_uids='[]' WHERE id=90003").run();
  expect((await reader.readAccess(path)).restricted).toBe(true);
});
it("starts legacy grace from actual final release and never treats an unknown old object as immediately eligible",async()=>{
  const key="notices/thumbnails/legacy-release.webp";
  const object=(await bucket.put(key,new Uint8Array([1,2,3])))!;
  const {vi}=await import("vitest");vi.useFakeTimers();vi.setSystemTime(object.uploaded.getTime()+16*60_000);
  try {
    expect((await store.retention(key,key,object.uploaded.getTime())).cleanupEligible).toBe(false);
    await store.releaseNoticeReference(key);
    const first=await db.prepare("SELECT * FROM asset_file_retention_releases WHERE logical_key=?").bind(key).first<{released_at:number;held:number}>();
    expect(first?.held).toBe(0);
    expect((await store.retention(key,key,object.uploaded.getTime())).cleanupEligible).toBe(false);
    await store.releaseNoticeReference(key);
    expect(await db.prepare("SELECT * FROM asset_file_retention_releases WHERE logical_key=?").bind(key).first()).toEqual(first);
    await db.prepare("INSERT INTO notices(id,content,image_urls) VALUES(999,'legacy re-reference',?)").bind(JSON.stringify([`/r2-assets/${key}`])).run();
    expect((await store.retention(key,key,object.uploaded.getTime())).recoveryHeld).toBe(true);
    await db.prepare("UPDATE notices SET content='same reference' WHERE id=999").run();
    await db.prepare("DELETE FROM notices WHERE id=999").run();
    const released=(await db.prepare("SELECT released_at,held FROM asset_file_retention_releases WHERE logical_key=?").bind(key).first<{released_at:number;held:number}>())!;
    expect(released.held).toBe(0);expect(released.released_at).toBeGreaterThanOrEqual(first!.released_at);
    vi.setSystemTime(released.released_at+14*60_000);
    expect((await store.retention(key,key,object.uploaded.getTime())).cleanupEligible).toBe(false);
    vi.setSystemTime(released.released_at+16*60_000);
    expect(await store.cleanupNoticeObject(key,key)).toBe(true);
    expect(await bucket.get(key)).toBeNull();
  }finally{vi.useRealTimers();}
});
it("does not borrow another row's external-origin classification to release a current file",async()=>{
  await db.batch([db.prepare("DELETE FROM member_links"),db.prepare("DELETE FROM music_entities"),db.prepare("DELETE FROM members")]);
  const members=[{code:"bing_hayu",uid:1,targetUid:1},{code:"u_lili",uid:2,targetUid:2},{code:"yang_mei",uid:3,targetUid:3}];
  await db.batch([...members,{code:"unrelated",uid:90}].map(member=>db.prepare("INSERT INTO members(uid,code,name) VALUES(?,?,?)").bind(member.uid,member.code,member.code)));

  await db.prepare("INSERT INTO content_transitions(id,source_site,target_site,source_resource,target_resource,local_site,local_resource,generation,protocol,manifest_digest,plan_json) VALUES('origin-scope','otw','luvdia','otw-db','luvdia-db','otw','otw-db',2,1,'origins',?)").bind(JSON.stringify({sourceSite:"otw",targetSite:"luvdia",members,classifications:[],fileOrigins:[{kind:"external",origin:"https://remote.example",reason:"Retained approved external image"}]})).run();
  const first=await store.put(input("external-selected"));
  const raw=`https://remote.example/r2-assets/${first.logicalKey}`;
  await db.prepare("INSERT INTO notices(id,content,related_member_uids,image_urls) VALUES(991,'selected','[1]',?)").bind(JSON.stringify([raw])).run();
  expect(await store.releaseNoticeReference(first.logicalKey)).toBe(true);
  await store.put(input("external-unrelated"));
  await db.prepare("INSERT INTO notices(id,content,related_member_uids,image_urls) VALUES(992,'unclassified unrelated','[90]',?)").bind(JSON.stringify([raw])).run();
  expect(await store.releaseNoticeReference(first.logicalKey)).toBe(false);
  expect((await store.listNoticeObjects()).every(object=>object.recoveryHeld)).toBe(true);
});
it("restarts legacy grace at a later historical hold's actual release without rewriting same-value holds",async()=>{
  const key="notices/thumbnails/history-release.webp";
  const object=(await bucket.put(key,new Uint8Array([1,3,5])))!;
  await store.releaseNoticeReference(key);
  await db.prepare("UPDATE asset_file_retention_releases SET released_at=1 WHERE logical_key=?").bind(key).run();
  const material=JSON.stringify({image:`/r2-assets/${key}`});
  await db.prepare("INSERT INTO content_historical_records(source_site,source_table,source_key,record_json,protocol) VALUES('otw','music_ai_reviews','[\"late\"]',?,1)").bind(material).run();
  expect(await db.prepare("SELECT held FROM asset_file_retention_releases WHERE logical_key=?").bind(key).first("held")).toBe(1);
  expect((await store.retention(key,key,object.uploaded.getTime())).recoveryHeld).toBe(true);
  const same=await db.prepare("UPDATE content_historical_records SET record_json=? WHERE source_key='[\"late\"]'").bind(material).run();
  expect(same.meta.rows_written).toBe(1);
  await db.prepare("DELETE FROM content_historical_records WHERE source_key='[\"late\"]'").run();
  const release=(await db.prepare("SELECT released_at,held FROM asset_file_retention_releases WHERE logical_key=?").bind(key).first<{released_at:number;held:number}>())!;
  expect(release.held).toBe(0);expect(release.released_at).toBeGreaterThan(1);
  expect((await store.retention(key,key,object.uploaded.getTime())).cleanupEligible).toBe(false);
});
it("writes a normal composed profile version without creating transfer receipts",async()=>{
  await db.prepare("INSERT OR IGNORE INTO members(uid,code,name) VALUES(700,'canonical_owner','Canonical Owner')").run();
  const intent=await buildAssetFileStore({...runtime,SITE_ID:"otw",SITE_D1_DATABASE_NAME:"otw-db",SITE_ASSET_BUCKET_NAME:"otw-schedule"} as unknown as Env).put({...input("native-profile"),logicalKey:"members/canonical_owner/backgrounds/default/original.webp"});
  expect(intent.transitionId).toBeNull();
  expect(await db.prepare("SELECT count(*) n FROM content_transition_operations").first("n")).toBe(0);
  expect(await db.prepare("SELECT version_key FROM asset_file_references WHERE logical_key=?").bind(intent.logicalKey).first("version_key")).toBe(intent.versionKey);
  expect(await bucket.get(intent.versionKey)).not.toBeNull();
});
it("reconciles a real immutable put after unknown result and commits exactly one reference before ACK",async()=>{
  const admitted=await store.begin(input("put-unknown"));
  await bucket.put(admitted.versionKey,input("put-unknown").bytes,{onlyIf:{etagDoesNotMatch:"*"}});
  expect(await db.prepare("SELECT version_key FROM asset_file_references").first()).toBeNull();
  const observed=await store.verifyPut(admitted,input("put-unknown").bytes);
  const uploadedVersion=(await bucket.head(admitted.versionKey))!.version;
  expect(observed.objectVersion).toBe(uploadedVersion);
  await store.commitReference(admitted,observed);
  const reference=await db.prepare("SELECT * FROM asset_file_references WHERE logical_key=?").bind(admitted.logicalKey).first();
  expect(reference).toMatchObject({version_key:admitted.versionKey,hash:admitted.hash,size:5});
  expect(await db.prepare("SELECT acknowledged_at FROM asset_file_versions WHERE operation_id='put-unknown'").first()).toEqual({acknowledged_at:null});
  await store.put(input("put-unknown"));
  expect((await bucket.head(admitted.versionKey))!.version).toBe(uploadedVersion);
  expect((await db.prepare("SELECT COUNT(*) n FROM asset_file_versions").first<{n:number}>())?.n).toBe(1);
  expect((await db.prepare("SELECT acknowledged_at FROM asset_file_versions WHERE operation_id='put-unknown'").first<{acknowledged_at:number}>())?.acknowledged_at).toBeGreaterThan(0);
  expect([...new Uint8Array(await (await bucket.get(admitted.versionKey))!.arrayBuffer())]).toEqual([82,73,70,70,255]);
});
it("captures same logical-key replacement as a new version while preserving prior bytes and rejecting stale reference commit",async()=>{
  const first=await store.put(input("first"));
  const pending=await store.begin(input("pending",new Uint8Array([3])));
  const newer=await store.put(input("newer",new Uint8Array([7,8])));
  const oldObservation=await store.verifyPut(pending,new Uint8Array([3]));
  await expect(store.commitReference(pending,oldObservation)).rejects.toThrow(/reference.*conflict/i);
  expect(await db.prepare("SELECT version_key FROM asset_file_references").first()).toEqual({version_key:newer.versionKey});
  expect(await bucket.head(first.versionKey)).not.toBeNull();
  expect(await bucket.head(pending.versionKey)).not.toBeNull();
  await expect(store.put(input("newer",new Uint8Array([9])))).rejects.toThrow(/identity/i);
});
it("rejects actual object byte/hash mismatches before the reference mutation",async()=>{
  const admitted=await store.begin(input("wrong-bytes"));
  await bucket.put(admitted.versionKey,new Uint8Array([9]));
  await expect(store.verifyPut(admitted,input("wrong-bytes").bytes)).rejects.toThrow(/hash|byte|size/i);
  expect(await db.prepare("SELECT * FROM asset_file_references").first()).toBeNull();
});
it("does not admit a member file namespace alias without its actual owning member identity",async()=>{
  await db.prepare("INSERT OR IGNORE INTO members(uid,code,name) VALUES(700,'canonical_owner','canonical owner')").run();
  await expect(store.begin({...input("namespace-alias"),logicalKey:"MEMBERS/canonical_owner/backgrounds/default/original.webp"})).rejects.toThrow(/identity|replacement|member/i);
  expect(await db.prepare("SELECT 1 FROM asset_file_versions WHERE operation_id='namespace-alias'").first()).toBeNull();
});

it("rejects cleanup of an unrelated physical object and a stale cleanup generation",async()=>{
  const profile=await store.put({...input("unrelated-object"),logicalKey:"notices/thumbnails/other.webp"});
  await expect(store.cleanupNoticeObject("notices/thumbnails/unrelated.webp",profile.versionKey)).rejects.toThrow(/identity/);
  expect(await bucket.head(profile.versionKey)).not.toBeNull();
  const notice=await store.put(input("wrong-claim-generation"));
  const object=(await bucket.head(notice.versionKey))!;
  await db.prepare("INSERT INTO asset_file_cleanup(object_key,logical_key,site_id,resource,object_version,hash,size,generation,claimed_at) VALUES(?,?,?,?,?,?,?,?,1)").bind(notice.versionKey,notice.logicalKey,"otw","otw-schedule",object.version,notice.hash,notice.size,notice.generation+1).run();
  await expect(store.cleanupNoticeObject(notice.logicalKey,notice.versionKey)).rejects.toThrow(/generation|identity/);
  expect(await bucket.head(notice.versionKey)).not.toBeNull();
});

it("protects equivalent encoded URL references and rejects a racing encoded reference to a claimed object",async()=>{
  const original=await store.put(input("encoded-reference"));
  const url="/r2-assets/notices/old/../thumbnails/%72ecover.webp?cache=1#image";
  await db.prepare("INSERT INTO notices(content,image_urls) VALUES('encoded',?)").bind(JSON.stringify([url])).run();
  expect(await store.releaseNoticeReference(original.logicalKey)).toBe(false);
  expect((await store.listNoticeObjects())[0]).toMatchObject({recoveryHeld:true,cleanupEligible:false});
  await db.prepare("DELETE FROM notices").run();
  await store.releaseNoticeReference(original.logicalKey);
  await db.prepare("UPDATE asset_file_versions SET created_at=1,acknowledged_at=1,released_at=1 WHERE operation_id=?").bind(original.operationId).run();
  const {vi}=await import("vitest");vi.useFakeTimers();vi.setSystemTime(Date.now()+16*60_000);
  try {
    const deleting=new D1R2FileStore(db,{...bucket,get:bucket.get.bind(bucket),head:bucket.head.bind(bucket),delete:async(key:string)=>{
      await expect(db.prepare("INSERT INTO notices(content,image_urls) VALUES('encoded race',?)").bind(JSON.stringify([url])).run()).rejects.toThrow(/cleanup_reference_conflict/);
      await bucket.delete(key);
    }} as unknown as R2Bucket,"otw","otw-schedule");
    expect(await deleting.cleanupNoticeObject(original.logicalKey,original.versionKey)).toBe(true);
  } finally {vi.useRealTimers();}
});

it("holds pending and unacknowledged bytes indefinitely and starts grace only after actual final release",async()=>{
  const pending=await store.begin(input("pending-hold"));
  await store.verifyPut(pending,input("pending-hold").bytes);
  await db.prepare("UPDATE asset_file_versions SET created_at=1,attempted_at=1 WHERE operation_id=?").bind(pending.operationId).run();
  expect((await store.listNoticeObjects())[0]).toMatchObject({recoveryHeld:true,cleanupEligible:false});
  await store.commitReference(pending,await store.verifyPut(pending,input("pending-hold").bytes));
  expect(await store.releaseNoticeReference(pending.logicalKey)).toBe(false);
  await store.acknowledge(pending);
  expect(await store.releaseNoticeReference(pending.logicalKey)).toBe(true);
  expect((await store.listNoticeObjects())[0]).toMatchObject({recoveryHeld:false,cleanupEligible:false});
});

it("blocks a racing reference to the claimed object, allows a newer version, and reconciles unknown delete by actual R2 readback",async()=>{
  const original=await store.put(input("delete-original"));
  await store.releaseNoticeReference(original.logicalKey);
  await db.prepare("UPDATE asset_file_versions SET created_at=1,acknowledged_at=1,released_at=1 WHERE operation_id=?").bind(original.operationId).run();
  // Actual upload time controls grace too; virtual clock affects only policy time.
  const {vi}=await import("vitest");
  vi.useFakeTimers();vi.setSystemTime(Date.now()+16*60_000);
  try {
    let newer:string|undefined;
    const deleting=new D1R2FileStore(db,{get:bucket.get.bind(bucket),head:bucket.head.bind(bucket),list:bucket.list.bind(bucket),put:bucket.put.bind(bucket),delete:async(key:string)=>{
      await expect(db.prepare("INSERT INTO notices(content,image_urls) VALUES('racing',?)").bind(JSON.stringify([`/r2-assets/${original.logicalKey}`])).run()).rejects.toThrow(/cleanup_reference_conflict/);
      newer=(await store.put(input("delete-newer",new Uint8Array([8,9])))).versionKey;
      await db.prepare("INSERT INTO notices(content,image_urls) VALUES('new version',?)").bind(JSON.stringify([`/r2-assets/${original.logicalKey}`])).run();
      await bucket.delete(key);
      throw new Error("delete result lost after real R2 side effect");
    }} as unknown as R2Bucket,"otw","otw-schedule");
    await expect(deleting.cleanupNoticeObject(original.logicalKey,original.versionKey)).rejects.toThrow(/result lost/);
    expect(await bucket.head(original.versionKey)).toBeNull();
    expect(await bucket.head(newer!)).not.toBeNull();
    expect(await db.prepare("SELECT deleted_at FROM asset_file_cleanup WHERE object_key=?").bind(original.versionKey).first()).toEqual({deleted_at:null});
    expect(await store.cleanupNoticeObject(original.logicalKey,original.versionKey)).toBe(true);
    expect((await db.prepare("SELECT deleted_at FROM asset_file_cleanup WHERE object_key=?").bind(original.versionKey).first<{deleted_at:number}>())?.deleted_at).toBeGreaterThan(0);
    await expect(store.put(input("delete-original"))).rejects.toThrow(/cleanup claim/);
  } finally { vi.useRealTimers(); }
});

it("seeks profile background references without treating member underscores as wildcards",async()=>{
  await db.prepare("INSERT INTO members(uid,code,name) VALUES(90003,'background_cost','Background cost')").run();
  const key='members/background_cost/backgrounds/one/original.webp';
  await bucket.put(key,new Uint8Array([1]));
  await db.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<5000) INSERT INTO asset_file_references(logical_key,version_key,hash,size,content_type,updated_at) SELECT 'notices/thumbnails/noise-'||x,'fixture',?,1,'image/webp',1 FROM n").bind('0'.repeat(64)).run();
  await db.prepare("INSERT INTO asset_file_references(logical_key,version_key,hash,size,content_type,updated_at) VALUES(?,'fixture',?,1,'image/webp',1),('members/backgroundXcost/backgrounds/other/original.webp','fixture',?,1,'image/webp',1)").bind(key,'0'.repeat(64),'0'.repeat(64)).run();
  const meter=meterD1(db);
  const reader=new D1MemberReader(getDb({otw_db:meter.db} as Env),bucket);
  const profile=await reader.findProfileByCode('background_cost');
  expect(profile?.backgroundImages?.map(row=>row.id)).toEqual(['one']);
  expect(meter.entries.length).toBeGreaterThan(0);
  expect(meter.summary().rowsRead).toBeLessThan(100);
  const withoutInventory=new D1MemberReader(getDb({otw_db:meter.db} as Env),{list:async()=>{throw new Error('Metadata must not list R2');}} as unknown as R2Bucket);
  expect((await withoutInventory.findProfileByCode('background_cost',false))?.backgroundImages).toBeNull();
  console.info('PROFILE_BACKGROUND_D1_COST',JSON.stringify(meter.summary()));
});

it("reads immutable history once for a notice object listing while preserving historical holds",async()=>{
  await db.prepare("WITH RECURSIVE n(x) AS(SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<500) INSERT INTO content_historical_records(source_site,source_table,source_key,record_json,protocol) SELECT 'otw','music_ai_reviews',json_array('cost-'||x),json_object('text','unrelated'),1 FROM n").run();
  await db.prepare("INSERT INTO content_historical_records(source_site,source_table,source_key,record_json,protocol) VALUES('otw','music_ai_reviews','[\"held\"]','{\"image\":\"/r2-assets/notices/thumbnails/cost-0.webp\"}',1)").run();
  for(let i=0;i<20;i++) {
    await bucket.put(`notices/thumbnails/cost-${i}.webp`,new Uint8Array([1,2,3]));
    await db.prepare("INSERT OR IGNORE INTO asset_file_retention_releases(logical_key,released_at,held) VALUES(?,1,0)").bind(`notices/thumbnails/cost-${i}.webp`).run();
  }
  const meter=meterD1(db),rows=await new D1R2FileStore(meter.db,bucket,'otw','otw-schedule').listNoticeObjects();
  expect(rows).toHaveLength(20);expect(rows.find(row=>row.key==='notices/thumbnails/cost-0.webp')?.recoveryHeld).toBe(true);expect(rows.find(row=>row.key==='notices/thumbnails/cost-1.webp')?.recoveryHeld).toBe(false);
  console.info('NOTICE_LIST_D1_COST',JSON.stringify(meter.summary()));
  expect(meter.summary().sqlCount).toBeLessThan(10);expect(meter.summary().rowsRead).toBeLessThan(30000);expect(meter.summary().rowsWritten).toBe(0);
  for(let i=20;i<40;i++)await bucket.put(`notices/thumbnails/cost-${i}.webp`,new Uint8Array([1,2,3]));
  const doubled=meterD1(db);await new D1R2FileStore(doubled.db,bucket,'otw','otw-schedule').listNoticeObjects();
  console.info('NOTICE_LIST_DOUBLE_D1_COST',JSON.stringify(doubled.summary()));
  expect(doubled.summary().rowsRead).toBeLessThan(meter.summary().rowsRead+1500);
  for(const row of rows) expect(await store.retention(row.key,row.objectKey,row.uploadedAt)).toEqual({recoveryHeld:row.recoveryHeld,cleanupEligible:row.cleanupEligible,graceStart:row.graceStart});
});

it("checks a referenced notice key through the path index and its owning row",async()=>{
  const {D1NoticeGateway}=await import('../../notices/infrastructure/d1-notice-gateway');
  await db.prepare("WITH RECURSIVE n(x) AS(SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<5000) INSERT INTO notices(content,image_urls) SELECT 'Unrelated',json_array('/r2-assets/notices/thumbnails/other-'||x||'.webp') FROM n").run();
  await db.prepare("INSERT INTO notices(content,image_urls) VALUES('Current','[\"/r2-assets/notices/thumbnails/referenced.webp\"]')").run();
  const meter=meterD1(db);
  expect(await new D1NoticeGateway(getDb({otw_db:meter.db} as Env)).deleteThumbnail('notices/thumbnails/referenced.webp')).toEqual({status:'referenced'});
  console.info('NOTICE_CURRENT_REFERENCE_D1_COST',JSON.stringify(meter.summary()));
  expect(meter.summary().rowsRead).toBeLessThan(100);
});
