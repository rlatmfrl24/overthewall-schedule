import { applyD1Migrations, env } from "cloudflare:test";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { readSiteSchemaMigrations } from "../../../test-support/site-schema";
import { meterD1 } from "../../../test-support/d1-meter";
import { siteEnv } from "../../../test-support/site-env";
import { readUpdateLogs } from "../../schedules/infrastructure/update-log-repository";
import { runDataRetentionPolicyPrune } from "./data-retention";
import { hydrateXReferences } from "../../x-posts/infrastructure/x-reference-hydration";
import { getDb } from "../../../platform/db";
import type { Env } from "../../../platform/types";

const db=env.otw_db;
beforeAll(async()=>{
  for(const migration of await readSiteSchemaMigrations()) {
    if(migration.name.startsWith('0030_')) await db.batch(['kurenai_natsuki','terri_nunna','bing_hayu','yang_mei','u_lili','on_haru','hane','kim_ate'].map((code,index)=>db.prepare('INSERT INTO members(uid,code,name,is_deprecated) VALUES(?,?,?,1)').bind(-10000-index,code,'migration bootstrap')));
    await applyD1Migrations(db,[migration]);
  }
},120000);
afterEach(()=>vi.restoreAllMocks());

it("uses indexed log bounds without changing mixed timestamp or UID filter semantics",async()=>{
  await db.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<5000) INSERT INTO update_logs(member_uid,schedule_date,action,created_at) SELECT 90011,'2020-01-01','insert','2020-01-01 00:00:00' FROM n").run();
  for(const date of ['2026-10-19 00:00:00','2026-10-19T00:00:00Z','2026-10-18T23:30:00-01:00']) await db.prepare("INSERT INTO update_logs(member_uid,schedule_date,action,created_at) VALUES(90010,'2026-10-19','insert',?)").bind(date).run();
  await db.prepare("INSERT INTO update_logs(member_uid,schedule_date,action,created_at) VALUES(90010,'2026-10-19','insert',julianday('2026-10-19T12:00:00Z'))").run();
  const options={limit:25,page:1,pageSize:25,sort:'created_desc' as const};
  const meter=meterD1(db),reader=getDb({otw_db:meter.db} as Env);
  expect(await readUpdateLogs(reader,{...options,from:'2026-10-19',until:'2026-10-19'})).toMatchObject({total:4});
  const dateCost=meter.summary(); expect.soft(dateCost.rowsRead).toBeLessThan(100);
  const byUid=meterD1(db);
  expect(await readUpdateLogs(getDb({otw_db:byUid.db} as Env),{...options,target:'90010'})).toMatchObject({total:4});
  expect.soft(byUid.summary().rowsRead).toBeLessThan(100);
  expect(await readUpdateLogs(reader,{...options,target:'090010'})).toMatchObject({total:0});
  console.info('LOG_FILTER_D1_COST',JSON.stringify({date:dateCost,uid:byUid.summary()}));
});

it("checks for a remaining retention row without counting the whole remainder",async()=>{
  const now=Date.parse('2026-10-19T12:00:00Z'); vi.spyOn(Date,'now').mockReturnValue(now);
  await db.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<5000) INSERT INTO x_api_cache(key,type,value,fetched_at,expires_at) SELECT 'retention-'||x,'linked_post','{}',1,1 FROM n").run();
  await db.prepare("INSERT INTO x_api_cache(key,type,value,fetched_at,expires_at) VALUES('boundary','linked_post','{}',1,?)").bind(now).run();
  const meter=meterD1(db),runtime={...siteEnv(),otw_db:meter.db} as Env;
  expect(await runDataRetentionPolicyPrune(runtime,'x-api-cache',1)).toMatchObject({deletedRows:1,hasMore:true});
  expect.soft(meter.summary().rowsRead).toBeLessThan(50);
  console.info('RETENTION_HAS_MORE_D1_COST',JSON.stringify(meter.summary()));
  expect(await runDataRetentionPolicyPrune(runtime,'x-api-cache',10000)).toMatchObject({deletedRows:4999,hasMore:false});
  expect(await db.prepare("SELECT key FROM x_api_cache").all()).toMatchObject({results:[{key:'boundary'}]});
});

