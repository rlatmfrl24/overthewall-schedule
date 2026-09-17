import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { XPostDto } from "@contracts/x-posts";
import { GetMemberPosts } from "../application/get-member-posts";
import { D1MemberPostsPort } from "./d1-member-posts-port";
import { xPostFeedService } from "../../x-posts";
import { readStoredNaverCafePostsForSources } from "../../naver-cafe";
import type { Env } from "../../../platform/types";

const testEnv = env as unknown as Env & { X_REFERENCE_MIGRATIONS: D1Migration[]; MEMBER_POSTS_CAFE_MIGRATIONS: D1Migration[] };
const db = testEnv.otw_db;
const date = "2026-09-17T00:00:00.000Z";
const configs = { x: { visibility: "public" as const, richLinkPreviewEnabled: false }, naverCafe: { visibility: "public" as const, enabled: true } };
const statements: string[] = [];
const measured = new Proxy(db, { get(target, key) {
  if (key === "prepare") return (sql: string) => { statements.push(sql); return target.prepare(sql); };
  const value = Reflect.get(target, key, target);
  return typeof value === "function" ? value.bind(target) : value;
} });
const port = new D1MemberPostsPort({ ...testEnv, otw_db: measured }, xPostFeedService, readStoredNaverCafePostsForSources);
const app = new GetMemberPosts(port);
beforeEach(async () => {
  await applyD1Migrations(db, testEnv.X_REFERENCE_MIGRATIONS);
  await applyD1Migrations(db, testEnv.MEMBER_POSTS_CAFE_MIGRATIONS);
  await db.batch([db.prepare("DELETE FROM x_posts"), db.prepare("DELETE FROM naver_cafe_posts"), db.prepare("DELETE FROM naver_cafe_sources")]);
  await db.prepare("INSERT INTO naver_cafe_sources(id,name,cafe_id,menu_id,cafe_url,member_uid,enabled,sort_order) VALUES(1,'member','1','1','https://cafe.naver.com',2,1,0)").run();
  vi.spyOn(port, "listActiveMembers").mockResolvedValue([{
    uid: 1, code: "member", name: "Member", url_twitter: "https://x.com/member",
    main_color: null, sub_color: null, oshi_mark: null, url_youtube: null,
    url_chzzk: null, youtube_channel_id: null, birth_date: null, debut_date: null,
    unit_name: null, fan_name: null, introduction: null, is_deprecated: false,
  }]);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Feed must only read stored data"); }));
  for (let i = 0; i < 15; i++) {
    const id = String(i).padStart(3, "0");
    const post: XPostDto = { id, text: id, username: "member", createdAt: date, url: `https://x.com/member/status/${id}`, media: [], metrics: { likeCount: 0, replyCount: 0, quoteCount: 0, repostCount: 0 } };
    await db.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,fetched_at,hidden_at) VALUES(?,'member','member',?,?,1,?)").bind(id, JSON.stringify(post), date, i === 14 ? 1 : null).run();
    await db.prepare("INSERT INTO naver_cafe_posts(id,article_id,source_id,source_name,cafe_id,menu_id,member_uid,title,summary,created_at,url,fetched_at,hidden_at) VALUES(?,?,1,'member','1','1',2,?,'',?,'https://cafe.naver.com',1,?)").bind(id, i, id, date, i === 14 ? 1 : null).run();
  }
  statements.length = 0;
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("pages through equal-time mixed sources without duplicates, hidden posts, external calls or writes", async () => {
  const ids: string[] = [];
  let cursor: { createdAt: string; id: string } | undefined;
  for (let i = 0; i < 4; i++) {
    const result = await app.execute({ includeX: true, includeNaverCafe: true, adminView: false, compact: true, maxResults: 10, size: 10, configs, page: { cursor } });
    ids.push(...result.body.posts.map(post => post.id));
    if (!result.body.nextCursor) break;
    cursor = JSON.parse(result.body.nextCursor);
  }
  expect(ids).toHaveLength(28);
  expect(new Set(ids).size).toBe(28);
  expect(ids).not.toContain("x:014");
  expect(ids).not.toContain("cafe:014");
  expect(ids.slice(0, 2)).toEqual(["x:013", "x:012"]);
  expect(statements.every(sql => /^\s*(SELECT|WITH)\b/i.test(sql))).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
});
it("filters each page by member and excludes inaccessible sources", async () => {
  const input = { includeX: true, includeNaverCafe: true, adminView: false, compact: true, maxResults: 10, size: 10, configs };
  const first = await app.execute({ ...input, page: { memberUid: 2 } });
  expect(first.body.posts).toHaveLength(10);
  expect(first.body.posts.every(post => post.memberUid === 2 && post.kind === "cafe")).toBe(true);
  const second = await app.execute({ ...input, page: { memberUid: 2, cursor: JSON.parse(first.body.nextCursor!) } });
  expect(second.body.posts).toHaveLength(4);
  expect(second.body.nextCursor).toBeNull();
  const hidden = await app.execute({ ...input, configs: { ...configs, x: { ...configs.x, visibility: "private" } }, page: {} });
  expect(hidden.body.posts.every(post => post.kind === "cafe")).toBe(true);
});
