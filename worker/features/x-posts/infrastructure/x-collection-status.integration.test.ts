import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readXCollectionStatus } from "./x-collection-status";
import { buildXCollectionApplication } from "../../../app/x-collection";
import type { XActivityStatusDto } from "@contracts/x-activity";
import { D1ScheduledJobRepository } from "../../../platform/scheduled-jobs/d1-scheduled-job-repository";
import { readHybridXCollectionTargets } from "./x-hybrid-policy";
const runtime = { ...env, SITE_ID: "otw" } as Env & { X_REFERENCE_MIGRATIONS: D1Migration[]; SCHEDULED_OPERATIONS_MIGRATIONS: D1Migration[] };
const db = runtime.otw_db;
const now = 1_800_000_000_000;
beforeEach(async () => {
  await applyD1Migrations(db, runtime.X_REFERENCE_MIGRATIONS);
  await applyD1Migrations(db, runtime.SCHEDULED_OPERATIONS_MIGRATIONS);
  await db.batch([...["members", "x_post_sources", "x_fx_sources", "scheduled_job_items", "scheduled_job_runs"].map(table => db.prepare(`DELETE FROM ${table}`)),
    ...[["x_collection_enabled", "true"], ["x_collection_primary_source", "fxembed"], ["x_collection_hybrid_policy", "rss_v1"], ["x_collection_hybrid_activated_at", String(now - 48 * 3600000)], ["x_api_backoff_until","0"]].map(([key,value]) => db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)").bind(key,value)),
    db.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(1,'member','Member','https://x.com/member')"),
    db.prepare("INSERT INTO x_post_sources(handle,last_checked_at,updated_at,collection_started_at,regular_completed_at,last_completed_at,next_check_at,sync_origin_scope,sync_timeline_completed_at,last_error) VALUES('member',0,0,1,?,?,?,'regular',?,'upstream_unavailable')").bind(now-25*3600000,now-25*3600000,now+3600000,now),
    db.prepare("INSERT INTO x_fx_sources(handle,collection_started_at,last_success_at,rss_last_http_success_at,rss_last_raw_count,rss_previous_raw_count,updated_at) VALUES('member',1,?,?,5,10,1)").bind(now,now),
  ]);
  vi.spyOn(Date,"now").mockReturnValue(now);
  vi.stubGlobal("fetch",vi.fn(() => { throw new Error("status must not call upstream"); }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("read_status_performs_no_writes_or_upstream_calls and RSS cannot hide official overdue", async () => {
  const statements: string[] = [];
  const measured = new Proxy(db, { get(target,key) {
    if (key === "prepare") return (sql: string) => { statements.push(sql); return target.prepare(sql); };
    const value = Reflect.get(target,key,target); return typeof value === "function" ? value.bind(target) : value;
  } });
  const result = await readXCollectionStatus({ ...runtime, otw_db: measured },null);
  await buildXCollectionApplication({ ...runtime, otw_db: measured },{actorId:null,actorName:null,actorIp:null}).status();
  expect(statements.filter(sql => /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER)/i.test(sql))).toHaveLength(0);
  expect(fetch).not.toHaveBeenCalled();
  expect(result).toMatchObject({ hybridPolicy: "rss_v1", rss: { enabled: true, lastHttpSuccessAt: now, windowReduced: true }, xApi: { intervalHours: 12 } });
  expect(result.accounts[0]).toMatchObject({ officialHealth: "overdue", officialPending: true, officialNextEligibleAt: now+3600000, officialBlockedReason: "backoff", rssLastCheckCompletedAt: null });
  expect(result.accounts[0].officialNominalDueAt).toBeLessThan(now);
});
it("matches the planner's global paid timeline backoff while retaining local final-page completion eligibility", async () => {
  const activity: XActivityStatusDto = { configured:true,callbackUrl:null,subscription:null,events:[],site:"otw",mode:"normal",budgetReady:true,budget:{limitMicros:1000000,usedMicros:0,reservedMicros:0,strictDailyCap:false},recovery:{intervalHours:12,lastSuccessAt:1,pendingSources:0,budget:{targetCount:1,pageSize:5,continuationPageSize:25,perPageMicros:50000,firstPagesMicros:50000,identityMicros:10000,siteLimitMicros:1000000,siteFirstPagesMicros:50000,day:new Date(now).toISOString().slice(0,10),sharedRemainingMicros:1000000,siteRemainingMicros:1000000,availableMicros:1000000}} };
  const globalBackoff = now + 6 * 3600000;
  await db.prepare("UPDATE settings SET value=? WHERE key='x_api_backoff_until'").bind(String(globalBackoff)).run();
  await db.prepare("UPDATE x_post_sources SET sync_origin_scope=NULL,sync_timeline_completed_at=NULL,sync_pagination_token=NULL,last_error=NULL,last_error_code=NULL,next_check_at=0").run();
  const before = await db.prepare("SELECT * FROM x_post_sources").first();
  const blocked = await readXCollectionStatus(runtime,activity);
  expect(blocked.accounts[0]).toMatchObject({officialHealth:"overdue",officialNextEligibleAt:globalBackoff,officialBlockedReason:"backoff"});
  expect(blocked.accounts[0].officialNominalDueAt).toBe(now-13*3600000);
  expect(blocked.xApi.nextRegularEligibleAt).toBe(globalBackoff);
  expect((await readHybridXCollectionTargets(runtime,now)).filter(target=>target.provider==="x_api")).toEqual([]);
  expect(await db.prepare("SELECT * FROM x_post_sources").first()).toEqual(before);
  await db.prepare("UPDATE x_post_sources SET sync_origin_scope='regular',sync_timeline_completed_at=?").bind(now).run();
  const completedPage = await db.prepare("SELECT * FROM x_post_sources").first();
  const local = await readXCollectionStatus(runtime,null);
  expect(local.accounts[0]).toMatchObject({officialHealth:"overdue",officialPending:true,officialNextEligibleAt:now-25*3600000,officialBlockedReason:null,officialRegularCompletedAt:now-25*3600000});
  expect((await readHybridXCollectionTargets(runtime,now)).filter(target=>target.provider==="x_api")).toMatchObject([{scope:"pending",handles:["member"]}]);
  expect(await db.prepare("SELECT * FROM x_post_sources").first()).toEqual(completedPage);
  expect(await db.prepare("SELECT value FROM settings WHERE key='x_api_backoff_until'").first("value")).toBe(String(globalBackoff));
  expect(fetch).not.toHaveBeenCalled();
});
it("unconfigured_legacy_does_not_show_rss_enabled and rollback does not activate historical marker", async () => {
  for (const [key,value] of [["x_collection_hybrid_policy","legacy"],["x_collection_hybrid_policy","rss_v1"],["x_collection_hybrid_activated_at","Infinity"],["x_collection_hybrid_activated_at","1"],["x_collection_enabled","false"],["x_collection_primary_source","x_api"]]) {
    await db.prepare("UPDATE settings SET value=? WHERE key=?").bind(value,key).run();
    const result = await readXCollectionStatus(runtime,null);
    const active = value === "rss_v1" || key === "x_collection_hybrid_activated_at" && value === "1";
    expect(result.rss.enabled).toBe(active);
  }
});
it("reports account 12h due,18h attention,24h overdue independently from budget and real backoff", async () => {
  const activity: XActivityStatusDto = { configured:true,callbackUrl:null,subscription:null,events:[],site:"otw",mode:"normal",budgetReady:true,budget:{limitMicros:1000000,usedMicros:0,reservedMicros:0,strictDailyCap:false},recovery:{intervalHours:12,lastSuccessAt:1,pendingSources:0,budget:{targetCount:1,pageSize:5,continuationPageSize:25,perPageMicros:50000,firstPagesMicros:50000,identityMicros:10000,siteLimitMicros:1000000,siteFirstPagesMicros:50000,day:new Date(now).toISOString().slice(0,10),sharedRemainingMicros:1000000,siteRemainingMicros:1000000,availableMicros:1000000}} };
  await db.prepare("UPDATE x_post_sources SET sync_origin_scope=NULL,sync_timeline_completed_at=NULL,last_error=NULL,next_check_at=0").run();
  for (const [hours,health] of [[12,"due"],[18,"attention"],[24,"overdue"]] as const) {
    await db.prepare("UPDATE x_post_sources SET regular_completed_at=?").bind(now-hours*3600000).run();
    const result = await readXCollectionStatus(runtime,activity);
    expect(result.accounts[0]).toMatchObject({officialHealth:health,officialRegularAgeMs:hours*3600000,officialBlockedReason:null});
    expect(result.accounts[0].officialNextEligibleAt).toBe(now-(hours-12)*3600000);
  }
  activity.recovery!.budget!.availableMicros = 1;
  expect((await readXCollectionStatus(runtime,activity)).accounts[0].officialBlockedReason).toBe("budget_exceeded");
  activity.site = "luvdia";
  activity.sites = [{site:"otw",enabled:true,targetCount:8,activeCount:8,failedCount:0,pauseReason:null,resumeAt:null,lastError:null}];
  const isolated = await readXCollectionStatus(runtime,activity);
  expect(isolated.webhook).toMatchObject({state:"unavailable",siteActiveCount:null});
  expect(isolated.accounts[0].officialBlockedReason).toBe("shared_budget_unavailable");
});
it("reads pending RSS candidates from the source's durable continuation", async () => {
  const repo = new D1ScheduledJobRepository(db,() => now);
  const run = await repo.createRun({jobType:"x_collection",source:"scheduled",scheduledFor:now,idempotencyKey:"status-rss"});
  const [id] = await repo.addItems(run.id,[{targetKey:"rss:member",phase:"collect",lane:"x",continuation:{provider:"fxembed",mode:"rss_candidates",scope:"pending",handles:["member"],phase:"hydrate",nextAttemptAt:now+1,candidates:[{id:"123",firstSeenAt:now,createdAtHint:now,attempts:1,nextAttemptAt:now+1,error:"fx_404",stage:"free"}]}}]);
  await db.prepare("UPDATE x_fx_sources SET rss_pending_item_id=?").bind(id).run();
  const result = await readXCollectionStatus(runtime,null);
  expect(result.rss).toMatchObject({pendingSources:1,pendingCandidates:1,lastCheckCompletedAt:null});
  expect(result.accounts[0].rssPendingCandidates).toBe(1);
});
