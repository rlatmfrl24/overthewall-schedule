import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { XPostDto } from "@contracts/x-posts";
import { writeStoredPosts, xTimelineWriteContext } from "./x-api";
import { xPostContentKey } from "../domain/merge-x-post";
import { meterD1 } from "../../../test-support/d1-meter";
import { filterArchivedXReferences } from "./x-reference-store";

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
const privatePreview = { id: "122", text: "private preview body", createdAt: post.createdAt, url: "https://x.com/private_member/status/122", username: "private_member", name: null, profileImageUrl: null, metrics: post.metrics, media: [] };
const referencing = (relation: "quote" | "reply" | "link"): XPostDto => ({ ...post, reply: null,
  ...(relation === "quote" ? { quote: { postId: "122", post: privatePreview } } : relation === "reply" ? { reply: { postId: "122", conversationId: null, post: privatePreview } }
    : { links: [{ url: privatePreview.url, expandedUrl: privatePreview.url, displayUrl: "private", linkedPost: privatePreview, title: "private title", description: "private description", imageUrl: "https://example.com/private.png", siteName: "Private", previewStatus: "ready" as const }] }),
});
const seedPrivateTarget = async (mode = "normal") => {
  await db.prepare("INSERT OR REPLACE INTO members(uid,code,name,url_twitter,content_access) VALUES(9901,?,'Private','https://x.com/private_member','normal')")
    .bind(mode === "publication" ? "bing_hayu" : "private").run();
  await db.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,fetched_at,content_access,hidden_at,content_removed_at) VALUES('122','private_member','private_member',?,?,1,?,?,?)")
    .bind(JSON.stringify({ ...post, id: "122", username: "private_member", reply: null }), post.createdAt, mode === "archive" ? "admin_archive" : "normal", mode === "hidden" ? 3 : null, mode === "removed" ? 3 : null).run();
  if (mode === "terminal") await db.prepare("INSERT INTO x_post_references(source_post_id,relation_type,referenced_post_id,resolution_state,created_at,updated_at) VALUES('122','quote','122','terminal',1,1)").run();
};
it("treats raw protected Fx replays as one-call no-ops but commits authority upgrades and NULL hash repairs", async () => {
  await seedPrivateTarget("archive");
  const raw = referencing("quote"), fx = { origin: "fxembed" as const, completeness: complete };
  expect(await writeStoredPosts(db, "member", user, [raw], 1, "otw", fx)).toMatchObject({ ok: true, count: 1 });
  const before = await read(), noop = meterD1(db);
  expect(await writeStoredPosts(noop.db, "member", user, [raw], 2, "otw", fx)).toMatchObject({ ok: true, count: 0, insertedIds: [] });
  expect(noop.bindingCalls).toBe(1);
  expect(await read()).toEqual(before);
  const upgrade = meterD1(db);
  expect(await writeStoredPosts(upgrade.db, "member", user, [raw], 3, "otw")).toMatchObject({ ok: true, count: 1, insertedIds: [] });
  expect(upgrade.bindingCalls).toBe(2);
  expect(JSON.parse((await db.prepare("SELECT source_authority FROM x_posts WHERE id='123'").first<string>("source_authority"))!)).toEqual({ text: "x_api", media: "x_api", relations: "x_api" });
  await db.prepare("UPDATE x_posts SET content_hash=NULL WHERE id='123'").run();
  const revision = (await read())!.revision, repair = meterD1(db);
  expect(await writeStoredPosts(repair.db, "member", user, [raw], 4, "otw")).toMatchObject({ ok: true, count: 1, insertedIds: [] });
  expect(repair.bindingCalls).toBe(2);
  expect((await read())!.revision).toBe(revision);
  expect(await db.prepare("SELECT content_hash FROM x_posts WHERE id='123'").first("content_hash")).toMatch(/^[a-f0-9]{64}$/);
});
it("does not reinterpret an explicit protected Fx relation change as omission preserving the old public target", async () => {
  const fx = { origin: "fxembed" as const, completeness: complete };
  const old = { ...referencing("quote"), quote: { postId: "121", post: { ...privatePreview, id: "121", username: "public_target", text: "old public target" } } };
  expect(await writeStoredPosts(db, "member", user, [old], 1, "otw", fx)).toMatchObject({ ok: true });
  await seedPrivateTarget("archive");
  expect(await writeStoredPosts(db, "member", user, [referencing("quote")], 2, "otw", fx)).toMatchObject({ ok: true, count: 1 });
  expect(JSON.parse((await read())!.value).quote).toBeUndefined();
});
it.each(["archive", "publication", "hidden", "removed", "terminal"].flatMap(mode => (["quote", "reply", "link"] as const).map(relation => ({ mode, relation }))))("stores the public root while sanitizing $mode $relation context in two calls", async ({ mode, relation }) => {
  await seedPrivateTarget(mode);
  const measured = meterD1(db);
  expect(await writeStoredPosts(measured.db, "member", user, [referencing(relation)], 2, "otw")).toMatchObject({ ok: true, count: 1, insertedIds: [post.id] });
  expect(measured.bindingCalls).toBe(2);
  const saved = JSON.parse((await read())!.value) as XPostDto;
  expect(saved.text).toBe(post.text);
  expect(JSON.stringify(saved)).not.toContain("private preview body");
  if (mode === "archive" || mode === "publication") {
    if (relation === "link") expect(saved.links).toEqual([]);
    else expect(saved[relation]).toBeUndefined();
    expect(await filterArchivedXReferences(db, [saved], "otw")).toEqual([saved]);
  } else if (relation === "link") expect(saved.links).toEqual([{ url: privatePreview.url, expandedUrl: privatePreview.url, displayUrl: "private" }]);
  else expect(saved[relation]).toMatchObject({ postId: "122", post: null });
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(xPostContentKey(saved))))].map(byte => byte.toString(16).padStart(2, "0")).join("");
  expect(await db.prepare("SELECT content_hash FROM x_posts WHERE id='123'").first("content_hash")).toBe(hash);
});
it.each([1, 5])("atomically stores %i related roots in two D1 calls", async count => {
  const calls: string[] = [];
  const observed = {
    batch: async (statements: D1PreparedStatement[]) => { calls.push("batch"); return db.batch(statements); },
    prepare(sql: string) {
      const statement = db.prepare(sql), bind = statement.bind.bind(statement);
      statement.bind = (...values) => {
        const bound = bind(...values);
        for (const method of ["first", "all", "run"] as const) {
          const original = bound[method].bind(bound);
          Object.assign(bound, { [method]: (...args: unknown[]) => { calls.push(method); return Reflect.apply(original, bound, args); } });
        }
        return bound;
      };
      return statement;
    },
  };
  const roots = Array.from({ length: count }, (_, i) => ({ ...post, id: String(123 + i) }));
  expect(await writeStoredPosts(observed, "member", user, roots, 1, "otw")).toMatchObject({ ok: true, count, insertedIds: roots.map(p => p.id) });
  expect(calls).toEqual(["batch", "batch"]);
  expect(await db.prepare("SELECT count(*) n FROM x_posts WHERE content_hash IS NOT NULL").first("n")).toBe(count);
  expect(await db.prepare("SELECT count(*) n FROM x_post_references").first("n")).toBe(count);
});
it("rolls back roots and INSERT evidence if a derived write fails", async () => {
  await db.exec("CREATE TRIGGER fail_atomic_reference BEFORE INSERT ON x_post_references BEGIN SELECT RAISE(ABORT,'reference failure'); END;");
  try {
    expect(await writeStoredPosts(db, "member", user, [post], 1, "otw")).toMatchObject({ ok: false, insertedIds: [] });
    expect(await db.prepare("SELECT count(*) n FROM x_posts").first("n")).toBe(0);
  } finally { await db.exec("DROP TRIGGER fail_atomic_reference;"); }
});
it("merges repeated IDs in one response without losing the INSERT or later authority", async () => {
  expect(await writeStoredPosts(db, "member", user, [post, { ...post, text: "later version" }], 1, "otw")).toMatchObject({ ok: true, insertedIds: [post.id] });
  expect(JSON.parse((await db.prepare("SELECT value FROM x_posts WHERE id=?").bind(post.id).first<string>("value"))!).text).toBe("later version");
});
const read = () => db.prepare("SELECT * FROM x_posts WHERE id='123'").first<{ value: string; revision: number; hidden_at: number | null }>();
it.each(["quote", "reply"] as const)("keeps a known Fx %s and preview on omitted replay without rewriting the row", async relation => {
  const preview = { id: "122", text: "known parent", createdAt: null, url: "https://x.com/member/status/122", username: "member", name: null, profileImageUrl: null, metrics: post.metrics, media: [] };
  const known = { ...post, [relation]: { postId: "122", post: preview } };
  await writeStoredPosts(db, "member", user, [known], 1, "otw", { origin: "fxembed", completeness: complete });
  const before = await read();
  expect(await writeStoredPosts(db, "member", user, [{ ...known, [relation]: null }], 2, "otw", { origin: "fxembed", completeness: complete })).toMatchObject({ ok: true, count: 0 });
  expect(await read()).toEqual(before);
  await writeStoredPosts(db, "member", user, [{ ...known, [relation]: null }], 3, "otw", { origin: "x_api", completeness: complete });
  expect(JSON.parse((await read())!.value)[relation]).toBeNull();
});
it("protects official fields, no-op writes and redaction on Fx replay", async () => {
  expect((await writeStoredPosts(db, "member", user, [post], 1, "otw", { origin: "x_api", completeness: complete })).ok).toBe(true);
  const before = await read();
  const statements: string[] = [];
  const observed = { batch: db.batch.bind(db), prepare(sql: string) { statements.push(sql); return db.prepare(sql); } };
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
  const blocked = { batch: db.batch.bind(db), prepare(sql: string) { return db.prepare(sql.startsWith("UPDATE x_posts SET value=") ? sql.replace("WHERE id=?", "WHERE 0 AND id=?") : sql); } };
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
    expect(await read()).toBeNull();
  } finally { await db.exec("DROP TRIGGER fail_reference;"); }
  expect((await writeStoredPosts(db, "member", user, [post], 2, "otw")).ok).toBe(true);
  expect(await db.prepare("SELECT referenced_post_id FROM x_post_references WHERE source_post_id='123'").first("referenced_post_id")).toBe("122");
  const statements: string[] = [];
  const observed = { batch: db.batch.bind(db), prepare(sql: string) { statements.push(sql); return db.prepare(sql); } };
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

// External mutations can interleave between the two batches, never inside a D1 transaction.
const beforeCommit = (change: () => Promise<unknown>) => {
  const original = db.batch.bind(db);
  let calls = 0;
  return vi.spyOn(db, "batch").mockImplementation(async statements => {
    calls++;
    if (calls === 2) await change();
    return original(statements);
  });
};
it.each(["quote", "reply", "link"] as const)("sanitizes an unchanged official %s retained by an incomplete Fx replay", async relation => {
  await seedPrivateTarget();
  await writeStoredPosts(db, "member", user, [referencing(relation)], 1, "otw");
  await db.prepare("UPDATE x_posts SET content_access='admin_archive' WHERE id='122'").run();
  const measured = meterD1(db);
  expect(await writeStoredPosts(measured.db, "member", user, [{ ...post, text: "ignored Fx" }], 2, "otw", { origin: "fxembed", completeness: { text: true, media: true, relations: false } })).toMatchObject({ ok: true, count: 1, insertedIds: [] });
  expect(measured.bindingCalls).toBe(2);
  const saved = JSON.parse((await read())!.value) as XPostDto;
  expect(saved.text).toBe(post.text);
  expect(JSON.stringify(saved)).not.toContain("private preview body");
  expect(JSON.parse((await db.prepare("SELECT source_authority FROM x_posts WHERE id='123'").first<string>("source_authority"))!).relations).toBe("x_api");
  const noop = meterD1(db);
  expect(await writeStoredPosts(noop.db, "member", user, [saved], 3, "otw")).toMatchObject({ ok: true, count: 0, insertedIds: [] });
  expect(noop.bindingCalls).toBe(1);
});
it.each(["archive", "hidden"])("re-reads a %s transition before commit and stores the public root with safe context", async mode => {
  await seedPrivateTarget();
  beforeCommit(() => db.prepare(mode === "archive" ? "UPDATE x_posts SET content_access='admin_archive' WHERE id='122'" : "UPDATE x_posts SET hidden_at=3 WHERE id='122'").run());
  expect(await writeStoredPosts(db, "member", user, [referencing("reply")], 2, "otw")).toMatchObject({ ok: true, insertedIds: [post.id] });
  const saved = JSON.parse((await read())!.value);
  if (mode === "archive") expect(saved.reply).toBeUndefined();
  else expect(saved.reply).toMatchObject({ postId: "122", post: null });
});
it("sanitizes a reply whose archived author is learned while connecting snapshot context", async () => {
  await db.prepare("INSERT OR REPLACE INTO members(uid,code,name,url_twitter,content_access) VALUES(9901,'private','Private','https://x.com/private_member','admin_archive')").run();
  await db.prepare("INSERT OR REPLACE INTO x_post_sources(handle,user_id,username,last_checked_at,updated_at) VALUES('private_member','999','private_member',0,0)").run();
  const incoming: XPostDto = { ...post, reply: { ...post.reply!, inReplyToUserId: "999" } };
  expect(await writeStoredPosts(db, "member", user, [incoming], 1, "otw")).toMatchObject({ ok: true, insertedIds: [post.id] });
  expect(JSON.parse((await read())!.value).reply).toBeUndefined();
});

it.each([false, true])("uses one snapshot for a complete unchanged or protected root: protected=%s", async protectedPost => {
  await writeStoredPosts(db, "member", user, [post], 1, "otw");
  if (protectedPost) await db.prepare("UPDATE x_posts SET hidden_at=3 WHERE id='123'").run();
  const before = await read(), measured = meterD1(db);
  expect(await writeStoredPosts(measured.db, "member", user, [post], 2, "otw")).toMatchObject({ ok: true, count: 0, insertedIds: [] });
  expect(measured.bindingCalls).toBe(1);
  expect(measured.summary().rowsWritten).toBe(0);
  expect(await read()).toEqual(before);
});

it("rejects turnover of the trusted Fx fallback identity before atomic commit", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const fence = await seedRssFence();
  await db.batch([db.prepare("UPDATE x_post_sources SET user_id=NULL"), db.prepare("UPDATE x_fx_sources SET user_id='101'")]);
  let changed = false;
  beforeCommit(async () => { changed = true; await db.prepare("UPDATE x_fx_sources SET user_id='999'").run(); });
  expect(await writeStoredPosts(db, "member", user, [post], 2, "otw", { origin: "fxembed", completeness: complete }, fence)).toMatchObject({ ok: false, error: "post_author_mismatch", insertedIds: [] });
  expect(changed).toBe(true);
  expect(await read()).toBeNull();
});

