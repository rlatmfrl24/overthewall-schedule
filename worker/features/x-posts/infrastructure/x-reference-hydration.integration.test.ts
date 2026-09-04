import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  claimXReferenceTarget,
  hydrateXReferences,
} from "./x-reference-hydration";
import {
  readXReferenceBudget,
  reserveXReferenceBudget,
} from "./x-reference-budget";
import {
  backfillXPostReferencesFromStoredPosts,
  readXHistoryHealth,
} from "./x-history";
import {
  collectXPostsForHandles,
  fetchXPostsForHandles,
  fetchXPostPreviewById,
  redactStoredXPosts,
  clearXServiceCachesForTests,
  type XApiUsageTracker,
} from "./x-api";
import { linkedPostKey } from "./x-reference-store";
import type { XPostDto } from "@contracts/x-posts";
import { runXCollectionForHandles } from "./x-collection";

const testEnv = env as Env & { X_REFERENCE_MIGRATIONS: D1Migration[] };
const db = testEnv.otw_db;
const tracker = (): XApiUsageTracker => ({
  apiCalls: 0,
  estimatedCostMicros: 0,
  reservedCostMicros: 0,
  uniqueResources: 0,
  previewDeferred: 0,
  authorCacheHits: 0,
  authorCacheMisses: 0,
  source: "scheduled",
});
const body = (id: string): XPostDto => ({
  id,
  text: `body ${id}`,
  username: "member",
  createdAt: new Date().toISOString(),
  url: `https://x.com/member/status/${id}`,
  metrics: { likeCount: 0, replyCount: 0, repostCount: 0, quoteCount: 0 },
  media: [],
});
const seed = async (id = "101", parent = "10", handle = "member") => {
  const post = {
    ...body(id),
    reply: { postId: parent, conversationId: parent, post: null },
  };
  await db
    .prepare(
      `INSERT INTO x_posts(id,handle,username,value,created_at,first_seen_at,fetched_at)
    VALUES(?,?,?,?,?,?,?)`,
    )
    .bind(
      id,
      handle,
      handle,
      JSON.stringify(post),
      post.createdAt,
      Date.now(),
      Date.now(),
    )
    .run();
  await backfillXPostReferencesFromStoredPosts(db);
  return post;
};
const getPost = async (id = "101") =>
  JSON.parse(
    (await db
      .prepare("SELECT value FROM x_posts WHERE id=?")
      .bind(id)
      .first<{ value: string }>())!.value,
  ) as XPostDto;
const run = (
  mode: "cached_author" | "post_only" | "link_only" = "cached_author",
  handles = ["member"],
) =>
  hydrateXReferences({
    db,
    handles,
    bearerToken: "test",
    mode,
    tracker: tracker(),
  });
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });

