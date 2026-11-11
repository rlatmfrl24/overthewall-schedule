import { meterD1 } from "../../test-support/d1-meter";
import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  SCHEDULED_JOB_LEASE_MS,
  SCHEDULED_QUEUE_DELIVERY_RECOVERY_MS,
} from "./job-policy";
import { D1ScheduledJobRepository, type ScheduledJobItemRecord } from "./d1-scheduled-job-repository";

type TestEnv = Env & {
  SCHEDULED_OPERATIONS_MIGRATIONS: D1Migration[];
};

const testEnv = env as TestEnv;
const db = testEnv.otw_db;
let timestamp = Date.UTC(2026, 7, 31, 0);
let sequence = 0;

const createRepository = () =>
  new D1ScheduledJobRepository(
    db,
    () => timestamp,
    () => `id-${++sequence}`,
  );

beforeEach(async () => {
  await applyD1Migrations(db, testEnv.SCHEDULED_OPERATIONS_MIGRATIONS);
  await db.batch([
    db.prepare("DELETE FROM scheduled_outbox"),
    db.prepare("DELETE FROM scheduled_job_items"),
    db.prepare("DELETE FROM scheduled_job_runs"),
    db.prepare("DELETE FROM scheduled_usage_daily"),
  ]);
  timestamp = Date.UTC(2026, 7, 31, 0);
  sequence = 0;
});