it("retains official identity precedence over the Fx fallback", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const fence = await seedRssFence();
  await db.prepare("UPDATE x_fx_sources SET user_id='999'").run();
  expect(await writeStoredPosts(db, "member", user, [post], 2, "otw", { origin: "fxembed", completeness: complete }, fence)).toMatchObject({ ok: true, insertedIds: [post.id] });
  expect(await writeStoredPosts(db, "member", { id: "999", username: "member" }, [{ ...post, id: "124" }], 3, "otw", { origin: "fxembed", completeness: complete }, fence)).toMatchObject({ ok: false, error: "post_author_mismatch", insertedIds: [] });
  expect(await db.prepare("SELECT id FROM x_posts WHERE id='124'").first()).toBeNull();
});

it.each([
  ["collection stop", "UPDATE settings SET value='false' WHERE key='x_collection_enabled'"],
  ["identity change", "UPDATE x_post_sources SET user_id='999' WHERE handle='member'"],
  ["member change", "UPDATE members SET url_twitter='https://x.com/another' WHERE uid=1"],
  ["item expiry", "UPDATE scheduled_job_items SET lease_until=0 WHERE id='rss-item'"],
  ["source expiry", "UPDATE x_post_sources SET lease_until=0 WHERE handle='member'"],
  ["invalid activation", "UPDATE settings SET value='1e999' WHERE key='x_collection_hybrid_activated_at'"],
])("rejects %s between snapshot and commit", async (_name, sql) => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const fence = await seedRssFence();
  await writeStoredPosts(db, "member", user, [post], 1, "otw");
  const before = await read();
  beforeCommit(() => db.prepare(sql).run());
  expect(await writeStoredPosts(db, "member", user, [{ ...post, text: "changed" }], 2, "otw", { origin: "x_api", completeness: complete }, fence)).toMatchObject({ ok: false, insertedIds: [] });
  expect(await read()).toEqual(before);
});