it("releases the claimed X lease after provider failure without scanning unrelated references",async()=>{
  await db.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(90200,'lease_cost','Lease cost','https://x.com/lease_cost')").run();
  await db.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<5000) INSERT INTO x_posts(id,handle,username,value,created_at,fetched_at) SELECT 'lease-history-'||x,'lease_cost','lease_cost','{}','2026-10-19',1 FROM n").run();
  await db.prepare("INSERT INTO x_post_references(source_post_id,relation_type,referenced_post_id,resolution_state,hydrated_at,author_state,next_attempt_at,created_at,updated_at) SELECT id,'quote','100000000'||id,'hydrated',1,'resolved',9000000000000,1,1 FROM x_posts WHERE id LIKE 'lease-history-%'").run();
  const post={id:'lease-pending',text:'Pending',username:'lease_cost',url:'https://x.com/lease_cost/status/1',createdAt:'2026-10-19T00:00:00Z',quote:{postId:'9999999999999999999',post:{id:'9999999999999999999'}}};
  await db.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,fetched_at) VALUES('lease-pending','lease_cost','lease_cost',?,'2026-10-19',1)").bind(JSON.stringify(post)).run();
  await db.prepare("INSERT INTO x_post_references(source_post_id,relation_type,referenced_post_id,resolution_state,created_at,updated_at) VALUES('lease-pending','quote','9999999999999999999','pending',1,1)").run();
  vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Provider unavailable'));
  const meter=meterD1(db);
  await hydrateXReferences({siteId:'otw',db:meter.db,handles:['lease_cost'],bearerToken:'local-test',mode:'post_only',tracker:{apiCalls:0,estimatedCostMicros:0,reservedCostMicros:0,uniqueResources:0,previewDeferred:0,authorCacheHits:0,authorCacheMisses:0,source:'scheduled'}});
  const release=meter.entries.filter(row=>row.sql.includes('SET lease_token=NULL,lease_until=NULL WHERE lease_token=?'));
  expect(release).toHaveLength(1); expect.soft(release[0].rowsRead).toBeLessThan(10);
  expect(await db.prepare("SELECT lease_token FROM x_post_references WHERE source_post_id='lease-pending'").first('lease_token')).toBeNull();
  console.info('LEASE_RELEASE_D1_COST',JSON.stringify(release));
});

it("reads exact pending member/date pairs above the D1 bind limit",async()=>{
  const {queryPendingScheduleReview}=await import("../../schedules/infrastructure/d1-pending-schedule-query");
  await db.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<110) INSERT INTO pending_schedules(member_uid,member_name,date,status,action_type) SELECT 91000+x,'Pair',date('2026-01-01','+'||x||' days'),'방송','create' FROM n").run();
  await db.prepare("INSERT INTO schedules(member_uid,date,title,status) SELECT member_uid,date,'Exact','방송' FROM pending_schedules WHERE member_uid>91000").run();
  await db.prepare("INSERT INTO schedules(member_uid,date,title,status) SELECT a.member_uid,b.date,'Other pair','방송' FROM pending_schedules a CROSS JOIN pending_schedules b WHERE a.member_uid>91000 AND b.member_uid>91000 AND a.member_uid<>b.member_uid").run();
  const meter=meterD1(db), rows=await queryPendingScheduleReview(meter.db);
  const requested=rows.filter(row=>row.member_uid>91000);
  expect(requested).toHaveLength(110);
  expect(requested.every(row=>row.same_day_schedule_count===1 && row.same_day_schedules[0].title==='Exact')).toBe(true);
  console.info('PENDING_PAIR_D1_COST',JSON.stringify(meter.summary()));
  expect(meter.summary().rowsRead).toBeLessThan(3000);
});
