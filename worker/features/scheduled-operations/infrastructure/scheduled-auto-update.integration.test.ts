import { applyD1Migrations, env } from "cloudflare:test";
import { readSiteSchemaMigrations } from "../../../test-support/site-schema";
import {beforeAll,beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {handleScheduledControlQueue,handleScheduledJobQueue} from "../../../app/scheduled-queue";
import {ScheduledJobCoordinator} from "./scheduled-job-coordinator";
import {D1ScheduledJobRepository} from "../../../platform/scheduled-jobs/d1-scheduled-job-repository";
import {ScheduledRunClient} from "../../../platform/scheduled-jobs/scheduled-run-client";
import {siteEnv} from "../../../test-support/site-env";
import {clearChzzkServiceCachesForTests} from "../../../features/chzzk";
import type { ScheduledControlQueueMessage, ScheduledJobQueueMessage } from "@contracts/scheduled-operations";
import { D1CollectorWriter, ScheduledAutoUpdateBlocked } from "../../schedules";
import type {Env} from "../../../platform/types";
let db:D1Database, runtime:Env, repo:D1ScheduledJobRepository;
const base=Date.parse("2026-10-20T10:00:00Z"), channel="e".repeat(32), uid=990001;
let controls:ScheduledControlQueueMessage[]=[], sent:ScheduledJobQueueMessage[]=[], calls:string[]=[], duringVideos:(()=>Promise<void>)|undefined;
let replacementLease:string|null=null;
const nativeFetch=globalThis.fetch;
beforeAll(async()=>{
 db=(env as unknown as Env).otw_db;
 for (const migration of await readSiteSchemaMigrations()) {
  if(migration.name.startsWith("0030_")) await db.batch(["kurenai_natsuki","terri_nunna","bing_hayu","yang_mei","u_lili","on_haru","hane","kim_ate"].map((code,index)=>db.prepare("INSERT OR IGNORE INTO members(uid,code,name,is_deprecated) VALUES(?,?,?,1)").bind(-10000-index,code,"migration bootstrap")));
  await applyD1Migrations(db,[migration]);
 }
},120000);
beforeEach(async()=>{
 vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(base);
 controls=[];sent=[];calls=[];duringVideos=undefined;clearChzzkServiceCachesForTests();
 await db.batch([
 ...["scheduled_outbox","scheduled_job_items","scheduled_job_runs","scheduled_usage_daily","auto_update_runs","pending_schedules","schedule_day_assessments","schedule_broadcast_observations"].map(table=>db.prepare(`DELETE FROM ${table}`)),
 db.prepare("UPDATE members SET url_chzzk=NULL,is_deprecated=1"),
 db.prepare("INSERT INTO members(uid,code,name,url_chzzk,is_deprecated) VALUES(?,'review3_owner','Review owner',?,0) ON CONFLICT(uid) DO UPDATE SET url_chzzk=excluded.url_chzzk,is_deprecated=0").bind(uid,`https://chzzk.naver.com/${channel}`),
 ...["auto_update_enabled","scheduled_v2_schedule_auto_update_enabled"].map(key=>db.prepare("INSERT INTO settings(key,value) VALUES(?,'true') ON CONFLICT(key) DO UPDATE SET value='true'").bind(key)),
 db.prepare("INSERT INTO settings(key,value) VALUES('auto_update_range_days','3') ON CONFLICT(key) DO UPDATE SET value='3'"),
 db.prepare("INSERT INTO settings(key,value) VALUES('auto_update_interval_hours','1') ON CONFLICT(key) DO UPDATE SET value='1'"),
 db.prepare("INSERT INTO settings(key,value) VALUES('auto_update_last_run','0') ON CONFLICT(key) DO UPDATE SET value='0'"),
 ]);
 runtime={...siteEnv(),otw_db:db,OTW_OPS_CONTROL_QUEUE:{send:async(body:ScheduledControlQueueMessage)=>{controls.push(body)}},OTW_OPS_BACKGROUND_QUEUE:{send:async(body:ScheduledJobQueueMessage)=>{sent.push(body)}}} as unknown as Env;
 repo=new D1ScheduledJobRepository(db);
 vi.stubGlobal("fetch",async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);
  if(["127.0.0.1","localhost","[::1]"].includes(url.hostname)) return nativeFetch(input,init);
  calls.push(url.href);
  if(url.origin!=="https://api.chzzk.naver.com") throw new Error("Blocked review outbound "+url.href);
  if(url.pathname===`/service/v1/channels/${channel}/videos`){
   await duringVideos?.();
   return Response.json({content:{data:[{videoId:"review3-video",videoTitle:"Original provider title",publishDateAt:base-86400000,duration:3600,thumbnailImageUrl:null}]}});
  }
  if(url.pathname===`/polling/v2/channels/${channel}/live-status`)return Response.json({code:200,content:{status:"CLOSE",openDate:null}});
  throw new Error("Unexpected review provider path "+url.href);
 });
});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
async function startRun(source:"manual"|"scheduled"="scheduled"){
 const run=await repo.createRun({jobType:"schedule_auto_update",source,idempotencyKey:crypto.randomUUID(),...(source==="scheduled"?{scheduledFor:base}:{})});
 await repo.addItems(run.id,[{targetKey:`channels:0:${channel}`,phase:"scan",lane:"auto-update",continuation:{channelIds:[channel]}}]);
 await new ScheduledJobCoordinator(runtime).dispatchRun(run.id);
 const item=(await db.prepare("SELECT id FROM scheduled_job_items WHERE run_id=? AND phase='scan'").bind(run.id).first<{id:string}>())!;
 return {run,scan:item.id};
}
async function deliver(id:string){
 const item=(await repo.readItem(id))!;const ack=vi.fn(),retry=vi.fn();
 await handleScheduledJobQueue({queue:"otw-ops-background",messages:[{body:{schemaVersion:1,messageType:"scheduled_job_item",runId:item.run_id,itemId:id,phase:item.phase},ack,retry}]} as unknown as MessageBatch<unknown>,runtime);
 expect(ack).toHaveBeenCalledOnce();expect(retry).not.toHaveBeenCalled();
}
async function drain(){let count=0;while(sent.length){if(++count>12)throw new Error("Unexpected review delivery loop");await deliver(sent.shift()!.itemId);}}
it("skips a dispatched scheduled scan after automation is disabled",async()=>{
 const {run,scan}=await startRun();sent=[];
 await db.batch(["auto_update_enabled","scheduled_v2_schedule_auto_update_enabled"].map(key=>db.prepare("UPDATE settings SET value='false' WHERE key=?").bind(key)));
 await deliver(scan);
 const observations=await db.prepare("SELECT count(*) n FROM schedule_broadcast_observations").first("n");
 const state=(await repo.readItem(scan))!.status;
 console.info("REVIEW3_PAUSE",JSON.stringify({providerCalls:calls.length,observations,itemStatus:state,runStatus:(await repo.readRun(run.id))!.status}));
 expect(calls).toHaveLength(0);expect(observations).toBe(0);expect(state).toBe("skipped");
 await drain();
 expect(await db.prepare("SELECT count(*) n FROM pending_schedules").first("n")).toBe(0);
});
it("preserves newer observations when an in-flight scan loses its lease",async()=>{
 const {scan}=await startRun();sent=[];
 duringVideos=async()=>{
  duringVideos=undefined;
  vi.setSystemTime(base+300001);
  const replacement=await new D1ScheduledJobRepository(db).claimItem(scan);
  expect(replacement).not.toBeNull();
  replacementLease=replacement!.lease_token;
  await db.batch([
   db.prepare("INSERT INTO schedule_broadcast_observations(vod_id,member_uid,channel_id,title,started_at,ended_at,duration_seconds,first_seen_at,last_seen_at) VALUES('chzzk:review3-video',?,?,'Newer owner title',?,?,?,?,?)").bind(uid,channel,base-90000000,base-86400000,3600,base+300001,base+300001),
  ]);
 };
 await deliver(scan);
 const item=(await repo.readItem(scan))!;
 const observation=await db.prepare("SELECT title,last_seen_at FROM schedule_broadcast_observations WHERE vod_id='chzzk:review3-video'").first();
 console.info("REVIEW3_LEASE",JSON.stringify({itemStatus:item.status,lease:item.lease_token,result:item.result_json,observation}));
 expect(item.status).toBe("running");expect(item.lease_token).toBe(replacementLease);expect(item.result_json).toBeNull();
 expect(observation).toMatchObject({title:"Newer owner title",last_seen_at:base+300001});
});
describe("completed scan redelivery",()=>{
 let prepared:Awaited<ReturnType<typeof startRun>> & {finishedAt:number|null;itemsBefore:unknown;callsBefore:number};
 beforeEach(async()=>{
 const owned=await startRun();await drain();
 const before=await repo.readRun(owned.run.id);
 expect(before!.status).toBe("succeeded");
 prepared={...owned,finishedAt:before!.finished_at,itemsBefore:await db.prepare("SELECT count(*) n FROM scheduled_job_items WHERE run_id=?").bind(owned.run.id).first("n"),callsBefore:calls.length};
});
it("keeps completed scan redelivery from creating new dated work",async()=>{
 const {run,scan,itemsBefore,callsBefore,finishedAt}=prepared;
 vi.setSystemTime(base+14*60*60_000);
 await deliver(scan);
 const added=(await db.prepare("SELECT phase,status,target_key FROM scheduled_job_items WHERE run_id=? AND status='queued'").bind(run.id).all()).results;
 const after=await repo.readRun(run.id);
 console.info("REVIEW3_REDELIVERY",JSON.stringify({before:"succeeded",after:after!.status,itemsBefore,added,extraProviderCalls:calls.length-callsBefore}));
 expect(after!.status).toBe("succeeded");expect(added).toEqual([]);expect(after!.finished_at).toBe(finishedAt);
 expect(await db.prepare("SELECT count(*) n FROM scheduled_job_items WHERE run_id=?").bind(run.id).first("n")).toBe(itemsBefore);expect(sent).toHaveLength(0);
 expect(calls.length).toBe(callsBefore);
});
});
async function failedRun(source:"manual"|"scheduled") {
 const owned=await startRun(source);sent=[];
 const leased=(await repo.claimItem(owned.scan))!;
 await repo.completeItem(leased,{status:"failed",errorCode:"schedule_scan_failed",error:"fixture scan failed"});
 await new ScheduledJobCoordinator(runtime).advanceRun((await repo.readItem(owned.scan))!);
 await drain();
 expect((await repo.readRun(owned.run.id))!.status).toBe("failed");
 return owned;
}
async function retryThroughControl(runId:string) {
 expect(await new ScheduledRunClient(runtime).retryRun(runId)).toMatchObject({kind:"accepted"});
 const ack=vi.fn(),retry=vi.fn();const body=controls.shift();expect(body).toBeTruthy();
 await handleScheduledControlQueue({queue:"otw-ops-control",messages:[{body,ack,retry}]} as unknown as MessageBatch<unknown>,runtime);
 expect(ack).toHaveBeenCalledOnce();expect(retry).not.toHaveBeenCalled();
}
describe.each(["manual","scheduled"] as const)("%s retry through control Queue",source=>{
 let owned:Awaited<ReturnType<typeof startRun>>,matches:{id:string}[],finalizer:{id:string};
 beforeEach(async()=>{owned=await failedRun(source);});
 beforeEach(async()=>{
  vi.setSystemTime(base+2*60*60_000);
  await retryThroughControl(owned.run.id);
  expect(sent).toHaveLength(1);
  expect(sent[0].itemId).toBe(owned.scan);
  expect(await db.prepare("SELECT count(*) n FROM scheduled_outbox WHERE run_id=? AND event_type='execute' AND status='pending'").bind(owned.run.id).first("n")).toBe(1);
  sent=[];await deliver(owned.scan);
  matches=(await db.prepare("SELECT id FROM scheduled_job_items WHERE run_id=? AND phase='match' AND status='queued'").bind(owned.run.id).all<{id:string}>()).results;
  expect(matches).toHaveLength(1);
 });
 beforeEach(async()=>{
  for(const match of matches)await deliver(match.id);
  finalizer=(await db.prepare("SELECT id FROM scheduled_job_items WHERE run_id=? AND phase='finalize'").bind(owned.run.id).first<{id:string}>())!;
 });
 it("completes retry with fresh receipt and preserves previous failure history",async()=>{
  await deliver(finalizer.id);
  const history=(await db.prepare("SELECT status,pending_created_count,error FROM auto_update_runs ORDER BY id").all()).results;
  const candidates=await db.prepare("SELECT count(*) n FROM pending_schedules WHERE vod_id='chzzk:review3-video'").first("n");
  const receipt=JSON.parse((await repo.readItem(finalizer.id))!.result_json!);
  expect((await repo.readRun(owned.run.id))!.status).toBe("succeeded");
  expect(candidates).toBe(1);expect(receipt.updated).toBe(1);
  expect(history).toHaveLength(2);expect(history[0]).toMatchObject({status:"failed",pending_created_count:0});
  expect(history[1]).toMatchObject({status:"success",pending_created_count:1});
  await deliver(finalizer.id);
  expect(await db.prepare("SELECT count(*) n FROM auto_update_runs").first("n")).toBe(2);
  console.info("AUTO_UPDATE_RETRY",JSON.stringify({source,status:"succeeded",candidates,receiptUpdated:receipt.updated,history}));
 });
});

