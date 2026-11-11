import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { D1ScheduledJobRepository, ScheduledRunClient } from "../../../platform/scheduled-jobs";
import { D1SharedXApiGateway, D1SharedXBudget, runFxCollectionForHandles, runXCollectionForHandles } from "../../x-posts";
import { ScheduledJobPlanner } from "./scheduled-job-planner";
import { ScheduledJobExecutor } from "./scheduled-job-executor";
import { ScheduledJobCoordinator } from "./scheduled-job-coordinator";
import { writeStoredPosts } from "../../x-posts/infrastructure/x-api";
import { meterD1 } from "../../../test-support/d1-meter";
import { siteEnv } from "../../../test-support/site-env";
import { handleWorkerQueue } from "../../../app/worker-queue";
import { prepareXReceiptCleanup } from "../../x-posts/infrastructure/x-shared-budget";

const bindings = { ...env, SITE_ID: "otw" } as Env & { X_REFERENCE_MIGRATIONS: D1Migration[]; SCHEDULED_OPERATIONS_MIGRATIONS: D1Migration[] };
const db = bindings.otw_db, hour = 3600000;
let time: number;
const runtime = () => ({ ...bindings, X_BEARER_TOKEN: "fixture", X_API_GATEWAY: new D1SharedXApiGateway({ db, site: "otw", token: "fixture", admitD1: async () => true }) });
beforeEach(async () => {
  time = Date.parse("2026-11-03T00:23:00Z");
  vi.spyOn(Date, "now").mockImplementation(() => time);
  await applyD1Migrations(db, [...new Map([...bindings.X_REFERENCE_MIGRATIONS, ...bindings.SCHEDULED_OPERATIONS_MIGRATIONS].map(migration => [migration.name, migration])).values()]);
  await db.batch([
    ...["scheduled_outbox", "scheduled_job_items", "scheduled_job_runs", "scheduled_usage_daily", "x_post_references", "x_post_facts", "x_posts", "x_fx_sources", "x_post_sources", "x_api_cache", "x_api_usage_events", "x_api_usage_daily", "x_api_resource_daily", "x_collection_runs", "x_shared_requests", "x_shared_budgets", "members"].map(table => db.prepare(`DELETE FROM ${table}`)),
    ...[["x_collection_enabled", "true"], ["x_collection_primary_source", "fxembed"], ["x_collection_interval_hours", "24"], ["x_cost_optimizer_enabled", "true"], ["x_reference_preview_mode", "link_only"], ["x_collection_daily_budget_cents", "100"], ["x_collection_last_run", String(time - 2 * hour)]].map(([key, value]) => db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)").bind(key, value)),
    db.prepare("DELETE FROM settings WHERE key IN ('x_api_backoff_until','x_collection_cadence_state','x_collection_hybrid_policy','x_collection_hybrid_activated_at','x_reference_preview_daily_budget_cents')"),
    ...["member_a", "member_b"].flatMap((handle, i) => [
      db.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(?,?,?,?)").bind(i + 1, handle, handle, `https://x.com/${handle}`),
      db.prepare("INSERT INTO x_post_sources(handle,user_id,last_checked_at,updated_at,collection_started_at,last_completed_at,next_check_at,last_seen_post_id) VALUES(?,?,0,0,1,?,?, '100')").bind(handle, String(101 + i), time - 3 * hour, time + 21 * hour),
      db.prepare("INSERT INTO x_fx_sources(handle,collection_started_at,updated_at,cadence_anchor_at) VALUES(?,1,0,?)").bind(handle, time - hour),
      db.prepare("INSERT INTO x_api_cache(key,type,value,fetched_at,expires_at) VALUES(?,'user',?,?,?)").bind(`x:user:v1:${handle}`, JSON.stringify({ user: { id: String(101 + i), username: handle } }), time, time + 24 * hour),
    ]),
  ]);
  await new D1SharedXBudget(db).initialize([{ day: "2026-11-03", used: 0, reserved: 0 }, { day: "2026-11-03", used: 0, reserved: 0 }]);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const plans = () => new ScheduledJobPlanner(runtime(), new D1ScheduledJobRepository(db)).planScheduled("x_collection", time);

async function deliverOfficialQueueItem(body: unknown, send: ReturnType<typeof vi.fn>, retryExpected = () => false) {
  const meter = meterD1(db, 50), ack = vi.fn(), retry = vi.fn();
  await handleWorkerQueue({ queue: "otw-ops-background", messages: [{ body, ack, retry }] } as unknown as MessageBatch<unknown>, {
    ...runtime(), ...siteEnv(), X_API_GATEWAY: undefined, otw_db: meter.db, CLOUDFLARE_ACCOUNT_ID: "fixture", CLOUDFLARE_D1_TOKEN: "fixture",
    OTW_OPS_BACKGROUND_QUEUE: { send } as unknown as Queue<unknown>,
  });
  expect(meter.quotaDenials).toBe(0);
  if (retryExpected()) {
    expect(ack).not.toHaveBeenCalled();
    expect(retry).toHaveBeenCalledWith({ delaySeconds: 60 });
  } else {
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
  }
  return meter.bindingCalls;
}

it("schedules, resumes and completes a bounded official gap sweep", { timeout: 30_000 }, async () => {
  await db.batch([
    db.prepare("INSERT INTO settings(key,value) VALUES('x_collection_hybrid_policy','rss_v1'),('x_collection_hybrid_activated_at',?)").bind(String(time - 12 * hour)),
    db.prepare("UPDATE x_post_sources SET regular_completed_at=? WHERE handle='member_b'").bind(time),
  ]);
  const startedAt = time;
  const known = Array.from({ length: 32 }, (_, index) => String(110 + index * 10));
  await writeStoredPosts(db, "member_a", { id: "101", username: "member_a" }, known.map(id => ({
    id, username: "member_a", text: "already collected", url: `https://x.com/member_a/status/${id}`, createdAt: new Date(time - 1000).toISOString(),
    media: [], metrics: { likeCount: 0, replyCount: 0, repostCount: 0, quoteCount: 0 },
  })), time - 1000, "otw");
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.hostname === "api.cloudflare.com") return Response.json({ data: { viewer: { accounts: [{ usage: [{ sum: { rowsRead: 0 } }] }] } } });
    expect(url.pathname).toBe("/2/users/101/tweets");
    return Response.json({ data: url.searchParams.get("since_id") === "150"
      ? [{ id: "155", text: "missing", created_at: new Date(time - 1000).toISOString() }] : [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  const repository = new D1ScheduledJobRepository(db);
  await db.prepare("UPDATE x_fx_sources SET cadence_anchor_at=?,rss_cadence_anchor_at=?").bind(time, time).run();
  const job = await repository.createRun({ jobType: "x_collection", source: "scheduled", idempotencyKey: `gaps-${time}`, scheduledFor: time });
  const [id] = await new ScheduledJobPlanner(runtime(), repository).plan(job);
  const item = (await repository.readItem(id))!;
  expect(JSON.parse(item.continuation_json!)).toMatchObject({ provider: "x_api", scope: "regular", handles: ["member_a"] });
  const send = vi.fn<(body: unknown) => Promise<void>>().mockResolvedValue(undefined);
  const first = { schemaVersion: 1, messageType: "scheduled_job_item", runId: job.id, itemId: id, phase: "collect" };
  let maxBindingCalls = await deliverOfficialQueueItem(first, send);
  expect((await repository.readItem(id))?.status).toBe("queued");
  expect((await repository.readRun(job.id))?.status).toBe("running");
  expect(JSON.parse((await repository.readItem(id))!.result_json!)).toMatchObject({ pendingSources: 1, apiCalls: 2 });
  const next = send.mock.calls[0][0];
  expect(next).toMatchObject({ itemId: id, deliveryGeneration: 1 });
  const staleAck = vi.fn();
  await handleWorkerQueue({ queue: "otw-dead-letter", messages: [{ body: first, ack: staleAck, retry: vi.fn() }] } as unknown as MessageBatch<unknown>, {
    ...runtime(), ...siteEnv(), OTW_OPS_BACKGROUND_QUEUE: { send } as unknown as Queue<unknown>,
  });
  expect(staleAck).toHaveBeenCalledOnce();
  expect((await repository.readItem(id))?.status).toBe("queued");
  await deliverOfficialQueueItem(first, send);
  expect(send).toHaveBeenCalledOnce();
  expect(await db.prepare("SELECT last_seen_post_id FROM x_post_sources WHERE handle='member_a'").first("last_seen_post_id")).toBe("100");
  for (let step = 0; step < 24 && step < send.mock.calls.length; step++) {
    maxBindingCalls = Math.max(maxBindingCalls, await deliverOfficialQueueItem(send.mock.calls[step][0], send));
    const resumed = (await repository.readItem(id))!;
    if (resumed.status === "queued" && JSON.parse(resumed.result_json!).apiCalls < 33) {
      expect(await db.prepare("SELECT last_seen_post_id FROM x_post_sources WHERE handle='member_a'").first("last_seen_post_id")).toBe("100");
    }
  }
  expect((await repository.readItem(id))?.status).toBe("succeeded");
  expect((await repository.readRun(job.id))?.status).toBe("succeeded");
  expect(await db.prepare("SELECT last_seen_post_id,regular_completed_at FROM x_post_sources WHERE handle='member_a'").first()).toEqual({ last_seen_post_id: known.at(-1), regular_completed_at: time });
  expect(await db.prepare("SELECT id FROM x_posts WHERE id='155'").first("id")).toBe("155");
  const ledger = await db.prepare("SELECT COUNT(*) AS requests,COUNT(DISTINCT path) AS distinctPaths,SUM(cost) AS costMicros FROM x_shared_requests WHERE operation='timeline'").first();
  expect(ledger).toEqual({ requests: 33, distinctPaths: 33, costMicros: 5_000 });
  expect(await db.prepare("SELECT SUM(reserved) AS reserved FROM x_shared_budgets").first("reserved")).toBe(0);
  console.log("X_GAP_QUEUE_PROFILE", { ...ledger, maxBindingCalls, queueContinuations: send.mock.calls.length, elapsedMinutes: (time - startedAt) / 60_000 });
});

it.each([["link_only", 0], ["link_only", 10], ["cached_author", 0]] as const)(
  "continues a regular timeline and 20 waiting quotes under the D1 cap (%s, %s cached bodies)", { timeout: 30_000 }, async (mode, cachedBodies) => {
  const quoteCount = 20;
  await db.batch([
    db.prepare("INSERT INTO settings(key,value) VALUES('x_collection_hybrid_policy','rss_v1'),('x_collection_hybrid_activated_at',?)").bind(String(time - 12 * hour)),
    db.prepare("UPDATE x_post_sources SET regular_completed_at=? WHERE handle='member_b'").bind(time),
    db.prepare("UPDATE x_fx_sources SET cadence_anchor_at=?,rss_cadence_anchor_at=?").bind(time, time),
    db.prepare("UPDATE settings SET value=? WHERE key='x_reference_preview_mode'").bind(mode),
    db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('x_reference_preview_daily_budget_cents','25')"),
  ]);
  const known = ["110", "120", "130"];
  const quoteIds = Array.from({ length: quoteCount }, (_, index) => String(50 + index));
  expect((await writeStoredPosts(db, "member_a", { id: "101", username: "member_a" }, [...known, ...quoteIds].map(id => ({
    id, username: "member_a", text: "already collected", url: `https://x.com/member_a/status/${id}`, createdAt: new Date(time - 1000).toISOString(),
    media: [], metrics: { likeCount: 0, replyCount: 0, repostCount: 0, quoteCount: 0 },
    ...(quoteIds.includes(id) ? { quote: { postId: String(900 + Number(id)), post: null } } : {}),
  })), time - 1000, "otw")).ok).toBe(true);
  if (cachedBodies) await db.batch(quoteIds.slice(0, cachedBodies).map(id => {
    const postId = String(900 + Number(id));
    const value = { post: { id: postId, username: "quote_author", text: "cached quote", media: [],
      url: `https://x.com/quote_author/status/${postId}`, createdAt: new Date(time).toISOString() } };
    return db.prepare("INSERT INTO x_api_cache(key,type,value,fetched_at,expires_at) VALUES(?,'linked_post',?,?,?)")
      .bind(`x:linked-post:v1:${postId}`, JSON.stringify(value), time, time + hour);
  }));
  expect(await db.prepare("SELECT COUNT(*) AS count FROM x_quote_body_work").first("count")).toBe(quoteCount);
  const timeline: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.hostname === "api.cloudflare.com") return Response.json({ data: { viewer: { accounts: [{ usage: [{ sum: { rowsRead: 0 } }] }] } } });
    if (mode === "cached_author" && url.pathname === "/2/tweets") return Response.json({ data: [{ id: url.searchParams.get("ids"), text: "quote", author_id: "9001", created_at: new Date(time).toISOString() }] });
    if (mode === "cached_author" && url.pathname === "/2/users") return Response.json({ data: [{ id: "9001", username: "quote_author" }] });
    expect(url.pathname).toBe("/2/users/101/tweets");
    timeline.push(url.href);
    return Response.json({ data: url.searchParams.get("since_id") === "110" ? [{ id: "115", text: "missing", created_at: new Date(time).toISOString() }] : [] });
  }));
  const repo = new D1ScheduledJobRepository(db);
  const run = await repo.createRun({ jobType: "x_collection", source: "scheduled", idempotencyKey: "quote-queue-gaps", scheduledFor: time });
  const [id] = await new ScheduledJobPlanner(runtime(), repo).plan(run);
  const initial = { schemaVersion: 1, messageType: "scheduled_job_item", runId: run.id, itemId: id, phase: "collect" };
  const send = vi.fn<(body: unknown) => Promise<void>>().mockResolvedValue(undefined);
  if (mode === "cached_author") send.mockRejectedValueOnce(new Error("fixture queue send interruption"));
  const calls = [await deliverOfficialQueueItem(initial, send)];
  expect(await db.prepare("SELECT last_seen_post_id FROM x_post_sources WHERE handle='member_a'").first("last_seen_post_id")).toBe("100");
  expect(send).toHaveBeenCalledOnce();
  let firstDelivery = 0;
  if (mode === "cached_author") {
    const persisted = await db.prepare("SELECT status,available_at FROM scheduled_outbox WHERE item_id=? AND event_type='execute'").bind(id).first<{ status: string; available_at: number }>();
    expect(persisted?.status).toBe("failed");
    expect((await repo.readRunDto(run.id))?.xCollection?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: id, retryPending: true, nextRetryAt: persisted?.available_at }),
    ]));
    time = persisted!.available_at;
    await new ScheduledJobCoordinator({ ...runtime(), OTW_OPS_BACKGROUND_QUEUE: { send } as unknown as Queue<unknown> }).dispatchRun(run.id);
    firstDelivery = 1;
  }
  for (let index = firstDelivery; index < send.mock.calls.length && index < quoteCount * 2 + 10; index++) calls.push(await deliverOfficialQueueItem(send.mock.calls[index][0], send));
  expect((await repo.readItem(id))?.status).toBe("succeeded");
  if (mode === "cached_author") expect(calls.length).toBeLessThanOrEqual(33);
  expect((await repo.readRun(run.id))?.status).toBe("succeeded");
  expect(await db.prepare("SELECT COUNT(*) AS count FROM x_post_references WHERE last_error_code='preview_disabled'").first("count"))
    .toBe(mode === "link_only" ? quoteCount - cachedBodies : 0);
  expect(await db.prepare("SELECT COUNT(*) AS count FROM x_post_references WHERE resolution_state='hydrated' AND author_state='resolved'").first("count"))
    .toBe(mode === "link_only" ? cachedBodies : quoteCount);
  expect(await db.prepare("SELECT last_seen_post_id,regular_completed_at,next_check_at FROM x_post_sources WHERE handle='member_a'").first())
    .toEqual({ last_seen_post_id: "130", regular_completed_at: time, next_check_at: time + 12 * hour });
  expect(await db.prepare("SELECT id FROM x_posts WHERE id='115'").first("id")).toBe("115");
  expect(timeline).toHaveLength(4);
  expect(new Set(timeline).size).toBe(4);
  expect(JSON.parse((await repo.readItem(id))!.result_json!)).toMatchObject({
    apiCalls: mode === "link_only" ? 4 : quoteCount + 5,
    estimatedCostMicros: mode === "link_only" ? 5000 : 15000 + quoteCount * 5000,
    newlyStoredPosts: [{ id: "115" }],
    ...(mode === "link_only" ? { referenceHydration: { scanned: quoteCount, deferred: quoteCount - cachedBodies, hydrated: cachedBodies } } : {}),
  });
  console.log("X_GAP_QUOTE_QUEUE_PROFILE", { mode, quoteCount, cachedBodies, slices: calls.length, maxBindingCalls: Math.max(...calls), timelineCalls: timeline.length });
});