it.each([
  ["facts", "BEFORE INSERT ON x_post_facts"],
  ["references", "BEFORE INSERT ON x_post_references"],
  ["hash acknowledgement", "BEFORE UPDATE OF content_hash ON x_posts WHEN NEW.content_hash IS NOT NULL"],
])("rolls back every derived write after a %s failure and replays successfully", async (_name, trigger) => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const fence = await seedRssFence();
  await db.exec(`CREATE TRIGGER atomic_failure ${trigger} BEGIN SELECT RAISE(ABORT,'derived failure'); END;`);
  try {
    expect(await writeStoredPosts(db, "member", user, [post], 2, "otw", { origin: "fxembed", completeness: complete }, fence)).toMatchObject({ ok: false, insertedIds: [] });
    expect(await read()).toBeNull();
    expect(await db.prepare("SELECT count(*) n FROM x_post_facts").first("n")).toBe(0);
    expect(await db.prepare("SELECT count(*) n FROM x_post_references").first("n")).toBe(0);
  } finally { await db.exec("DROP TRIGGER atomic_failure;"); }
  expect(await writeStoredPosts(db, "member", user, [post], 3, "otw", { origin: "fxembed", completeness: complete }, fence)).toMatchObject({ ok: true, insertedIds: ["123"] });
  expect(await db.prepare("SELECT count(*) n FROM x_post_facts").first("n")).toBe(1);
  expect(await db.prepare("SELECT referenced_post_id FROM x_post_references WHERE source_post_id='123'").first("referenced_post_id")).toBe("122");
  expect(await db.prepare("SELECT content_hash FROM x_posts WHERE id='123'").first("content_hash")).toMatch(/^[a-f0-9]{64}$/);
});

