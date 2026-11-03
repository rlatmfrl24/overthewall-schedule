import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { XPostDto } from "@contracts/x-posts";
import { writeStoredPosts, xTimelineWriteContext } from "./x-api";

const bindings = env as Env & { X_REFERENCE_MIGRATIONS: D1Migration[] };
const db = bindings.otw_db;
const user = { id: "101", username: "member" };
const post: XPostDto = { id: "123", username: "member", text: "confirmed", createdAt: "2026-11-03T00:00:00Z", url: "https://x.com/member/status/123", media: [{ mediaKey: "m", type: "photo", url: "https://pbs.twimg.com/media/a.jpg", previewImageUrl: null, width: 10, height: 20, altText: null }], metrics: { likeCount: 0, replyCount: 0, repostCount: 0, quoteCount: 0 }, reply: { postId: "122", conversationId: "100", post: null } };
const complete = { text: true, media: true, relations: true };
beforeEach(async () => {
  await applyD1Migrations(db, bindings.X_REFERENCE_MIGRATIONS);
  await db.prepare("DELETE FROM x_posts").run();
});
afterEach(() => vi.restoreAllMocks());
const read = () => db.prepare("SELECT * FROM x_posts WHERE id='123'").first<{ value: string; revision: number; hidden_at: number | null }>();
it("protects official fields, no-op writes and redaction on Fx replay", async () => {
  expect((await writeStoredPosts(db, "member", user, [post], 1, "otw", { origin: "x_api", completeness: complete })).ok).toBe(true);
  const before = await read();
  const statements: string[] = [];
  const observed = { prepare(sql: string) { statements.push(sql); return db.prepare(sql); } };
  const replay = await writeStoredPosts(observed, "member", user, [{ ...post, text: "Fx", media: [], reply: null }], 2, "otw", { origin: "fxembed", completeness: complete });
  expect(replay.count).toBe(0);
  expect(statements.every(sql => /^SELECT\b/.test(sql))).toBe(true);
  expect(await read()).toEqual(before);
  await db.prepare("UPDATE x_posts SET hidden_at=3,hidden_reason='admin' WHERE id='123'").run();
  await writeStoredPosts(db, "member", user, [post], 4, "otw", { origin: "fxembed", completeness: complete });
  expect((await read())?.hidden_at).toBe(3);
});
it("does not erase acquired media when official expansion is incomplete", async () => {
  await writeStoredPosts(db, "member", user, [post], 1, "otw", { origin: "fxembed", completeness: complete });
  const response = { data: [{ id: post.id, text: "official", attachments: { media_keys: ["m"] } }] };
  await writeStoredPosts(db, "member", user, [{ ...post, text: "official", media: [] }], 2, "otw", xTimelineWriteContext(response, post.id));
  const stored = JSON.parse((await read())!.value);
  expect(stored.text).toBe("official");
  expect(stored.media).toEqual(post.media);
});
it("returns a storage failure when a revision cannot be acquired", async () => {
  await writeStoredPosts(db, "member", user, [post], 1, "otw", { origin: "fxembed", completeness: complete });
  const blocked = { prepare(sql: string) { return db.prepare(sql.startsWith("UPDATE x_posts SET value=") ? sql.replace("WHERE id=?", "WHERE 0 AND id=?") : sql); } };
  const result = await writeStoredPosts(blocked, "member", user, [{ ...post, text: "official" }], 2, "otw", { origin: "x_api", completeness: complete });
  expect(result).toMatchObject({ ok: false, error: "post_revision_conflict" });
  expect(JSON.parse((await read())!.value).text).toBe(post.text);
});
it("concurrent Fx and official updates converge to official content", async () => {
  const results = await Promise.all([
    writeStoredPosts(db, "member", user, [{ ...post, text: "Fx" }], 1, "otw", { origin: "fxembed", completeness: complete }),
    writeStoredPosts(db, "member", user, [post], 2, "otw", { origin: "x_api", completeness: complete }),
  ]);
  expect(results.some(result => result.ok)).toBe(true);
  expect(results.filter(result => !result.ok).every(result => result.error === "post_revision_conflict")).toBe(true);
  expect(JSON.parse((await read())!.value).text).toBe(post.text);
  expect(await db.prepare("SELECT content_hash FROM x_posts WHERE id='123'").first("content_hash")).toMatch(/^[a-f0-9]{64}$/);
});
it("retries incomplete secondary writes before acknowledging an identical replay", async () => {
  await db.exec("CREATE TRIGGER fail_reference BEFORE INSERT ON x_post_references WHEN NEW.source_post_id='123' BEGIN SELECT RAISE(ABORT,'reference failure'); END;");
  try {
    expect((await writeStoredPosts(db, "member", user, [post], 1, "otw")).ok).toBe(false);
    expect(await read()).not.toBeNull();
  } finally { await db.exec("DROP TRIGGER fail_reference;"); }
  expect((await writeStoredPosts(db, "member", user, [post], 2, "otw")).ok).toBe(true);
  expect(await db.prepare("SELECT referenced_post_id FROM x_post_references WHERE source_post_id='123'").first("referenced_post_id")).toBe("122");
  const statements: string[] = [];
  const observed = { prepare(sql: string) { statements.push(sql); return db.prepare(sql); } };
  expect(await writeStoredPosts(observed, "member", user, [post], 3, "otw")).toMatchObject({ ok: true, count: 0 });
  expect(statements.every(sql => /^SELECT\b/.test(sql))).toBe(true);
});