it("ignores a previous DLQ delivery after an expired lease is recovered", async () => {
  const repo = new D1ScheduledJobRepository(db);
  const run = await repo.createRun({ jobType: "x_collection", source: "scheduled", idempotencyKey: "recover-generation" });
  const [id] = await repo.addItems(run.id, [{ targetKey: "member_a", phase: "collect", lane: "x" }]);
  const original = (await repo.claimItem(id, 0))!;
  time = original.lease_until! + 1;
  expect(await repo.recoverStaleItems()).toBeGreaterThan(0);
  const [next] = await repo.claimPendingOutbox(run.id);
  const current = await repo.claimItem(id, next.delivery_generation);
  expect(current?.lease_token).not.toBe(original.lease_token);
  expect(await repo.checkpointItemContinuation(current!, { scope: "regular" }, { pending: 1 })).toBe(true);
  const ack = vi.fn();
  const old = { schemaVersion: 1, messageType: "scheduled_job_item", runId: run.id, itemId: id, phase: "collect" };
  await handleWorkerQueue({ queue: "otw-dead-letter", messages: [{ body: old, ack }] } as unknown as MessageBatch<unknown>, { ...runtime(), ...siteEnv() });
  expect(ack).toHaveBeenCalledOnce();
  expect(await repo.readItem(id)).toMatchObject({ status: "running", lease_token: current?.lease_token,
    continuation_json: JSON.stringify({ scope: "regular", deliveryGeneration: 1 }) });
  expect(next.delivery_generation).toBe(1);
  expect(await repo.completeItem(current!, { status: "succeeded" })).toBe(true);
});

it("gives manual retries a new generation before accepting their execution", async () => {
  const repo = new D1ScheduledJobRepository(db);
  const run = await repo.createRun({ jobType: "x_collection", source: "manual", idempotencyKey: "retry-generation" });
  const [id] = await repo.addItems(run.id, [{ targetKey: "member_a", phase: "collect", lane: "x" }]);
  const old = (await repo.claimItem(id, 0))!;
  await repo.completeItem(old, { status: "failed", errorCode: "fixture", error: "temporary" }, true);
  expect(await repo.retryRun(run.id)).toMatchObject({ kind: "accepted" });
  const send = vi.fn();
  await new ScheduledJobCoordinator({ ...runtime(), OTW_OPS_BACKGROUND_QUEUE: { send } as unknown as Queue<unknown> }).dispatchRun(run.id);
  const body = send.mock.calls[0][0];
  expect(body.deliveryGeneration).toBe(1);
  const active = (await repo.claimItem(id, 1))!;
  const ack = vi.fn();
  await handleWorkerQueue({ queue: "otw-dead-letter", messages: [{ body: { ...body, deliveryGeneration: 0 }, ack }] } as unknown as MessageBatch<unknown>, { ...runtime(), ...siteEnv() });
  expect(ack).toHaveBeenCalledOnce();
  expect(await repo.readItem(id)).toMatchObject({ status: "running", lease_token: active.lease_token });
  expect(await repo.completeItem(active, { status: "succeeded" })).toBe(true);
});

it("ignores an old RSS dead letter alongside a current terminal delivery", async () => {
  const repo = new D1ScheduledJobRepository(db);
  const messages = [];
  let protectedRun = "";
  for (const generation of [1, 0]) {
    const run = await repo.createRun({ jobType: "x_collection", source: "manual", idempotencyKey: `rss-dlq-${generation}` });
    const [id] = await repo.addItems(run.id, [{ targetKey: "member_a", phase: "collect", lane: "x",
      continuation: { provider: "fxembed", mode: "rss_candidates", handles: ["member_a"] } }]);
    let item = (await repo.claimItem(id, 0))!;
    if (generation) {
      await repo.completeItem(item, { status: "failed" }, true);
      expect(await repo.retryRun(run.id)).toMatchObject({ kind: "accepted" });
      item = (await repo.claimItem(id, 1))!;
      protectedRun = run.id;
    }
    await repo.completeItem(item, { status: "succeeded" }, true);
    messages.push({ body: { schemaVersion: 1, messageType: "scheduled_job_item", runId: run.id, itemId: id, phase: "collect" }, ack: vi.fn() });
  }
  const before = await repo.readRun(protectedRun);
  await db.exec(`CREATE TRIGGER protect_new_rss_run BEFORE UPDATE ON scheduled_job_runs WHEN NEW.id='${protectedRun}' BEGIN SELECT RAISE(ABORT,'old message touched new generation'); END;`);
  try {
    const meter = meterD1(db, 50);
    await handleWorkerQueue({ queue: "otw-dead-letter", messages } as unknown as MessageBatch<unknown>, { ...runtime(), ...siteEnv(), otw_db: meter.db });
    expect(meter.quotaDenials).toBe(0);
    expect(messages.every(message => message.ack.mock.calls.length === 1)).toBe(true);
    expect(await repo.readRun(protectedRun)).toEqual(before);
  } finally { await db.exec("DROP TRIGGER protect_new_rss_run;"); }
});