it("repairs pre-existing hash-NULL partial rows without claiming an INSERT", async () => {
  await seedRssFence();
  await writeStoredPosts(db, "member", user, [post], 1, "otw");
  await db.batch([db.prepare("UPDATE x_posts SET content_hash=NULL WHERE id='123'"), db.prepare("DELETE FROM x_post_facts WHERE post_id='123'"), db.prepare("DELETE FROM x_post_references WHERE source_post_id='123'")]);
  const before = await read();
  const measured = meterD1(db);
  expect(await writeStoredPosts(measured.db, "member", user, [post], 2, "otw")).toMatchObject({ ok: true, count: 1, insertedIds: [] });
  expect(measured.bindingCalls).toBe(2);
  expect((await read())!.revision).toBe(before!.revision);
  expect(await db.prepare("SELECT count(*) n FROM x_post_facts").first("n")).toBe(1);
  expect(await db.prepare("SELECT referenced_post_id FROM x_post_references WHERE source_post_id='123'").first("referenced_post_id")).toBe("122");
});

it("keeps analytics-disabled RSS writes complete without requiring facts", async () => {
  const fence = await seedRssFence();
  await db.prepare("UPDATE settings SET value='false' WHERE key='x_history_analytics_enabled'").run();
  expect(await writeStoredPosts(db, "member", user, [post], 2, "otw", { origin: "fxembed", completeness: complete }, fence)).toMatchObject({ ok: true });
  expect(await db.prepare("SELECT count(*) n FROM x_post_facts").first("n")).toBe(0);
  expect(await db.prepare("SELECT referenced_post_id FROM x_post_references WHERE source_post_id='123'").first("referenced_post_id")).toBe("122");
});