const seedRssFence = async () => {
  const until = Date.now() + 600_000;
  await db.batch([
    db.prepare("DELETE FROM x_post_facts WHERE post_id='123'"),
    db.prepare("DELETE FROM x_post_references WHERE source_post_id='123'"),
    ...[["x_collection_enabled", "true"], ["x_collection_primary_source", "fxembed"], ["x_collection_hybrid_policy", "rss_v1"], ["x_collection_hybrid_activated_at", "1"], ["x_history_analytics_enabled", "true"]].map(([key, value]) => db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)").bind(key, value)),
    db.prepare("INSERT OR REPLACE INTO members(uid,code,name,url_twitter,content_access) VALUES(1,'member','Member','https://x.com/member','normal')"),
    db.prepare("INSERT OR REPLACE INTO x_post_sources(handle,user_id,collection_started_at,last_checked_at,updated_at,lease_token,lease_until) VALUES('member','101',1,0,0,'source-lease',?)").bind(until),
    db.prepare("INSERT OR REPLACE INTO x_fx_sources(handle,collection_started_at,rss_pending_item_id,updated_at) VALUES('member',1,'rss-item',0)"),
    db.prepare("INSERT OR REPLACE INTO scheduled_job_runs(id,job_type,source,idempotency_key,status,accepted_at,created_at,updated_at) VALUES('rss-run','x_collection','scheduled','rss-run','running',0,0,0)"),
    db.prepare("INSERT OR REPLACE INTO scheduled_job_items(id,run_id,target_key,phase,lane,status,lease_token,lease_until,available_at,created_at,updated_at) VALUES('rss-item','rss-run','rss','collect','x','running','item-lease',?,0,0,0)").bind(until),
  ]);
  return { handle: "member", itemId: "rss-item", itemLeaseToken: "item-lease", sourceLeaseToken: "source-lease", members: [{ uid: 1, urlTwitter: "https://x.com/member" }] };
};

it("does not update an existing post after collection stops between the row read and SQL update", async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const fence = await seedRssFence();
  await writeStoredPosts(db, "member", user, [post], 1, "otw", { origin: "fxembed", completeness: complete });
  const before = await read(), original = db.prepare.bind(db);
  let stopped = false;
  vi.spyOn(db, "prepare").mockImplementation(sql => {
    const statement = original(sql);
    if (sql.startsWith("SELECT value,source_authority,content_hash,revision")) {
      const bind = statement.bind.bind(statement);
      statement.bind = (...values) => {
        const bound = bind(...values), first = bound.first.bind(bound);
        bound.first = (async (...args: Parameters<typeof first>) => {
          const row = await first(...args);
          if (!stopped) { stopped = true; await original("UPDATE settings SET value='false' WHERE key='x_collection_enabled'").run(); }
          return row;
        }) as typeof bound.first;
        return bound;
      };
    }
    return statement;
  });
  expect(await writeStoredPosts(db, "member", user, [{ ...post, text: "changed after stop" }], 2, "otw", { origin: "fxembed", completeness: complete }, fence)).toMatchObject({ ok: false });
  expect(await read()).toEqual(before);
  expect(warning).toHaveBeenCalledWith("Failed to write stored X posts", expect.objectContaining({ message: "post_revision_conflict" }));
});