it.each([false,true])("ignores an original control dead letter after retry (already planned=%s)", async planned => {
  const repo=new D1ScheduledJobRepository(db);
  const run=await repo.createRun({jobType:"x_collection",source:"manual",idempotencyKey:"old-control-retry"});
  const id=planned ? (await repo.addItems(run.id,[{targetKey:"member_a",phase:"collect",lane:"x"}]))[0] : null;
  if(id)await repo.completeItem((await repo.claimItem(id))!,{status:"failed"},true);
  else await repo.completeUnplannedRun(run.id,"failed","temporary control failure");
  expect(await repo.retryRun(run.id)).toMatchObject({kind:"accepted"});
  const before=id ? await repo.readItem(id) : null, beforeRun=await repo.readRun(run.id);
  const beforeOutbox=(await db.prepare("SELECT * FROM scheduled_outbox WHERE run_id=? ORDER BY id").bind(run.id).all()).results;
  const meter=meterD1(db,50),ack=vi.fn();
  await handleWorkerQueue({queue:"otw-dead-letter",messages:[{body:{schemaVersion:1,messageType:"scheduled_job_control",runId:run.id},ack}]} as unknown as MessageBatch<unknown>,{...runtime(),...siteEnv(),otw_db:meter.db});
  expect(ack).toHaveBeenCalledOnce();expect(meter.quotaDenials).toBe(0);
  if(id)expect(await repo.readItem(id)).toEqual(before);
  expect(await repo.readRun(run.id)).toEqual(beforeRun);
  expect((await db.prepare("SELECT * FROM scheduled_outbox WHERE run_id=? ORDER BY id").bind(run.id).all()).results).toEqual(beforeOutbox);
});

it("does not spend retry quota on a control error returned after a new round was accepted", async () => {
  const repo = new D1ScheduledJobRepository(db);
  const run = await repo.createRun({ jobType: "x_collection", source: "manual", idempotencyKey: "late-control-error" });
  await db.prepare("INSERT INTO scheduled_usage_daily(day,lane,resource,reserved,used,limit_value,updated_at) VALUES('2026-11-03','all','queue_operations',0,4744,5000,?)").bind(time).run();
  const send = vi.fn().mockResolvedValue(undefined);
  const environment = { ...runtime(), ...siteEnv(), OTW_OPS_CONTROL_QUEUE: { send } as unknown as Queue<unknown> };
  const body = { schemaVersion: 1, messageType: "scheduled_job_control", runId: run.id };
  vi.spyOn(D1ScheduledJobRepository.prototype, "getBackgroundUsagePercent").mockImplementationOnce(async () => {
    await handleWorkerQueue({ queue: "otw-dead-letter", messages: [{ body, ack: vi.fn() }] } as unknown as MessageBatch<unknown>, environment);
    await new ScheduledRunClient(environment).retryRun(run.id);
    throw new Error("old planning lookup failed");
  });
  const message = { body, ack: vi.fn(), retry: vi.fn() };
  await handleWorkerQueue({ queue: "otw-ops-control", messages: [message] } as unknown as MessageBatch<unknown>, environment);
  expect(await db.prepare("SELECT used FROM scheduled_usage_daily WHERE resource='queue_operations'").first("used")).toBe(4747);
  expect(message.ack).toHaveBeenCalledOnce();
  expect(message.retry).not.toHaveBeenCalled();
  expect(send).toHaveBeenCalledExactlyOnceWith({ ...body, deliveryGeneration: 1 }, { contentType: "json" });
  const next = { body: send.mock.calls[0][0], ack: vi.fn(), retry: vi.fn() };
  await handleWorkerQueue({ queue: "otw-ops-control", messages: [next] } as unknown as MessageBatch<unknown>, environment);
  expect((await repo.readRun(run.id))?.last_error).toBeNull();
  expect(next.ack).toHaveBeenCalledOnce();
});

it.each(["rss", "official"] as const)("reconciles ten current-round dead letters with %s and due transmissions within D1 50", async kind => {
  const repo = new D1ScheduledJobRepository(db);
  const run = await repo.createRun({ jobType: "x_collection", source: "manual", idempotencyKey: "current-rss-dlq-cohort" });
  const ids = await repo.addItems(run.id, Array.from({ length: 10 }, (_, index) => ({
    targetKey: `rss-${index}`, phase: "collect", lane: "x" as const,
    continuation: kind === "official" && index === 9
      ? { hybrid: true, provider: "x_api", scope: "regular", handles: ["member_a"] }
      : { hybrid: true, provider: "fxembed", mode: "rss_candidates", handles: ["member_a"] },
  })));
  for (const id of ids) await repo.completeItem((await repo.claimItem(id, 0))!, { status: "failed" }, true);
  expect(await repo.retryRun(run.id)).toMatchObject({ kind: "accepted" });
  for (const id of ids) await repo.completeItem((await repo.claimItem(id, 1))!, {
    status: "succeeded", result: { mode: "rss_candidates", scope: "regular", pendingSources: 0 },
  }, true);
  await db.prepare("UPDATE scheduled_outbox SET status='dispatched' WHERE run_id=? AND event_type='execute'").bind(run.id).run();
  time += 6 * 60_000;
  const messages = ids.map(itemId => ({
    body: { schemaVersion: 1, messageType: "scheduled_job_item", runId: run.id, itemId, phase: "collect", deliveryGeneration: 1 },
    ack: vi.fn(), retry: vi.fn(),
  }));
  const send = vi.fn().mockResolvedValue(undefined), meter = meterD1(db, 50);
  await handleWorkerQueue({ queue: "otw-dead-letter", messages } as unknown as MessageBatch<unknown>, {
    ...runtime(), ...siteEnv(), otw_db: meter.db, OTW_OPS_BACKGROUND_QUEUE: { send } as unknown as Queue<unknown>,
  });
  expect(meter.quotaDenials).toBe(0);
  expect(messages.every(message => message.ack.mock.calls.length === 1)).toBe(true);
  expect((await repo.readRun(run.id))?.status).toBe("succeeded");
  expect(await db.prepare("SELECT COUNT(*) n FROM scheduled_outbox WHERE run_id=? AND event_type='reconcile' AND reconciled_at IS NULL").bind(run.id).first("n")).toBe(0);
  expect(send).toHaveBeenCalled();
  console.log("X_CURRENT_RSS_DLQ_PROFILE", { kind, messages: messages.length, bindingCalls: meter.bindingCalls });
});

it.each([
  { complete: false, ackFailure: false },
  { complete: true, ackFailure: false },
  { complete: true, ackFailure: true },
])("reconciles ten independent official runs within D1 50 (complete=$complete, ACK failure=$ackFailure)", async ({ complete, ackFailure }) => {
  const repo = new D1ScheduledJobRepository(db), messages = [], runs: string[] = [];
  for (let index = 0; index < 10; index++) {
    const run = await repo.createRun({ jobType: "x_collection", source: "manual", idempotencyKey: `independent-dlq-${index}` });
    runs.push(run.id);
    const [itemId] = await repo.addItems(run.id, [{ targetKey: "member_a", phase: "collect", lane: "x",
      continuation: { provider: "x_api", scope: "regular", hybrid: true, handles: ["member_a"] },
    }]);
    await repo.completeItem((await repo.claimItem(itemId, 0))!, { status: "succeeded" }, true);
    messages.push({ body: { schemaVersion: 1, messageType: "scheduled_job_item", runId: run.id, itemId, phase: "collect" }, ack: vi.fn(), retry: vi.fn() });
  }
  await db.prepare("UPDATE scheduled_outbox SET status='dispatched' WHERE event_type='execute'").run();
  if (complete) await db.prepare("UPDATE x_post_sources SET regular_completed_at=?").bind(time).run();
  time += 6 * 60_000;
  const meter = meterD1(db, 50), send = vi.fn().mockResolvedValue(undefined);
  if (ackFailure) await db.exec("CREATE TRIGGER reject_dlq_ack BEFORE UPDATE OF reconciled_at ON scheduled_outbox WHEN NEW.reconciled_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'temporary_ack_failure'); END;");
  try {
    await handleWorkerQueue({ queue: "otw-dead-letter", messages } as unknown as MessageBatch<unknown>, {
      ...runtime(), ...siteEnv(), otw_db: meter.db, OTW_OPS_BACKGROUND_QUEUE: { send } as unknown as Queue<unknown>,
    });
  } finally { if (ackFailure) await db.exec("DROP TRIGGER reject_dlq_ack;"); }
  expect(meter.quotaDenials).toBe(0);
  expect(messages.every(message => message.ack.mock.calls.length === 1)).toBe(true);
  expect(await db.prepare("SELECT COUNT(*) n FROM scheduled_outbox WHERE event_type='reconcile' AND reconciled_at IS NULL").first("n")).toBe(ackFailure ? 10 : 0);
  expect((await Promise.all(runs.map(id => repo.readRun(id)))).every(run => run?.status === (ackFailure ? "failed" : "succeeded"))).toBe(true);
  expect(Number(await db.prepare("SELECT value FROM settings WHERE key='x_collection_last_run'").first("value"))).toBe(complete ? time - 6 * 60_000 : time - 6 * 60_000 - 2 * hour);
  console.log("X_MULTI_RUN_DLQ_PROFILE", { ackFailure, messages: messages.length, bindingCalls: meter.bindingCalls });
});