it("blocks scan writes if automation is disabled while the provider is in flight",async()=>{
 const {scan}=await startRun();sent=[];
 duringVideos=async()=>{duringVideos=undefined;await db.prepare("UPDATE settings SET value='false' WHERE key='auto_update_enabled'").run();};
 await deliver(scan);
 expect((await repo.readItem(scan))!.status).toBe("skipped");
 expect(await db.prepare("SELECT count(*) n FROM schedule_broadcast_observations").first("n")).toBe(0);
});
it("keeps an explicitly requested manual scan available while scheduled automation is paused",async()=>{
 const {scan}=await startRun("manual");sent=[];
 await db.prepare("UPDATE settings SET value='false' WHERE key='auto_update_enabled'").run();
 await deliver(scan);
 expect((await repo.readItem(scan))!.status).toBe("succeeded");
 expect(await db.prepare("SELECT count(*) n FROM schedule_broadcast_observations").first("n")).toBe(1);
});

it.each(["pause","lease"] as const)("atomically rejects a match batch after %s changes following its entry check",async(change)=>{
 const run=await repo.createRun({jobType:"schedule_auto_update",source:"scheduled",idempotencyKey:crypto.randomUUID()});
 const [id]=await repo.addItems(run.id,[{targetKey:"match",phase:"match",lane:"auto-update"}]);
 const item=(await repo.claimItem(id))!;
 const guardedDb=new Proxy(db,{get(target,key){
  if(key==="batch")return async(statements:D1PreparedStatement[])=>{
   if(change==="pause")await db.prepare("UPDATE settings SET value='false' WHERE key='auto_update_enabled'").run();
   else {vi.setSystemTime(base+300001);expect(await new D1ScheduledJobRepository(db).claimItem(id)).not.toBeNull();}
   return target.batch(statements);
  };
  const value=Reflect.get(target,key,target);return typeof value==="function"?value.bind(target):value;
 }});
 const writer=new D1CollectorWriter(guardedDb,"otw",{id,runId:run.id,leaseToken:item.lease_token});
 await expect(writer.write({action:"holiday_create",now:base,target:{memberUid:uid,date:"2026-10-19"}},[
  db.prepare("INSERT INTO pending_schedules(member_uid,member_name,date,status,action_type) VALUES(?,'Review owner','2026-10-19','휴방','create') RETURNING id").bind(uid),
 ])).rejects.toBeInstanceOf(ScheduledAutoUpdateBlocked);
 expect(await db.prepare("SELECT count(*) n FROM pending_schedules").first("n")).toBe(0);
});
it("atomically advances only one scan plan when two reconcilers race with different dates",async()=>{
 const {run,scan}=await startRun();sent=[];
 await repo.completeItem((await repo.claimItem(scan))!,{status:"succeeded",result:{channelResults:[]}});
 await Promise.all(["2026-10-19","2026-10-20"].map(date=>repo.addItems(run.id,[{targetKey:`member:${uid}:date:${date}`,phase:"match",lane:"auto-update",continuation:{memberUid:uid,date}}],"scan")));
 expect(await db.prepare("SELECT count(*) n FROM scheduled_job_items WHERE run_id=? AND phase='match'").bind(run.id).first("n")).toBe(1);
});
it("preserves a committed finalizer receipt during reconciliation-only retry",async()=>{
 const {run}=await startRun();await drain();
 const before=await db.prepare("SELECT id,result_json FROM scheduled_job_items WHERE run_id=? AND phase='finalize'").bind(run.id).first<{id:string;result_json:string}>();
 await repo.markRunFailed(run.id,"post_completion_reconciliation_failed:fixture",true);
 await retryThroughControl(run.id);await drain();
 expect((await repo.readItem(before!.id))!.result_json).toBe(before!.result_json);
 expect((await repo.readRun(run.id))!.status).toBe("succeeded");
 expect(await db.prepare("SELECT count(*) n FROM auto_update_runs").first("n")).toBe(1);
});

it("refuses delayed match and finalizer messages while a retry scan is still queued",async()=>{
 const {run,scan}=await startRun();sent=[];
 const [match,finalizer]=await repo.addItems(run.id,[
  {targetKey:`member:${uid}:date:2026-10-19`,phase:"match",lane:"auto-update",continuation:{memberUid:uid,date:"2026-10-19"}},
  {targetKey:"finalizer",phase:"finalize",lane:"auto-update"},
 ]);
 await repo.completeItem((await repo.claimItem(scan))!,{status:"failed",errorCode:"schedule_scan_failed"});
 await deliver(match);await deliver(finalizer);
 await retryThroughControl(run.id);sent=[];
 await deliver(match);await deliver(finalizer);
 expect((await repo.readItem(match))!.status).toBe("queued");
 expect((await repo.readItem(finalizer))!.status).toBe("queued");
 expect(await db.prepare("SELECT count(*) n FROM auto_update_runs").first("n")).toBe(1);
 expect(await db.prepare("SELECT count(*) n FROM pending_schedules").first("n")).toBe(0);
});