it.each([
  ["facts", /^\s*INSERT INTO x_post_facts/], ["references", /^\s*INSERT INTO x_post_references/],
  ["reply connection", /^\s*UPDATE x_posts SET value=(?:CASE|json_set)/], ["hash acknowledgement", /^UPDATE x_posts SET content_hash=/],
] as const)("fences %s at the actual secondary mutation", async (_name, boundary) => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const fence = await seedRssFence(), original = db.prepare.bind(db);
  let stopped = false, writesAfterStop = 0;
  vi.spyOn(db, "prepare").mockImplementation(sql => {
    const statement = original(sql), bind = statement.bind.bind(statement);
    statement.bind = (...values) => {
      const bound = bind(...values), run = bound.run.bind(bound);
      bound.run = (async (...args: Parameters<typeof run>) => {
        if (!stopped && boundary.test(sql)) { stopped = true; await original("UPDATE settings SET value='false' WHERE key='x_collection_enabled'").run(); }
        const result = await run(...args);
        if (stopped) writesAfterStop += result.meta.changes;
        return result;
      }) as typeof bound.run;
      return bound;
    };
    return statement;
  });
  const replyPost: XPostDto = { ...post, reply: { ...post.reply!, targetUsername: "target" } };
  const result = await writeStoredPosts(db, "member", user, [replyPost], 2, "otw", { origin: "fxembed", completeness: complete }, fence);
  expect(stopped).toBe(true);
  expect(result.ok).toBe(false);
  expect(writesAfterStop).toBe(0);
  expect(await db.prepare("SELECT content_hash FROM x_posts WHERE id='123'").first("content_hash")).toBeNull();
  expect(warning).toHaveBeenCalledWith("Failed to write stored X posts", expect.any(Error));
});

it("checks SQL execution time when the item lease expires after INSERT preparation", async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const fence = await seedRssFence(), original = db.prepare.bind(db);
  let delayed = false;
  vi.spyOn(db, "prepare").mockImplementation(sql => {
    const statement = original(sql);
    if (sql.startsWith("INSERT INTO x_posts(id,handle")) {
      const bind = statement.bind.bind(statement);
      statement.bind = (...values) => {
        const bound = bind(...values), run = bound.run.bind(bound);
        bound.run = (async (...args: Parameters<typeof run>) => {
          if (!delayed) {
            delayed = true;
            await original("UPDATE scheduled_job_items SET lease_until=? WHERE id='rss-item'").bind(Date.now() + 30).run();
            await new Promise(resolve => setTimeout(resolve, 80));
          }
          return run(...args);
        }) as typeof bound.run;
        return bound;
      };
    }
    return statement;
  });
  expect(await writeStoredPosts(db, "member", user, [post], 2, "otw", { origin: "fxembed", completeness: complete }, fence)).toMatchObject({ ok: false });
  expect(delayed).toBe(true);
  expect(await read()).toBeNull();
  expect(warning).toHaveBeenCalledWith("Failed to write stored X posts", expect.objectContaining({ message: "post_revision_conflict" }));
});