beforeEach(async () => {
  await applyD1Migrations(db, testEnv.X_REFERENCE_MIGRATIONS);
  for (const table of [
    "x_post_references",
    "x_post_facts",
    "x_posts",
    "x_post_sources",
    "x_api_cache",
    "x_api_usage_events",
    "x_api_usage_daily",
    "x_api_resource_daily",
    "scheduled_usage_daily",
    "x_collection_runs",
    "settings",
  ]) {
    await db.prepare(`DELETE FROM ${table}`).run();
  }
  clearXServiceCachesForTests();
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("X durable reference hydration", () => {
  it.each(["100", null])(
    "does not acknowledge a partial page when cursor persistence fails (base %s)",
    async (base) => {
      await db
        .prepare(
          "INSERT INTO settings(key,value) VALUES('x_cost_optimizer_enabled','true'),('x_reference_preview_mode','link_only')",
        )
        .run();
      await db
        .prepare(
          "INSERT INTO x_post_sources(handle,user_id,username,last_seen_post_id,last_checked_at,updated_at,collection_started_at) VALUES('member','1','member',?,0,0,1)",
        )
        .bind(base)
        .run();
      await db
        .prepare(
          "CREATE TRIGGER fail_cursor_ack BEFORE UPDATE OF sync_pagination_token ON x_post_sources BEGIN SELECT RAISE(ABORT, 'cursor unavailable'); END",
        )
        .run();
      const timelineRequests: URL[] = [];
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = new URL(String(input));
        if (url.pathname === "/2/users/by")
          return json({ data: [{ id: "1", username: "member" }] });
        timelineRequests.push(url);
        return json({
          data: [
            {
              id: "200",
              text: "new post",
              created_at: new Date().toISOString(),
            },
          ],
          meta: { next_token: "page2" },
        });
      });
      try {
        await expect(
          runXCollectionForHandles(
            { ...testEnv, X_BEARER_TOKEN: "test" },
            ["member"],
            "manual",
          ),
        ).rejects.toThrow("persistence unavailable");
        expect(
          await db
            .prepare(
              "SELECT last_seen_post_id,sync_pagination_token,last_success_at FROM x_post_sources",
            )
            .first(),
        ).toMatchObject({
          last_seen_post_id: base,
          sync_pagination_token: null,
          last_success_at: null,
        });
      } finally {
        await db.prepare("DROP TRIGGER fail_cursor_ack").run();
      }
      clearXServiceCachesForTests();
      await runXCollectionForHandles(
        { ...testEnv, X_BEARER_TOKEN: "test" },
        ["member"],
        "manual",
      );
      expect(timelineRequests[1].searchParams.get("since_id")).toBe(base);
      if (!base)
        expect(timelineRequests[1].searchParams.get("start_time")).toBe(
          new Date(1).toISOString(),
        );
      expect(
        await db
          .prepare(
            "SELECT last_seen_post_id,sync_pagination_token FROM x_post_sources",
          )
          .first(),
      ).toMatchObject({
        last_seen_post_id: base,
        sync_pagination_token: "page2",
      });
    },
  );

  it("removes hydrated reply/quote/link copies and stale feed caches when an original is redacted", async () => {
    const original = {
      ...body("10"),
      media: [
        { type: "photo" as const, url: "https://example.com/private.jpg" },
      ],
    };
    await db
      .prepare(
        "INSERT INTO x_posts(id,handle,username,value,created_at,first_seen_at,fetched_at) VALUES('10','member','member',?,?,0,0)",
      )
      .bind(JSON.stringify(original), original.createdAt)
      .run();
    const reply = await seed();
    await db
      .prepare("UPDATE x_posts SET value=? WHERE id='101'")
      .bind(
        JSON.stringify({
          ...reply,
          quote: { postId: "10", post: null },
          links: [
            {
              url: original.url,
              linkedPost: original,
              title: "copied title",
              description: original.text,
              imageUrl: original.media[0].url,
            },
          ],
        }),
      )
      .run();
    await backfillXPostReferencesFromStoredPosts(db);
    await run("link_only");
    const hydrated = await getPost();
    expect(hydrated.reply?.post?.text).toBe(original.text);
    expect(hydrated.quote?.post?.text).toBe(original.text);
    await db
      .prepare(
        "INSERT INTO x_api_cache(key,type,value,fetched_at,expires_at) VALUES(?,'linked_post',?,?,?)",
      )
      .bind(
        linkedPostKey("10"),
        JSON.stringify({ post: original }),
        Date.now(),
        Date.now() + 86_400_000,
      )
      .run();
    await db
      .prepare(
        "INSERT INTO x_api_cache(key,type,value,fetched_at,expires_at) VALUES('x:posts:v1:member:5:basic','posts',?,?,?)",
      )
      .bind(
        JSON.stringify({ userId: "1", posts: [hydrated, original] }),
        Date.now(),
        Date.now() + 86_400_000,
      )
      .run();
    await db
      .prepare(
        "INSERT INTO x_api_cache(key,type,value,fetched_at,expires_at) VALUES('x:relations:v3:member','relation_version','{\"version\":\"v3\"}',?,?)",
      )
      .bind(Date.now(), Date.now() + 86_400_000)
      .run();
    // Populate another reader's in-memory feed cache before the admin mutation.
    await fetchXPostsForHandles(["member"], {
      cacheDb: db,
      refresh: false,
      maxResults: 5,
    });
    expect(await redactStoredXPosts(db, ["10"])).toMatchObject({
      found: 1,
      redacted: 1,
    });
    expect(await getPost("10")).toEqual({});
    const clean = await getPost();
    expect(clean.reply?.post).toBeNull();
    expect(clean.quote?.post).toBeNull();
    expect(JSON.stringify(clean)).not.toContain("private.jpg");
    expect(clean.links?.[0].linkedPost).toBeUndefined();
    expect(
      (
        await db
          .prepare(
            "SELECT resolution_state,lease_token FROM x_post_references WHERE referenced_post_id='10'",
          )
          .all()
      ).results,
    ).toEqual([
      { resolution_state: "terminal", lease_token: null },
      { resolution_state: "terminal", lease_token: null },
    ]);
    expect(
      (
        await db
          .prepare(
            "SELECT COUNT(*) AS count FROM x_api_cache WHERE type IN ('posts','linked_post')",
          )
          .first()
      )?.count,
    ).toBe(0);
    expect(await fetchXPostPreviewById("10", { cacheDb: db })).toBeNull();
    // A different isolate can still hold/write an older collection cache. Public
    // reads must use authoritative post rows, not that cached copy.
    await db
      .prepare(
        "INSERT INTO x_api_cache(key,type,value,fetched_at,expires_at) VALUES('x:posts:v1:member:5:basic','posts',?,?,?)",
      )
      .bind(
        JSON.stringify({ userId: "1", posts: [hydrated, original] }),
        Date.now(),
        Date.now() + 86_400_000,
      )
      .run();
    const feed = await fetchXPostsForHandles(["member"], {
      cacheDb: db,
      refresh: false,
      maxResults: 5,
    });
    expect(feed.posts.map((post) => post.id)).toEqual(["101"]);
    expect(feed.posts[0].reply?.post).toBeNull();
    expect((await run("link_only")).scanned).toBe(0);
    expect(await redactStoredXPosts(db, ["10"])).toMatchObject({
      found: 1,
      redacted: 0,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rolls back the original tombstone if reverse-reference removal fails", async () => {
    await seed("10", "999");
    await seed();
    await run("link_only");
    await db
      .prepare(
        "CREATE TRIGGER test_reference_cleanup_failure BEFORE UPDATE ON x_post_references BEGIN SELECT RAISE(ABORT,'cleanup failed'); END",
      )
      .run();
    try {
      await expect(redactStoredXPosts(db, ["10"])).rejects.toThrow(
        "cleanup failed",
      );
      expect((await getPost("10")).text).toBe("body 10");
      expect(
        (
          await db
            .prepare("SELECT hidden_at FROM x_posts WHERE id='10'")
            .first()
        )?.hidden_at,
      ).toBeNull();
      expect((await getPost()).reply?.post?.text).toBe("body 10");
    } finally {
      await db.prepare("DROP TRIGGER test_reference_cleanup_failure").run();
    }
    expect(await redactStoredXPosts(db, ["10"])).toMatchObject({ redacted: 1 });
  });

  it("fences a paid cache write if admin redaction commits after its last visibility check", async () => {
    await seed();
    vi.mocked(fetch).mockImplementationOnce(async () => {
      await db
        .prepare(
          "INSERT INTO x_posts(id,handle,username,value,created_at,first_seen_at,fetched_at) VALUES('10','member','member',?,?,0,0)",
        )
        .bind(JSON.stringify(body("10")), body("10").createdAt)
        .run();
      return json({ data: [{ id: "10", text: "must not be cached again" }] });
    });
    let removed = false;
    const racingDb = {
      prepare(query: string) {
        const statement = db.prepare(query);
        if (!query.includes("INSERT INTO x_api_cache")) return statement;
        return {
          bind(...bindings: unknown[]) {
            const bound = statement.bind(...bindings);
            return {
              async run() {
                if (!removed && bindings[1] === "linked_post") {
                  removed = true;
                  await redactStoredXPosts(db, ["10"]);
                }
                return bound.run();
              },
            };
          },
        };
      },
      batch: db.batch.bind(db),
    } as unknown as D1Database;
    await hydrateXReferences({
      db: racingDb,
      handles: ["member"],
      bearerToken: "test",
      mode: "post_only",
      tracker: tracker(),
    });
    expect(removed).toBe(true);
    expect((await getPost()).reply?.post).toBeNull();
    expect(
      await db
        .prepare("SELECT value FROM x_api_cache WHERE key=?")
        .bind(linkedPostKey("10"))
        .first(),
    ).toBeNull();
  });

  it("repairs legacy completed references whose embedded preview is missing", async () => {
    await seed("10", "999");
    await seed();
    await db
      .prepare(
        "UPDATE x_post_references SET resolution_state='hydrated',hydrated_at=1,author_state='resolved',next_attempt_at=NULL WHERE source_post_id='101'",
      )
      .run();
    expect((await run("link_only")).hydrated).toBe(1);
    expect((await getPost()).reply?.post?.text).toBe("body 10");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves hydrated context when the normal pipeline replays a continuation page", async () => {
    await seed("10", "999");
    await seed("150", "10");
    await run("link_only");
    const preview = (await getPost("150")).reply?.post;
    await db
      .prepare(
        "INSERT INTO settings(key,value) VALUES('x_cost_optimizer_enabled','true'),('x_reference_preview_mode','link_only')",
      )
      .run();
    await db
      .prepare(
        "INSERT INTO x_post_sources(handle,user_id,username,last_seen_post_id,last_checked_at,updated_at,collection_started_at,sync_pagination_token,sync_base_post_id,sync_newest_post_id) VALUES('member','1','member','100',0,0,0,'page2','100','200')",
      )
      .run();
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/2/users/by")
        return json({ data: [{ id: "1", username: "member" }] });
      expect(url.searchParams.get("pagination_token")).toBe("page2");
      return json({
        data: [
          {
            id: "150",
            text: "replayed reply",
            created_at: new Date().toISOString(),
            referenced_tweets: [{ id: "10", type: "replied_to" }],
          },
        ],
        meta: {},
      });
    });
    await runXCollectionForHandles(
      { ...testEnv, X_BEARER_TOKEN: "test" },
      ["member"],
      "manual",
    );
    expect((await getPost("150")).reply?.post).toEqual(preview);
    expect(
      (await db.prepare("SELECT last_seen_post_id FROM x_post_sources").first())
        ?.last_seen_post_id,
    ).toBe("200");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(["link_only", "cached_author"] as const)(
    "connects each missing body despite another reference waiting for its author in %s",
    async (mode) => {
      await seed();
      await seed("102", "10");
      const preview = {
        ...body("10"),
        username: "i",
        name: null,
        profileImageUrl: null,
      };
      const second = await getPost("102");
      await db
        .prepare("UPDATE x_posts SET value=? WHERE id='102'")
        .bind(
          JSON.stringify({
            ...second,
            reply: { ...second.reply, post: preview },
          }),
        )
        .run();
      await db
        .prepare(
          "UPDATE x_post_references SET next_attempt_at=100 WHERE source_post_id='101'",
        )
        .run();
      await db
        .prepare(
          "UPDATE x_post_references SET resolution_state='hydrated',hydrated_at=100,next_attempt_at=NULL,author_id='20',author_state='pending',author_next_attempt_at=200 WHERE source_post_id='102'",
        )
        .run();
      await db
        .prepare(
          "INSERT INTO x_api_cache(key,type,value,fetched_at,expires_at) VALUES(?,'linked_post',?,?,?)",
        )
        .bind(
          linkedPostKey("10"),
          JSON.stringify({ post: preview, authorId: "20" }),
          Date.now(),
          Date.now() + 86_400_000,
        )
        .run();
      await db
        .prepare(
          "INSERT INTO settings(key,value) VALUES('x_reference_preview_daily_budget_cents','0')",
        )
        .run();
      const result = await run(mode);
      expect(result.hydrated).toBe(1);
      expect((await getPost()).reply?.post?.text).toBe(preview.text);
      expect((await getPost("102")).reply?.post).toEqual(preview);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("keeps ordinary link previews in the normal deferred collection pipeline", async () => {
    await db
      .prepare(
        "INSERT INTO settings(key,value) VALUES('x_reference_preview_mode','link_only')",
      )
      .run();
    await db
      .prepare(
        "INSERT INTO x_post_sources(handle,user_id,username,last_seen_post_id,last_checked_at,updated_at,collection_started_at) VALUES('member','1','member','100',0,0,0)",
      )
      .run();
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "example.com")
        return new Response(
          '<html><head><meta property="og:title" content="News preview"><meta property="og:image" content="https://example.com/news.jpg"></head></html>',
          { headers: { "content-type": "text/html" } },
        );
      if (url.pathname === "/2/users/by")
        return json({ data: [{ id: "1", username: "member" }] });
      expect(url.pathname).toBe("/2/users/1/tweets");
      return json({
        data: [
          {
            id: "101",
            text: "news https://t.co/test",
            created_at: new Date().toISOString(),
            entities: {
              urls: [
                {
                  url: "https://t.co/test",
                  expanded_url: "https://example.com/news",
                  display_url: "example.com/news",
                },
              ],
            },
          },
        ],
        meta: {},
      });
    });
    await runXCollectionForHandles(
      { ...testEnv, X_BEARER_TOKEN: "test" },
      ["member"],
      "manual",
    );
    expect((await getPost()).links?.[0]).toMatchObject({
      title: "News preview",
      imageUrl: "https://example.com/news.jpg",
      previewStatus: "ready",
    });
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(
          ([input]) => new URL(String(input)).hostname === "api.x.com",
        ),
    ).toHaveLength(2);
  });

  it("bounds content fanout to 100 selected references and resumes the remainder for free", async () => {
    const posts = Array.from({ length: 101 }, (_, index) => ({
      ...body(String(500 + index)),
      reply: { postId: "10", conversationId: null, post: null },
    }));
    await db.batch(
      [...posts, body("10")].map((post) =>
        db
          .prepare(
            "INSERT INTO x_posts(id,handle,username,value,created_at,first_seen_at,fetched_at) VALUES(?,'member','member',?,?,0,0)",
          )
          .bind(post.id, JSON.stringify(post), post.createdAt),
      ),
    );
    await backfillXPostReferencesFromStoredPosts(db);
    await backfillXPostReferencesFromStoredPosts(db);
    expect((await run("link_only")).hydrated).toBe(100);
    expect(
      (
        await db
          .prepare(
            "SELECT COUNT(*) AS count FROM x_posts WHERE json_extract(value,'$.reply.post.id')='10'",
          )
          .first()
      )?.count,
    ).toBe(100);
    expect((await run("link_only")).hydrated).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reuses a cached author across parents and refreshes only expired authors", async () => {
    await seed();
    await db
      .prepare(
        "INSERT INTO x_api_cache(key,type,value,fetched_at,expires_at) VALUES('x:linked-user:v1:20','linked_user',?,?,?)",
      )
      .bind(
        JSON.stringify({ user: { id: "20", username: "cached" } }),
        Date.now(),
        Date.now() + 86_400_000,
      )
      .run();
    vi.mocked(fetch).mockResolvedValueOnce(
      json({ data: [{ id: "10", text: "parent", author_id: "20" }] }),
    );
    expect((await run()).authorsResolved).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await getPost()).reply?.post?.username).toBe("cached");
    await seed("102", "11");
    await db
      .prepare("UPDATE x_api_cache SET expires_at=0 WHERE type='linked_user'")
      .run();
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        json({ data: [{ id: "11", text: "parent 2", author_id: "20" }] }),
      )
      .mockResolvedValueOnce(json({ data: [{ id: "20", username: "fresh" }] }));
    await run();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect((await getPost("102")).reply?.post?.username).toBe("fresh");
  });

  it("keeps free D1 repair available when the timeline provider fails", async () => {
    await seed();
    await seed("10", "999");
    await db
      .prepare(
        "INSERT INTO settings(key,value) VALUES('x_reference_preview_mode','link_only')",
      )
      .run();
    vi.mocked(fetch).mockResolvedValue(
      new Response("temporary", { status: 503 }),
    );
    const result = await runXCollectionForHandles(
      { ...testEnv, X_BEARER_TOKEN: "test" },
      ["member"],
      "manual",
    );
    expect(result.status).toBe("failed");
    expect(result.referenceHydration?.hydrated).toBe(1);
    expect((await getPost()).reply?.post?.text).toBe("body 10");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not expose a target redacted during hydration or through a later public read", async () => {
    await seed();
    vi.mocked(fetch).mockImplementationOnce(async () => {
      await db
        .prepare(
          "INSERT INTO x_posts(id,handle,username,value,created_at,first_seen_at,fetched_at,hidden_at,content_removed_at) VALUES('10','parent','parent','{}',?,0,0,1,1)",
        )
        .bind(new Date().toISOString())
        .run();
      return json({ data: [{ id: "10", text: "must not reappear" }] });
    });
    await run("post_only");
    expect((await getPost()).reply?.post).toBeNull();
    expect(await fetchXPostPreviewById("10", { cacheDb: db })).toBeNull();
  });

  it("normal pipeline advances a new reply cursor, then recovers its parent on a zero-new-post run", async () => {
    await db
      .prepare(
        "INSERT INTO settings(key,value) VALUES('x_cost_optimizer_enabled','true'),('x_collection_interval_hours','2'),('x_reference_preview_mode','post_only')",
      )
      .run();
    await db
      .prepare(
        "INSERT INTO x_post_sources(handle,user_id,username,last_seen_post_id,last_checked_at,updated_at,collection_started_at) VALUES('member','1','member','100',0,0,0)",
      )
      .run();
    let timelineCalls = 0;
    let parentCalls = 0;
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/2/users/by")
        return json({ data: [{ id: "1", username: "member" }] });
      if (url.pathname === "/2/users/1/tweets")
        return json({
          data:
            timelineCalls++ === 0
              ? [
                  {
                    id: "101",
                    text: "reply",
                    created_at: new Date().toISOString(),
                    referenced_tweets: [{ id: "10", type: "replied_to" }],
                  },
                ]
              : [],
          meta: {},
        });
      if (url.pathname === "/2/tweets")
        return parentCalls++ === 0
          ? new Response("temporary", { status: 503 })
          : json({ data: [{ id: "10", text: "recovered through pipeline" }] });
      throw new Error(`Unexpected provider path: ${url.pathname}`);
    });
    const first = await runXCollectionForHandles(
      { ...testEnv, X_BEARER_TOKEN: "test" },
      ["member"],
      "manual",
    );
    expect(first.postsStored).toBe(1);
    expect(first.referenceHydration?.failed).toBe(1);
    expect(
      (await db.prepare("SELECT last_seen_post_id FROM x_post_sources").first())
        ?.last_seen_post_id,
    ).toBe("101");
    const factsBefore = await db.prepare("SELECT * FROM x_post_facts").all();
    await db.prepare("UPDATE x_post_references SET next_attempt_at=0").run();
    const second = await runXCollectionForHandles(
      { ...testEnv, X_BEARER_TOKEN: "test" },
      ["member"],
      "manual",
    );
    expect(second.postsStored).toBe(0);
    expect(second.referenceHydration?.hydrated).toBe(1);
    expect((await getPost()).reply?.post?.text).toBe(
      "recovered through pipeline",
    );
    expect(await db.prepare("SELECT * FROM x_post_facts").all()).toMatchObject({
      results: factsBefore.results,
    });
    expect(parentCalls).toBe(2);
  });

  it("shrinks lookup batches at the budget boundary and resumes deferred IDs after UTC reset", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-04T22:00:00Z"));
    await seed();
    await seed("102", "11");
    await db
      .prepare(
        "INSERT INTO settings(key,value) VALUES('x_reference_preview_daily_budget_cents','3')",
      )
      .run();
    vi.mocked(fetch).mockImplementation(async (input) => {
      const ids = new URL(String(input)).searchParams.get("ids")!.split(",");
      return json({
        data: ids.map((id) => ({ id, text: `parent ${id}` })),
        includes: {
          media: [
            { media_key: "m1", type: "photo" },
            { media_key: "m2", type: "photo" },
          ],
        },
      });
    });
    const first = await run("post_only");
    expect(first.hydrated).toBe(1);
    expect(first.deferred).toBe(1);
    expect(first.failed).toBe(0);
    expect(
      new URL(String(vi.mocked(fetch).mock.calls[0][0])).searchParams
        .get("ids")!
        .split(","),
    ).toHaveLength(1);
    expect(first.retryAt).toBeGreaterThan(Date.parse("2026-09-05T00:00:00Z"));
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-05T00:02:00Z"));
    const second = await run("post_only");
    expect(second.hydrated).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((await readXReferenceBudget(db)).previewUsed).toBe(15_000);
  });

  it("uses existing D1 posts and cache even in link_only; public reader writes/calls nothing", async () => {
    await seed();
    await seed("102", "11");
    await seed("10", "999");
    await db
      .prepare(
        "INSERT INTO x_api_cache(key,type,value,fetched_at,expires_at) VALUES(?,'linked_post',?,?,?)",
      )
      .bind(
        linkedPostKey("11"),
        JSON.stringify({
          post: { ...body("11"), name: null, profileImageUrl: null },
        }),
        Date.now(),
        Date.now() + 86_400_000,
      )
      .run();
    const result = await run("link_only");
    expect(result.hydrated).toBe(2);
    expect((await getPost()).reply?.post?.text).toBe("body 10");
    expect((await getPost("102")).reply?.post?.text).toBe("body 11");
    expect((await fetchXPostPreviewById("10", { cacheDb: db }))?.text).toBe(
      "body 10",
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(
      (
        await db
          .prepare("SELECT COUNT(*) AS count FROM x_api_usage_events")
          .first<{ count: number }>()
      )?.count,
    ).toBe(0);
    expect(
      (await db.prepare("PRAGMA foreign_key_check").all()).results,
    ).toEqual([]);
  });

  it("persists a paid Post when User lookup fails, then retries only User", async () => {
    await seed();
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        json({ data: [{ id: "10", text: "parent", author_id: "20" }] }),
      )
      .mockResolvedValueOnce(new Response("temporary", { status: 503 }));
    const first = await run();
    expect(first.failed).toBe(1);
    expect((await getPost()).reply?.post?.text).toBe("parent");
    expect((await getPost()).reply?.post?.username).toBe("i");
    await db
      .prepare("UPDATE x_post_references SET author_next_attempt_at=0")
      .run();
    vi.mocked(fetch).mockResolvedValueOnce(
      json({ data: [{ id: "20", username: "parent_author" }] }),
    );
    await run();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.map((call) => new URL(String(call[0])).pathname),
    ).toEqual(["/2/tweets", "/2/users", "/2/users"]);
    expect((await getPost()).reply?.post?.username).toBe("parent_author");
  });

  it("coalesces concurrent shards referring to the same target", async () => {
    await seed();
    await seed("102", "10", "other");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started!: () => void;
    const requestStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    vi.mocked(fetch).mockImplementationOnce(async () => {
      started();
      await gate;
      return json({ data: [{ id: "10", text: "parent" }] });
    });
    const first = run("post_only");
    await requestStarted;
    const second = await run("post_only", ["other"]);
    expect(second.coalesced).toBe(1);
    release();
    await first;
    await run("post_only", ["other"]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await getPost("102")).reply?.post?.text).toBe("parent");
  });

  it("a newly inserted reference cannot bypass an existing target lease", async () => {
    await seed();
    expect(await claimXReferenceTarget(db, "10", "first")).toBe(true);
    await seed("102", "10", "other");
    expect(await claimXReferenceTarget(db, "10", "second")).toBe(false);
    await db.prepare("UPDATE x_post_references SET lease_until=0").run();
    expect(await claimXReferenceTarget(db, "10", "second")).toBe(true);
  });

  it("does not revive a post redacted while the provider request is running", async () => {
    await seed();
    vi.mocked(fetch).mockImplementationOnce(async () => {
      await db
        .prepare(
          "UPDATE x_posts SET value='{}',hidden_at=?,content_removed_at=? WHERE id='101'",
        )
        .bind(Date.now(), Date.now())
        .run();
      return json({ data: [{ id: "10", text: "parent" }] });
    });
    await run("post_only");
    expect(await getPost()).toEqual({});
  });

  it("keeps omitted IDs pending but explicit resource not-found terminal", async () => {
    await seed();
    await seed("102", "11");
    vi.mocked(fetch).mockResolvedValueOnce(
      json({
        data: [],
        errors: [
          {
            resource_id: "10",
            type: "https://api.x.com/2/problems/resource-not-found",
          },
        ],
      }),
    );
    await run("post_only");
    const rows = await db
      .prepare(
        "SELECT referenced_post_id,resolution_state,last_error_code FROM x_post_references ORDER BY referenced_post_id",
      )
      .all();
    expect(rows.results).toEqual([
      {
        referenced_post_id: "10",
        resolution_state: "terminal",
        last_error_code: "not_found_or_unavailable",
      },
      {
        referenced_post_id: "11",
        resolution_state: "pending",
        last_error_code: "invalid_response",
      },
    ]);
  });

  it("backfills each relation independently", async () => {
    const post = await seed();
    await db
      .prepare("UPDATE x_posts SET value=? WHERE id='101'")
      .bind(JSON.stringify({ ...post, quote: { postId: "12", post: null } }))
      .run();
    await backfillXPostReferencesFromStoredPosts(db);
    await backfillXPostReferencesFromStoredPosts(db);
    expect(
      (
        await db
          .prepare("SELECT COUNT(*) AS count FROM x_post_references")
          .first<{ count: number }>()
      )?.count,
    ).toBe(2);
  });

  it("repairs pending references after an empty optimized timeline, without rewriting facts", async () => {
    await seed();
    await db
      .prepare(
        "INSERT INTO x_post_sources(handle,user_id,username,last_seen_post_id,last_checked_at,updated_at,collection_started_at) VALUES('member','1','member','101',0,0,0)",
      )
      .run();
    await db
      .prepare(
        "INSERT INTO x_api_cache(key,type,value,fetched_at,expires_at) VALUES('x:relations:v3:member','relation_version','{\"version\":\"v3\"}',?,?)",
      )
      .bind(Date.now(), Date.now() + 86_400_000)
      .run();
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ data: [{ id: "1", username: "member" }] }))
      .mockResolvedValueOnce(json({ data: [], meta: {} }))
      .mockResolvedValueOnce(json({ data: [{ id: "10", text: "recovered" }] }));
    const result = await collectXPostsForHandles(["member"], {
      cacheDb: db,
      bearerToken: "test",
      optimizerEnabled: true,
      source: "manual",
      maxResults: 5,
      afterTimeline: (track) =>
        hydrateXReferences({
          db,
          handles: ["member"],
          bearerToken: "test",
          mode: "post_only",
          tracker: track,
        }),
    });
    expect(result.postsStored).toBe(0);
    expect((await getPost()).reply?.post?.text).toBe("recovered");
    expect(
      (await db.prepare("SELECT last_seen_post_id FROM x_post_sources").first())
        ?.last_seen_post_id,
    ).toBe("101");
    expect(
      (await db.prepare("SELECT COUNT(*) AS count FROM x_post_facts").first())
        ?.count,
    ).toBe(0);
  });
});