it.each([false, true])("fences a terminal delivery read before manual retry (cohort=%s)", async cohort => {
  const repo = new D1ScheduledJobRepository(db);
  const run = await repo.createRun({ jobType: "x_collection", source: "manual", idempotencyKey: "terminal-read-retry" });
  const ids = await repo.addItems(run.id, ["a", "b"].map(targetKey => ({ targetKey, phase: "collect", lane: "x" as const,
    continuation: { provider: "fxembed", mode: "rss_candidates", handles: ["member_a"] },
  })));
  for (const id of ids) await repo.completeItem((await repo.claimItem(id, 0))!, { status: "failed" }, true);
  await repo.reserveQueueOperations("control", 4750);
  const send = vi.fn().mockResolvedValue(undefined), controlSend = vi.fn().mockResolvedValue(undefined);
  const environment = { ...runtime(), ...siteEnv(), OTW_OPS_BACKGROUND_QUEUE: { send } as unknown as Queue<unknown>,
    OTW_OPS_CONTROL_QUEUE: { send: controlSend } as unknown as Queue<unknown> };
  let beforeRun: unknown, beforeItems: unknown, beforeOutbox: unknown;
  const retry = async () => {
    await new ScheduledRunClient(environment).retryRun(run.id);
    beforeRun = await repo.readRun(run.id);
    beforeItems = await repo.readItems(ids);
    beforeOutbox = (await db.prepare("SELECT * FROM scheduled_outbox WHERE run_id=? ORDER BY id").bind(run.id).all()).results;
  };
  if (cohort) {
    const original = D1ScheduledJobRepository.prototype.readItems;
    vi.spyOn(D1ScheduledJobRepository.prototype, "readItems").mockImplementationOnce(async function (this: D1ScheduledJobRepository, itemIds) {
      const snapshot = await original.call(this, itemIds);
      await retry();
      return snapshot;
    });
  } else {
    const original = D1ScheduledJobRepository.prototype.readItem;
    vi.spyOn(D1ScheduledJobRepository.prototype, "readItem").mockImplementationOnce(async function (this: D1ScheduledJobRepository, itemId) {
      const snapshot = await original.call(this, itemId);
      await retry();
      return snapshot;
    });
  }
  const messages = (cohort ? ids : ids.slice(0, 1)).map(itemId => ({
    body: { schemaVersion: 1, messageType: "scheduled_job_item", runId: run.id, itemId, phase: "collect" }, ack: vi.fn(), retry: vi.fn(),
  }));
  const meter = meterD1(db, 50);
  await handleWorkerQueue({ queue: "otw-dead-letter", messages } as unknown as MessageBatch<unknown>, { ...environment, otw_db: meter.db });
  expect(meter.quotaDenials).toBe(0);
  expect(send).not.toHaveBeenCalled();
  expect(await repo.readRun(run.id)).toEqual(beforeRun);
  expect(await repo.readItems(ids)).toEqual(beforeItems);
  expect((await db.prepare("SELECT * FROM scheduled_outbox WHERE run_id=? ORDER BY id").bind(run.id).all()).results).toEqual(beforeOutbox);
  expect(messages.every(message => message.ack.mock.calls.length === 1)).toBe(true);
});

it.each(["current","retried","reclaimed"] as const)("fences dispatch admission denial to its outbox claim (%s)",async mode=>{
  const send=vi.fn();
  const coordinator=new ScheduledJobCoordinator({...runtime(),OTW_OPS_BACKGROUND_QUEUE:{send} as unknown as Queue<unknown>});
  const repo=coordinator.repository;
  const run=await repo.createRun({jobType:"x_collection",source:"manual",idempotencyKey:`dispatch-denial-${mode}`});
  const [id]=await repo.addItems(run.id,[{targetKey:"member_a",phase:"collect",lane:"x"}]);
  await repo.completeItem((await repo.claimItem(id))!,{status:"failed"},true);
  await db.batch([db.prepare("UPDATE scheduled_outbox SET status='dispatched' WHERE run_id=? AND event_type='execute'").bind(run.id),
    db.prepare("UPDATE scheduled_outbox SET available_at=0 WHERE run_id=? AND event_type='reconcile'").bind(run.id)]);
  let before:unknown,beforeRun:unknown,beforeOutbox:unknown;
  vi.spyOn(repo,"reserveDispatchBudgets").mockImplementation(async requests=>{
    if(mode==="retried")expect(await repo.retryRun(run.id)).toMatchObject({kind:"accepted"});
    if(mode==="reclaimed")await db.prepare("UPDATE scheduled_outbox SET lease_token='new-owner' WHERE run_id=? AND event_type='reconcile'").bind(run.id).run();
    before=await repo.readItem(id);beforeRun=await repo.readRun(run.id);
    beforeOutbox=(await db.prepare("SELECT * FROM scheduled_outbox WHERE run_id=? ORDER BY id").bind(run.id).all()).results;
    return requests.map(()=>false);
  });
  await coordinator.dispatchRun(run.id);
  expect(send).not.toHaveBeenCalled();
  if(mode==="current")expect(await repo.readRun(run.id)).toMatchObject({status:"throttled",last_error:"daily_background_budget_exhausted"});
  else{
    expect(await repo.readItem(id)).toEqual(before);expect(await repo.readRun(run.id)).toEqual(beforeRun);
    expect((await db.prepare("SELECT * FROM scheduled_outbox WHERE run_id=? ORDER BY id").bind(run.id).all()).results).toEqual(beforeOutbox);
  }
});

it("does not reset a prior dispatch when two recoveries share the same timestamp", async () => {
  const repo = new D1ScheduledJobRepository(db);
  const run = await repo.createRun({ jobType: "x_collection", source: "scheduled", idempotencyKey: "same-time-recovery" });
  const [a, b] = await repo.addItems(run.id, ["a", "b"].map(targetKey => ({ targetKey, phase: "collect", lane: "x" as const })));
  await repo.claimItem(a, 0);
  const old = (await repo.claimItem(b, 0))!;
  time = old.lease_until! + 1;
  expect(await repo.recoverExpiredDelivery(a, 0)).toBe(true);
  const send = vi.fn();
  const coordinator = new ScheduledJobCoordinator({ ...runtime(), OTW_OPS_BACKGROUND_QUEUE: { send } as unknown as Queue<unknown> });
  await coordinator.dispatchRun(run.id);
  expect(send).toHaveBeenCalledOnce();
  expect(await repo.recoverStaleItems()).toBe(1);
  await coordinator.dispatchRun(run.id);
  expect(send.mock.calls.filter(([body]) => body.itemId === a)).toHaveLength(1);
  expect(send.mock.calls.filter(([body]) => body.itemId === b)).toHaveLength(1);
});

it("requeues an expired lease seen by a regular delivery before running the next generation", async () => {
  await db.batch([
    db.prepare("INSERT INTO settings(key,value) VALUES('x_collection_hybrid_policy','rss_v1'),('x_collection_hybrid_activated_at',?)").bind(String(time - 12 * hour)),
    db.prepare("UPDATE x_post_sources SET regular_completed_at=? WHERE handle='member_b'").bind(time),
    db.prepare("UPDATE x_fx_sources SET cadence_anchor_at=?,rss_cadence_anchor_at=?").bind(time, time),
  ]);
  const repo = new D1ScheduledJobRepository(db);
  const run = await repo.createRun({ jobType: "x_collection", source: "scheduled", idempotencyKey: "expired-normal-delivery", scheduledFor: time });
  const [id] = await new ScheduledJobPlanner(runtime(), repo).plan(run);
  const original = (await repo.claimItem(id, 0))!;
  time = original.lease_until! + 1;
  const old = { schemaVersion: 1, messageType: "scheduled_job_item", runId: run.id, itemId: id, phase: "collect" };
  const send = vi.fn<(body: unknown) => Promise<void>>().mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.hostname === "api.cloudflare.com") return Response.json({ data: { viewer: { accounts: [{ usage: [{ sum: { rowsRead: 0 } }] }] } } });
    expect(url.pathname).toBe("/2/users/101/tweets");
    return Response.json({ data: [] });
  }));
  await deliverOfficialQueueItem(old, send);
  expect(fetch).not.toHaveBeenCalled();
  expect(send).toHaveBeenCalledExactlyOnceWith({ ...old, deliveryGeneration: 1 }, { contentType: "json" });
  expect(await repo.readItem(id)).toMatchObject({ status: "queued", lease_token: null });
  const ack = vi.fn();
  await handleWorkerQueue({ queue: "otw-dead-letter", messages: [{ body: old, ack }] } as unknown as MessageBatch<unknown>, { ...runtime(), ...siteEnv() });
  expect(ack).toHaveBeenCalledOnce();
  expect((await repo.readItem(id))?.status).toBe("queued");
  for (let i = 0; i < send.mock.calls.length && i < 5; i++) await deliverOfficialQueueItem(send.mock.calls[i][0], send);
  expect((await repo.readItem(id))?.status).toBe("succeeded");
});

async function seedPendingQuoteAuthors(handles: string[], authorIds: string[], warm: Set<string>, expireBodies = false) {
  const at = time - 1_000;
  await db.batch([
    db.prepare("INSERT INTO settings(key,value) VALUES('x_collection_hybrid_policy','rss_v1'),('x_collection_hybrid_activated_at',?),('x_reference_preview_daily_budget_cents','25')").bind(String(time - 12 * hour)),
    db.prepare("UPDATE settings SET value='cached_author' WHERE key='x_reference_preview_mode'"),
    db.prepare("UPDATE x_fx_sources SET cadence_anchor_at=?,rss_cadence_anchor_at=?").bind(time, time),
    db.prepare("UPDATE x_post_sources SET sync_origin_scope='regular',sync_origin_started_at=?,sync_timeline_completed_at=?,next_check_at=0 WHERE handle IN (SELECT value FROM json_each(?))").bind(at, at, JSON.stringify(handles)),
    db.prepare("UPDATE x_post_sources SET regular_completed_at=? WHERE handle NOT IN (SELECT value FROM json_each(?))").bind(time, JSON.stringify(handles)),
    ...[...warm].map(id => db.prepare("INSERT INTO x_api_cache(key,type,value,fetched_at,expires_at) VALUES(?,'linked_user',?,?,?)")
      .bind(`x:linked-user:v1:${id}`, JSON.stringify({ user: { id, username: `author_${id}` } }), at, time + hour)),
  ]);
  for (const [index, authorId] of authorIds.entries()) {
    const handle = handles[index % handles.length], id = String(50 + index), target = String(950 + index);
    const metrics = { likeCount: 0, replyCount: 0, repostCount: 0, quoteCount: 0 }, createdAt = new Date(at).toISOString();
    const post = { id: target, username: "i", text: "parent", createdAt, metrics, media: [], url: `https://x.com/i/status/${target}`, name: null, profileImageUrl: null };
    expect((await writeStoredPosts(db, handle, { id: handle === "member_a" ? "101" : "102", username: handle }, [{
      id, username: handle, text: "quote", url: `https://x.com/${handle}/status/${id}`, createdAt, metrics, media: [], quote: { postId: target, post },
    }], at, "otw")).ok).toBe(true);
    await db.batch([
      db.prepare("UPDATE x_post_references SET resolution_state='hydrated',author_state='pending',author_id=?,author_next_attempt_at=? WHERE source_post_id=?").bind(authorId, at, id),
      db.prepare("INSERT INTO x_api_cache(key,type,value,fetched_at,expires_at) VALUES(?,'linked_post',?,?,?)")
        .bind(`x:linked-post:v1:${target}`, JSON.stringify({ post, authorId }), at, expireBodies ? time - 1 : time + hour),
    ]);
  }
  const repo = new D1ScheduledJobRepository(db);
  const run = await repo.createRun({ jobType: "x_collection", source: "scheduled", idempotencyKey: "pending-quote-authors", scheduledFor: time });
  const ids = await new ScheduledJobPlanner(runtime(), repo).plan(run);
  expect(ids).toHaveLength(handles.length);
  const deliveries = new Map((await repo.readItems(ids)).map(item => [JSON.parse(item.continuation_json!).handles[0] as string, {
    schemaVersion: 1, messageType: "scheduled_job_item", runId: run.id, itemId: item.id, phase: "collect",
  }]));
  return { repo, deliveries };
}

