import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { beforeEach, expect, it } from "vitest";
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