it("skips a root hidden between snapshot and commit without restoring its content", async () => {
  await seedRssFence();
  await writeStoredPosts(db, "member", user, [post], 1, "otw");
  beforeCommit(() => db.prepare("UPDATE x_posts SET hidden_at=3 WHERE id='123'").run());
  expect(await writeStoredPosts(db, "member", user, [{ ...post, text: "new" }], 2, "otw")).toMatchObject({ ok: true, count: 0, insertedIds: [] });
  expect((await read())!.hidden_at).toBe(3);
  expect(JSON.parse((await read())!.value).text).toBe(post.text);
});

it("does not claim a concurrent identical winner's INSERT or incomplete acknowledgement", async () => {
  let winner: Awaited<ReturnType<typeof writeStoredPosts>> | undefined;
  const hook = beforeCommit(async () => {
    hook.mockRestore();
    winner = await writeStoredPosts(db, "member", user, [post], 1, "otw");
    await db.prepare("UPDATE x_posts SET content_hash=NULL WHERE id='123'").run();
  });
  expect(await writeStoredPosts(db, "member", user, [post], 2, "otw")).toMatchObject({ ok: true, count: 1, insertedIds: [] });
  expect(winner).toMatchObject({ ok: true, insertedIds: ["123"] });
  expect(await db.prepare("SELECT content_hash FROM x_posts WHERE id='123'").first("content_hash")).toMatch(/^[a-f0-9]{64}$/);
});