it("immediately reselects work when paired author cache entries expire during execution", async () => {
  const { repo, deliveries } = await seedPendingQuoteAuthors(["member_a"], ["9001", "9001"], new Set(["9001"]), true);
  await db.prepare("UPDATE x_api_cache SET expires_at=? WHERE key='x:linked-user:v1:9001'").bind(time + 1).run();
  const initial = deliveries.get("member_a")!, meter = meterD1(db, 50);
  const originals = new WeakMap<object, D1PreparedStatement>();
  let expired = false;
  const wrapped = new Proxy(meter.db, { get(target, key) {
    if (key === "prepare") return (sql: string) => {
      const wrap = (statement: D1PreparedStatement): D1PreparedStatement => {
        const proxy = new Proxy(statement, { get(statement, method) {
          if (method === "bind") return (...args: unknown[]) => wrap(statement.bind(...args));
          if (method === "all") return async () => {
            const rows = await statement.all();
            if (sql.includes("u.value AS cached_author") && !expired) { expired = true; time += 2; }
            return rows;
          };
          const value = Reflect.get(statement, method, statement);
          return typeof value === "function" ? value.bind(statement) : value;
        } });
        originals.set(proxy, statement);
        return proxy;
      };
      return wrap(target.prepare(sql));
    };
    if (key === "batch") return (statements: D1PreparedStatement[]) => target.batch(statements.map(item => originals.get(item) ?? item));
    const value = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.hostname === "api.cloudflare.com") return Response.json({ data: { viewer: { accounts: [{ usage: [{ sum: { rowsRead: 0 } }] }] } } });
    expect(url.pathname).toBe("/2/users");
    return Response.json({ data: [{ id: "9001", username: "fresh_author" }] });
  }));
  const pending: unknown[] = [], send = vi.fn(async (body: unknown) => { pending.push(body); }), ack = vi.fn(), retry = vi.fn();
  await handleWorkerQueue({ queue: "otw-ops-background", messages: [{ body: initial, ack, retry }] } as unknown as MessageBatch<unknown>, {
    ...runtime(), ...siteEnv(), X_API_GATEWAY: undefined, otw_db: wrapped,
    OTW_OPS_BACKGROUND_QUEUE: { send } as unknown as Queue<unknown>,
  });
  expect(expired).toBe(true);
  expect(meter.quotaDenials).toBe(0);
  expect((await repo.readItem(initial.itemId))?.status).toBe("queued");
  expect(send).toHaveBeenCalledOnce();
  expect(ack).toHaveBeenCalledOnce();
  expect(retry).not.toHaveBeenCalled();
  for (let i = 0; i < pending.length && i < 5; i++) await deliverOfficialQueueItem(pending[i], send);
  expect((await repo.readItem(initial.itemId))?.status).toBe("succeeded");
  expect(await db.prepare("SELECT COUNT(*) n FROM x_post_references WHERE author_state='resolved'").first("n")).toBe(2);
});

it("reuses a settled author response across different quotes before the first quote retries", async () => {
  const { deliveries } = await seedPendingQuoteAuthors(["member_a", "member_b"], ["9001", "9001"], new Set());
  let upstream = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.hostname === "api.cloudflare.com") return Response.json({ data: { viewer: { accounts: [{ usage: [{ sum: { rowsRead: 0 } }] }] } } });
    expect(url.pathname).toBe("/2/users");
    expect(url.searchParams.get("ids")).toBe("9001");
    if (++upstream === 1) await db.exec("CREATE TRIGGER fixture_fail_shared_author BEFORE INSERT ON x_api_cache WHEN NEW.type='linked_user' BEGIN SELECT RAISE(ABORT,'fixture author cache unavailable'); END;");
    return Response.json({ data: [{ id: "9001", username: "author_9001" }] });
  }));
  const send = vi.fn();
  try { await deliverOfficialQueueItem(deliveries.get("member_a"), send, () => true); }
  finally { await db.exec("DROP TRIGGER IF EXISTS fixture_fail_shared_author;"); }
  expect(await db.prepare("SELECT value FROM x_api_cache WHERE key='x:linked-user:v1:9001'").first()).toBeNull();
  await db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('x_reference_preview_daily_budget_cents','0'),('x_api_backoff_until',?)").bind(String(time + hour)).run();
  try { await deliverOfficialQueueItem(deliveries.get("member_b"), send); }
  finally { await db.prepare("DELETE FROM settings WHERE key IN ('x_reference_preview_daily_budget_cents','x_api_backoff_until')").run(); }
  expect(await db.prepare("SELECT author_state FROM x_post_references WHERE source_post_id='51'").first("author_state")).toBe("resolved");
  expect(upstream).toBe(1);
  expect(await db.prepare("SELECT COUNT(*) n FROM x_shared_requests WHERE operation='user_lookup' AND status='complete'").first("n")).toBe(1);
});

it("recovers an abandoned author lookup through manual control and ordinary Queue delivery", async () => {
  const { repo, deliveries } = await seedPendingQuoteAuthors(["member_a"], ["9000"], new Set(), true);
  const initial = deliveries.get("member_a")!;
  const lookup = { id: `otw:quote:${crypto.randomUUID()}`, operation: "user_lookup" as const,
    path: "/users?ids=9000&user.fields=name%2Cusername%2Cprofile_image_url%2Cprotected", startedAt: time };
  const upstream = vi.fn(() => Response.json({ data: [{ id: "9000", username: "recovered_author" }] }));
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.hostname === "api.cloudflare.com") return Response.json({ data: { viewer: { accounts: [{ usage: [{ sum: { rowsRead: 0 } }] }] } } });
    expect(url.pathname).toBe("/2/users");
    return upstream();
  }));
  await db.exec("CREATE TRIGGER stop_author_settlement BEFORE UPDATE OF status ON x_shared_requests WHEN NEW.status='complete' AND NEW.operation='user_lookup' BEGIN SELECT RAISE(ABORT,'author settlement interrupted'); END;");
  try { expect(await runtime().X_API_GATEWAY.execute(lookup)).toMatchObject({ ok: false, error: "shared_budget_unavailable" }); }
  finally { await db.exec("DROP TRIGGER stop_author_settlement;"); }
  await db.prepare("INSERT INTO x_api_cache(key,type,value,fetched_at,expires_at) VALUES('x:quote-author-lookup:v1:otw:9000','quote_lookup',?,?,?)")
    .bind(JSON.stringify(lookup), time, time + 24 * hour).run();
  time += 10 * 60_000;
  const send = vi.fn().mockResolvedValue(undefined);
  await deliverOfficialQueueItem(initial, send);
  expect((await repo.readItem(initial.itemId))?.status).toBe("failed");
  expect(upstream).toHaveBeenCalledOnce();
  const nextAttempt = await db.prepare("SELECT author_next_attempt_at FROM x_post_references WHERE author_id='9000'").first<number>("author_next_attempt_at");
  time = nextAttempt! + 1;
  const controlSend = vi.fn().mockResolvedValue(undefined);
  const environment = { ...runtime(), ...siteEnv(), OTW_OPS_CONTROL_QUEUE: { send: controlSend } as unknown as Queue<unknown>,
    OTW_OPS_BACKGROUND_QUEUE: { send } as unknown as Queue<unknown> };
  await new ScheduledRunClient(environment).retryRun(initial.runId);
  const controlMeter = meterD1(db, 50), ack = vi.fn();
  await handleWorkerQueue({ queue: "otw-ops-control", messages: [{ body: controlSend.mock.calls[0][0], ack, retry: vi.fn() }] } as unknown as MessageBatch<unknown>, { ...environment, otw_db: controlMeter.db });
  expect(controlMeter.quotaDenials).toBe(0);
  expect(ack).toHaveBeenCalledOnce();
  for (let index = 0; index < send.mock.calls.length && index < 5; index++) await deliverOfficialQueueItem(send.mock.calls[index][0], send);
  expect((await repo.readItem(initial.itemId))?.status).toBe("succeeded");
  expect(upstream).toHaveBeenCalledTimes(2);
  expect(await db.prepare("SELECT author_state FROM x_post_references WHERE author_id='9000'").first("author_state")).toBe("resolved");
  expect(await runtime().X_API_GATEWAY.readBudget()).toMatchObject({ reserved: 10000, used: 10000 });
  expect(await db.prepare("SELECT status FROM x_shared_requests WHERE id=?").bind(lookup.id).first("status")).toBe("running");
  expect(await db.prepare("SELECT regular_completed_at,next_check_at FROM x_post_sources WHERE handle='member_a'").first()).toEqual({ regular_completed_at: time, next_check_at: time + 12 * hour });
});

it("records every continuation within the D1 cap for 20 mixed author quotes with expired bodies", { timeout: 30_000 }, async () => {
  const authors = Array.from({ length: 20 }, (_, index) => String(9000 + index));
  const warm = new Set(authors.filter((_, index) => index % 4 >= 2));
  const { repo, deliveries } = await seedPendingQuoteAuthors(["member_a"], authors, warm, true);
  const initial = deliveries.get("member_a")!;
  const requested: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.hostname === "api.cloudflare.com") return Response.json({ data: { viewer: { accounts: [{ usage: [{ sum: { rowsRead: 0 } }] }] } } });
    expect(url.pathname).toBe("/2/users");
    const id = url.searchParams.get("ids")!;
    requested.push(id);
    return Response.json({ data: [{ id, username: `author_${id}` }] });
  }));
  const pending: unknown[] = [initial], calls: number[] = [];
  const send = vi.fn(async (body: unknown) => { pending.push(body); });
  for (let i = 0; i < pending.length && i < 30; i++) {
    const before = pending.length;
    calls.push(await deliverOfficialQueueItem(pending[i], send));
    if (pending.length > before) expect(await db.prepare("SELECT status FROM scheduled_outbox WHERE item_id=? AND event_type='execute'")
      .bind(initial.itemId).first("status")).toBe("dispatched");
  }
  expect((await repo.readItem(initial.itemId))?.status).toBe("succeeded");
  expect(await db.prepare("SELECT COUNT(*) n FROM x_post_references WHERE author_state='resolved'").first("n")).toBe(20);
  expect(requested.sort()).toEqual(authors.filter(id => !warm.has(id)).sort());
  expect(await db.prepare("SELECT last_seen_post_id,regular_completed_at,next_check_at FROM x_post_sources WHERE handle='member_a'").first())
    .toEqual({ last_seen_post_id: "100", regular_completed_at: time, next_check_at: time + 12 * hour });
  console.log("X_EXPIRED_QUOTE_QUEUE_PROFILE", { slices: calls.length, maxBindingCalls: Math.max(...calls), userLookups: requested.length });
});