it.each([
  ["facts", /^\s*INSERT INTO x_post_facts/, "x_post_facts"],
  ["references", /^\s*INSERT INTO x_post_references/, "x_post_references"],
  ["reply connection", /^\s*UPDATE x_posts SET value=(?:CASE|json_set)/, "x_post_references"],
] as const)("keeps a transiently blocked %s write incomplete until successful replay", async (_name, boundary, table) => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const fence = await seedRssFence(), original = db.prepare.bind(db);
  let blocked = false, hashAttempted = false;
  const prepare = vi.spyOn(db, "prepare").mockImplementation(sql => {
    const statement = original(sql), bind = statement.bind.bind(statement);
    statement.bind = (...values) => {
      const bound = bind(...values), run = bound.run.bind(bound);
      bound.run = (async (...args: Parameters<typeof run>) => {
        if (sql.startsWith("UPDATE x_posts SET content_hash=")) hashAttempted = true;
        if (blocked || !boundary.test(sql)) return run(...args);
        blocked = true;
        await original("UPDATE settings SET value='false' WHERE key='x_collection_enabled'").run();
        try { return await run(...args); }
        finally { await original("UPDATE settings SET value='true' WHERE key='x_collection_enabled'").run(); }
      }) as typeof bound.run;
      return bound;
    };
    return statement;
  });
  const incoming: XPostDto = { ...post, reply: { ...post.reply!, targetUsername: "target" } };
  expect(await writeStoredPosts(db, "member", user, [incoming], 2, "otw", { origin: "fxembed", completeness: complete }, fence)).toMatchObject({ ok: false });
  expect(blocked).toBe(true);
  expect(hashAttempted).toBe(false);
  expect(await db.prepare("SELECT value FROM settings WHERE key='x_collection_enabled'").first("value")).toBe("true");
  expect(await db.prepare(`SELECT count(*) n FROM ${table}`).first("n")).toBe(0);
  expect(await db.prepare("SELECT content_hash FROM x_posts WHERE id='123'").first("content_hash")).toBeNull();
  expect(warning).toHaveBeenCalledWith("Failed to write stored X posts", expect.any(Error));
  prepare.mockRestore();
  expect(await writeStoredPosts(db, "member", user, [incoming], 3, "otw", { origin: "fxembed", completeness: complete }, fence)).toMatchObject({ ok: true });
  expect(await db.prepare("SELECT count(*) n FROM x_post_facts").first("n")).toBe(1);
  expect(await db.prepare("SELECT referenced_post_id FROM x_post_references WHERE source_post_id='123'").first("referenced_post_id")).toBe("122");
  expect(await db.prepare("SELECT content_hash FROM x_posts WHERE id='123'").first("content_hash")).toMatch(/^[a-f0-9]{64}$/);
});

it("keeps analytics-disabled RSS writes complete without requiring facts", async () => {
  const fence = await seedRssFence();
  await db.prepare("UPDATE settings SET value='false' WHERE key='x_history_analytics_enabled'").run();
  expect(await writeStoredPosts(db, "member", user, [post], 2, "otw", { origin: "fxembed", completeness: complete }, fence)).toMatchObject({ ok: true });
  expect(await db.prepare("SELECT count(*) n FROM x_post_facts").first("n")).toBe(0);
  expect(await db.prepare("SELECT referenced_post_id FROM x_post_references WHERE source_post_id='123'").first("referenced_post_id")).toBe("122");
  expect(await db.prepare("SELECT content_hash FROM x_posts WHERE id='123'").first("content_hash")).toMatch(/^[a-f0-9]{64}$/);
});

it.each([
  ["facts", /^\s*INSERT INTO x_post_facts/], ["references", /^\s*INSERT INTO x_post_references/],
  ["reply connection", /^\s*UPDATE x_posts SET value=(?:CASE|json_set)/],
] as const)("preserves legitimate zero-row %s writes for a concurrently hidden post", async (_name, boundary) => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const fence = await seedRssFence(), original = db.prepare.bind(db);
  let hidden = false;
  vi.spyOn(db, "prepare").mockImplementation(sql => {
    const statement = original(sql), bind = statement.bind.bind(statement);
    statement.bind = (...values) => {
      const bound = bind(...values), run = bound.run.bind(bound);
      bound.run = (async (...args: Parameters<typeof run>) => {
        if (!hidden && boundary.test(sql)) {
          hidden = true;
          await original("UPDATE x_posts SET hidden_at=3 WHERE id='123'").run();
          await original("UPDATE settings SET value='false' WHERE key='x_collection_enabled'").run();
        }
        return run(...args);
      }) as typeof bound.run;
      return bound;
    };
    return statement;
  });
  const incoming: XPostDto = { ...post, reply: { ...post.reply!, targetUsername: "target" } };
  expect(await writeStoredPosts(db, "member", user, [incoming], 2, "otw", { origin: "fxembed", completeness: complete }, fence)).toMatchObject({ ok: true });
  expect(hidden).toBe(true);
  expect((await read())!.hidden_at).toBe(3);
  expect(await db.prepare("SELECT count(*) n FROM x_post_references").first("n")).toBe(0);
  expect(warning).not.toHaveBeenCalled();
});