describe("D1 scheduled job state machine", () => {
  it.each([false, true])("batches ten reconciliation failures with snapshot fencing and atomic rollback=%s", async rejectWrite => {
    const repo = createRepository();
    const items: ScheduledJobItemRecord[] = [];
    for (let i = 0; i < 10; i++) {
      const run = await repo.createRun({ jobType: "x_collection", source: "manual", idempotencyKey: `cohort-failure-${i}` });
      const [id] = await repo.addItems(run.id, [{ targetKey: "one", phase: "collect", lane: "x" }]);
      await repo.completeItem((await repo.claimItem(id))!, { status: i === 9 ? "failed" : "succeeded" }, true);
      items.push((await repo.readItem(id))!);
    }
    expect(await repo.retryRun(items[9].run_id)).toMatchObject({ kind: "accepted" });
    const beforeRuns = await Promise.all(items.map(item => repo.readRun(item.run_id)));
    const beforeItems = await repo.readItems(items.map(item => item.id));
    const beforeOutbox = (await db.prepare("SELECT * FROM scheduled_outbox ORDER BY id").all()).results;
    const error = "post_completion_reconciliation_dead_letter:lost_commit_response";
    if (rejectWrite) await db.exec(`CREATE TRIGGER reject_cohort_failure BEFORE UPDATE ON scheduled_job_runs WHEN OLD.id='${items[1].run_id}' AND NEW.last_error='${error}' BEGIN SELECT RAISE(ABORT,'cohort write unavailable'); END;`);
    const meter = meterD1(db, 1), measured = new D1ScheduledJobRepository(meter.db, () => timestamp);
    try {
      const failure = measured.markReconciliationsFailed([...items, items[0]], error);
      if (rejectWrite) await expect(failure).rejects.toThrow("cohort write unavailable");
      else await failure;
    } finally {
      if (rejectWrite) await db.exec("DROP TRIGGER reject_cohort_failure;");
    }
    expect(meter.bindingCalls).toBe(1);
    expect(meter.calls[0].statements).toBe(30);
    expect(meter.quotaDenials).toBe(0);
    expect(await repo.readItems(items.map(item => item.id))).toEqual(beforeItems);
    const afterRuns = await Promise.all(items.map(item => repo.readRun(item.run_id)));
    if (rejectWrite) {
      expect(afterRuns).toEqual(beforeRuns);
      expect((await db.prepare("SELECT * FROM scheduled_outbox ORDER BY id").all()).results).toEqual(beforeOutbox);
    } else {
      expect(afterRuns.slice(0, 9)).toEqual(expect.arrayContaining(items.slice(0, 9).map(item => expect.objectContaining({ id: item.run_id, status: "failed", last_error: error }))));
      expect(afterRuns[9]).toEqual(beforeRuns[9]);
      expect((await db.prepare("SELECT * FROM scheduled_outbox WHERE run_id=? ORDER BY id").bind(items[9].run_id).all()).results).toEqual(beforeOutbox.filter(row => row.run_id === items[9].run_id));
    }
  });

  it.each(["x_collection", "youtube_feed_collection"] as const)("does not refresh a retried %s run from an older completion", async jobType => {
    const repo = createRepository();
    const run = await repo.createRun({ jobType, source: "manual", idempotencyKey: `refresh-fence-${jobType}` });
    const [id] = await repo.addItems(run.id, [{ targetKey: "one", phase: "collect", lane: "x" }]);
    await repo.completeItem((await repo.claimItem(id))!, { status: "failed" }, true);
    const previous = (await repo.readItem(id))!;
    expect(await repo.retryRun(run.id)).toMatchObject({ kind: "accepted" });
    const current = await repo.readRun(run.id);
    const meter = meterD1(db), measured = new D1ScheduledJobRepository(meter.db, () => timestamp);
    await measured.refreshRun(run.id, [previous]);
    expect(await repo.readRun(run.id)).toEqual(current);
    await measured.refreshRuns([run.id], [previous]);
    expect(await repo.readRun(run.id)).toEqual(current);
    expect(meter.summary().rowsWritten).toBe(0);
    await measured.refreshRun(run.id, [(await repo.readItem(id))!]);
    expect((await repo.readRun(run.id))?.status).toBe("running");
  });

  it.each(["control", "items"] as const)("atomically fences a successful outbox claim by its %s snapshot", async fenceKind => {
    const repo = createRepository();
    const run = await repo.createRun({ jobType: "x_collection", source: "manual", idempotencyKey: `dispatch-fence-${fenceKind}` });
    const [id] = await repo.addItems(run.id, [{ targetKey: "one", phase: "collect", lane: "x" }]);
    await repo.completeItem((await repo.claimItem(id))!, { status: "failed" }, true);
    const previous = (await repo.readItem(id))!;
    expect(await repo.retryRun(run.id)).toMatchObject({ kind: "accepted" });
    const current = (await repo.readItem(id))!;
    const meter = meterD1(db, 2), measured = new D1ScheduledJobRepository(meter.db, () => timestamp);
    expect(await measured.claimPendingOutbox(run.id, 8, fenceKind === "control" ? { controlGeneration: 0 } : { items: [previous] })).toEqual([]);
    expect(meter.bindingCalls).toBe(1);
    expect(meter.summary().rowsWritten).toBe(0);
    expect(await measured.claimPendingOutbox(run.id, 8, { controlGeneration: 1, items: [current] })).toMatchObject([{ item_id: id, delivery_generation: 1, control_generation: 1 }]);
    expect(meter.bindingCalls).toBe(2);
    expect(meter.quotaDenials).toBe(0);
  });

  it("does not apply an old dispatch denial to a retried run with an active sibling", async () => {
    timestamp = Date.UTC(2026, 7, 31, 23, 59, 59);
    const repo = createRepository();
    const run = await repo.createRun({ jobType: "x_collection", source: "manual", idempotencyKey: "active-sibling-denial" });
    const [active, retryable] = await repo.addItems(run.id, ["active", "retryable"].map(targetKey => ({ targetKey, phase: "collect", lane: "x" as const })));
    const claims = await repo.claimPendingOutbox(run.id);
    const denied = claims.find(claim => claim.item_id === active)!;
    await repo.reserveQueueOperations("x", 5000);
    expect(await repo.reserveDispatchBudgets([{ lane: "x", estimate: { rowsRead: 1, rowsWritten: 1 } }])).toEqual([false]);
    await repo.claimItem(active);
    await repo.markRunThrottled(run.id, "daily_queue_budget_100pct", 0);
    timestamp += 2_000;
    expect(await repo.retryRun(run.id)).toMatchObject({ kind: "accepted" });
    expect(await repo.getBackgroundUsagePercent()).toBe(0);
    const beforeRun = await repo.readRun(run.id);
    const beforeItems = await repo.readItems([active, retryable]);
    const beforeOutbox = (await db.prepare("SELECT * FROM scheduled_outbox WHERE run_id=? ORDER BY id").bind(run.id).all()).results;
    expect(beforeItems.find(item => item.id === active)?.status).toBe("running");
    expect(JSON.parse(beforeItems.find(item => item.id === active)!.continuation_json ?? "{}").deliveryGeneration ?? 0).toBe(0);
    expect(JSON.parse(beforeItems.find(item => item.id === retryable)!.continuation_json!).deliveryGeneration).toBe(1);
    const meter = meterD1(db, 1);
    await new D1ScheduledJobRepository(meter.db, () => timestamp).markOutboxResults([], denied);
    expect(await repo.readRun(run.id)).toEqual(beforeRun);
    expect(await repo.readItems([active, retryable])).toEqual(beforeItems);
    expect((await db.prepare("SELECT * FROM scheduled_outbox WHERE run_id=? ORDER BY id").bind(run.id).all()).results).toEqual(beforeOutbox);
    expect(meter.bindingCalls).toBe(1);
    expect(meter.summary().rowsWritten).toBe(0);
    const [currentClaim] = await repo.claimPendingOutbox(run.id);
    expect(currentClaim).toMatchObject({ item_id: retryable, delivery_generation: 1, control_generation: 1 });
    await repo.reserveQueueOperations("x", 5000);
    expect(await repo.reserveDispatchBudgets([{ lane: "x", estimate: { rowsRead: 1, rowsWritten: 1 } }])).toEqual([false]);
    await repo.markOutboxResults([], currentClaim);
    expect((await repo.readRun(run.id))?.status).toBe("throttled");
    expect((await repo.readItem(active))?.status).toBe("running");
    expect((await repo.readItem(retryable))?.status).toBe("throttled");
  });

  it.each([
    { used: 4747, expected: "reserved", after: 4750 },
    { used: 4998, expected: "denied", after: 4998 },
  ])("atomically admits the current control retry: $expected", async ({ used, expected, after }) => {
    const repo = createRepository();
    const run = await repo.createRun({ jobType: "x_collection", source: "manual", idempotencyKey: "control-retry-budget" });
    await repo.reserveQueueOperations("control", used);
    const meter = meterD1(db, 1);
    const measured = new D1ScheduledJobRepository(meter.db, () => timestamp);
    expect(await measured.reserveControlRetry(run.id, 0)).toBe(expected);
    expect(meter.bindingCalls).toBe(1);
    expect(await db.prepare("SELECT used FROM scheduled_usage_daily WHERE resource='queue_operations'").first("used")).toBe(after);
  });

  it("does not reserve quota for superseded or closed control retries", async () => {
    const repo = createRepository();
    const run = await repo.createRun({ jobType: "x_collection", source: "manual", idempotencyKey: "stale-control-retry" });
    await repo.completeUnplannedRun(run.id, "failed", "first control failed");
    expect(await repo.retryRun(run.id)).toMatchObject({ kind: "accepted" });
    const measured = new D1ScheduledJobRepository(meterD1(db).db, () => timestamp);
    expect(await measured.reserveControlRetry(run.id, 0)).toBe("stale");
    expect(await db.prepare("SELECT COUNT(*) AS n FROM scheduled_usage_daily").first("n")).toBe(0);
    await repo.reserveQueueOperations("control", 4747);
    expect(await measured.reserveControlRetry(run.id, 0)).toBe("stale");
    await repo.completeUnplannedRun(run.id, "failed", "current control failed", 1);
    expect(await measured.reserveControlRetry(run.id, 1)).toBe("stale");
    expect(await measured.reserveControlRetry("missing", 0)).toBe("stale");
    expect(await db.prepare("SELECT used FROM scheduled_usage_daily WHERE resource='queue_operations'").first("used")).toBe(4747);
  });

  it.each([
    {name:'missing ledger',used:null,reserved:0,limit:5000,allowed:true},
    {name:'exact remaining budget',used:4997,reserved:0,limit:5000,allowed:true},
    {name:'reserved budget denial',used:4997,reserved:1,limit:5000,allowed:false},
    {name:'stored lower limit denial',used:4,reserved:1,limit:7,allowed:false},
  ])("atomically reserves reconciliation or records recoverable failure: $name",async({used,reserved,limit,allowed})=>{
    const repo=createRepository(),run=await repo.createRun({jobType:'naver_cafe_collection',source:'scheduled',idempotencyKey:'reconcile-budget'});
    const [done,queued,running]=await repo.addItems(run.id,[
      {targetKey:'done',phase:'collect',lane:'naver'},
      {targetKey:'queued',phase:'collect',lane:'naver'},
      {targetKey:'running',phase:'collect',lane:'naver'},
    ]);
    await repo.completeItem((await repo.claimItem(done))!,{status:'succeeded',result:{stored:1}});
    await repo.claimItem(running);
    await db.prepare("UPDATE scheduled_job_runs SET status='succeeded' WHERE id=?").bind(run.id).run();
    const before=await repo.readItem(done),active=await repo.readItem(running);
    if(used!==null)await db.prepare("INSERT INTO scheduled_usage_daily(day,lane,resource,used,reserved,limit_value,updated_at) VALUES('2026-08-31','all','queue_operations',?,?,?,0)").bind(used,reserved,limit).run();
    const meter=meterD1(db,1),measured=new D1ScheduledJobRepository(meter.db,()=>timestamp);
    expect(await measured.reserveReconciliationRetry(run.id,'post_completion_reconciliation_failed:test')).toBe(allowed);
    expect(meter.bindingCalls).toBe(1);expect(meter.quotaDenials).toBe(0);
    expect(await repo.readItem(done)).toEqual(before);expect(await repo.readItem(running)).toEqual(active);
    expect((await repo.readItem(queued))?.status).toBe(allowed?'queued':'failed');
    expect(await repo.readRun(run.id)).toMatchObject({status:allowed?'succeeded':'failed',last_error:allowed?null:'post_completion_reconciliation_failed:test'});
    expect(await db.prepare("SELECT used,reserved FROM scheduled_usage_daily WHERE lane='all' AND resource='queue_operations'").first()).toEqual({used:allowed?(used??0)+3:used,reserved});
    expect(await db.prepare("SELECT count(*) n FROM scheduled_outbox WHERE run_id=? AND status IN ('pending','failed','dispatching')").bind(run.id).first('n')).toBe(allowed?4:0);
    expect(await db.prepare("SELECT reconciled_at FROM scheduled_outbox WHERE item_id=? AND event_type='reconcile'").bind(done).first('reconciled_at')).toBeNull();
  });

  it.each([0, 5000])("fences stale reconciliation writes after manual retry even when queue usage is %s", async used => {
    const repo=createRepository(), run=await repo.createRun({jobType:"x_collection",source:"manual",idempotencyKey:`reconciliation-generation-${used}`});
    const [done, failed]=await repo.addItems(run.id,["done","failed"].map(targetKey=>({targetKey,phase:"collect",lane:"x" as const})));
    const completed=(await repo.claimItem(done))!, unsuccessful=(await repo.claimItem(failed))!;
    await repo.completeItem(completed,{status:"succeeded"});
    await repo.completeItem(unsuccessful,{status:"failed"});
    const oldDone=(await repo.readItem(done))!, oldFailed=(await repo.readItem(failed))!;
    expect(await repo.retryRun(run.id)).toMatchObject({kind:"accepted"});
    const beforeRun=await repo.readRun(run.id), beforeItems=await repo.readItems([done,failed]);
    expect(beforeItems.every(item=>JSON.parse(item.continuation_json!).deliveryGeneration===1)).toBe(true);
    await db.prepare("INSERT INTO scheduled_usage_daily(day,lane,resource,used,reserved,limit_value,updated_at) VALUES('2026-08-31','all','queue_operations',?,0,5000,0)").bind(used).run();
    const beforeOutbox=(await db.prepare("SELECT * FROM scheduled_outbox WHERE run_id=? ORDER BY id").bind(run.id).all()).results;
    const meter=meterD1(db,3), measured=new D1ScheduledJobRepository(meter.db,()=>timestamp);
    expect(await measured.reserveReconciliationRetry(run.id,"post_completion_reconciliation_failed:stale",[oldDone])).toBe(false);
    await measured.markRunFailed(run.id,"post_completion_reconciliation_dead_letter:stale",true,[oldFailed]);
    await measured.acknowledgeReconciliation(oldDone);
    expect(meter.bindingCalls).toBe(3);
    expect(meter.summary().rowsWritten).toBe(0);
    expect(await repo.readRun(run.id)).toEqual(beforeRun);
    expect(await repo.readItems([done,failed])).toEqual(beforeItems);
    expect((await db.prepare("SELECT * FROM scheduled_outbox WHERE run_id=? ORDER BY id").bind(run.id).all()).results).toEqual(beforeOutbox);
    expect(await db.prepare("SELECT used FROM scheduled_usage_daily WHERE resource='queue_operations'").first("used")).toBe(used);
  });

  it.each(["failed","throttled"] as const)("completes only an unplanned control run as %s",async status=>{
    const repo=createRepository(),run=await repo.createRun({jobType:"x_collection",source:"manual",idempotencyKey:`control-${status}`});
    await repo.completeUnplannedRun(run.id,status,"control_failure");
    expect(await repo.readRun(run.id)).toMatchObject({status,last_error:"control_failure"});
    expect(await repo.retryRun(run.id)).toMatchObject({kind:"accepted"});
    const retried=await repo.readRun(run.id);
    await repo.skipRun(run.id,"old plan",0);
    await repo.markRunThrottled(run.id,"old budget",0);
    await repo.completeUnplannedRun(run.id,status,"old control",0);
    expect(await repo.addItems(run.id,[{targetKey:"obsolete",phase:"collect",lane:"x"}],undefined,0)).toEqual([]);
    expect(await repo.readRun(run.id)).toEqual(retried);
    expect(await repo.hasItems(run.id)).toBe(false);
    await repo.updateRunSummary(run.id,{provider:"fixture"});
    expect(JSON.parse((await repo.readRun(run.id))!.summary_json!)).toEqual({provider:"fixture",controlGeneration:1});
    expect((await repo.readRunDto(run.id))?.summary).toEqual({provider:"fixture"});
    await repo.addItems(run.id,[{targetKey:"one",phase:"collect",lane:"x"}]);
    const before=await repo.readRun(run.id);
    await repo.completeUnplannedRun(run.id,status,"old_control_failure");
    expect(await repo.readRun(run.id)).toEqual(before);
  });

  it("fences delayed cohort send results to their own outbox claim",async()=>{
    const repo=createRepository(),run=await repo.createRun({jobType:'x_collection',source:'scheduled',idempotencyKey:'late-marker'});
    await repo.addItems(run.id,[{targetKey:'one',phase:'collect',lane:'x'}]);
    const [claim]=await repo.claimPendingOutbox(run.id);
    await db.prepare("UPDATE scheduled_outbox SET lease_token='new-owner' WHERE id=?").bind(claim.id).run();
    await repo.markOutboxResults([{id:claim.id,error:null,leaseToken:claim.lease_token}]);
    await repo.markOutboxResults([{id:claim.id,error:'late failure',leaseToken:claim.lease_token}]);
    expect(await db.prepare('SELECT status,lease_token,last_error,dispatched_at FROM scheduled_outbox WHERE id=?').bind(claim.id).first()).toEqual({status:'dispatching',lease_token:'new-owner',last_error:null,dispatched_at:null});
    await repo.markOutboxResults([{id:claim.id,error:null,leaseToken:'new-owner'}]);
    expect(await db.prepare('SELECT status FROM scheduled_outbox WHERE id=?').bind(claim.id).first('status')).toBe('dispatched');
  });

  it("rolls back reconciliation-denial transitions together when recording failure fails",async()=>{
    const repo=createRepository(),run=await repo.createRun({jobType:'naver_cafe_collection',source:'scheduled',idempotencyKey:'denial-rollback'});
    const [id]=await repo.addItems(run.id,[{targetKey:'one',phase:'collect',lane:'naver'}]);
    await repo.reserveQueueOperations('naver',5000);
    const before=await repo.readRun(run.id),item=await repo.readItem(id);
    await db.exec("CREATE TRIGGER fail_reconciliation_transition BEFORE UPDATE ON scheduled_job_runs WHEN NEW.last_error='denied' BEGIN SELECT RAISE(ABORT,'failure record unavailable'); END;");
    const meter=meterD1(db,1);
    try {
      await expect(new D1ScheduledJobRepository(meter.db,()=>timestamp).reserveReconciliationRetry(run.id,'denied')).rejects.toThrow('failure record unavailable');
    } finally { await db.exec('DROP TRIGGER fail_reconciliation_transition;'); }
    expect(meter.bindingCalls).toBe(1);expect(meter.calls[0].completed).toBe(false);
    expect(await repo.readRun(run.id)).toEqual(before);expect(await repo.readItem(id)).toEqual(item);
    expect(await db.prepare('SELECT status FROM scheduled_outbox WHERE item_id=?').bind(id).first('status')).toBe('pending');
    expect(await db.prepare("SELECT used FROM scheduled_usage_daily WHERE resource='queue_operations'").first('used')).toBe(5000);
  });

  it("admits only the highest-priority eligible paid item despite adverse IDs and reordered delivery", async () => {
    const repo = createRepository(), run = await repo.createRun({ jobType: "x_collection", source: "scheduled", idempotencyKey: "ranked" });
    const [low, high, free] = await repo.addItems(run.id, [
      { targetKey: "a-low", lane: "x", phase: "collect", continuation: { executionPriority: { deadlineAt: timestamp + 1000, lastAttemptAt: 0, key: "low" } } },
      { targetKey: "z-high", lane: "x", phase: "collect", continuation: { executionPriority: { deadlineAt: timestamp, lastAttemptAt: 0, key: "high" } } },
      { targetKey: "free", lane: "x", phase: "collect" },
    ]);
    await db.prepare("UPDATE scheduled_outbox SET id=CASE item_id WHEN ? THEN 'a-low' WHEN ? THEN 'z-high' ELSE 'free' END").bind(low, high).run();
    const exposed = await repo.claimPendingOutbox(run.id);
    expect(new Set(exposed.map(row => row.item_id))).toEqual(new Set([high, free]));
    expect(await repo.claimItem(low)).toBeNull();
    await db.prepare("UPDATE scheduled_outbox SET status='dispatched',dispatched_at=? WHERE item_id=?").bind(timestamp,low).run();
    expect(await repo.rearmDeferredPriorityItem(low)).toBe(true);
    await repo.markOutboxDispatched("a-low");
    expect(await db.prepare("SELECT status FROM scheduled_outbox WHERE item_id=?").bind(low).first("status")).toBe("pending");
    const claimed = (await repo.claimItem(high))!;
    expect(claimed).not.toBeNull();
    expect(await repo.claimItem(low)).toBeNull();
    await repo.checkpointItemContinuation(claimed, { ...JSON.parse(claimed.continuation_json!), phase: "hydrate" }, {});
    expect(JSON.parse((await repo.readItem(high))!.continuation_json!).executionPriority.deadlineAt).toBe(timestamp);
    await repo.completeItem(claimed, { status: "succeeded" });
    expect((await repo.claimPendingOutbox(run.id)).map(row => row.item_id)).toContain(low);
    expect(await repo.claimItem(low)).not.toBeNull();
  });

  it("does not let future retry priority block eligible work or other cohorts", async () => {
    const repo = createRepository(), run = await repo.createRun({ jobType: "x_collection", source: "scheduled", idempotencyKey: "retry-rank" });
    const [high, low] = await repo.addItems(run.id, [0, 1].map(rank => ({ targetKey: String(rank), lane: "x" as const, phase: "collect", continuation: { executionPriority: { deadlineAt: rank, lastAttemptAt: 0, key: String(rank) } } })));
    const claimed = (await repo.claimItem(high))!;
    await repo.releaseItemForRetry(claimed, "retry", "retry");
    expect(await repo.claimItem(high)).toBeNull();
    expect(await repo.claimItem(low)).not.toBeNull();
    const otherRun = await repo.createRun({ jobType: "x_collection", source: "scheduled", idempotencyKey: "other-rank" });
    const [other] = await repo.addItems(otherRun.id, [{ targetKey: "other", lane: "x", phase: "collect", continuation: { executionPriority: { deadlineAt: 2, lastAttemptAt: 0, key: "other" } } }]);
    expect(await repo.claimItem(other)).not.toBeNull();
  });

  it("dispatches the ready peer while a higher-priority send is backed off", async () => {
    const repo = createRepository();
    const run = await repo.createRun({ jobType: "x_collection", source: "scheduled", idempotencyKey: "send-backoff-rank" });
    const [high, low] = await repo.addItems(run.id, [0, 1].map(rank => ({
      targetKey: String(rank), lane: "x" as const, phase: "collect",
      continuation: { executionPriority: { deadlineAt: rank, lastAttemptAt: 0, key: String(rank) } },
    })));
    const [first] = await repo.claimPendingOutbox(run.id);
    expect(first.item_id).toBe(high);
    await repo.markOutboxResults([{ id: first.id, leaseToken: first.lease_token!, error: "queue unavailable" }]);
    expect((await repo.claimPendingOutbox(run.id)).map(row => row.item_id)).toEqual([low]);
    const claimed = await repo.claimItem(low);
    expect(claimed?.id).toBe(low);
    await repo.completeItem(claimed!, { status: "succeeded" });
    expect(await repo.claimPendingOutbox(run.id)).toHaveLength(0);
    const retry = new D1ScheduledJobRepository(db, () => timestamp + 60_000);
    expect((await retry.claimPendingOutbox(run.id)).map(row => row.item_id)).toEqual([high]);
  });

  it("bounds priority admission reads to active items as retained history grows", async () => {
    const repo=createRepository(),run=await repo.createRun({jobType:"x_collection",source:"scheduled",idempotencyKey:"priority-cost"});
    const [,low]=await repo.addItems(run.id,[0,1].map(rank=>({targetKey:String(rank),lane:"x" as const,phase:"collect",continuation:{executionPriority:{deadlineAt:rank,lastAttemptAt:0,key:String(rank)}}})));
    const measure=async()=>{
      const meter=meterD1(db);
      expect(await new D1ScheduledJobRepository(meter.db,()=>timestamp).claimItem(low)).toBeNull();
      return meter;
    };
    const before=await measure();
    await db.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<2000) INSERT INTO scheduled_job_items(id,run_id,target_key,phase,lane,status,available_at,created_at,updated_at) SELECT 'old-'||x,?,'old-'||x,'collect','x','succeeded',0,0,0 FROM n").bind(run.id).run();
    const after=await measure();
    expect(after.summary()).toEqual(before.summary());
    const entry=after.entries[0];
    const plan=await db.prepare(`EXPLAIN QUERY PLAN ${entry.sql}`).bind(...entry.args).all<{detail:string}>();
    expect(plan.results.map(row=>row.detail).join(" ")).toContain("idx_scheduled_job_items_run_status_updated");
    console.log("PRIORITY_ADMISSION_PROFILE",JSON.stringify({...after.summary(),bindingCalls:after.bindingCalls}));
  });
  it("bounds latest-success reads by job type while preserving completion order and missing jobs", async () => {
    await db.prepare(`WITH RECURSIVE history(n) AS (
      VALUES (1) UNION ALL SELECT n+1 FROM history WHERE n<4000
    ) INSERT INTO scheduled_job_runs (
      id,job_type,source,idempotency_key,status,accepted_at,finished_at,created_at,updated_at
    ) SELECT 'success-'||n,CASE WHEN n%2=0 THEN 'x_collection' ELSE 'naver_cafe_collection' END,
      'scheduled','success-'||n,'succeeded',?+n,?+n,?,?+n FROM history`)
      .bind(timestamp,timestamp,timestamp,timestamp).run();
    const insert = (id: string, status: string, accepted: number, finished: number | null) => db.prepare(`
      INSERT INTO scheduled_job_runs(id,job_type,source,idempotency_key,status,accepted_at,finished_at,created_at,updated_at)
      VALUES(?,'x_collection','scheduled',?,?,?,?,?,?)`)
      .bind(id,id,status,accepted,finished,timestamp,timestamp+10_000);
    await db.batch([
      insert('older-accepted-last-finished','succeeded',timestamp+1,timestamp+6000),
      insert('newer-accepted-earlier-finished','succeeded',timestamp+7000,timestamp+5000),
      insert('failed','failed',timestamp+8000,timestamp+9000),
      insert('partial','partial',timestamp+8001,timestamp+9001),
      insert('unfinished','succeeded',timestamp+8002,null),
    ]);
    const measured=meterD1(db);
    expect(await new D1ScheduledJobRepository(measured.db).readLatestSuccessfulRunTimes()).toEqual([
      {jobType:'naver_cafe_collection',latestSuccessAt:timestamp+3999},
      {jobType:'x_collection',latestSuccessAt:timestamp+6000},
    ]);
    console.info('LATEST_SUCCESS_D1_COST',JSON.stringify(measured.summary()));
    expect(measured.summary().rowsRead).toBeLessThan(50);
    expect(measured.summary().rowsWritten).toBe(0);

    const indexName='idx_scheduled_job_runs_success_finished';
    const indexSql=await db.prepare("SELECT sql FROM sqlite_master WHERE name=?").bind(indexName).first<string>('sql');
    expect(indexSql).toBeTruthy();
    await db.prepare(`DROP INDEX ${indexName}`).run();
    const before=await insert('before-index','succeeded',timestamp,timestamp).run();
    const build=await db.prepare(indexSql!).run();
    const after=await insert('after-index','succeeded',timestamp,timestamp).run();
    console.info('LATEST_SUCCESS_INDEX_COST',JSON.stringify({build:build.meta,insertBefore:before.meta,insertAfter:after.meta}));
    expect(after.meta.rows_written-before.meta.rows_written).toBe(1);
  });

  it.each([true,false])("replaces retry match targets atomically and permits an empty new plan: %s",async(hasTargets)=>{
    const repository=createRepository();
    const run=await repository.createRun({jobType:"schedule_auto_update",source:"manual",idempotencyKey:"retry-plan"});
    const [scan]=await repository.addItems(run.id,[{targetKey:"scan",phase:"scan",lane:"auto-update"}]);
    await repository.completeItem((await repository.claimItem(scan))!,{status:"partial"});
    const [retained,obsolete]=await repository.addItems(run.id,[
      {targetKey:"member:1:date:2026-08-31",phase:"match",lane:"auto-update"},
      {targetKey:"member:1:date:2026-08-30",phase:"match",lane:"auto-update"},
    ],"scan");
    for(const id of [retained,obsolete])await repository.completeItem((await repository.claimItem(id))!,{status:"succeeded",result:{updated:1}});
    const [finalizer]=await repository.addItems(run.id,[{targetKey:"finalizer",phase:"finalize",lane:"auto-update"}],"match");
    await repository.completeItem((await repository.claimItem(finalizer))!,{status:"partial",result:{updated:2}});
    expect(await repository.retryRun(run.id)).toMatchObject({kind:"accepted"});
    await repository.completeItem((await repository.claimItem(scan))!,{status:"succeeded"});
    const next=hasTargets?[
      {targetKey:"member:1:date:2026-08-31",phase:"match",lane:"auto-update" as const},
      {targetKey:"new-fresh",phase:"match",lane:"auto-update" as const},
    ]:[{targetKey:"finalizer",phase:"finalize",lane:"auto-update" as const}];
    if(hasTargets){
      await db.prepare("CREATE TRIGGER retry_plan_abort BEFORE INSERT ON scheduled_job_items WHEN NEW.target_key='new-fresh' BEGIN SELECT RAISE(ABORT,'retry_plan_failure'); END").run();
      try{
        await expect(repository.addItems(run.id,next,"scan")).rejects.toThrow(/retry_plan_failure/);
        expect((await repository.readItem(obsolete))!.status).toBe("queued");
      } finally {await db.prepare("DROP TRIGGER retry_plan_abort").run();}
    }
    await repository.addItems(run.id,next,"scan");
    expect(await repository.readItem(obsolete)).toMatchObject({status:"skipped",last_error_code:"auto_update_target_superseded"});
    expect(await repository.claimItem(obsolete)).toBeNull();
    const outbox=await repository.claimPendingOutbox(run.id,10);
    expect(outbox.map(row=>row.item_id)).not.toContain(obsolete);
    expect(outbox.filter(row=>row.phase==="match")).toHaveLength(hasTargets?2:0);
    if(!hasTargets){
      expect((await repository.readItem(retained))!.status).toBe("skipped");
      expect(outbox).toContainEqual(expect.objectContaining({item_id:finalizer,phase:"finalize"}));
      expect(await repository.claimItem(finalizer)).not.toBeNull();
    }
  });

  it("hydrates a run page in bounded queries and seeks latest runs without walking history",async()=>{
    await db.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<5000) INSERT INTO scheduled_job_runs(id,job_type,source,idempotency_key,status,accepted_at,created_at,updated_at) SELECT printf('cost-%05d',x),'naver_cafe_collection','manual','cost-'||x,'succeeded',x,x,x FROM n").run();
    const meter=meterD1(db),repository=new D1ScheduledJobRepository(meter.db);
    const runs=await repository.listRunDtos({limit:26});
    expect(runs).toHaveLength(26); expect(runs[0].runId).toBe('cost-05000'); expect(runs[25].runId).toBe('cost-04975');
    expect.soft(meter.summary().sqlCount).toBeLessThanOrEqual(7);
    const latestMeter=meterD1(db);
    const latest=await new D1ScheduledJobRepository(latestMeter.db).listLatestRunDtosByJobType();
    expect(latest.map(row=>row.runId)).toEqual(['cost-05000']);
    expect.soft(latestMeter.summary().rowsRead).toBeLessThan(500);
    const normalizedMeter=meterD1(db);
    const filtered=await new D1ScheduledJobRepository(normalizedMeter.db).listRunDtos({limit:26,offset:50,status:'succeeded'});
    expect(filtered[0].runId).toBe('cost-04950'); expect(filtered).toHaveLength(26);
    expect.soft(normalizedMeter.summary().sqlCount).toBeLessThanOrEqual(8);
    expect.soft(normalizedMeter.summary().rowsRead).toBeLessThan(500);
    console.info('RUN_LIST_D1_COST',JSON.stringify({page:meter.summary(),latest:latestMeter.summary(),filtered:normalizedMeter.summary()}));
  });

  it('scheduled_reconciliation_upgrade preserves old unknown receipts and rolls back terminal plus followup together',async()=>{
    const upgradeDb=(env as typeof env & {transition_target_db:D1Database}).transition_target_db;
    const migrations=testEnv.SCHEDULED_OPERATIONS_MIGRATIONS;
    await applyD1Migrations(upgradeDb,migrations.filter(m=>!m.name.startsWith('0135_')&&!m.name.startsWith('0136_')));
    const repository=new D1ScheduledJobRepository(upgradeDb,()=>timestamp,()=>`upgrade-${++sequence}`);
    const legacy=await repository.createRun({jobType:'x_collection',source:'manual',idempotencyKey:'upgrade-original'});
    const [legacyId]=await repository.addItems(legacy.id,[{targetKey:'old',phase:'collect',lane:'x'}]);
    await upgradeDb.batch([
      upgradeDb.prepare("UPDATE scheduled_job_items SET status='succeeded',result_json=?,finished_at=? WHERE id=?").bind(JSON.stringify({original:true}),timestamp,legacyId),
      upgradeDb.prepare("UPDATE scheduled_job_runs SET status='succeeded',finished_at=? WHERE id=?").bind(timestamp,legacy.id),
      upgradeDb.prepare("INSERT INTO scheduled_outbox(id,run_id,item_id,lane,event_type,status,attempts,available_at,dispatched_at,created_at,updated_at) VALUES('upgrade-reconcile',?,?,'x','reconcile','dispatched',1,?,?,?,?)").bind(legacy.id,legacyId,timestamp,timestamp,timestamp,timestamp),
    ]);
    const before=await upgradeDb.prepare("SELECT * FROM scheduled_outbox WHERE id='upgrade-reconcile'").first();
    await applyD1Migrations(upgradeDb,migrations.filter(m=>m.name.startsWith('0135_')||m.name.startsWith('0136_')));
    const after=await upgradeDb.prepare("SELECT * FROM scheduled_outbox WHERE id='upgrade-reconcile'").first();
    expect(after).toEqual({...before,reconciled_at:null});
    expect((await repository.claimPendingOutbox(legacy.id)).map(o=>o.id)).toEqual(['upgrade-reconcile']);
    const run=await repository.createRun({jobType:'x_collection',source:'manual',idempotencyKey:'atomic-original'});
    const [id]=await repository.addItems(run.id,[{targetKey:'new',phase:'collect',lane:'x'}]);const claimed=(await repository.claimItem(id))!;
    await upgradeDb.prepare("CREATE TRIGGER task44_reconcile_insert_abort BEFORE INSERT ON scheduled_outbox WHEN NEW.event_type='reconcile' BEGIN SELECT RAISE(ABORT,'reconcile_insert_failure'); END").run();
    await expect(repository.completeItem(claimed,{status:'succeeded',result:{original:true}})).rejects.toThrow(/reconcile_insert_failure/);
    expect(await repository.readItem(id)).toEqual(claimed);
    expect(await upgradeDb.prepare("SELECT count(*) n FROM scheduled_outbox WHERE item_id=? AND event_type='reconcile'").bind(id).first('n')).toBe(0);
    await upgradeDb.prepare('DROP TRIGGER task44_reconcile_insert_abort').run();
    expect(await repository.completeItem(claimed,{status:'succeeded',result:{original:true}})).toBe(true);
    const item=(await repository.readItem(id))!;
    expect(await upgradeDb.prepare("SELECT status,reconciled_at FROM scheduled_outbox WHERE item_id=? AND event_type='reconcile'").bind(id).first()).toEqual({status:'pending',reconciled_at:null});
    await repository.acknowledgeReconciliation({...item,result_json:'{"different":true}'});
    expect(await upgradeDb.prepare("SELECT reconciled_at FROM scheduled_outbox WHERE item_id=? AND event_type='reconcile'").bind(id).first('reconciled_at')).toBeNull();
    await repository.acknowledgeReconciliation(item);
    expect(await upgradeDb.prepare("SELECT status,reconciled_at FROM scheduled_outbox WHERE item_id=? AND event_type='reconcile'").bind(id).first()).toEqual({status:'pending',reconciled_at:timestamp});
  });

  it("keeps idle atomic outbox updates bounded after retained history outgrows planner statistics", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "ingestion_recovery", source: "scheduled", idempotencyKey: "retained-history",
    });
    await db.prepare(`WITH RECURSIVE history(n) AS (
      VALUES (0) UNION ALL SELECT n + 1 FROM history WHERE n < 2129
    ) INSERT INTO scheduled_job_items (
      id, run_id, target_key, phase, lane, status, available_at,
      finished_at, created_at, updated_at
    ) SELECT 'retained-item-' || n, ?, 'history:' || n, 'cleanup', 'ingestion',
        'succeeded', ?, ?, ?, ? FROM history`)
      .bind(run.id, timestamp, timestamp, timestamp, timestamp).run();
    const insertHistoryOutbox = `INSERT INTO scheduled_outbox (
      id, run_id, item_id, lane, event_type, status, attempts,
      available_at, dispatched_at, created_at, updated_at
    ) SELECT 'retained-outbox-' || id, run_id, id, lane, 'execute', 'dispatched',
        1, ?, ?, ?, ? FROM scheduled_job_items WHERE run_id = ?`;
    await db.prepare(`${insertHistoryOutbox} LIMIT 22`)
      .bind(timestamp, timestamp, timestamp, timestamp, run.id).run();
    // Production retained statistics for 22 outbox rows after the table grew
    // past 2,000. Without this stale-statistics condition the outer UPDATE
    // happened to use its PK in local tests and hid the production full scan.
    await db.prepare("ANALYZE scheduled_outbox").run();
    await db.prepare(`${insertHistoryOutbox} ON CONFLICT(id) DO NOTHING`)
      .bind(timestamp, timestamp, timestamp, timestamp, run.id).run();
    expect(await db.prepare(
      "SELECT stat FROM sqlite_stat1 WHERE idx = 'sqlite_autoindex_scheduled_outbox_1'",
    ).first("stat")).toBe("22 1");
    // Inline completion has no Queue send. Its pending status remains truthful,
    // but reconciled history must not inflate the new recovery lookup either.
    await db.prepare(`INSERT INTO scheduled_outbox(id,run_id,item_id,lane,event_type,status,attempts,available_at,reconciled_at,created_at,updated_at)
      SELECT 'reconciled-'||id,run_id,id,lane,'reconcile','pending',0,?,?,?,? FROM scheduled_job_items WHERE run_id=?`)
      .bind(timestamp,timestamp,timestamp,timestamp,run.id).run();
    await db.batch([
      db.prepare("UPDATE scheduled_job_runs SET status = 'succeeded', finished_at = ?").bind(timestamp),
    ]);
    timestamp += SCHEDULED_QUEUE_DELIVERY_RECOVERY_MS + 1;

    const measurements: Array<{ operation: string; rowsRead: number; rowsWritten: number }> = [];
    let operation = "scoped-claim";
    const native = new WeakMap<D1PreparedStatement, D1PreparedStatement>();
    const record = <T>(result: D1Result<T>) => {
      measurements.push({ operation,
        rowsRead: Number(result.meta.rows_read ?? 0),
        rowsWritten: Number(result.meta.rows_written ?? 0),
      });
      return result;
    };
    const wrap = (statement: D1PreparedStatement): D1PreparedStatement => {
      const wrapped = {
        bind: (...values: unknown[]) => wrap(statement.bind(...values)),
        all: async <T>() => record(await statement.all<T>()),
        run: async <T>() => record(await statement.run<T>()),
        first: statement.first.bind(statement),
        raw: statement.raw.bind(statement),
      } as D1PreparedStatement;
      native.set(wrapped, statement);
      return wrapped;
    };
    const measuredDb = {
      prepare: (sql: string) => wrap(db.prepare(sql)),
      batch: async <T>(statements: D1PreparedStatement[]) =>
        (await db.batch<T>(statements.map((statement) => native.get(statement) ?? statement))).map(record),
    } as D1Database;
    const measured = new D1ScheduledJobRepository(measuredDb, () => timestamp);

    expect(await measured.claimPendingOutbox(run.id, 8)).toEqual([]);
    operation = "global-claim";
    expect(await measured.claimPendingOutbox(undefined, 8)).toEqual([]);
    operation = "recovery-probe";
    expect(await measured.hasRecoveryWork()).toBe(false);
    operation = "recovery";
    expect(await measured.recoverStaleItems()).toBe(0);
    expect(measurements.filter((row) => row.operation === "scoped-claim")).toHaveLength(1);
    expect(measurements.filter((row) => row.operation === "global-claim")).toHaveLength(1);
    expect(measurements.filter((row) => row.operation === "recovery-probe")).toHaveLength(4);
    expect(measurements.filter((row) => row.operation === "recovery")).toHaveLength(5);
    expect(measurements.some((row) => row.rowsRead > 0)).toBe(true);
    for (const measurement of measurements) {
      expect(measurement.rowsRead, measurement.operation).toBeLessThanOrEqual(10);
      expect(measurement.rowsWritten, measurement.operation).toBe(0);
    }
    console.info('unresolved outbox bounded readback',measurements);

    const activeRun = await repository.createRun({
      jobType: "x_collection", source: "scheduled", idempotencyKey: "after-retained-history",
    });
    await repository.addItems(activeRun.id, ["first", "second", "third"].map((targetKey) => ({
      targetKey, phase: "collect", lane: "x" as const,
    })));
    operation = "active-claim";
    const claimed = await measured.claimPendingOutbox(activeRun.id, 2);
    expect(claimed).toHaveLength(2);
    expect(claimed.every((row) => row.run_id === activeRun.id &&
      row.phase === "collect" && row.job_type === "x_collection")).toBe(true);
    expect(measurements.at(-1)?.rowsRead).toBeLessThanOrEqual(100);
    const remaining = await measured.claimPendingOutbox(undefined, 2);
    expect(remaining).toHaveLength(1);
    expect(new Set([...claimed, ...remaining].map((row) => row.id)).size).toBe(3);
    expect(measurements.at(-1)?.rowsRead).toBeLessThanOrEqual(100);
  });

  it("uses the same read-only recovery eligibility for pending, expired, and missing deliveries", async () => {
    const repository = createRepository();
    const readOnly = new D1ScheduledJobRepository({
      prepare(sql: string) {
        expect(sql.trim()).toMatch(/^SELECT\b/i);
        return db.prepare(sql);
      },
      batch: db.batch.bind(db),
    } as D1Database, () => timestamp);
    const run = await repository.createRun({
      jobType: "x_collection", source: "scheduled", idempotencyKey: "recovery-eligibility",
    });
    expect(await readOnly.hasRecoveryWork()).toBe(false);
    await repository.addItems(run.id, [{ targetKey: "target", phase: "collect", lane: "x" }]);
    expect(await readOnly.hasRecoveryWork()).toBe(true);
    const [outbox] = await repository.claimPendingOutbox(run.id, 1);
    expect(await repository.hasRecoveryWork()).toBe(false);
    await repository.markOutboxDispatched(outbox.id);
    expect(await repository.hasRecoveryWork()).toBe(false);
    timestamp += SCHEDULED_QUEUE_DELIVERY_RECOVERY_MS;
    expect(await repository.hasRecoveryWork()).toBe(true);
    expect(await repository.recoverStaleItems()).toBe(1);
    await db.prepare("DELETE FROM scheduled_outbox WHERE id = ?").bind(outbox.id).run();
    expect(await repository.hasRecoveryWork()).toBe(true);
    expect(await repository.recoverStaleItems()).toBe(1);
  });

  it("keeps failed and expired dispatches eligible while respecting future and live leases", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "x_collection", source: "scheduled", idempotencyKey: "dispatch-status-eligibility",
    });
    const targets = ["pending", "failed", "expired", "leased", "future", "null-lease", "delivered"];
    await repository.addItems(run.id, targets.map((targetKey) => ({ targetKey, phase: "collect", lane: "x" as const })));
    const updateOutbox = (target: string, status: string, availableAt: number, leaseUntil: number | null) =>
      db.prepare(`UPDATE scheduled_outbox SET status = ?, available_at = ?, lease_until = ?
        WHERE item_id = (SELECT id FROM scheduled_job_items WHERE run_id = ? AND target_key = ?)`)
        .bind(status, availableAt, leaseUntil, run.id, target);
    await db.batch([
      updateOutbox("failed", "failed", timestamp, null),
      updateOutbox("expired", "dispatching", timestamp, timestamp - 1),
      updateOutbox("leased", "dispatching", timestamp, timestamp),
      updateOutbox("future", "pending", timestamp + 1, null),
      updateOutbox("null-lease", "dispatching", timestamp, null),
      updateOutbox("delivered", "dispatched", timestamp, null),
    ]);
    const expected = await db.prepare(`SELECT id FROM scheduled_job_items
      WHERE run_id = ? AND target_key IN ('pending', 'failed', 'expired') ORDER BY id`).bind(run.id).all<{ id: string }>();
    const claimed = await repository.claimPendingOutbox(run.id, 20);
    expect(claimed.map((row) => row.item_id).sort()).toEqual(expected.results.map((row) => row.id).sort());
  });

  it("exposes source-health retry partials in the operation failure readback", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "source_health", source: "scheduled", idempotencyKey: "source-health-retry",
    });
    await repository.addItems(run.id, [{ targetKey: "due:0", phase: "check", lane: "youtube-critical" }]);
    const [outbox] = await repository.claimPendingOutbox(run.id, 1);
    await repository.markOutboxDispatched(outbox.id);
    const item = await repository.claimItem(outbox.item_id);
    expect(await repository.completeItem(item!, {
      status: "partial", result: { claimed: 2, checked: 0, failed: 0, retryScheduled: 2 },
      errorCode: "source_health_retry_pending", error: "2 sources are waiting for retry",
    })).toBe(true);
    expect(await repository.readRunDto(run.id)).toMatchObject({
      status: "partial",
      failures: [{ code: "source_health_retry_pending", message: "2 sources are waiting for retry" }],
    });
    expect((await repository.readLatestSuccessfulRunTimes()).some((row) => row.jobType === "source_health")).toBe(false);
  });

  it("reads every X shard result without normalizing partials or inventing missing hydration", async () => {
    const repository = createRepository();
    const run = await repository.createRun({ jobType: "x_collection", source: "manual", idempotencyKey: "x-observability" });
    await repository.addItems(run.id, ["succeeded", "partial", "failed", "skipped"].map((status) => ({
      targetKey: status, phase: "collect", lane: "x" as const,
    })));
    const hydration = { status: "deferred", scanned: 1, hydrated: 0, authorsResolved: 0, deferred: 1, failed: 0, terminal: 0, coalesced: 0, retryAt: timestamp + 1000, errorCode: "preview_budget_exceeded" };
    for (const status of ["succeeded", "partial", "failed", "skipped"]) {
      const result = status === "failed" ? "invalid-json" : JSON.stringify({
        status: status === "skipped" ? "skipped" : "success", checkedHandles: 4, refreshedHandles: status === "skipped" ? 0 : 4,
        postsReturned: 3, postsStored: 3,
        ...(status === "partial" ? {provider:"fxembed",mode:"rss_candidates",paidApiCalls:1,pendingSources:1,rawCount:7,candidatesFound:3,pending:2,nextAttemptAt:timestamp+1000,windowReduced:true} : {}),
        ...(status === "succeeded" ? {} : { referenceHydration: status === "partial" ? { ...hydration, scope: "quotes", status: "failed", failed: 1, errorCode: "x_api_503" } : hydration }),
      });
      await db.prepare("UPDATE scheduled_job_items SET status=?,result_json=? WHERE run_id=? AND target_key=?").bind(status, result, run.id, status).run();
    }
    await db.prepare("UPDATE scheduled_job_runs SET status='partial' WHERE id=?").bind(run.id).run();
    const before = await db.prepare("SELECT * FROM scheduled_job_items ORDER BY id").all();
    const readOnly = new D1ScheduledJobRepository({ prepare(sql: string) {
      expect(sql.trim()).toMatch(/^SELECT\b/i);
      return db.prepare(sql);
    } } as D1Database);
    const result = await readOnly.readRunDto(run.id);
    expect(result?.status).toBe("partial");
    expect(result?.xCollection?.items).toHaveLength(4);
    expect(result?.xCollection?.items.find((item) => item.status === "partial")).toMatchObject({ collection: { status: "success", postsStored: 3 }, referenceHydration: { scope: "quotes", status: "failed", failed: 1 } });
    expect(result?.xCollection?.items.find((item) => item.status === "partial")?.collection).toMatchObject({provider:"fxembed",mode:"rss_candidates",paidApiCalls:1,rss:{rawCount:7,candidatesFound:3,pendingCandidates:2,nextAttemptAt:timestamp+1000,windowReduced:true}});
    expect(result?.xCollection?.items.find((item) => item.status === "succeeded")?.collection?.provider).toBeUndefined();
    expect(result?.xCollection?.items.find((item) => item.status === "skipped")?.referenceHydration?.scope).toBeUndefined();
    expect(result?.xCollection?.items.find((item) => item.status === "skipped")).toMatchObject({ collection: { status: "skipped" }, referenceHydration: { status: "deferred" } });
    expect(result?.xCollection?.items.find((item) => item.status === "succeeded")?.referenceHydration).toBeNull();
    expect(result?.xCollection?.items.find((item) => item.status === "failed")?.collection).toBeNull();
    expect((await readOnly.listRunDtos({ jobType: "x_collection", limit: 10 }))[0]?.xCollection).toEqual(result?.xCollection);
    expect((await db.prepare("SELECT * FROM scheduled_job_items ORDER BY id").all()).results).toEqual(before.results);
  });

  it("중복 coordinator 실행을 전역 idempotency key 하나로 합친다", async () => {
    const repository = createRepository();
    const first = await repository.createRun({
      jobType: "x_collection",
      source: "scheduled",
      idempotencyKey: "scheduled:x:bucket-1",
    });
    const duplicate = await repository.createRun({
      jobType: "x_collection",
      source: "scheduled",
      idempotencyKey: "scheduled:x:bucket-1",
    });

    expect(duplicate.id).toBe(first.id);
    const count = await db.prepare(
      "SELECT COUNT(*) AS count FROM scheduled_job_runs",
    ).first<{ count: number }>();
    expect(count?.count).toBe(1);
  });

  it("terminal run에 남은 outbox는 다시 claim하지 않는다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "x_collection",
      source: "scheduled",
      idempotencyKey: "scheduled:x:terminal-outbox",
    });
    await repository.addItems(run.id, [{
      targetKey: "handle:terminal",
      phase: "collect",
      lane: "x",
    }]);
    await repository.skipRun(run.id, "operator_closed");
    await db.prepare(
      `UPDATE scheduled_outbox
       SET status = 'failed', last_error = 'historical_failure'
       WHERE run_id = ?`,
    ).bind(run.id).run();

    expect(await repository.claimPendingOutbox(run.id, 10)).toEqual([]);
  });

  it("item/outbox 중복을 제거하고 outbox를 CAS로 한 번만 claim한다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "naver_cafe_collection",
      source: "manual",
      idempotencyKey: "manual:naver:1",
    });
    const item = {
      targetKey: "source:1",
      phase: "collect",
      lane: "naver" as const,
    };
    await repository.addItems(run.id, [item]);
    await repository.addItems(run.id, [item]);

    const concurrentClaims = await Promise.all([
      repository.claimPendingOutbox(run.id, 10),
      repository.claimPendingOutbox(undefined, 10),
    ]);
    expect(concurrentClaims.map((claim) => claim.length).sort()).toEqual([0, 1]);
    const duplicateClaim = await repository.claimPendingOutbox(run.id, 10);
    expect(duplicateClaim).toHaveLength(0);

    const counts = await db.prepare(
      `SELECT
         (SELECT COUNT(*) FROM scheduled_job_items) AS itemCount,
         (SELECT COUNT(*) FROM scheduled_outbox) AS outboxCount`,
    ).first<{ itemCount: number; outboxCount: number }>();
    expect(counts).toEqual({ itemCount: 1, outboxCount: 1 });
  });

  it("5배 규모 item도 10개 단위 bulk insert와 단일 outbox fan-out으로 저장한다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "schedule_auto_update",
      source: "scheduled",
      idempotencyKey: "scheduled:auto-update:five-x",
    });
    await repository.addItems(
      run.id,
      Array.from({ length: 25 }, (_, index) => ({
        targetKey: `member:${index + 1}:date:2026-08-31`,
        phase: "match",
        lane: "auto-update" as const,
        continuation: { memberUid: index + 1, date: "2026-08-31" },
      })),
    );

    const counts = await db.prepare(
      `SELECT
         (SELECT COUNT(*) FROM scheduled_job_items WHERE run_id = ?) AS itemCount,
         (SELECT COUNT(*) FROM scheduled_outbox WHERE run_id = ?) AS outboxCount`,
    ).bind(run.id, run.id).first<{ itemCount: number; outboxCount: number }>();
    expect(counts).toEqual({ itemCount: 25, outboxCount: 25 });
  });

  it("hard termination으로 만료된 lease를 queued item과 pending outbox로 복구한다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "retention_prune",
      source: "scheduled",
      idempotencyKey: "scheduled:retention:1",
    });
    await repository.addItems(run.id, [{
      targetKey: "target:1",
      phase: "prune",
      lane: "maintenance",
    }]);
    const [outbox] = await repository.claimPendingOutbox(run.id, 1);
    expect(outbox).toBeDefined();
    await repository.markOutboxDispatched(outbox!.id);
    const claimed = await repository.claimItem(outbox!.item_id);
    expect(claimed?.status).toBe("running");

    timestamp += SCHEDULED_JOB_LEASE_MS + 1;
    expect(await repository.recoverStaleItems(10)).toBe(1);
    const recovered = await repository.claimPendingOutbox(run.id, 1);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.item_id).toBe(outbox!.item_id);
  });

  it("Queue 보존기간이 지난 dispatched item을 pending outbox로 복구한다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "ingestion_recovery",
      source: "scheduled",
      idempotencyKey: "scheduled:ingestion:expired-delivery",
    });
    await repository.addItems(run.id, [{
      targetKey: "recover-scheduled",
      phase: "recover-scheduled",
      lane: "ingestion",
    }]);
    const [outbox] = await repository.claimPendingOutbox(run.id, 1);
    expect(outbox).toBeDefined();
    await repository.markOutboxDispatched(outbox!.id);

    timestamp += SCHEDULED_QUEUE_DELIVERY_RECOVERY_MS - 1;
    expect(await repository.recoverStaleItems(10)).toBe(0);
    expect(await repository.claimPendingOutbox(run.id, 1)).toEqual([]);

    timestamp += 2;
    expect(await repository.recoverStaleItems(10)).toBe(1);
    const recovered = await repository.claimPendingOutbox(run.id, 1);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.item_id).toBe(outbox!.item_id);
  });

  it("오래된 queued item의 execute outbox가 누락되면 다시 생성한다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "websub_maintenance",
      source: "scheduled",
      idempotencyKey: "scheduled:websub:missing-outbox",
    });
    await repository.addItems(run.id, [{
      targetKey: "renew",
      phase: "renew",
      lane: "websub",
    }]);
    await db.prepare(
      "DELETE FROM scheduled_outbox WHERE run_id = ?",
    ).bind(run.id).run();

    timestamp += SCHEDULED_QUEUE_DELIVERY_RECOVERY_MS + 1;
    expect(await repository.recoverStaleItems(10)).toBe(1);
    const recovered = await repository.claimPendingOutbox(run.id, 1);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.run_id).toBe(run.id);
  });

  it("lease를 다시 획득한 worker만 item 완료 상태를 기록한다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "x_collection",
      source: "scheduled",
      idempotencyKey: "scheduled:x:lease-cas",
    });
    await repository.addItems(run.id, [{
      targetKey: "handle:lease-owner",
      phase: "collect",
      lane: "x",
    }]);
    const [outbox] = await repository.claimPendingOutbox(run.id, 1);
    expect(outbox).toBeDefined();
    await repository.markOutboxDispatched(outbox!.id);

    const firstOwner = await repository.claimItem(outbox!.item_id);
    expect(firstOwner?.lease_token).toBeTruthy();
    timestamp += SCHEDULED_JOB_LEASE_MS + 1;
    const secondOwner = await repository.claimItem(outbox!.item_id);
    expect(secondOwner?.lease_token).toBeTruthy();
    expect(secondOwner?.lease_token).not.toBe(firstOwner?.lease_token);

    expect(
      await repository.completeItem(firstOwner!, {
        status: "succeeded",
        result: { owner: "expired" },
      }),
    ).toBe(false);
    expect(await repository.readItem(outbox!.item_id)).toMatchObject({
      status: "running",
      lease_token: secondOwner!.lease_token,
    });
    expect(
      await repository.completeItem(secondOwner!, {
        status: "succeeded",
        result: { owner: "current" },
      }),
    ).toBe(true);
    expect(await repository.readRunDto(run.id)).toMatchObject({
      status: "succeeded",
      progress: { succeeded: 1 },
    });
  });

  it("오류와 미완료가 없는 YouTube partial을 succeeded로 정규화한다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "youtube_feed_collection",
      source: "scheduled",
      idempotencyKey: "scheduled:youtube:resolved-partial",
    });
    await repository.addItems(run.id, [{
      targetKey: "youtube-feed",
      phase: "collect",
      lane: "maintenance",
    }]);
    const [outbox] = await repository.claimPendingOutbox(run.id, 1);
    await repository.markOutboxDispatched(outbox!.id);
    const item = await repository.claimItem(outbox!.item_id);

    expect(await repository.completeItem(item!, {
      status: "partial",
      result: { status: "partial", attempted: 1, succeeded: 1, failed: 0 },
    })).toBe(true);
    // The provider result is complete, but the original coordinator/finalizer
    // responsibility is still durable until its separate completion receipt.
    expect((await repository.readRunDto(run.id))!.status).toBe('partial');
    const finishedAt = timestamp;
    timestamp += SCHEDULED_JOB_LEASE_MS + 1;
    const [reconciliation] = await repository.claimPendingOutbox(run.id, 1);
    expect(reconciliation).toBeDefined();
    await repository.markOutboxDispatched(reconciliation!.id);
    await repository.refreshRun(run.id);
    expect((await repository.readRun(run.id))!.status).toBe("partial");
    expect((await repository.readRunDto(run.id))!.status).toBe("partial");
    expect((await repository.listRunDtos({ status: "partial", limit: 10 }))
      .map(entry => entry.runId)).toContain(run.id);
    expect(await repository.readLatestSuccessfulRunTimes()).not.toContainEqual(
      expect.objectContaining({ jobType: "youtube_feed_collection" }),
    );
    // Older code could persist success during this delivery/acknowledgment window.
    await db.prepare("UPDATE scheduled_job_runs SET status='succeeded' WHERE id=?").bind(run.id).run();
    expect((await repository.readRunDto(run.id))!.status).toBe("partial");
    expect((await repository.listRunDtos({ status: "partial", limit: 10 }))
      .map(entry => entry.runId)).toContain(run.id);
    expect((await repository.listRunDtos({ status: "succeeded", limit: 10 }))
      .map(entry => entry.runId)).not.toContain(run.id);
    expect(await repository.readLatestSuccessfulRunTimes()).not.toContainEqual(
      expect.objectContaining({ jobType: "youtube_feed_collection" }),
    );
    await repository.acknowledgeReconciliation((await repository.readItem(item!.id))!);

    expect(await repository.readRun(run.id)).toMatchObject({
      status: "succeeded",
    });
    expect(await repository.readRunDto(run.id)).toMatchObject({
      status: "succeeded",
      progress: { total: 1, succeeded: 1, failed: 0 },
      failures: [],
    });

    await db.prepare(
      "UPDATE scheduled_job_runs SET status = 'partial' WHERE id = ?",
    ).bind(run.id).run();
    expect(await repository.readRunDto(run.id)).toMatchObject({
      status: "succeeded",
      progress: { total: 1, succeeded: 1, failed: 0 },
    });
    expect((await repository.listRunDtos({
      status: "succeeded",
      limit: 10,
    })).map((entry) => entry.runId)).toContain(run.id);
    expect((await repository.listRunDtos({
      status: "partial",
      limit: 10,
    })).map((entry) => entry.runId)).not.toContain(run.id);
    expect(await repository.readLatestSuccessfulRunTimes()).toContainEqual({
      jobType: "youtube_feed_collection",
      latestSuccessAt: finishedAt,
    });
  });

  it("keeps dispatched X reconciliation visible until its completion receipt", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "x_collection", source: "manual", idempotencyKey: "x:reconciliation-dispatched",
    });
    await repository.addItems(run.id, [{ targetKey: "handle:member", phase: "collect", lane: "x" }]);
    const [execution] = await repository.claimPendingOutbox(run.id, 1);
    await repository.markOutboxDispatched(execution!.id);
    const item = (await repository.claimItem(execution!.item_id))!;
    await repository.completeItem(item, { status: "succeeded" });
    timestamp += SCHEDULED_JOB_LEASE_MS + 1;
    const [reconciliation] = await repository.claimPendingOutbox(run.id, 1);
    await repository.markOutboxDispatched(reconciliation!.id);

    expect((await repository.readRunDto(run.id))!.xCollection!.items[0]).toMatchObject({
      retryPending: true, nextRetryAt: expect.any(Number),
    });
    await repository.acknowledgeReconciliation((await repository.readItem(item.id))!);
    expect((await repository.readRunDto(run.id))!.xCollection!.items[0]).toMatchObject({
      retryPending: false, nextRetryAt: null,
    });
  });

  it("keeps actual YouTube channel counts separate from a single completed wrapper", async () => {
    const repository = createRepository();
    const run = await repository.createRun({ jobType: "youtube_feed_collection", source: "manual", idempotencyKey: "youtube:actual-results" });
    await repository.addItems(run.id, [{ targetKey: "feed:0", phase: "collect", lane: "maintenance" }]);
    const [outbox] = await repository.claimPendingOutbox(run.id, 1);
    await repository.markOutboxDispatched(outbox!.id);
    const item = await repository.claimItem(outbox!.item_id);
    const result = { status: "succeeded", attempted: 8, succeeded: 8, failed: 0, metadataRefreshed: 100, unavailableMarked: 2, shortsStored: 9, scanPages: 2, exhaustedSources: 1, quotaBlocked: false, backoffSources: 0, backfillFailed: 0 };
    expect(await repository.completeItem(item!, { status: "succeeded", result })).toBe(true);
    expect(await repository.readRunDto(run.id)).toMatchObject({
      status: "succeeded", source: "manual", progress: { total: 1, succeeded: 1 },
      youtubeCollection: { attempted: 8, succeeded: 8, metadataRefreshed: 100, unavailableMarked: 2 },
    });
    await db.prepare("UPDATE scheduled_job_items SET result_json = 'invalid' WHERE run_id = ?").bind(run.id).run();
    expect((await repository.readRunDto(run.id))?.youtubeCollection).toBeUndefined();
  });

  it("작업별 최신 점검과 과거의 마지막 성공 시각을 서로 분리한다", async () => {
    const repository = createRepository();
    const succeeded = await repository.createRun({
      jobType: "x_collection",
      source: "scheduled",
      idempotencyKey: "scheduled:x:succeeded",
    });
    await repository.addItems(succeeded.id, [{
      targetKey: "handle:member",
      phase: "collect",
      lane: "x",
    }]);
    const [outbox] = await repository.claimPendingOutbox(succeeded.id, 1);
    await repository.markOutboxDispatched(outbox!.id);
    const item = await repository.claimItem(outbox!.item_id);
    expect(await repository.completeItem(item!, { status: "succeeded" })).toBe(true);
    const latestSuccessAt = timestamp;

    timestamp += 60_000;
    const neutralSkip = await repository.createRun({
      jobType: "x_collection",
      source: "scheduled",
      idempotencyKey: "scheduled:x:not-due",
    });
    await repository.skipRun(neutralSkip.id, "all_handles_cooldown");

    timestamp += 60_000;
    const failed = await repository.createRun({
      jobType: "naver_cafe_collection",
      source: "scheduled",
      idempotencyKey: "scheduled:naver:failed",
    });
    await repository.markRunFailed(failed.id, "upstream_unavailable");

    const latestByType = await repository.listLatestRunDtosByJobType();
    expect(latestByType.find((run) => run.jobType === "x_collection")).toMatchObject({
      runId: neutralSkip.id,
      status: "skipped",
      summary: { reason: "all_handles_cooldown" },
    });
    expect(latestByType.find((run) => run.jobType === "naver_cafe_collection")).toMatchObject({
      runId: failed.id,
      status: "failed",
    });
    expect(await repository.readLatestSuccessfulRunTimes()).toContainEqual({
      jobType: "x_collection",
      latestSuccessAt,
    });
  });

  it("실제 소스 실패가 있는 YouTube partial과 내부 진행률을 보존한다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "youtube_feed_collection",
      source: "scheduled",
      idempotencyKey: "scheduled:youtube:true-partial",
    });
    await repository.addItems(run.id, [{
      targetKey: "youtube-feed",
      phase: "collect",
      lane: "maintenance",
    }]);
    const [outbox] = await repository.claimPendingOutbox(run.id, 1);
    await repository.markOutboxDispatched(outbox!.id);
    const item = await repository.claimItem(outbox!.item_id);

    expect(await repository.completeItem(item!, {
      status: "partial",
      result: { status: "partial", attempted: 5, succeeded: 4, failed: 1 },
      errorCode: "youtube_feed_collection_failed",
      error: "YouTube feed collection failed for 1 of 5 sources",
    })).toBe(true);

    expect(await repository.readRun(run.id)).toMatchObject({
      status: "partial",
    });
    const counters = await db.prepare(
      `SELECT total_items AS total, completed_items AS completed,
              failed_items AS failed
       FROM scheduled_job_runs WHERE id = ?`,
    ).bind(run.id).first<{ total: number; completed: number; failed: number }>();
    expect(counters).toEqual({ total: 5, completed: 5, failed: 1 });
    expect(await repository.readRunDto(run.id)).toMatchObject({
      status: "partial",
      progress: { total: 5, succeeded: 4, failed: 1 },
      failures: [{
        code: "youtube_feed_collection_failed",
        message: "YouTube feed collection failed for 1 of 5 sources",
      }],
    });
    expect((await repository.listRunDtos({
      status: "partial",
      limit: 10,
    })).map((entry) => entry.runId)).toContain(run.id);
    expect((await repository.listRunDtos({
      status: "succeeded",
      limit: 10,
    })).map((entry) => entry.runId)).not.toContain(run.id);

    expect(await repository.retryRun(run.id)).toMatchObject({
      kind: "accepted",
      run: { status: "queued" },
    });
    expect(await repository.readItem(item!.id)).toMatchObject({
      status: "queued",
      last_error_code: null,
      last_error: null,
    });
    const retryOutbox = await repository.claimPendingOutbox(run.id, 10);
    expect(retryOutbox).toHaveLength(1);
    expect(retryOutbox[0]?.item_id).toBe(item!.id);
  });

  it("run 실패는 아직 dispatch되지 않은 item과 outbox를 함께 종료한다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "naver_cafe_collection",
      source: "manual",
      idempotencyKey: "manual:naver:failed-control",
    });
    await repository.addItems(run.id, [{
      targetKey: "source:1",
      phase: "collect",
      lane: "naver",
    }]);

    await repository.markRunFailed(run.id, "scheduled_control_queue_unavailable");

    expect(await repository.claimPendingOutbox(run.id, 10)).toEqual([]);
    expect(await repository.readRunDto(run.id)).toMatchObject({
      status: "failed",
      progress: { failed: 1 },
    });
  });

  it("admission control로 throttled 된 item의 failed outbox를 재전송하지 않는다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "retention_prune",
      source: "scheduled",
      idempotencyKey: "scheduled:retention:throttled",
    });
    await repository.addItems(run.id, [{
      targetKey: "target:throttled",
      phase: "prune",
      lane: "maintenance",
    }]);

    await repository.markRunThrottled(run.id, "daily_budget_guard");

    expect(await repository.claimPendingOutbox(run.id, 10)).toHaveLength(0);
    const item = await db.prepare(
      "SELECT status FROM scheduled_job_items WHERE run_id = ?",
    ).bind(run.id).first<{ status: string }>();
    expect(item?.status).toBe("throttled");
  });

  it("성공한 terminal run은 retry로 queued 상태로 되돌리지 않는다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "naver_cafe_collection",
      source: "manual",
      idempotencyKey: "manual:naver:terminal-retry",
    });
    await repository.addItems(run.id, [{
      targetKey: "source:terminal",
      phase: "collect",
      lane: "naver",
    }]);
    const [outbox] = await repository.claimPendingOutbox(run.id, 1);
    await repository.markOutboxDispatched(outbox!.id);
    const item = await repository.claimItem(outbox!.item_id);
    expect(await repository.completeItem(item!, { status: "succeeded" })).toBe(
      true,
    );

    expect(await repository.retryRun(run.id)).toEqual({
      kind: "not_retryable",
      status: "succeeded",
    });
    expect(await repository.readRunDto(run.id)).toMatchObject({
      status: "succeeded",
      progress: { succeeded: 1, queued: 0 },
    });
    expect(await repository.claimPendingOutbox(run.id, 10)).toEqual([]);
  });

  it("제거된 legacy job type은 조회 DTO와 retry 경로에서 차단한다", async () => {
    const repository = createRepository();
    await db.prepare(
      `INSERT INTO scheduled_job_runs (
         id, job_type, source, idempotency_key, status, accepted_at,
         last_error, created_at, updated_at
       ) VALUES (?, 'x_metrics_refresh', 'scheduled', ?, 'failed', ?, ?, ?, ?)`,
    ).bind(
      "legacy-x-metrics",
      "scheduled:x-metrics:legacy",
      timestamp,
      "legacy_job_type_removed",
      timestamp,
      timestamp,
    ).run();

    expect(await repository.readRunDto("legacy-x-metrics")).toBeNull();
    expect(await repository.retryRun("legacy-x-metrics")).toEqual({
      kind: "not_retryable",
      status: "failed",
    });
    const row = await db.prepare(
      "SELECT status FROM scheduled_job_runs WHERE id = ?",
    ).bind("legacy-x-metrics").first<{ status: string }>();
    expect(row?.status).toBe("failed");
  });

  it("실패한 run retry는 failed item과 outbox만 다시 queued로 만든다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "retention_prune",
      source: "manual",
      idempotencyKey: "manual:retention:retryable",
    });
    await repository.addItems(run.id, [{
      targetKey: "retention:retryable",
      phase: "prune",
      lane: "maintenance",
    }]);
    await repository.markRunFailed(run.id, "temporary_control_failure");

    const retry = await repository.retryRun(run.id);

    expect(retry).toMatchObject({
      kind: "accepted",
      run: { status: "queued" },
    });
    const pending = await repository.claimPendingOutbox(run.id, 10);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ lane: "maintenance" });
  });

  it("후속 조정 실패 retry는 terminal item을 재실행하지 않는 reconcile outbox를 만든다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "schedule_auto_update",
      source: "scheduled",
      idempotencyKey: "scheduled:auto-update:reconcile-retry",
    });
    await repository.addItems(run.id, [{
      targetKey: "channel:reconcile",
      phase: "scan",
      lane: "auto-update",
    }]);
    const [outbox] = await repository.claimPendingOutbox(run.id, 1);
    await repository.markOutboxDispatched(outbox!.id);
    const item = await repository.claimItem(outbox!.item_id);
    expect(await repository.completeItem(item!, { status: "succeeded" })).toBe(
      true,
    );
    const [nextItemId] = await repository.addItems(run.id, [{
      targetKey: "member:1:date:2026-08-31",
      phase: "match",
      lane: "auto-update",
    }]);
    await repository.markRunFailed(
      run.id,
      "post_completion_reconciliation_failed:d1_unavailable",
      true,
    );

    expect(await repository.retryRun(run.id)).toMatchObject({
      kind: "accepted",
      run: { status: "queued" },
    });
    const reconciliation = await repository.claimPendingOutbox(run.id, 10);
    expect(reconciliation).toHaveLength(2);
    expect(reconciliation).toEqual(expect.arrayContaining([
      expect.objectContaining({ item_id: item!.id, lane: "auto-update" }),
      expect.objectContaining({ item_id: nextItemId, lane: "auto-update" }),
    ]));
    expect(await repository.claimItem(item!.id)).toBeNull();
    expect(await repository.claimItem(nextItemId!)).toMatchObject({
      status: "running",
    });
  });

  it("failed terminal item의 후속 조정 retry도 executor 재실행 대상으로 되돌리지 않는다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "x_collection",
      source: "scheduled",
      idempotencyKey: "scheduled:x:failed-reconcile-retry",
    });
    await repository.addItems(run.id, [{
      targetKey: "handle:failed-reconcile",
      phase: "collect",
      lane: "x",
    }]);
    const [outbox] = await repository.claimPendingOutbox(run.id, 1);
    await repository.markOutboxDispatched(outbox!.id);
    const item = await repository.claimItem(outbox!.item_id);
    expect(
      await repository.completeItem(item!, {
        status: "failed",
        error: "upstream_failed",
      }),
    ).toBe(true);
    await repository.markRunFailed(
      run.id,
      "post_completion_reconciliation_failed:d1_unavailable",
      true,
    );

    expect(await repository.retryRun(run.id)).toMatchObject({
      kind: "accepted",
      run: { status: "queued" },
    });
    const reconciliation = await repository.claimPendingOutbox(run.id, 10);
    expect(reconciliation).toHaveLength(1);
    expect(await repository.readItem(item!.id)).toMatchObject({
      status: "failed",
    });
    expect(await repository.claimItem(item!.id)).toBeNull();
  });

  it("last_error가 없는 partial run도 실패 item만 다시 dispatch한다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "naver_cafe_collection",
      source: "manual",
      idempotencyKey: "manual:naver:partial-retry",
    });
    await repository.addItems(run.id, [
      { targetKey: "source:ok", phase: "collect", lane: "naver" },
      { targetKey: "source:failed", phase: "collect", lane: "naver" },
    ]);
    const outbox = await repository.claimPendingOutbox(run.id, 2);
    expect(outbox).toHaveLength(2);
    for (const record of outbox) {
      await repository.markOutboxDispatched(record.id);
      const item = await repository.claimItem(record.item_id);
      await repository.completeItem(item!, {
        status: record.item_id === outbox[0]!.item_id ? "succeeded" : "failed",
        error: record.item_id === outbox[0]!.item_id ? null : "temporary",
      });
    }
    expect(await repository.readRunDto(run.id)).toMatchObject({
      status: "partial",
      lastError: null,
    });

    expect(await repository.retryRun(run.id)).toMatchObject({
      kind: "accepted",
      run: { status: "queued" },
    });
    const retryOutbox = await repository.claimPendingOutbox(run.id, 10);
    expect(retryOutbox).toHaveLength(1);
    expect(retryOutbox[0]?.item_id).toBe(outbox[1]!.item_id);
  });

  it("모든 lane이 공유하는 Queue 5,000 operations 일일 한도를 원자 적용한다", async () => {
    const repository = createRepository();
    expect(await repository.reserveQueueOperations("x", 4_997)).toBe(true);
    expect(await repository.reserveQueueOperations("naver", 3)).toBe(true);
    expect(await repository.reserveQueueOperations("websub", 1)).toBe(false);
    expect(await repository.getQueueUsagePercent()).toBe(100);
  });

  it("Queue와 D1 read/write 일일 예산을 한 번에 예약하고 하나라도 초과하면 모두 거부한다", async () => {
    const repository = createRepository();
    expect(await repository.reserveDispatchBudget("x", {
      rowsRead: 1_999_500,
      rowsWritten: 39_950,
    })).toBe(true);
    expect(await repository.reserveDispatchBudget("naver", {
      rowsRead: 501,
      rowsWritten: 1,
    })).toBe(false);

    const rows = await db.prepare(
      `SELECT resource, used FROM scheduled_usage_daily
       ORDER BY resource`,
    ).all<{ resource: string; used: number }>();
    expect(rows.results).toEqual([
      { resource: "d1_rows_read", used: 1_999_500 },
      { resource: "d1_rows_written", used: 39_950 },
      { resource: "queue_operations", used: 3 },
    ]);
  });
});