describe("X preview dual budget", () => {
  it("fails closed without provider calls when either ledger cannot be read", async () => {
    await seed();
    await db
      .prepare("ALTER TABLE scheduled_usage_daily RENAME TO unavailable_ledger")
      .run();
    try {
      await expect(run()).rejects.toThrow();
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      await db
        .prepare(
          "ALTER TABLE unavailable_ledger RENAME TO scheduled_usage_daily",
        )
        .run();
    }
  });

  it("atomically reserves both ledgers under concurrency and shrinks no other budget", async () => {
    const outcomes = await Promise.allSettled([
      reserveXReferenceBudget(db, 70_000),
      reserveXReferenceBudget(db, 70_000),
    ]);
    expect(
      outcomes.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    let budget = await readXReferenceBudget(db);
    expect([budget.globalReserved, budget.previewReserved]).toEqual([
      70_000, 70_000,
    ]);
    const success = outcomes.find(
      (result) => result.status === "fulfilled",
    ) as PromiseFulfilledResult<(actual: number) => Promise<void>>;
    await success.value(15_000);
    budget = await readXReferenceBudget(db);
    expect([
      budget.globalReserved,
      budget.previewReserved,
      budget.previewUsed,
    ]).toEqual([0, 0, 15_000]);
  });

  it("reconstructs rollout costs and keeps settlement on the admission UTC day", async () => {
    const day = Date.parse("2026-09-04T23:59:59Z");
    await db
      .prepare(
        `INSERT INTO x_api_usage_events(operation,endpoint,resource_type,resource_count,estimated_cost_micros,status,created_at,detail)
      VALUES('user_lookup','/users','user',1,10000,200,?,?)`,
      )
      .bind(day, JSON.stringify({ source: "reply-context" }))
      .run();
    expect((await readXReferenceBudget(db, day)).previewUsed).toBe(10_000);
    const settle = await reserveXReferenceBudget(db, 20_000, day);
    await settle(5_000);
    expect((await readXReferenceBudget(db, day)).previewUsed).toBe(15_000);
    expect((await readXReferenceBudget(db, day + 86_400_000)).previewUsed).toBe(
      0,
    );
  });

  it("health reads do not initialize or write budget ledgers", async () => {
    const before = await db
      .prepare("SELECT COUNT(*) AS count FROM scheduled_usage_daily")
      .first();
    const health = await readXHistoryHealth(db);
    expect(health.referenceHydration?.budgetLimitMicros).toBe(100_000);
    expect(
      await db
        .prepare("SELECT COUNT(*) AS count FROM scheduled_usage_daily")
        .first(),
    ).toEqual(before);
  });
});