it("re-reads a target hidden after snapshot and leaves the reply link-only", async () => {
  await writeStoredPosts(db, "member", user, [{ ...post, id: "122", reply: null }], 1, "otw");
  beforeCommit(() => db.prepare("UPDATE x_posts SET hidden_at=3 WHERE id='122'").run());
  expect(await writeStoredPosts(db, "member", user, [post], 2, "otw")).toMatchObject({ ok: true });
  expect(JSON.parse((await read())!.value).reply.post).toBeNull();
});

it("snapshots preserved old relations and hashes the exact connected final value", async () => {
  await writeStoredPosts(db, "member", user, [post], 1, "otw", { origin: "fxembed", completeness: complete });
  await writeStoredPosts(db, "member", user, [{ ...post, id: "122", reply: null }], 1, "otw");
  expect(await writeStoredPosts(db, "member", user, [{ ...post, text: "changed", reply: null }], 2, "otw", { origin: "fxembed", completeness: complete })).toMatchObject({ ok: true });
  const row = (await read())!;
  expect(JSON.parse(row.value).reply.post.text).toBe(post.text);
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(xPostContentKey(JSON.parse(row.value)))))].map(byte => byte.toString(16).padStart(2, "0")).join("");
  expect(await db.prepare("SELECT content_hash FROM x_posts WHERE id='123'").first("content_hash")).toBe(hash);
});

it("bounds snapshot reads by root and relation IDs despite unrelated history", async () => {
  const measured = meterD1(db);
  expect(await writeStoredPosts(measured.db, "member", user, [post], 1, "otw")).toMatchObject({ ok: true });
  expect(measured.bindingCalls).toBe(2);
  const selectors = measured.entries.filter(entry => entry.sql.startsWith("SELECT json_group_array"));
  expect(selectors).toHaveLength(7);
  const before = await Promise.all(selectors.map(entry => db.prepare(entry.sql).bind(...entry.args).all()));
  await db.batch([
    db.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<2000) INSERT INTO x_posts(id,handle,username,value,created_at,fetched_at) SELECT 'unrelated-'||x,'unrelated','unrelated','{}',0,0 FROM n"),
    db.prepare("INSERT INTO x_post_references(source_post_id,relation_type,referenced_post_id,resolution_state,created_at,updated_at) SELECT id,'quote',id,'terminal',0,0 FROM x_posts WHERE handle='unrelated'"),
    db.prepare("INSERT INTO x_api_cache(key,type,value,fetched_at,expires_at) SELECT 'x:linked-post:v1:'||id,'linked_post','{}',0,9999999999999 FROM x_posts WHERE handle='unrelated'"),
  ]);
  for (const [index, entry] of selectors.entries()) {
    const after = await db.prepare(entry.sql).bind(...entry.args).all();
    expect(after.results).toEqual(before[index].results);
    expect(after.meta.rows_read).toBeLessThanOrEqual(before[index].meta.rows_read + 2);
    console.log("SNAPSHOT_READ", index, before[index].meta.rows_read, after.meta.rows_read);
    if (index < 4) {
      const plan = await db.prepare(`EXPLAIN QUERY PLAN ${entry.sql}`).bind(...entry.args).all<{ detail: string }>();
      expect(plan.results.map(row => row.detail).join(" ")).toMatch(/SEARCH (?:p|x_posts) USING INDEX sqlite_autoindex_x_posts_1/);
    }
  }
  const stages: Record<string, { statements: number; rowsRead: number; rowsWritten: number }> = {};
  for (const entry of measured.entries) {
    const key = entry.sql.startsWith("SELECT json_group_array") ? "snapshot" : entry.sql.includes("THEN 1 ELSE") ? "assertions" : "mutations";
    const stage = stages[key] ??= { statements: 0, rowsRead: 0, rowsWritten: 0 };
    stage.statements++;
    stage.rowsRead += entry.rowsRead;
    stage.rowsWritten += entry.rowsWritten;
  }
  console.log("ATOMIC_WRITER_PROFILE", JSON.stringify({ ...measured.summary(), bindingCalls: measured.bindingCalls, snapshotReads: before.map(result => result.meta.rows_read), stages }));
});
