import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SITE_OPENS_AT } from "@contracts/site-publication";
import { backfillXPostFactsFromStoredPosts, backfillXPostReferencesFromStoredPosts } from "./x-history";
import { hydrateXReferences } from "./x-reference-hydration";
import { runXCollectionForHandles } from "./x-collection";
import { normalizeXTimelineResponse } from "./x-api";

const testEnv = env as Env & { X_REFERENCE_MIGRATIONS: D1Migration[]; transition_target_db: D1Database };
const db = testEnv.otw_db;
const post = (id: string, parent = "10", media: unknown[] = []) => ({
  id, text: "stored post", username: "member", createdAt: "2026-10-15T00:00:00Z",
  url: `https://x.com/member/status/${id}`, media,
  metrics: { likeCount: 0, replyCount: 0, repostCount: 0, quoteCount: 0 },
  quote: { postId: parent, post: { id: parent } },
});
const tracker = () => ({ apiCalls: 0, estimatedCostMicros: 0, reservedCostMicros: 0,
  uniqueResources: 0, previewDeferred: 0, authorCacheHits: 0, authorCacheMisses: 0, source: "scheduled" });

function meter(afterRun?: (sql: string) => Promise<void>) {
  const reads: { sql: string; rows: number }[] = [];
  const measured = new Proxy(db, {
    get(database, key) {
      if (key === "prepare") return (sql: string) => {
        const wrap = (statement: D1PreparedStatement): D1PreparedStatement => new Proxy(statement, {
          get(target, method) {
            if (method === "bind") return (...values: unknown[]) => wrap(target.bind(...values));
            if (method === "all") return async () => {
              const result = await target.all();
              reads.push({ sql, rows: Number(result.meta.rows_read) });
              await afterRun?.(sql);
              return result;
            };
            if (method === "run" && afterRun) return async () => {
              const result = await target.run();
              await afterRun(sql);
              return result;
            };
            const value = Reflect.get(target, method, target);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
        return wrap(database.prepare(sql));
      };
      const value = Reflect.get(database, key, database);
      return typeof value === "function" ? value.bind(database) : value;
    },
  });
  return { db: measured, reads };
}

beforeEach(async () => {
  await applyD1Migrations(db, testEnv.X_REFERENCE_MIGRATIONS);
  for (const table of ["x_post_references", "x_post_facts", "x_posts", "x_post_sources", "members", "settings"]) {
    await db.prepare(`DELETE FROM ${table}`).run();
  }
  await db.prepare("INSERT INTO settings(key,value) VALUES('x_history_analytics_enabled','true')").run();
  await db.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(1,'member','Member','https://x.com/member')").run();
});

async function completedHistory() {
  await db.prepare(`WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<512)
    INSERT INTO x_posts(id,handle,username,value,created_at,first_seen_at,fetched_at)
    SELECT printf('%04d',n),'member','member',json_set(?,'$.id',printf('%04d',n)), '2026-10-15T00:00:00Z',n,n FROM seq`)
    .bind(JSON.stringify(post("seed"))).run();
  await db.prepare(`INSERT INTO x_post_facts(post_id,member_uid,member_name_snapshot,post_type,created_at,first_seen_at,media_count,link_count,updated_at)
    SELECT id,1,'Member','quote',1,first_seen_at,0,0,1 FROM x_posts`).run();
  await db.prepare(`INSERT INTO x_post_references(source_post_id,relation_type,referenced_post_id,resolution_state,hydrated_at,author_state,created_at,updated_at)
    SELECT id,'quote','10','hydrated',1,'resolved',1,1 FROM x_posts`).run();
  for (let batch = 0; batch < 6; batch++) {
    await backfillXPostFactsFromStoredPosts(db,'otw');
    await backfillXPostReferencesFromStoredPosts(db,'otw');
  }
}

describe("X maintenance reads scale with pending work", { timeout: 15_000 }, () => {
  it("seeds only incomplete repairs when upgrading populated history", async () => {
    const legacy = testEnv.transition_target_db;
    const repairMigrations = testEnv.X_REFERENCE_MIGRATIONS.filter(({ name }) => /^(0137_|0138_)/.test(name));
    await applyD1Migrations(legacy, testEnv.X_REFERENCE_MIGRATIONS.filter(migration => !repairMigrations.includes(migration)));
    await legacy.prepare("INSERT INTO settings(key,value) VALUES('x_history_analytics_enabled','true')").run();
    await legacy.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(1,'member','Member','https://x.com/member')").run();
    for (const id of ["complete", "missing", "reference"]) {
      await legacy.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,first_seen_at,fetched_at) VALUES(?,'member','member',?,'2026-10-15',1,1)")
        .bind(id, JSON.stringify(post(id))).run();
    }
    await legacy.prepare(`INSERT INTO x_post_facts(post_id,member_uid,member_name_snapshot,post_type,created_at,first_seen_at,media_count,link_count,updated_at)
      SELECT id,1,'Member','quote',1,1,0,0,1 FROM x_posts WHERE id!='missing'`).run();
    await legacy.prepare(`INSERT INTO x_post_references(source_post_id,relation_type,referenced_post_id,resolution_state,hydrated_at,author_state,created_at,updated_at)
      VALUES('complete','quote','10','hydrated',1,'resolved',1,1)`).run();
    await applyD1Migrations(legacy, repairMigrations);
    expect((await legacy.prepare("SELECT post_id,facts_pending,references_pending FROM x_post_repair_work ORDER BY post_id").all()).results)
      .toEqual([{ post_id: "missing", facts_pending: 1, references_pending: 1 }, { post_id: "reference", facts_pending: 0, references_pending: 1 }]);
    expect((await legacy.prepare("SELECT * FROM x_quote_body_work").all()).results).toEqual([]);
    expect(await backfillXPostFactsFromStoredPosts(legacy,'otw')).toMatchObject({ scanned: 1, recorded: 1 });
    expect(await backfillXPostReferencesFromStoredPosts(legacy,'otw')).toMatchObject({ scanned: 2 });
    expect(await backfillXPostReferencesFromStoredPosts(legacy,'otw')).toMatchObject({ scanned: 0 });
  });

  it("does not rescan completed history when repairs and hydration have no work", async () => {
    await completedHistory();
    const measured = meter();
    expect(await backfillXPostFactsFromStoredPosts(measured.db,'otw')).toMatchObject({ scanned: 0 });
    expect(await backfillXPostReferencesFromStoredPosts(measured.db,'otw')).toMatchObject({ scanned: 0 });
    expect(await hydrateXReferences({ siteId:'otw', db: measured.db, handles: ["member"], bearerToken: "unused", mode: "cached_author", tracker: tracker() }))
      .toMatchObject({ scanned: 0, hydrated: 0 });
    const totalReads = measured.reads.reduce((sum, read) => sum + read.rows, 0);
    console.info("X completed-history reads:", totalReads);
    expect(totalReads, JSON.stringify(measured.reads)).toBeLessThan(40);
  });

  it("repairs an edited old post and a late inserted ID after completed history", async () => {
    await completedHistory();
    await db.prepare("UPDATE x_post_references SET attempt_count=7,lease_token='old',lease_until=9999999999999,author_id='old',author_state='pending',author_attempt_count=4,author_next_attempt_at=9999999999999,author_last_error_code='old' WHERE source_post_id='0001'").run();
    await db.prepare("UPDATE x_posts SET value=? WHERE id='0001'").bind(JSON.stringify(post("0001", "20", [{ type: "photo" }]))).run();
    await db.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,first_seen_at,fetched_at) VALUES('0000','member','member',?,'2026-10-15',1,1)")
      .bind(JSON.stringify(post("0000"))).run();
    await backfillXPostFactsFromStoredPosts(db,'otw');
    await backfillXPostReferencesFromStoredPosts(db,'otw');
    expect(await db.prepare("SELECT media_count FROM x_post_facts WHERE post_id='0001'").first()).toEqual({ media_count: 1 });
    expect(await db.prepare("SELECT referenced_post_id FROM x_post_references WHERE source_post_id='0001'").first()).toEqual({ referenced_post_id: "20" });
    expect(await db.prepare("SELECT attempt_count,lease_token,lease_until,author_id,author_attempt_count,author_next_attempt_at,author_last_error_code FROM x_post_references WHERE source_post_id='0001'").first())
      .toEqual({ attempt_count: 0, lease_token: null, lease_until: null, author_id: null, author_attempt_count: 0, author_next_attempt_at: null, author_last_error_code: null });
    expect(await db.prepare("SELECT post_id FROM x_post_facts WHERE post_id='0000'").first()).toEqual({ post_id: "0000" });
    expect(await backfillXPostReferencesFromStoredPosts(db,'otw')).toMatchObject({ scanned: 0 });
  });

  it("does not run global backfills when no source handles are claimed", async () => {
    await completedHistory();
    await db.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,first_seen_at,fetched_at) VALUES('late','member','member',?,'2026-10-15',1,1)").bind(JSON.stringify(post("late"))).run();
    const measured = meter();
    await runXCollectionForHandles({ ...testEnv, SITE_ID: "otw", otw_db: measured.db }, [], "manual");
    expect(measured.reads.reduce((sum, read) => sum + read.rows, 0)).toBe(0);
  });

  it.each(["quote", "reply", "both"] as const)("retires removed %s relations from a normalized replay without changing originals", async relation => {
    const [replayed] = normalizeXTimelineResponse({ data: [{ id: "removed", text: "stored post", created_at: "2026-10-15T00:00:00Z" }] }, "member");
    const original = { ...replayed,
      quote: relation === "reply" ? null : post("removed").quote,
      reply: relation === "quote" ? null : { ...post("removed").quote, conversationId: null },
    };
    await db.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,first_seen_at,fetched_at) VALUES('removed','member','member',?,'2026-10-15',1,1)")
      .bind(JSON.stringify(original)).run();
    await backfillXPostFactsFromStoredPosts(db, "otw");
    await backfillXPostReferencesFromStoredPosts(db, "otw");
    expect((await db.prepare("SELECT * FROM x_post_references WHERE source_post_id='removed'").all()).results).toHaveLength(relation === "both" ? 2 : 1);
    const fact = await db.prepare("SELECT * FROM x_post_facts WHERE post_id='removed'").first();
    await db.prepare("UPDATE x_posts SET value=? WHERE id='removed'").bind(JSON.stringify(replayed)).run();
    await backfillXPostReferencesFromStoredPosts(db, "otw");
    expect((await db.prepare("SELECT * FROM x_post_references WHERE source_post_id='removed'").all()).results).toEqual([]);
    expect((await db.prepare("SELECT * FROM x_quote_body_work WHERE source_post_id='removed'").all()).results).toEqual([]);
    expect(await db.prepare("SELECT value FROM x_posts WHERE id='removed'").first("value")).toBe(JSON.stringify(replayed));
    expect(await db.prepare("SELECT * FROM x_post_facts WHERE post_id='removed'").first()).toEqual(fact);
    expect(await db.prepare("SELECT references_pending FROM x_post_repair_work WHERE post_id='removed'").first("references_pending")).toBe(0);
    expect(await backfillXPostReferencesFromStoredPosts(db, "otw")).toMatchObject({ scanned: 0 });
    const provider = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected provider request"));
    try {
      expect(await hydrateXReferences({ siteId: "otw", db, handles: ["member"], bearerToken: "unused", mode: "post_only", tracker: tracker() }))
        .toMatchObject({ scanned: 0 });
      expect(provider).not.toHaveBeenCalled();
    } finally { provider.mockRestore(); }
  });

  it.each(["selection", "removal"] as const)("preserves a new reference edited after obsolete relation %s", async stage => {
    await db.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,first_seen_at,fetched_at) VALUES('edited','member','member',?,'2026-10-15',1,1)")
      .bind(JSON.stringify(post("edited"))).run();
    await backfillXPostReferencesFromStoredPosts(db, "otw");
    await db.prepare("UPDATE x_posts SET value=? WHERE id='edited'").bind(JSON.stringify({ ...post("edited"), quote: null })).run();
    const changed = JSON.stringify(post("edited", "20"));
    let edited = false;
    const measured = meter(async sql => {
      if (!edited && (stage === "selection" ? sql.includes("work.references_pending=1") : sql.includes("DELETE FROM x_post_references"))) {
        edited = true;
        await db.prepare("UPDATE x_posts SET value=? WHERE id='edited'").bind(changed).run();
      }
    });
    await backfillXPostReferencesFromStoredPosts(measured.db, "otw");
    expect(edited).toBe(true);
    expect(await db.prepare("SELECT references_pending FROM x_post_repair_work WHERE post_id='edited'").first("references_pending")).toBe(1);
    expect(await db.prepare("SELECT value FROM x_posts WHERE id='edited'").first("value")).toBe(changed);
    await backfillXPostReferencesFromStoredPosts(db, "otw");
    expect((await db.prepare("SELECT referenced_post_id FROM x_post_references WHERE source_post_id='edited'").all()).results).toEqual([{ referenced_post_id: "20" }]);
    expect(await backfillXPostReferencesFromStoredPosts(db, "otw")).toMatchObject({ scanned: 0 });
  });

  it("does not remove an obsolete selected relation when its repair crosses publication cutoff", async () => {
    await db.prepare("UPDATE members SET code='bing_hayu' WHERE uid=1").run();
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse(SITE_OPENS_AT) - 1);
    try {
      await db.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,first_seen_at,fetched_at) VALUES('cutoff','member','member',?,'2026-10-15',1,1)")
        .bind(JSON.stringify(post("cutoff"))).run();
      await backfillXPostReferencesFromStoredPosts(db, "otw");
      const replayed = JSON.stringify({ ...post("cutoff"), quote: null });
      await db.prepare("UPDATE x_posts SET value=? WHERE id='cutoff'").bind(replayed).run();
      const measured = meter(async sql => {
        if (sql.includes("work.references_pending=1")) clock.mockReturnValue(Date.parse(SITE_OPENS_AT));
      });
      await backfillXPostReferencesFromStoredPosts(measured.db, "otw");
      expect(await db.prepare("SELECT referenced_post_id FROM x_post_references WHERE source_post_id='cutoff'").first("referenced_post_id")).toBe("10");
      expect(await db.prepare("SELECT references_pending FROM x_post_repair_work WHERE post_id='cutoff'").first("references_pending")).toBe(1);
      expect(await db.prepare("SELECT value FROM x_posts WHERE id='cutoff'").first("value")).toBe(replayed);
    } finally { clock.mockRestore(); }
  });

  it.each(["invalid", "malformed", "archived", "hidden", "removed"] as const)("preserves reference evidence for an %s source", async state => {
    await db.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,first_seen_at,fetched_at) VALUES('retained','member','member',?,'2026-10-15',1,1)")
      .bind(JSON.stringify(post("retained"))).run();
    await backfillXPostReferencesFromStoredPosts(db, "otw");
    const value = state === "invalid" ? "invalid" : state === "malformed" ? JSON.stringify({ ...post("retained"), quote: {} })
      : state === "archived" ? JSON.stringify({ ...post("retained"), quote: null }) : "{}";
    await db.prepare("UPDATE x_posts SET value=?,hidden_at=?,content_removed_at=?,content_access=? WHERE id='retained'")
      .bind(value, state === "hidden" ? 1 : null, state === "removed" ? 1 : null, state === "archived" ? "admin_archive" : "normal").run();
    const original = await db.prepare("SELECT * FROM x_posts WHERE id='retained'").first();
    const reference = await db.prepare("SELECT * FROM x_post_references WHERE source_post_id='retained'").first();
    await backfillXPostReferencesFromStoredPosts(db, "otw");
    expect(await db.prepare("SELECT * FROM x_posts WHERE id='retained'").first()).toEqual(original);
    expect(await db.prepare("SELECT * FROM x_post_references WHERE source_post_id='retained'").first()).toEqual(reference);
  });

  it("does not read deferred quote-body or author backlogs before their due time", async () => {
    await completedHistory();
    await db.prepare("UPDATE x_post_references SET resolution_state='pending',hydrated_at=NULL,next_attempt_at=?,author_state='pending',author_next_attempt_at=?")
      .bind(Date.now() + 86_400_000, Date.now() + 86_400_000).run();
    const measured = meter();
    expect(await hydrateXReferences({ siteId:'otw', db: measured.db, handles: ["member"], bearerToken: "unused", mode: "link_only", tracker: tracker() }))
      .toMatchObject({ scanned: 0 });
    const totalReads = measured.reads.reduce((sum, read) => sum + read.rows, 0);
    console.info("X future-retry backlog reads:", totalReads);
    expect(totalReads, JSON.stringify(measured.reads)).toBeLessThan(40);
    await db.prepare("UPDATE x_post_references SET next_attempt_at=0 WHERE source_post_id='0001'").run();
    expect(await hydrateXReferences({ siteId:'otw', db, handles: ["member"], bearerToken: "unused", mode: "link_only", tracker: tracker() }))
      .toMatchObject({ scanned: 1 });
  });

  it("rotates invalid pending rows so later valid posts are not starved", async () => {
    await db.prepare(`WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<201)
      INSERT INTO x_posts(id,handle,username,value,created_at,first_seen_at,fetched_at)
      SELECT printf('%04d',n),'member','member','invalid','2026-10-15',n,n FROM seq`).run();
    await db.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,first_seen_at,fetched_at) VALUES('late','member','member',?,'2026-10-15',999,999)").bind(JSON.stringify(post("late"))).run();
    for (let batch = 0; batch < 3; batch++) await backfillXPostFactsFromStoredPosts(db,'otw');
    expect(await db.prepare("SELECT post_id FROM x_post_facts WHERE post_id='late'").first()).toEqual({ post_id: "late" });
    expect(await db.prepare("SELECT COUNT(*) AS pending FROM x_post_repair_work WHERE facts_pending=1").first()).toEqual({ pending: 201 });
  });

  it("keeps an edit pending when it races successful fact persistence", async () => {
    await db.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,first_seen_at,fetched_at) VALUES('edit','member','member',?,'2026-10-15',1,1)").bind(JSON.stringify(post("edit"))).run();
    let edited = false;
    const measured = meter(async sql => {
      if (!edited && sql.includes("INSERT INTO x_post_facts")) {
        edited = true;
        await db.prepare("UPDATE x_posts SET value=? WHERE id='edit'").bind(JSON.stringify(post("edit", "10", [{ type: "photo" }]))).run();
      }
    });
    await backfillXPostFactsFromStoredPosts(measured.db,'otw');
    await backfillXPostFactsFromStoredPosts(db,'otw');
    expect(await db.prepare("SELECT media_count FROM x_post_facts WHERE post_id='edit'").first()).toEqual({ media_count: 1 });
    expect(await backfillXPostFactsFromStoredPosts(db,'otw')).toMatchObject({ scanned: 0 });
  });

  it("retries a reference deleted between persistence and acknowledgement", async () => {
    await db.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,first_seen_at,fetched_at) VALUES('delete','member','member',?,'2026-10-15',1,1)").bind(JSON.stringify(post("delete"))).run();
    let deleted = false;
    const measured = meter(async sql => {
      if (!deleted && sql.includes("INSERT INTO x_post_references")) {
        deleted = true;
        await db.prepare("DELETE FROM x_post_references WHERE source_post_id='delete'").run();
      }
    });
    await backfillXPostReferencesFromStoredPosts(measured.db,'otw');
    expect(await db.prepare("SELECT references_pending FROM x_post_repair_work WHERE post_id='delete'").first()).toEqual({ references_pending: 1 });
    await backfillXPostReferencesFromStoredPosts(db,'otw');
    expect(await db.prepare("SELECT referenced_post_id FROM x_post_references WHERE source_post_id='delete'").first()).toEqual({ referenced_post_id: "10" });
    expect(await backfillXPostReferencesFromStoredPosts(db,'otw')).toMatchObject({ scanned: 0 });
  });

  it("bounds hidden pending repair checks and rotates them without starving an eligible tail",async()=>{
    await db.prepare("UPDATE members SET code='bing_hayu' WHERE uid=1").run();
    await db.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(2,'other','Other','https://x.com/public')").run();
    await db.prepare(`WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<512)
      INSERT INTO x_posts(id,handle,username,value,created_at,first_seen_at,fetched_at)
      SELECT printf('%04d',n),'member','member',json_set(?,'$.id',printf('%04d',n)),'2026-10-15T00:00:00Z',n,n FROM seq`).bind(JSON.stringify(post('seed'))).run();
    await db.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,first_seen_at,fetched_at) VALUES('zz-tail','public','public',?,'2026-10-15T00:00:00Z',1,1)").bind(JSON.stringify(post('zz-tail'))).run();
    const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse(SITE_OPENS_AT));
    const measured=meter();
    try {
      for(let batch=0;batch<6;batch++) {
        expect((await backfillXPostFactsFromStoredPosts(measured.db,'otw')).scanned).toBeLessThanOrEqual(100);
      }
      expect((await db.prepare('SELECT post_id FROM x_post_facts').all()).results).toEqual([{post_id:'zz-tail'}]);
      expect(await db.prepare("SELECT count(*) n FROM x_post_repair_work WHERE facts_pending=1").first('n')).toBe(512);
      const reads=measured.reads.filter(read=>read.sql.includes('idx_x_post_repair_facts')).map(read=>read.rows);
      expect(reads).toHaveLength(6);expect(Math.max(...reads)).toBeLessThan(2000);
      console.log(`X hidden-candidate maximum selector reads: ${Math.max(...reads)}`);
    } finally {clock.mockRestore();}
  },30000);
});
