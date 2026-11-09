import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { afterEach, expect, it, vi } from "vitest";
import { handleWorkerQueue } from "../../../app/worker-queue";
import { D1ScheduledJobRepository } from "../../../platform/scheduled-jobs";
import { meterD1 } from "../../../test-support/d1-meter";
import { siteEnv } from "../../../test-support/site-env";

const bindings = env as Env & {
  X_REFERENCE_MIGRATIONS: D1Migration[];
  SCHEDULED_OPERATIONS_MIGRATIONS: D1Migration[];
};
const db = bindings.otw_db;

afterEach(() => vi.unstubAllGlobals());

it("completes a multi-account Fx run within Free D1 limits and fills reply previews on replay", async () => {
  await applyD1Migrations(db, bindings.X_REFERENCE_MIGRATIONS);
  await applyD1Migrations(db, bindings.SCHEDULED_OPERATIONS_MIGRATIONS);
  const handles = ["member_a", "member_b", "member_c", "member_d"];
  await db.batch([
    db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('x_collection_enabled','true')"),
    ...handles.flatMap((handle, index) => [
      db.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(?,?,?,?)").bind(index + 1, handle, handle, "https://x.com/" + handle),
      db.prepare("INSERT INTO x_post_sources(handle,user_id,last_checked_at,updated_at,collection_started_at) VALUES(?,?,0,0,1)").bind(handle, String(index + 101)),
    ]),
  ]);
  const createdAt = new Date().toUTCString();
  const post = (id: string, authorId: string, handle: string) => ({
    type: "status", id, text: id, author: { id: authorId, screen_name: handle, protected: false },
    created_at: createdAt, media: {},
  });
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const url = new URL(input);
    expect(url.hostname).toBe("api.fxtwitter.com");
    if (url.pathname.startsWith("/2/status/")) {
      return Response.json({ code: 200, status: post(url.pathname.split("/").at(-1)!, "900", "original") });
    }
    const author = url.pathname.match(/id:(\d+)/)![1];
    const account = Number(author) - 101;
    const page = Number(url.searchParams.get("cursor") ?? 1);
    return Response.json({
      code: 200,
      results: [{
        ...post(String(1000 + account * 100 + page), author, handles[account]),
        ...(page === 1 ? { replying_to: { status: String(9000 + account), screen_name: "original" } } : {}),
      }],
      cursor: { bottom: page < 4 ? String(page + 1) : null },
    });
  }));
  const deliveries: unknown[] = [];
  const runtime = {
    ...bindings, ...siteEnv(),
    OTW_OPS_BACKGROUND_QUEUE: { send: async (body: unknown) => { deliveries.push(body); } } as unknown as Queue<unknown>,
  };
  const repo = new D1ScheduledJobRepository(db);
  async function deliver(queue: string, body: unknown) {
    const meter = meterD1(db, 50);
    const ack = vi.fn(), retry = vi.fn();
    await handleWorkerQueue({ queue, messages: [{ body, ack, retry }] } as unknown as MessageBatch<unknown>, {
      ...runtime, otw_db: meter.db,
    });
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
    expect(meter.quotaDenials).toBe(0);
    return meter.bindingCalls;
  }
  async function collect(key: string, stored: number) {
    const run = await repo.createRun({ jobType: "x_collection", source: "manual", idempotencyKey: key, initialSummary: { xCollectionProvider: "fxembed" } });
    await deliver("otw-ops-control", { schemaVersion: 1, messageType: "scheduled_job_control", runId: run.id });
    expect(deliveries.length).toBeGreaterThan(0);
    const calls: number[] = [];
    while (deliveries.length) calls.push(await deliver("otw-ops-background", deliveries.shift()));
    const completed = await repo.readRun(run.id);
    expect(completed).toMatchObject({ status: "succeeded", finished_at: expect.any(Number) });
    const items = await db.prepare("SELECT status,result_json,finished_at,lease_token,lease_until FROM scheduled_job_items WHERE run_id=?").bind(run.id).all<{ result_json: string }>();
    expect(items.results).toHaveLength(2);
    for (const item of items.results) {
      expect(item).toMatchObject({ status: "succeeded", finished_at: expect.any(Number), lease_token: null, lease_until: null });
    }
    expect(items.results.reduce((total, item) => total + JSON.parse(item.result_json).postsStored, 0)).toBe(stored);
    expect(await db.prepare("SELECT count(*) AS count FROM scheduled_outbox WHERE run_id=? AND event_type='reconcile' AND reconciled_at IS NOT NULL").bind(run.id).first("count")).toBe(2);
    expect(await db.prepare("SELECT count(*) AS count FROM x_post_sources WHERE lease_token IS NOT NULL OR lease_until IS NOT NULL").first("count")).toBe(0);
    return calls;
  }
  const first = await collect("fx-with-replies", 16);
  expect(await db.prepare("SELECT count(*) AS count FROM x_fx_sources WHERE last_completed_at IS NOT NULL AND cursor IS NULL AND last_error IS NULL").first("count")).toBe(4);
  expect(await db.prepare("SELECT count(*) AS count FROM x_post_references WHERE relation_type='reply' AND resolution_state='hydrated'").first("count")).toBe(2);
  const replay = await collect("fx-with-replies-replay", 0);
  expect(await db.prepare("SELECT count(*) AS count FROM x_post_references WHERE relation_type='reply' AND resolution_state='hydrated'").first("count")).toBe(4);
  expect(await db.prepare("SELECT count(*) AS count FROM x_posts WHERE json_extract(value,'$.reply.post.id') IS NOT NULL").first("count")).toBe(4);
  console.log("FX_QUEUE_D1_PROFILE", { first, replay });
});