it.each([0,15])("keeps mixed expired quote resumes within D1 50 when ACK fails at slice %s",{timeout:30_000},async failAt=>{
  const authors=Array.from({length:20},(_,index)=>String(9000+index));
  const {repo,deliveries}=await seedPendingQuoteAuthors(["member_a"],authors,new Set(authors.filter((_,index)=>index%4>=2)),true);
  const initial=deliveries.get("member_a")!,pending:unknown[]=[initial],calls:number[]=[];
  vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL)=>{
    const url=new URL(String(input));
    if(url.hostname==="api.cloudflare.com")return Response.json({data:{viewer:{accounts:[{usage:[{sum:{rowsRead:0}}]}]}}});
    expect(url.pathname).toBe("/2/users");
    const id=url.searchParams.get("ids")!;
    return Response.json({data:[{id,username:`author_${id}`}]});
  }));
  const send=vi.fn(async(body:unknown)=>{pending.push(body);});
  let injected=false;
  for(let slice=0;slice<pending.length && slice<25;slice++){
    const meter=meterD1(db,50),retry=vi.fn();
    const ack=vi.fn(()=>{if(slice===failAt && !injected){injected=true;throw new Error("temporary ACK failure");}});
    await handleWorkerQueue({queue:"otw-ops-background",messages:[{body:pending[slice],ack,retry}]} as unknown as MessageBatch<unknown>,{
      ...runtime(),...siteEnv(),X_API_GATEWAY:undefined,otw_db:meter.db,CLOUDFLARE_ACCOUNT_ID:"fixture",CLOUDFLARE_D1_TOKEN:"fixture",OTW_OPS_BACKGROUND_QUEUE:{send} as unknown as Queue<unknown>
    });
    expect(meter.quotaDenials).toBe(0);calls.push(meter.bindingCalls);
    if(retry.mock.calls.length)pending.push(pending[slice]);
  }
  expect(injected).toBe(true);
  expect((await repo.readItem(initial.itemId))?.status).toBe("succeeded");
  expect(await db.prepare("SELECT COUNT(*) FROM x_post_references WHERE author_state='resolved'").first("COUNT(*)")).toBe(20);
  expect(await db.prepare("SELECT COUNT(*) n FROM scheduled_outbox WHERE item_id=? AND event_type='reconcile' AND reconciled_at IS NULL").bind(initial.itemId).first("n")).toBe(0);
  console.log("X_MIXED_ACK_PROFILE",{failAt,slices:calls.length,maxBindingCalls:Math.max(...calls)});
});

it.each([["tweet_lookup", 60_000], ["user_lookup", 60_000], ["tweet_lookup", 3 * 24 * hour], ["user_lookup", 3 * 24 * hour]] as const)(
  "reuses a settled %s after a quote cache write fails and %s milliseconds pass", async (operation, delay) => {
  await db.batch([
    db.prepare("INSERT INTO settings(key,value) VALUES('x_collection_hybrid_policy','rss_v1'),('x_collection_hybrid_activated_at',?)").bind(String(time - 12 * hour)),
    db.prepare("UPDATE x_post_sources SET regular_completed_at=? WHERE handle='member_b'").bind(time),
    db.prepare("UPDATE x_fx_sources SET cadence_anchor_at=?,rss_cadence_anchor_at=?").bind(time, time),
    db.prepare("UPDATE settings SET value='cached_author' WHERE key='x_reference_preview_mode'"),
  ]);
  expect((await writeStoredPosts(db, "member_a", { id: "101", username: "member_a" }, [{
    id: "52", username: "member_a", text: "quote", url: "https://x.com/member_a/status/52", createdAt: new Date(time - 1000).toISOString(),
    media: [], metrics: { likeCount: 0, replyCount: 0, repostCount: 0, quoteCount: 0 }, quote: { postId: "952", post: null },
  }], time - 1000, "otw")).ok).toBe(true);
  const cacheType = operation === "tweet_lookup" ? "linked_post" : "linked_user";
  let injected = false;
  const upstream = { timeline: 0, tweet_lookup: 0, user_lookup: 0 };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.hostname === "api.cloudflare.com") return Response.json({ data: { viewer: { accounts: [{ usage: [{ sum: { rowsRead: 0 } }] }] } } });
    if (url.pathname === "/2/users/101/tweets") { upstream.timeline++; return Response.json({ data: [] }); }
    const request = url.pathname === "/2/tweets" ? "tweet_lookup" : "user_lookup";
    if (++upstream[request] === 1 && request === operation) {
      await db.exec(`CREATE TRIGGER fixture_fail_quote_cache BEFORE INSERT ON x_api_cache WHEN NEW.type='${cacheType}' BEGIN SELECT RAISE(ABORT,'fixture quote cache unavailable'); END;`);
      injected = true;
    }
    return Response.json({ data: request === "tweet_lookup" ? [{ id: "952", text: "parent", ...(operation === "user_lookup" ? { author_id: "9001" } : {}), created_at: new Date(time).toISOString() }] : [{ id: "9001", username: "quote_author" }] });
  }));
  const repo = new D1ScheduledJobRepository(db);
  const run = await repo.createRun({ jobType: "x_collection", source: "scheduled", idempotencyKey: "quote-replay", scheduledFor: time });
  const [id] = await new ScheduledJobPlanner(runtime(), repo).plan(run);
  const pending: unknown[] = [{ schemaVersion: 1, messageType: "scheduled_job_item", runId: run.id, itemId: id, phase: "collect" }];
  const send = vi.fn(async (body: unknown) => { pending.push(body); });
  let retried = false;
  try {
    for (let index = 0; index < pending.length && index < 10; index++) {
      await deliverOfficialQueueItem(pending[index], send, () => injected && !retried);
      if (!injected || retried) continue;
      retried = true;
      expect(await db.prepare("SELECT COUNT(*) AS n FROM x_shared_requests WHERE operation=? AND status='complete'").bind(operation).first("n")).toBe(1);
      await db.exec("DROP TRIGGER fixture_fail_quote_cache;");
      time += delay;
      await prepareXReceiptCleanup(db, time).run();
      // Make a fresh purchase impossible while this settled response is recovered.
      await db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('x_reference_preview_daily_budget_cents','0'),('x_api_backoff_until',?)").bind(String(time + hour)).run();
      try { await deliverOfficialQueueItem(pending[index], send); }
      finally { await db.prepare("DELETE FROM settings WHERE key IN ('x_reference_preview_daily_budget_cents','x_api_backoff_until')").run(); }
    }
  } finally { await db.exec("DROP TRIGGER IF EXISTS fixture_fail_quote_cache;"); }
  expect(retried).toBe(true);
  expect(upstream).toEqual({ timeline: 1, tweet_lookup: 1, user_lookup: operation === "user_lookup" ? 1 : 0 });
  expect(await db.prepare("SELECT resolution_state,author_state FROM x_post_references WHERE source_post_id='52'").first()).toEqual({ resolution_state: "hydrated", author_state: "resolved" });
  expect((await repo.readItem(id))?.status).toBe("succeeded");
});

it("replays a settled timeline response through the planned queue item during budget and backoff", async () => {
  await db.batch([
    db.prepare("INSERT INTO settings(key,value) VALUES('x_collection_hybrid_policy','rss_v1'),('x_collection_hybrid_activated_at',?)").bind(String(time - 12 * hour)),
    db.prepare("UPDATE x_post_sources SET regular_completed_at=? WHERE handle='member_b'").bind(time),
    db.prepare("UPDATE x_post_sources SET next_check_at=0 WHERE handle='member_a'"),
    db.prepare("UPDATE x_fx_sources SET cadence_anchor_at=?,rss_cadence_anchor_at=?").bind(time, time),
    db.prepare("UPDATE x_shared_budgets SET reserved=875000"),
  ]);
  const timeline = vi.fn(() => Response.json({ data: [{ id: "155", text: "paid once", created_at: new Date(time).toISOString() }] }));
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.hostname === "api.cloudflare.com") return Response.json({ data: { viewer: { accounts: [{ usage: [{ sum: { rowsRead: 0 } }] }] } } });
    expect(url.pathname).toBe("/2/users/101/tweets");
    return timeline();
  }));
  await db.exec("CREATE TRIGGER fail_replay_ack BEFORE UPDATE OF sync_gap_state ON x_post_sources WHEN json_extract(NEW.sync_gap_state,'$.request.id') IS NULL BEGIN SELECT RAISE(ABORT,'gap checkpoint unavailable'); END;");
  try { await expect(runXCollectionForHandles(runtime(), ["member_a"], "scheduled", time, false, undefined, "regular")).rejects.toThrow(); }
  finally { await db.exec("DROP TRIGGER fail_replay_ack;"); }
  const budget = await runtime().X_API_GATEWAY.readBudget();
  expect(budget.remaining).toBe(120000);
  await db.prepare("INSERT INTO settings(key,value) VALUES('x_api_backoff_until',?)").bind(String(time + hour)).run();
  const repository = new D1ScheduledJobRepository(db);
  const job = await repository.createRun({ jobType: "x_collection", source: "scheduled", idempotencyKey: "settled-gap-replay", scheduledFor: time });
  const [id] = await new ScheduledJobPlanner(runtime(), repository).plan(job);
  expect(JSON.parse((await repository.readItem(id))!.continuation_json!)).toMatchObject({ scope: "pending", replayOnly: true });
  await deliverOfficialQueueItem({ schemaVersion: 1, messageType: "scheduled_job_item", runId: job.id, itemId: id, phase: "collect" }, vi.fn());
  const finished = await repository.readItem(id);
  expect(finished?.status).toBe("succeeded");
  expect(JSON.parse(finished!.result_json!)).toMatchObject({ apiCalls: 0, estimatedCostMicros: 0, pendingSources: 0 });
  expect(await db.prepare("SELECT last_seen_post_id,regular_completed_at FROM x_post_sources WHERE handle='member_a'").first()).toEqual({ last_seen_post_id: "155", regular_completed_at: time });
  expect(await runtime().X_API_GATEWAY.readBudget()).toEqual(budget);
  expect(timeline).toHaveBeenCalledOnce();
});
it("plans and completes a free pending check for a first-page error without a cursor", async () => {
  await db.prepare("UPDATE x_fx_sources SET last_error='fx_storage_failed' WHERE handle='member_a'").run();
  const official = await db.prepare("SELECT handle,last_seen_post_id,sync_pagination_token,last_completed_at,regular_completed_at FROM x_post_sources ORDER BY handle").all();
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: 200, results: [], cursor: {} })));
  const repository = new D1ScheduledJobRepository(db);
  const run = await repository.createRun({ jobType: "x_collection", source: "manual", idempotencyKey: "first-page-retry", initialSummary: { xCollectionProvider: "fxembed", xCollectionScope: "pending" } });
  const [id] = await new ScheduledJobPlanner(runtime(), repository).plan(run);
  const item = (await repository.claimItem(id))!;
  expect(JSON.parse(item.continuation_json!)).toMatchObject({ provider: "fxembed", scope: "pending", handles: ["member_a"] });
  const outcome = await new ScheduledJobExecutor(runtime(), repository).execute(item);
  await repository.completeItem(item, outcome);
  expect(outcome).toMatchObject({ status: "succeeded", result: { pendingSources: 0, recentCheck: { lookbackHours: 48, maxPages: 4 } } });
  expect(await db.prepare("SELECT last_error,cursor,pages_completed FROM x_fx_sources WHERE handle='member_a'").first()).toEqual({ last_error: null, cursor: null, pages_completed: 1 });
  expect((await db.prepare("SELECT handle,last_seen_post_id,sync_pagination_token,last_completed_at,regular_completed_at FROM x_post_sources ORDER BY handle").all()).results).toEqual(official.results);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(new URL(String(vi.mocked(fetch).mock.calls[0][0])).hostname).toBe("api.fxtwitter.com");
});
it.each(["pending", "rss"])("carries %s recovery deadline into paid admission despite adverse item IDs", async urgency => {
  await db.batch([
    db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('x_collection_hybrid_policy','rss_v1'),('x_collection_hybrid_activated_at','1')"),
    db.prepare("UPDATE x_fx_sources SET cadence_anchor_at=?,rss_cadence_anchor_at=?").bind(time,time),
    db.prepare("UPDATE x_post_sources SET regular_completed_at=?,last_completed_at=?,next_check_at=0").bind(time-13*hour,time-13*hour),
  ]);
  const repository = new D1ScheduledJobRepository(db);
  if (urgency === "pending") await db.prepare("UPDATE x_post_sources SET sync_origin_started_at=?,sync_origin_scope='regular',sync_pagination_token='pending',sync_gap_state=? WHERE handle='member_b'")
    .bind(time-23*hour,JSON.stringify({startedAt:time-23*hour,base:"100",after:"100",boundsRevision:0,page:{until:null,token:"pending",newest:null}})).run();
  else {
    const old = await repository.createRun({jobType:"x_collection",source:"scheduled",idempotencyKey:"old-rss"});
    const [id] = await repository.addItems(old.id,[{targetKey:"rss",phase:"collect",lane:"x",continuation:{provider:"fxembed",mode:"rss_candidates",scope:"pending",handles:["member_b"],phase:"hydrate",nextAttemptAt:null,candidates:[{id:"777",stage:"official",firstSeenAt:time-23*hour,createdAtHint:time-23*hour,attempts:2,nextAttemptAt:0,error:null}]}}]);
    await repository.completeItem((await repository.claimItem(id))!,{status:"partial"});
    await db.prepare("UPDATE x_fx_sources SET rss_pending_item_id=? WHERE handle='member_b'").bind(id).run();
  }
  const run = await repository.createRun({jobType:"x_collection",source:"scheduled",idempotencyKey:"ordered-paid",scheduledFor:time});
  const items = await new ScheduledJobPlanner(runtime(),repository).plan(run);
  const rows = await Promise.all(items.map(id => repository.readItem(id)));
  const high = rows.find(row => JSON.parse(row!.continuation_json!).handles[0] === "member_b")!;
  const low = rows.find(row => JSON.parse(row!.continuation_json!).handles[0] === "member_a")!;
  await db.prepare("UPDATE scheduled_outbox SET id=CASE item_id WHEN ? THEN 'a-low' ELSE 'z-high' END WHERE run_id=?").bind(low.id,run.id).run();
  expect((await repository.claimPendingOutbox(run.id)).map(row=>row.item_id)).toEqual([high.id]);
  expect(await repository.claimItem(low.id)).toBeNull();
  const admitted: string[] = [];
  vi.stubGlobal("fetch",vi.fn(async (input:RequestInfo|URL) => {
    const url=new URL(String(input));
    if(url.pathname.includes("/tweets")){admitted.push(url.pathname);return Response.json({data:[]});}
    throw new Error(`Unexpected upstream ${url}`);
  }));
  await db.prepare("UPDATE x_shared_budgets SET used=875000").run();
  const claimed=(await repository.claimItem(high.id))!;
  await repository.completeItem(claimed,await new ScheduledJobExecutor(runtime(),repository).execute(claimed));
  expect(admitted[0]).toBe("/2/users/102/tweets");
});
it("keeps an empty official timeline cursor independent from stored Fx posts", async () => {
  await db.prepare("UPDATE settings SET value=? WHERE key='x_collection_last_run'").bind(String(time-25*hour)).run();
  await db.prepare("UPDATE x_fx_sources SET cadence_anchor_at=?").bind(time).run();
  await db.prepare("UPDATE x_post_sources SET last_seen_post_id=NULL").run();
  await writeStoredPosts(db,"member_a",{id:"101",username:"member_a"},[{id:"200",username:"member_a",text:"Fx only",url:"https://x.com/member_a/status/200",createdAt:new Date(time-1000).toISOString(),media:[],metrics:{likeCount:0,replyCount:0,repostCount:0,quoteCount:0}}],time,"otw",{origin:"fxembed",completeness:{text:true,media:true,relations:true}});
  vi.stubGlobal("fetch",vi.fn().mockImplementation(async()=>Response.json({data:[]})));
  const repository=new D1ScheduledJobRepository(db),executor=new ScheduledJobExecutor(runtime(),repository);
  const run=await repository.createRun({jobType:"x_collection",source:"scheduled",idempotencyKey:"empty-official",scheduledFor:time});
  const items=await new ScheduledJobPlanner(runtime(),repository).plan(run);
  for(const id of items){const item=(await repository.claimItem(id))!;await repository.completeItem(item,await executor.execute(item));}
  expect(await db.prepare("SELECT last_seen_post_id,collection_started_at FROM x_post_sources WHERE handle='member_a'").first()).toEqual({last_seen_post_id:null,collection_started_at:1});
});
it("retains the completed account when another account in the same regular shard fails", async () => {
  await db.prepare("UPDATE settings SET value=? WHERE key='x_collection_last_run'").bind(String(time-25*hour)).run();
  await db.prepare("UPDATE x_fx_sources SET cadence_anchor_at=?").bind(time).run();
  vi.stubGlobal("fetch",vi.fn().mockImplementation(async(input:RequestInfo|URL)=>String(input).includes('/101/')?Response.json({data:[]}):new Response('provider down',{status:503})));
  const repository=new D1ScheduledJobRepository(db),executor=new ScheduledJobExecutor(runtime(),repository);
  const run=await repository.createRun({jobType:"x_collection",source:"scheduled",idempotencyKey:"partial-shard",scheduledFor:time});
  const [id]=await new ScheduledJobPlanner(runtime(),repository).plan(run);
  const item=(await repository.claimItem(id))!;
  expect(JSON.parse(item.continuation_json!).handles).toEqual(["member_a","member_b"]);
  const outcome=await executor.execute(item);
  await repository.completeItem(item,outcome);
  expect(await db.prepare("SELECT regular_completed_at FROM x_post_sources WHERE handle='member_a'").first("regular_completed_at")).toBe(time);
  time=Number(await db.prepare("SELECT next_check_at FROM x_post_sources WHERE handle='member_b'").first("next_check_at"))+1;
  const next=(await plans()).filter(item=>item.continuation?.provider==='x_api');
  expect(next.flatMap(item=>item.continuation?.handles??[])).toEqual(['member_b']);
  expect(await db.prepare("SELECT regular_completed_at FROM x_post_sources WHERE handle='member_b'").first("regular_completed_at")).toBeNull();
});
it.each([{ provider: "unknown" }, { provider: "x_api", scope: "unknown" }])("rejects malformed provider metadata before any external call", async metadata => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({ data: [] })));
  const repository = new D1ScheduledJobRepository(db);
  const run = await repository.createRun({ jobType: "x_collection", source: "manual", idempotencyKey: JSON.stringify(metadata) });
  const [id] = await repository.addItems(run.id, [{ targetKey: "invalid", phase: "collect", lane: "x", continuation: { handles: ["member_a"], ...metadata } }]);
  await expect(new ScheduledJobExecutor(runtime(), repository).execute((await repository.claimItem(id))!)).rejects.toThrow(/invalid_x_collection/);
  expect(fetch).not.toHaveBeenCalled();
});
it("runs fallback only for the failed account and clears it after two successful Fx checks", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response("down", { status: 503 })));
  await runFxCollectionForHandles(runtime(), ["member_a"], "scheduled", time);
  time += 30 * 60000;
  await runFxCollectionForHandles(runtime(), ["member_a"], "scheduled", time);
  expect(await db.prepare("SELECT fallback_active FROM x_fx_sources WHERE handle='member_a'").first("fallback_active")).toBe(1);
  const planned = await plans();
  expect(planned.filter(item => item.continuation?.scope === "fallback").map(item => item.continuation?.handles)).toEqual([["member_a"]]);
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({ code: 200, results: [], cursor: {} })));
  await runFxCollectionForHandles(runtime(), ["member_a"], "scheduled", time);
  expect(await db.prepare("SELECT fallback_active FROM x_fx_sources WHERE handle='member_a'").first("fallback_active")).toBe(1);
  await db.prepare("UPDATE x_post_sources SET sync_pagination_token='unfinished' WHERE handle='member_a'").run();
  time += 30 * 60000;
  await runFxCollectionForHandles(runtime(), ["member_a"], "scheduled", time);
  expect(await db.prepare("SELECT fallback_active FROM x_fx_sources WHERE handle='member_a'").first("fallback_active")).toBe(0);
  expect(await db.prepare("SELECT sync_pagination_token FROM x_post_sources WHERE handle='member_a'").first("sync_pagination_token")).toBe("unfinished");
});
it("official fallback independently discovers an Fx-missed post without changing the regular anchor", async () => {
  await db.prepare("UPDATE x_fx_sources SET fallback_active=1,cadence_anchor_at=? WHERE handle='member_a'").bind(time).run();
  await db.prepare("UPDATE x_fx_sources SET cadence_anchor_at=? WHERE handle='member_b'").bind(time).run();
  const before = await db.prepare("SELECT value FROM settings WHERE key='x_collection_last_run'").first("value");
  const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    expect(url.pathname).toBe("/2/users/101/tweets");
    expect(url.searchParams.get("since_id")).toBe("100");
    return Response.json({ data: [{ id: "200", text: "official discovery", created_at: new Date(time - 1000).toISOString() }] });
  });
  vi.stubGlobal("fetch", fetchMock);
  const repository = new D1ScheduledJobRepository(db), executor = new ScheduledJobExecutor(runtime(), repository);
  const run = await repository.createRun({ jobType: "x_collection", source: "scheduled", idempotencyKey: "fallback", scheduledFor: time });
  const items = await new ScheduledJobPlanner(runtime(), repository).plan(run);
  expect(items).toHaveLength(1);
  const item = (await repository.claimItem(items[0]))!;
  expect(JSON.parse(item.continuation_json!)).toMatchObject({ provider: "x_api", scope: "fallback", handles: ["member_a"] });
  const outcome = await executor.execute(item);
  expect(outcome.status).toBe("succeeded");
  await repository.completeItem(item, outcome);
  await executor.finalizeLegacyState(run.id);
  expect(await db.prepare("SELECT last_completed_at,regular_completed_at FROM x_post_sources WHERE handle='member_a'").first()).toEqual({ last_completed_at: time, regular_completed_at: null });
  expect(await db.prepare("SELECT id FROM x_posts WHERE handle='member_a'").first("id")).toBe("200");
  expect(await db.prepare("SELECT value FROM settings WHERE key='x_collection_last_run'").first("value")).toBe(before);
  expect((await plans()).filter(item => item.continuation?.scope === "fallback")).toHaveLength(0);
});
it("completes a regular cohort only after pending work and an independent regular check", async () => {
  const baseline = String(time - 25 * hour);
  await db.prepare("UPDATE settings SET value=? WHERE key='x_collection_last_run'").bind(baseline).run();
  await db.prepare("UPDATE x_fx_sources SET cadence_anchor_at=?").bind(time).run();
  await db.prepare("UPDATE x_post_sources SET sync_pagination_token='tail',sync_base_post_id='100',next_check_at=0 WHERE handle='member_b'").run();
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.hostname === "api.fxtwitter.com") return Response.json({ code: 200, results: [], cursor: {} });
    const tail = url.searchParams.get("pagination_token");
    return Response.json(tail === "tail" ? { data: [{ id: "201", text: "partial", created_at: new Date(time - 1000).toISOString() }], meta: { next_token: "tail2" } } : tail === "tail2" || url.searchParams.get("since_id") === "201" ? { data: [] } : { data: [{ id: "200", text: "regular", created_at: new Date(time - 1000).toISOString() }] });
  }));
  const repository = new D1ScheduledJobRepository(db), executor = new ScheduledJobExecutor(runtime(), repository);
  const execute = async (key: string) => {
    const run = await repository.createRun({ jobType: "x_collection", source: "scheduled", idempotencyKey: key, scheduledFor: time });
    const items = await new ScheduledJobPlanner(runtime(), repository).plan(run);
    for (const id of items) { const item = (await repository.claimItem(id))!; await repository.completeItem(item, await executor.execute(item)); }
    await executor.finalizeLegacyState(run.id);
  };
  await execute("regular-first");
  expect(await db.prepare("SELECT value FROM settings WHERE key='x_collection_last_run'").first("value")).toBe(baseline);
  time += 30 * 60000;
  expect((await plans()).filter(item => item.continuation?.provider === "x_api").map(item => item.continuation?.scope)).toEqual(["pending"]);
  await execute("pending-complete");
  expect(await db.prepare("SELECT value FROM settings WHERE key='x_collection_last_run'").first("value")).toBe(baseline);
  time += 30 * 60000;
  expect((await plans()).filter(item => item.continuation?.provider === "x_api").map(item => item.continuation?.handles)).toEqual([["member_b"]]);
  await execute("regular-complete");
  expect(await db.prepare("SELECT value FROM settings WHERE key='x_collection_last_run'").first("value")).toBe(String(time));
});
it("preserves pending cursors and regular cadence when the common budget is exhausted", async () => {
  await db.prepare("UPDATE x_post_sources SET sync_pagination_token='pending',next_check_at=0 WHERE handle='member_a'").run();
  await db.prepare("UPDATE x_shared_budgets SET used=limit_value").run();
  const anchor = await db.prepare("SELECT value FROM settings WHERE key='x_collection_last_run'").first("value");
  const planned = await plans();
  expect(planned.length).toBeGreaterThan(0);
  expect(planned.every(item => item.continuation?.provider === "fxembed")).toBe(true);
  expect(await db.prepare("SELECT sync_pagination_token FROM x_post_sources WHERE handle='member_a'").first("sync_pagination_token")).toBe("pending");
  expect(await db.prepare("SELECT value FROM settings WHERE key='x_collection_last_run'").first("value")).toBe(anchor);
});
it("keeps the 24h anchor on an Fx-only normal execution", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({ code: 200, results: [], cursor: {} })));
  const repository = new D1ScheduledJobRepository(db), executor = new ScheduledJobExecutor(runtime(), repository);
  const anchor = await db.prepare("SELECT value FROM settings WHERE key='x_collection_last_run'").first("value");
  const run = await repository.createRun({ jobType: "x_collection", source: "scheduled", idempotencyKey: "fx-only", scheduledFor: time });
  const items = await new ScheduledJobPlanner(runtime(), repository).plan(run);
  expect(items).toHaveLength(1);
  const item = (await repository.claimItem(items[0]))!;
  const outcome = await executor.execute(item);
  expect(outcome.status).toBe("succeeded");
  await repository.completeItem(item, outcome);
  await executor.finalizeLegacyState(run.id);
  expect(await db.prepare("SELECT value FROM settings WHERE key='x_collection_last_run'").first("value")).toBe(anchor);
});
it("keeps regular gap CAS retries within the invocation D1 cap", async () => {
  const makePost = (id: string, text: string) => ({
    id, username: "member_a", text, url: "https://x.com/member_a/status/" + id,
    createdAt: new Date(time - 1000).toISOString(), media: [],
    metrics: { likeCount: 0, replyCount: 0, repostCount: 0, quoteCount: 0 },
  });
  await db.batch([
    db.prepare("INSERT INTO settings(key,value) VALUES('x_collection_hybrid_policy','rss_v1'),('x_collection_hybrid_activated_at',?)").bind(String(time - 12 * hour)),
    db.prepare("UPDATE x_post_sources SET regular_completed_at=? WHERE handle='member_b'").bind(time),
    db.prepare("UPDATE x_fx_sources SET cadence_anchor_at=?,rss_cadence_anchor_at=?").bind(time, time),
  ]);
  expect((await writeStoredPosts(db, "member_a", { id: "101", username: "member_a" },
    ["110", "120", "130"].map(id => makePost(id, "anchor")), time - 1000, "otw")).ok).toBe(true);
  let conflicts = 0, seeded = false;
  const paths: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.hostname === "api.cloudflare.com") {
      return Response.json({ data: { viewer: { accounts: [{ usage: [{ sum: { rowsRead: 0 } }] }] } } });
    }
    paths.push(url.pathname + url.search);
    if (url.searchParams.get("since_id") === "110") {
      if (!seeded) {
        seeded = true;
        expect((await writeStoredPosts(db, "member_a", { id: "101", username: "member_a" },
          [makePost("115", "older snapshot")], time - 1000, "otw")).ok).toBe(true);
      }
      return Response.json({ data: [{ id: "115", text: "official snapshot", created_at: new Date(time - 1000).toISOString() }] });
    }
    return Response.json({ data: [] });
  }));
  const meter = meterD1(db, 50);
  const originals = new WeakMap<object, { statement: D1PreparedStatement; sql: string }>();
  const database = new Proxy(meter.db, { get(target, key) {
    if (key === "prepare") return (sql: string) => {
      const wrap = (statement: D1PreparedStatement): D1PreparedStatement => {
        const proxy = new Proxy(statement, { get(statement, method) {
          if (method === "bind") return (...args: unknown[]) => wrap(statement.bind(...args));
          const value = Reflect.get(statement, method, statement);
          return typeof value === "function" ? value.bind(statement) : value;
        } });
        originals.set(proxy, { statement, sql });
        return proxy;
      };
      return wrap(target.prepare(sql));
    };
    if (key === "batch") return (statements: D1PreparedStatement[]) => {
      const entries = statements.map(statement => originals.get(statement)!);
      const commit = async () => {
        // The competing invocation spends its own D1 quota.
        if (conflicts < 3 && entries.some(entry => entry.sql.startsWith("UPDATE x_posts SET content_hash="))) {
          conflicts++;
          await db.prepare("UPDATE x_posts SET revision=revision+1 WHERE id='115'").run();
        }
        return target.batch(entries.map(entry => entry.statement));
      };
      return commit();
    };
    const value = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  const repo = new D1ScheduledJobRepository(db);
  const run = await repo.createRun({ jobType: "x_collection", source: "scheduled", idempotencyKey: "regular-cas-budget", scheduledFor: time });
  const [id] = await new ScheduledJobPlanner(runtime(), repo).plan(run);
  const ack = vi.fn(), retry = vi.fn(), send = vi.fn();
  await handleWorkerQueue({
    queue: "otw-ops-background", messages: [{
      body: { schemaVersion: 1, messageType: "scheduled_job_item", runId: run.id, itemId: id, phase: "collect" },
      ack, retry,
    }],
  } as unknown as MessageBatch<unknown>, {
    ...runtime(), ...siteEnv(), X_API_GATEWAY: undefined, otw_db: database,
    CLOUDFLARE_ACCOUNT_ID: "fixture", CLOUDFLARE_D1_TOKEN: "fixture",
    OTW_OPS_BACKGROUND_QUEUE: { send } as unknown as Queue<unknown>,
  });
  expect(conflicts).toBeGreaterThan(0);
  expect(meter.quotaDenials).toBe(0);
  expect(meter.bindingCalls).toBeLessThanOrEqual(50);
  expect(await db.prepare("SELECT last_seen_post_id FROM x_post_sources WHERE handle='member_a'").first("last_seen_post_id")).toBe("100");
  time += hour;
  let maxBindingCalls = Math.max(meter.bindingCalls, await deliverOfficialQueueItem({
    schemaVersion: 1, messageType: "scheduled_job_item", runId: run.id, itemId: id, phase: "collect",
  }, send));
  for (let step = 0; step < 8 && step < send.mock.calls.length; step++) {
    maxBindingCalls = Math.max(maxBindingCalls, await deliverOfficialQueueItem(send.mock.calls[step][0], send));
  }
  expect((await repo.readItem(id))?.status).toBe("succeeded");
  expect(await db.prepare("SELECT last_seen_post_id FROM x_post_sources WHERE handle='member_a'").first("last_seen_post_id")).toBe("130");
  expect(JSON.parse(String(await db.prepare("SELECT value FROM x_posts WHERE id='115'").first("value"))).text).toBe("official snapshot");
  expect(new Set(paths).size).toBe(paths.length);
  console.log("X_REGULAR_CAS_QUEUE_PROFILE", {
    conflicts, maxBindingCalls, denials: meter.quotaDenials,
    acked: ack.mock.calls.length, retried: retry.mock.calls.length, sent: send.mock.calls.length,
  });
});
