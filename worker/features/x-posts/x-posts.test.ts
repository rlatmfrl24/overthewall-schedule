import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAuthCachesForTests } from "../../platform/auth";
import {
  buildXPostsApplication,
  createXPostsHandler,
} from "./index";
import {
  collectXPostsForHandles,
  clearXServiceCachesForTests,
  fetchXPostsForHandles,
  normalizeXTimelineResponse,
} from "./infrastructure/x-api";
import type { XPostItem } from "../../platform/types";

const AUTH_ISSUER = "https://test-clerk.example.com";
const AUTH_JWKS_URL = `${AUTH_ISSUER}/.well-known/jwks.json`;
const AUTH_KEY_ID = "test-key";
const textEncoder = new TextEncoder();
const handleXPosts = createXPostsHandler(buildXPostsApplication);

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const base64UrlEncode = (value: string | ArrayBuffer) => {
  const bytes =
    typeof value === "string"
      ? textEncoder.encode(value)
      : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

type FakeCacheRecord = {
  type?: string;
  value: string;
  fetched_at?: number;
  expires_at?: number;
};

type FakeStoredPostRecord = {
  id: string;
  handle: string;
  user_id: string | null;
  username: string;
  value: string;
  created_at: string;
  first_seen_at?: number;
  fetched_at: number;
  hidden_at: number | null;
};

type FakePostSourceRecord = {
  handle: string;
  user_id: string | null;
  username: string | null;
  last_seen_post_id: string | null;
  last_checked_at: number;
  updated_at: number;
  last_error: string | null;
  collection_started_at?: number | null;
  initialization_completed_at?: number | null;
  sync_pagination_token?: string | null;
  sync_base_post_id?: string | null;
  sync_newest_post_id?: string | null;
};

type FakeUsageEventRecord = {
  operation: string;
  endpoint: string;
  resource_type: string;
  resource_count: number;
  estimated_cost_micros: number;
  status: number;
  created_at: number;
  detail: string | null;
};

type FakeCollectionRunRecord = {
  source: string;
  status: string;
  checked_handles: number;
  refreshed_handles: number;
  posts_returned: number;
  posts_stored: number;
  api_calls: number;
  estimated_cost_micros: number;
  error: string | null;
};

const makePost = (id: string, username: string): XPostItem => ({
  id,
  text: `post ${id}`,
  createdAt: "2026-02-13T00:00:00Z",
  url: `https://x.com/${username}/status/${id}`,
  username,
  metrics: {
    likeCount: 0,
    replyCount: 0,
    repostCount: 0,
    quoteCount: 0,
  },
  media: [],
});

const publicXSettings = {
  x_posts_visibility: { value: "public" },
};

const makeCacheDb = (
  initial: Record<string, FakeCacheRecord> = {},
  options: { failStoredPostWrites?: boolean } = {},
) => {
  const store = new Map(Object.entries(initial));
  const posts = new Map<string, FakeStoredPostRecord>();
  const sources = new Map<string, FakePostSourceRecord>();
  const usageEvents: FakeUsageEventRecord[] = [];
  const collectionRuns: FakeCollectionRunRecord[] = [];
  let xBudgetLedger: {
    day: string;
    reserved: number;
    used: number;
    limit: number;
  } | null = null;
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes("INSERT INTO scheduled_usage_daily")) {
                const [day, requested, observedUsed, limit] = args;
                const current = xBudgetLedger?.day === String(day)
                  ? xBudgetLedger
                  : {
                      day: String(day),
                      reserved: 0,
                      used: 0,
                      limit: Number(limit),
                    };
                const used = Math.max(current.used, Number(observedUsed));
                if (used + current.reserved + Number(requested) > Number(limit)) {
                  return null as T | null;
                }
                xBudgetLedger = {
                  day: String(day),
                  reserved: current.reserved + Number(requested),
                  used,
                  limit: Number(limit),
                };
                return { reserved: xBudgetLedger.reserved } as T;
              }
              if (
                sql.includes("SELECT limit_value AS limitValue") &&
                sql.includes("x_api_cost_micros")
              ) {
                return (xBudgetLedger
                  ? { limitValue: xBudgetLedger.limit }
                  : null) as T | null;
              }
              if (sql.includes("FROM x_post_sources")) {
                return (sources.get(String(args[0])) ?? null) as T | null;
              }
              if (sql.includes("FROM x_posts")) {
                const post = posts.get(String(args[0]));
                return (post && post.hidden_at === null ? post : null) as T | null;
              }
              if (sql.includes("SUM(estimated_cost_micros)")) {
                const since = Number(args[0]);
                const total = usageEvents
                  .filter((event) => event.created_at >= since)
                  .reduce(
                    (sum, event) => sum + event.estimated_cost_micros,
                    0,
                );
                return { total } as T;
              }
              if (
                sql.includes("FROM x_api_cache") ||
                sql.includes("FROM settings")
              ) {
                return (store.get(String(args[0])) ?? null) as T | null;
              }
              return null as T | null;
            },
            async all<T>() {
              if (sql.includes("FROM members")) {
                return {
                  results: [
                    { url_twitter: "https://x.com/otw_member" },
                  ] as T[],
                };
              }
              if (sql.includes("FROM x_posts")) {
                const handle = String(args[0]);
                const limit = Number(args[1]);
                const results = Array.from(posts.values())
                  .filter(
                    (post) =>
                      post.handle === handle && post.hidden_at === null,
                  )
                  .sort((a, b) => {
                    const dateDiff =
                      new Date(b.created_at).getTime() -
                      new Date(a.created_at).getTime();
                    return dateDiff || b.id.localeCompare(a.id);
                  })
                  .slice(0, limit) as T[];
                return { results };
              }
              return { results: [] as T[] };
            },
            async run() {
              if (
                sql.includes("UPDATE scheduled_usage_daily") &&
                sql.includes("x_api_cost_micros") &&
                xBudgetLedger
              ) {
                const [released, used] = args;
                xBudgetLedger.reserved = Math.max(
                  0,
                  xBudgetLedger.reserved - Number(released),
                );
                xBudgetLedger.used += Number(used);
              }
              if (sql.includes("INSERT INTO settings")) {
                const [key, value] = args;
                store.set(String(key), { value: String(value) });
              }
              if (sql.includes("INSERT INTO x_api_cache")) {
                const [key, type, value, fetchedAt, expiresAt] = args;
                store.set(String(key), {
                  type: String(type),
                  value: String(value),
                  fetched_at: Number(fetchedAt),
                  expires_at: Number(expiresAt),
                });
              }
              if (sql.includes("INSERT INTO x_posts")) {
                if (options.failStoredPostWrites) {
                  throw new Error("stored post write failed");
                }
                for (let index = 0; index < args.length; index += 8) {
                  const [
                    id,
                    handle,
                    userId,
                    username,
                    value,
                    createdAt,
                    firstSeenAt,
                    fetchedAt,
                  ] = args.slice(index, index + 8);
                  posts.set(String(id), {
                    id: String(id),
                    handle: String(handle),
                    user_id: userId === null ? null : String(userId),
                    username: String(username),
                    value: String(value),
                    created_at: String(createdAt),
                    first_seen_at: Number(firstSeenAt),
                    fetched_at: Number(fetchedAt),
                    hidden_at: null,
                  });
                }
              }
              if (sql.includes("INSERT INTO x_post_sources")) {
                const [
                  handle,
                  userId,
                  username,
                  lastSeenPostId,
                  lastCheckedAt,
                  updatedAt,
                  lastError,
                ] = args;
                const key = String(handle);
                const current = sources.get(key);
                sources.set(key, {
                  handle: key,
                  user_id:
                    userId === null ? current?.user_id ?? null : String(userId),
                  username:
                    username === null
                      ? current?.username ?? null
                      : String(username),
                  last_seen_post_id:
                    lastSeenPostId === null
                      ? current?.last_seen_post_id ?? null
                      : String(lastSeenPostId),
                  last_checked_at: Number(lastCheckedAt),
                  updated_at: Number(updatedAt),
                  last_error: lastError === null ? null : String(lastError),
                });
              }
              if (sql.includes("UPDATE x_post_sources")) {
                if (sql.includes("x_sync_continuation")) {
                  const [lastSeen, nextToken, basePostId, newestPostId, , , , updatedAt, handle] = args;
                  const key = String(handle);
                  const current = sources.get(key);
                  if (current) {
                    sources.set(key, {
                      ...current,
                      last_seen_post_id: lastSeen === null ? null : String(lastSeen),
                      sync_pagination_token: nextToken === null ? null : String(nextToken),
                      sync_base_post_id: basePostId === null ? null : String(basePostId),
                      sync_newest_post_id: newestPostId === null ? null : String(newestPostId),
                      updated_at: Number(updatedAt),
                    });
                  }
                  return { success: true };
                }
                const [lastCheckedAt, updatedAt, lastError, handle] = args;
                const key = String(handle);
                const current = sources.get(key);
                if (current) {
                  sources.set(key, {
                    ...current,
                    last_checked_at: Number(lastCheckedAt),
                    updated_at: Number(updatedAt),
                    last_error: lastError === null ? null : String(lastError),
                  });
                }
              }
              if (sql.includes("INSERT INTO x_api_usage_events")) {
                const [
                  operation,
                  endpoint,
                  resourceType,
                  resourceCount,
                  estimatedCostMicros,
                  status,
                  createdAt,
                  detail,
                ] = args;
                usageEvents.push({
                  operation: String(operation),
                  endpoint: String(endpoint),
                  resource_type: String(resourceType),
                  resource_count: Number(resourceCount),
                  estimated_cost_micros: Number(estimatedCostMicros),
                  status: Number(status),
                  created_at: Number(createdAt),
                  detail: detail === null ? null : String(detail),
                });
              }
              if (sql.includes("INSERT INTO x_collection_runs")) {
                const [
                  source,
                  ,
                  ,
                  checkedHandles,
                  refreshedHandles,
                  postsReturned,
                  postsStored,
                  apiCalls,
                  estimatedCostMicros,
                  status,
                  error,
                ] = args;
                collectionRuns.push({
                  source: String(source),
                  status: String(status),
                  checked_handles: Number(checkedHandles),
                  refreshed_handles: Number(refreshedHandles),
                  posts_returned: Number(postsReturned),
                  posts_stored: Number(postsStored),
                  api_calls: Number(apiCalls),
                  estimated_cost_micros: Number(estimatedCostMicros),
                  error: error === null ? null : String(error),
                });
              }
              return {};
            },
          };
        },
      };
    },
  } as unknown as Pick<D1Database, "prepare">;

  return {
    db,
    store,
    posts,
    sources,
    usageEvents,
    collectionRuns,
    getBudgetLedger: () => xBudgetLedger,
  };
};

describe("x worker service", () => {
  let privateKey: CryptoKey;
  let publicJwk: JsonWebKey & { kid: string };

  beforeEach(async () => {
    clearXServiceCachesForTests();
    clearAuthCachesForTests();
    const keyPair = (await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    privateKey = keyPair.privateKey;
    publicJwk = {
      ...((await crypto.subtle.exportKey(
        "jwk",
        keyPair.publicKey,
      )) as JsonWebKey),
      kid: AUTH_KEY_ID,
      alg: "RS256",
      use: "sig",
    };
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const signAdminToken = async () => {
    const header = base64UrlEncode(
      JSON.stringify({ alg: "RS256", kid: AUTH_KEY_ID, typ: "JWT" }),
    );
    const payload = base64UrlEncode(
      JSON.stringify({
        iss: AUTH_ISSUER,
        sub: "user_admin",
        sid: "session_1",
        name: "Admin User",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    );
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      privateKey,
      textEncoder.encode(`${header}.${payload}`),
    );
    return `${header}.${payload}.${base64UrlEncode(signature)}`;
  };

  const makeAdminRequest = async (url: string) => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ keys: [publicJwk] }));
    const token = await signAdminToken();
    return new Request(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  };

  const makeRouteEnv = (
    db: Pick<D1Database, "prepare">,
    overrides: Partial<Parameters<typeof handleXPosts>[1]> = {},
  ) =>
    ({
      YOUTUBE_API_KEY: "",
      X_BEARER_TOKEN: "token",
      CLERK_ISSUER: AUTH_ISSUER,
      CLERK_JWKS_URL: AUTH_JWKS_URL,
      CLERK_ADMIN_IDS: "user_admin",
      otw_db: db,
      ...overrides,
    }) as Parameters<typeof handleXPosts>[1];

  const seedReplyPost = (
    target: ReturnType<typeof makeCacheDb>,
    {
      sourcePostId = "2059529979700846592",
      replyToPostId = "2059529979700846500",
      hidden = false,
    }: {
      sourcePostId?: string;
      replyToPostId?: string;
      hidden?: boolean;
    } = {},
  ) => {
    const post: XPostItem = {
      ...makePost(sourcePostId, "otw_member"),
      reply: {
        postId: replyToPostId,
        conversationId: replyToPostId,
        post: null,
      },
    };
    target.posts.set(sourcePostId, {
      id: sourcePostId,
      handle: "otw_member",
      user_id: "u1",
      username: "otw_member",
      value: JSON.stringify(post),
      created_at: post.createdAt,
      fetched_at: Date.now(),
      hidden_at: hidden ? Date.now() : null,
    });
    return { sourcePostId, replyToPostId };
  };

  it("timeline 응답을 게시글 카드 데이터로 정규화한다", () => {
    const posts = normalizeXTimelineResponse(
      {
        data: [
          {
            id: "123",
            text: "hello",
            created_at: "2026-02-13T00:00:00Z",
            public_metrics: {
              like_count: 10,
              reply_count: 2,
              retweet_count: 3,
              quote_count: 1,
            },
            conversation_id: "100",
            in_reply_to_user_id: "u0",
            referenced_tweets: [
              { type: "replied_to", id: "100" },
              { type: "quoted", id: "200" },
            ],
            attachments: { media_keys: ["m1"] },
            entities: {
              urls: [
                {
                  url: "https://t.co/u50CuYmgiR",
                  expanded_url: "https://example.com/full",
                  display_url: "example.com/full",
                  title: "Example",
                  description: "Example description",
                  images: [{ url: "https://example.com/card.jpg" }],
                },
              ],
            },
          },
        ],
        includes: {
          media: [
            {
              media_key: "m1",
              type: "photo",
              url: "https://example.com/photo.jpg",
              width: 1200,
              height: 800,
              alt_text: "photo alt",
            },
          ],
        },
      },
      "otw_member",
    );

    expect(posts[0]).toMatchObject({
      id: "123",
      text: "hello",
      url: "https://x.com/otw_member/status/123",
      metrics: {
        likeCount: 10,
        replyCount: 2,
        repostCount: 3,
        quoteCount: 1,
      },
      quote: { postId: "200", post: null },
      reply: { postId: "100", conversationId: "100", post: null },
    });
    expect(posts[0]?.media[0]).toMatchObject({
      mediaKey: "m1",
      type: "photo",
      url: "https://example.com/photo.jpg",
      altText: "photo alt",
    });
    expect(posts[0]?.links?.[0]).toMatchObject({
      url: "https://t.co/u50CuYmgiR",
      expandedUrl: "https://example.com/full",
      resolvedUrl: "https://example.com/full",
      displayUrl: "example.com/full",
      title: "Example",
      description: "Example description",
      imageUrl: "https://example.com/card.jpg",
    });
  });

  it("사용자 조회 후 handle별 최신 게시글을 가져온다", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "u1", username: "otw_member", name: "OTW" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "p1",
              text: "first post",
              created_at: "2026-02-13T00:00:00Z",
              public_metrics: {},
            },
          ],
        }),
      );

    const { db, store } = makeCacheDb();
    const result = await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: db,
      maxResults: 5,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/users/by?usernames=otw_member",
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      "/users/u1/tweets?",
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("exclude=retweets");
    expect(String(fetchMock.mock.calls[1]?.[0])).not.toContain(
      "exclude=replies",
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      "referenced_tweets%2Cconversation_id%2Cin_reply_to_user_id",
    );
    expect(result.posts[0]?.id).toBe("p1");
    expect(result.byHandle[0]).toMatchObject({
      handle: "otw_member",
      userId: "u1",
      error: null,
    });
    expect(store.has("x:user:v1:otw_member")).toBe(true);
    expect(store.has("x:posts:v4:otw_member:5:plain")).toBe(true);
  });

  it("저장된 게시글이 stale이면 since_id로 새 글만 증분 조회한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));

    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "u1", username: "otw_member", name: "OTW" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "p1",
              text: "first post",
              created_at: "2026-02-13T00:00:00Z",
              public_metrics: {},
            },
          ],
        }),
      );

    const { db, store, posts, sources } = makeCacheDb();
    await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: db,
      maxResults: 5,
    });

    expect(posts.has("p1")).toBe(true);
    expect(sources.get("otw_member")?.last_seen_post_id).toBe("p1");
    expect(String(fetchMock.mock.calls[1]?.[0])).not.toContain("since_id=");
    expect(store.has("x:relations:v3:otw_member")).toBe(true);

    clearXServiceCachesForTests();
    vi.setSystemTime(new Date("2026-02-13T01:01:00Z"));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            id: "p2",
            text: "second post",
            created_at: "2026-02-13T01:00:00Z",
            public_metrics: {},
          },
        ],
      }),
    );

    const result = await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: db,
      maxResults: 5,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain("since_id=p1");
    expect(result.posts.map((post) => post.id)).toEqual(["p2", "p1"]);
    expect(sources.get("otw_member")?.last_seen_post_id).toBe("p2");
  });

  it("관계 버전 마커가 없는 기존 handle은 fresh 저장 데이터도 한 번 재수집한 뒤 증분 수집으로 복귀한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));
    const target = makeCacheDb();
    const oldPost = makePost("2059529979700846300", "otw_member");
    target.posts.set(oldPost.id, {
      id: oldPost.id,
      handle: "otw_member",
      user_id: "u1",
      username: "otw_member",
      value: JSON.stringify(oldPost),
      created_at: oldPost.createdAt,
      fetched_at: Date.now(),
      hidden_at: null,
    });
    target.sources.set("otw_member", {
      handle: "otw_member",
      user_id: "u1",
      username: "otw_member",
      last_seen_post_id: oldPost.id,
      last_checked_at: Date.now(),
      updated_at: Date.now(),
      last_error: null,
    });
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "u1", username: "otw_member", name: "OTW" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "2059529979700846400",
              text: "relation backfill post",
              created_at: "2026-02-13T00:01:00Z",
              conversation_id: "2059529979700846200",
              referenced_tweets: [
                { type: "replied_to", id: "2059529979700846200" },
              ],
              public_metrics: {},
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "2059529979700846200",
              author_id: "u0",
              text: "reply parent",
              created_at: "2026-02-12T23:00:00Z",
              public_metrics: {},
            },
          ],
          includes: {
            users: [{ id: "u0", username: "parent", name: "Parent" }],
          },
        }),
      );

    const first = await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: target.db,
      maxResults: 5,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1]?.[0])).not.toContain("since_id=");
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain(
      "/tweets?ids=2059529979700846200",
    );
    expect(first.posts[0]).toMatchObject({
      id: "2059529979700846400",
      reply: {
        postId: "2059529979700846200",
        conversationId: "2059529979700846200",
        post: {
          id: "2059529979700846200",
          text: "reply parent",
          username: "parent",
        },
      },
    });
    expect(target.store.has("x:relations:v3:otw_member")).toBe(true);

    clearXServiceCachesForTests();
    vi.setSystemTime(new Date("2026-02-13T01:01:00Z"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));
    await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: target.db,
      maxResults: 5,
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const incrementalTimelineUrl = String(fetchMock.mock.calls[3]?.[0]);
    expect(incrementalTimelineUrl).toContain("max_results=5");
    expect(incrementalTimelineUrl).toContain(
      "since_id=2059529979700846400",
    );
  });

  it("기존 v2 관계 마커가 있어도 보존 중인 게시글 전체를 재보강한 뒤 v3 마커를 기록한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));
    const target = makeCacheDb();
    const postIds = Array.from(
      { length: 10 },
      (_, index) => `20595299797008465${String(index).padStart(2, "0")}`,
    );

    for (const postId of postIds) {
      const post = makePost(postId, "otw_member");
      target.posts.set(post.id, {
        id: post.id,
        handle: "otw_member",
        user_id: "u1",
        username: "otw_member",
        value: JSON.stringify(post),
        created_at: post.createdAt,
        fetched_at: Date.now(),
        hidden_at: null,
      });
    }
    target.sources.set("otw_member", {
      handle: "otw_member",
      user_id: "u1",
      username: "otw_member",
      last_seen_post_id: postIds.at(-1)!,
      last_checked_at: Date.now(),
      updated_at: Date.now(),
      last_error: null,
    });
    target.store.set("x:relations:v2:otw_member", {
      type: "relation_version",
      value: JSON.stringify({ version: "v2" }),
      fetched_at: Date.now(),
      expires_at: Date.now() + 365 * 24 * 60 * 60_000,
    });

    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "u1", username: "otw_member", name: "OTW" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: postIds.map((postId, index) => ({
            id: postId,
            text: `relation backfill ${index}`,
            created_at: "2026-02-13T00:00:00Z",
            conversation_id: "2059529979700846000",
            referenced_tweets: [
              {
                type: "replied_to",
                id: `2059529979700846${String(index).padStart(3, "0")}`,
              },
            ],
            public_metrics: {},
          })),
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: postIds.map((_, index) => ({
            id: `2059529979700846${String(index).padStart(3, "0")}`,
            author_id: "u0",
            text: `reply parent ${index}`,
            created_at: "2026-02-12T23:00:00Z",
            public_metrics: {},
          })),
          includes: {
            users: [{ id: "u0", username: "parent", name: "Parent" }],
          },
        }),
      );

    const result = await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: target.db,
      maxResults: 5,
    });

    expect(result.posts).toHaveLength(5);
    const timelineUrl = String(fetchMock.mock.calls[1]?.[0]);
    expect(timelineUrl).toContain("max_results=25");
    expect(timelineUrl).not.toContain("since_id=");
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain("/tweets?ids=");
    expect(target.store.has("x:relations:v2:otw_member")).toBe(true);
    expect(target.store.has("x:relations:v3:otw_member")).toBe(true);
    for (const [index, postId] of postIds.entries()) {
      const storedPost = JSON.parse(
        target.posts.get(postId)?.value ?? "null",
      ) as XPostItem | null;
      expect(storedPost?.reply).toMatchObject({
        postId: `2059529979700846${String(index).padStart(3, "0")}`,
        post: {
          text: `reply parent ${index}`,
          username: "parent",
        },
      });
    }
  });

  it("새 게시글 저장 실패 시 since_id 커서를 전진시키지 않는다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "u1", username: "otw_member", name: "OTW" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "p1",
              text: "first post",
              created_at: "2026-02-13T00:00:00Z",
              public_metrics: {},
            },
          ],
        }),
      );

    const dbOptions = { failStoredPostWrites: false };
    const { db, posts, sources } = makeCacheDb({}, dbOptions);
    await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: db,
      maxResults: 5,
    });

    expect(posts.has("p1")).toBe(true);
    expect(sources.get("otw_member")).toMatchObject({
      last_seen_post_id: "p1",
      last_checked_at: Date.parse("2026-02-13T00:00:00Z"),
    });

    clearXServiceCachesForTests();
    dbOptions.failStoredPostWrites = true;
    vi.setSystemTime(new Date("2026-02-13T01:01:00Z"));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            id: "p2",
            text: "second post",
            created_at: "2026-02-13T01:00:00Z",
            public_metrics: {},
          },
        ],
      }),
    );

    const result = await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: db,
      maxResults: 5,
    });

    expect(String(fetchMock.mock.calls[2]?.[0])).toContain("since_id=p1");
    expect(result.posts.map((post) => post.id)).toEqual(["p2", "p1"]);
    expect(posts.has("p2")).toBe(false);
    expect(sources.get("otw_member")).toMatchObject({
      last_seen_post_id: "p1",
      last_checked_at: Date.parse("2026-02-13T00:00:00Z"),
    });
  });

  it("since_id 조회 결과가 비어 있으면 저장된 게시글을 유지하고 확인 시각만 갱신한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));

    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "u1", username: "otw_member", name: "OTW" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "p1",
              text: "first post",
              created_at: "2026-02-13T00:00:00Z",
              public_metrics: {},
            },
          ],
        }),
      );

    const { db, sources } = makeCacheDb();
    await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: db,
      maxResults: 5,
    });

    clearXServiceCachesForTests();
    vi.setSystemTime(new Date("2026-02-13T01:01:00Z"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));

    const result = await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: db,
      maxResults: 5,
    });

    expect(String(fetchMock.mock.calls[2]?.[0])).toContain("since_id=p1");
    expect(result.posts.map((post) => post.id)).toEqual(["p1"]);
    expect(sources.get("otw_member")).toMatchObject({
      last_seen_post_id: "p1",
      last_checked_at: Date.parse("2026-02-13T01:01:00Z"),
    });
  });

  it("백그라운드 수집은 사용량과 수집 실행 로그를 기록한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));

    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "u1", username: "otw_member", name: "OTW" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "p1",
              text: "first post",
              created_at: "2026-02-13T00:00:00Z",
              public_metrics: {},
            },
          ],
          includes: {
            media: [
              {
                media_key: "m1",
                type: "photo",
              },
            ],
          },
        }),
      );

    const { db, usageEvents, collectionRuns } = makeCacheDb();
    const result = await collectXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: db,
    });

    expect(result).toMatchObject({
      checkedHandles: 1,
      refreshedHandles: 1,
      apiCalls: 2,
      status: "success",
    });
    expect(usageEvents).toHaveLength(2);
    expect(usageEvents[0]).toMatchObject({
      operation: "user_lookup",
      resource_count: 1,
      estimated_cost_micros: 10_000,
    });
    expect(usageEvents[1]).toMatchObject({
      operation: "timeline",
      resource_count: 2,
      estimated_cost_micros: 10_000,
    });
    expect(collectionRuns[0]).toMatchObject({
      source: "scheduled",
      status: "success",
      api_calls: 2,
      estimated_cost_micros: 20_000,
    });
  });

  it("백그라운드 신규 소스는 과거 캐시를 가져오지 않고 활성화 이후 글만 저장한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));

    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "u1", username: "otw_member", name: "OTW" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "fresh",
              text: "fresh post",
              created_at: "2026-02-13T00:00:00Z",
              public_metrics: {},
            },
          ],
        }),
      );

    const { db, posts } = makeCacheDb({
      "x:posts:v4:otw_member:5:plain": {
        type: "posts",
        value: JSON.stringify({
          userId: "u1",
          posts: [makePost("cached", "otw_member")],
        }),
        fetched_at: Date.now(),
        expires_at: Date.now() + 60 * 60_000,
      },
    });

    const result = await collectXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: db,
    });

    expect(result).toMatchObject({
      status: "success",
      postsStored: 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      "/users/u1/tweets?",
    );
    expect(posts.has("fresh")).toBe(true);
    expect(posts.has("cached")).toBe(false);
  });

  it("백그라운드 수집은 최근 확인한 저장 게시글이 있으면 X API 호출을 건너뛴다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));

    const currentTime = Date.now();
    const cachedPost = makePost("p1", "otw_member");
    const { db, posts, sources, collectionRuns } = makeCacheDb();
    posts.set("p1", {
      id: "p1",
      handle: "otw_member",
      user_id: "u1",
      username: "otw_member",
      value: JSON.stringify(cachedPost),
      created_at: cachedPost.createdAt,
      fetched_at: currentTime,
      hidden_at: null,
    });
    sources.set("otw_member", {
      handle: "otw_member",
      user_id: "u1",
      username: "otw_member",
      last_seen_post_id: "p1",
      last_checked_at: currentTime,
      updated_at: currentTime,
      last_error: null,
    });

    const result = await collectXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: db,
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      checkedHandles: 1,
      refreshedHandles: 0,
      apiCalls: 0,
      status: "skipped",
      error: "all_handles_cooldown",
    });
    expect(collectionRuns[0]).toMatchObject({
      status: "skipped",
      error: "all_handles_cooldown",
      api_calls: 0,
    });
  });

  it("25개 초과 페이지는 continuation을 저장하고 완료 뒤에만 커서를 전진한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T04:00:00Z"));
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        data: [{ id: "u1", username: "otw_member", name: "OTW" }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: [{ id: "p2", text: "newest", created_at: "2026-09-01T04:00:00Z", public_metrics: {} }],
        meta: { next_token: "page-2" },
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: [{ id: "p1", text: "older", created_at: "2026-09-01T03:59:00Z", public_metrics: {} }],
      }));
    const target = makeCacheDb();

    await collectXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: target.db,
      source: "manual",
    });
    expect(target.sources.get("otw_member")).toMatchObject({
      last_seen_post_id: null,
      sync_pagination_token: "page-2",
      sync_newest_post_id: "p2",
    });

    await collectXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: target.db,
      source: "manual",
    });
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain("pagination_token=page-2");
    expect(target.sources.get("otw_member")).toMatchObject({
      last_seen_post_id: "p2",
      sync_pagination_token: null,
      sync_newest_post_id: null,
    });
  });

  it("수동 수집은 최근 확인 또는 오류 쿨다운 중인 핸들도 다시 조회한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));

    const currentTime = Date.now();
    const cachedPost = makePost("p1", "otw_member");
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "u1", username: "otw_member", name: "OTW" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "p2",
              text: "manual recovery post",
              created_at: "2026-02-13T00:00:00Z",
              public_metrics: {},
            },
          ],
        }),
      );
    const { db, posts, sources, collectionRuns } = makeCacheDb();
    posts.set("p1", {
      id: "p1",
      handle: "otw_member",
      user_id: "u1",
      username: "otw_member",
      value: JSON.stringify(cachedPost),
      created_at: cachedPost.createdAt,
      fetched_at: currentTime,
      hidden_at: null,
    });
    sources.set("otw_member", {
      handle: "otw_member",
      user_id: "u1",
      username: "otw_member",
      last_seen_post_id: "p1",
      last_checked_at: currentTime,
      updated_at: currentTime,
      last_error: "x_api_unavailable",
    });

    const result = await collectXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: db,
      source: "manual",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      checkedHandles: 1,
      refreshedHandles: 1,
      status: "success",
    });
    expect(collectionRuns[0]).toMatchObject({
      source: "manual",
      status: "success",
    });
  });

  it("백그라운드 수집은 활성 계정도 2시간 쿨다운 전에는 재조회하지 않는다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));

    const currentTime = Date.now();
    const cachedPost = makePost("p1", "otw_member");
    const { db, posts, sources } = makeCacheDb();
    posts.set("p1", {
      id: "p1",
      handle: "otw_member",
      user_id: "u1",
      username: "otw_member",
      value: JSON.stringify(cachedPost),
      created_at: cachedPost.createdAt,
      fetched_at: currentTime,
      hidden_at: null,
    });
    sources.set("otw_member", {
      handle: "otw_member",
      user_id: "u1",
      username: "otw_member",
      last_seen_post_id: "p1",
      last_checked_at: currentTime - 90 * 60_000,
      updated_at: currentTime - 90 * 60_000,
      last_error: null,
    });

    const result = await collectXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: db,
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      checkedHandles: 1,
      refreshedHandles: 0,
      apiCalls: 0,
      status: "skipped",
      error: "all_handles_cooldown",
    });
  });

  it("백그라운드 수집은 신규 핸들 최초 실패도 소스 오류로 저장하고 쿨다운한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));

    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));
    const { db, sources } = makeCacheDb();

    const first = await collectXPostsForHandles(["missing_member"], {
      bearerToken: "token",
      cacheDb: db,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({
      checkedHandles: 1,
      refreshedHandles: 0,
      status: "success",
    });
    expect(sources.get("missing_member")).toMatchObject({
      handle: "missing_member",
      user_id: null,
      username: null,
      last_seen_post_id: null,
      last_checked_at: Date.now(),
      last_error: "user_not_found",
    });

    fetchMock.mockClear();
    const second = await collectXPostsForHandles(["missing_member"], {
      bearerToken: "token",
      cacheDb: db,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(second).toMatchObject({
      checkedHandles: 1,
      refreshedHandles: 0,
      apiCalls: 0,
      status: "skipped",
      error: "all_handles_cooldown",
    });
  });

  it("백그라운드 수집은 D1 게시글 저장 실패를 실패 결과로 기록한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "u1", username: "otw_member", name: "OTW" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "p1",
              text: "first post",
              created_at: "2026-02-13T00:00:00Z",
              public_metrics: {},
            },
          ],
        }),
      );

    const { db, posts, collectionRuns } = makeCacheDb(
      {},
      { failStoredPostWrites: true },
    );
    const result = await collectXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: db,
    });

    expect(result).toMatchObject({
      status: "failed",
      error: "x_post_storage_failed",
      postsReturned: 1,
      postsStored: 0,
      apiCalls: 2,
    });
    expect(posts.has("p1")).toBe(false);
    expect(collectionRuns[0]).toMatchObject({
      status: "failed",
      posts_stored: 0,
      error: "x_post_storage_failed",
    });
  });

  it("일일 예산을 초과하면 추가 X API 호출을 막는다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));

    const { db, usageEvents } = makeCacheDb({
      x_collection_daily_budget_cents: { value: "1" },
    });
    usageEvents.push({
      operation: "timeline",
      endpoint: "/users/u1/tweets",
      resource_type: "mixed",
      resource_count: 2,
      estimated_cost_micros: 10_000,
      status: 200,
      created_at: Date.now(),
      detail: null,
    });

    const result = await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: db,
      maxResults: 5,
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(result.byHandle[0]).toMatchObject({
      error: "budget_exceeded",
      errorStatus: 429,
    });
  });

  it("429 응답을 받으면 reset 시각까지 추가 X API 호출을 막는다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));

    const fetchMock = vi.mocked(fetch);
    const resetAt = Date.parse("2026-02-13T00:15:00Z");
    fetchMock.mockResolvedValueOnce(
      new Response("rate limited", {
        status: 429,
        headers: { "x-rate-limit-reset": String(Math.floor(resetAt / 1000)) },
      }),
    );
    const { db, store } = makeCacheDb();

    const first = await collectXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: db,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({
      status: "failed",
      apiCalls: 1,
    });
    expect(store.get("x_api_backoff_until")?.value).toBe(String(resetAt));

    fetchMock.mockClear();
    const second = await collectXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: db,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(second).toMatchObject({
      status: "skipped",
      apiCalls: 0,
      error: "all_handles_cooldown",
    });
  });

  it("stale 게시글을 제공해도 원래 rate-limit 원인과 source cooldown을 보존한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));

    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "u1", username: "otw_member", name: "OTW" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{
            id: "p1",
            text: "cached",
            created_at: "2026-02-13T00:00:00Z",
            public_metrics: {},
          }],
        }),
      );
    const { db, sources, collectionRuns } = makeCacheDb();
    await collectXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: db,
    });

    clearXServiceCachesForTests();
    vi.setSystemTime(new Date("2026-02-13T02:01:00Z"));
    fetchMock.mockResolvedValueOnce(
      new Response("rate limited", {
        status: 429,
        headers: {
          "x-rate-limit-reset": String(
            Math.floor(Date.parse("2026-02-13T02:15:00Z") / 1000),
          ),
        },
      }),
    );

    const result = await collectXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: db,
    });

    expect(result).toMatchObject({
      status: "failed",
      error: "rate_limited",
      postsReturned: 1,
    });
    expect(sources.get("otw_member")?.last_error).toBe("rate_limited");
    expect(collectionRuns.at(-1)).toMatchObject({
      status: "failed",
      error: "rate_limited",
    });
  });

  it("백그라운드 수집은 예산 초과를 보호 정책 skip으로 기록한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));

    const { db, usageEvents, collectionRuns, sources } = makeCacheDb({
      x_collection_daily_budget_cents: { value: "1" },
    });
    usageEvents.push({
      operation: "timeline",
      endpoint: "/users/u1/tweets",
      resource_type: "mixed",
      resource_count: 2,
      estimated_cost_micros: 10_000,
      status: 200,
      created_at: Date.now(),
      detail: null,
    });

    const result = await collectXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: db,
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "skipped",
      error: "budget_exceeded",
      postsStored: 0,
      apiCalls: 0,
    });
    expect(collectionRuns[0]).toMatchObject({
      status: "skipped",
      error: "budget_exceeded",
    });
    expect(sources.get("otw_member")?.last_error).toBe("budget_exceeded");
  });

  it("예약한 최대 비용 대신 실제 반환 리소스 비용만 예산 ledger에 확정한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));

    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "u1", username: "otw_one", name: "OTW One" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{
            id: "p1",
            text: "first",
            created_at: "2026-02-13T00:00:00Z",
            public_metrics: {},
          }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "u2", username: "otw_two", name: "OTW Two" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{
            id: "p2",
            text: "second",
            created_at: "2026-02-13T00:00:00Z",
            public_metrics: {},
          }],
        }),
      );

    const { db, getBudgetLedger } = makeCacheDb({
      x_collection_daily_budget_cents: { value: "10" },
    });

    const first = await fetchXPostsForHandles(["otw_one"], {
      bearerToken: "token",
      cacheDb: db,
      maxResults: 5,
    });
    const second = await fetchXPostsForHandles(["otw_two"], {
      bearerToken: "token",
      cacheDb: db,
      maxResults: 5,
    });

    expect(first.byHandle[0]?.error).toBeNull();
    expect(second.byHandle[0]?.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(getBudgetLedger()).toMatchObject({
      reserved: 0,
      used: 30_000,
      limit: 100_000,
    });
  });

  it("전송 후 네트워크 오류로 사용량을 알 수 없으면 예약 비용을 보수적으로 확정한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));

    vi.mocked(fetch).mockRejectedValueOnce(new Error("network interrupted"));
    const { db, usageEvents, getBudgetLedger } = makeCacheDb({
      x_collection_daily_budget_cents: { value: "10" },
    });

    await expect(
      fetchXPostsForHandles(["otw_member"], {
        bearerToken: "token",
        cacheDb: db,
        maxResults: 5,
      }),
    ).rejects.toMatchObject({ code: "x_api_error" });
    expect(usageEvents).toHaveLength(1);
    expect(usageEvents[0]).toMatchObject({
      operation: "user_lookup",
      status: 0,
      resource_count: 0,
      estimated_cost_micros: 10_000,
    });
    expect(JSON.parse(usageEvents[0]?.detail ?? "{}")).toMatchObject({
      costBasis: "conservative_request_estimate",
    });
    expect(getBudgetLedger()).toMatchObject({
      reserved: 0,
      used: 10_000,
      limit: 100_000,
    });
  });

  it("성공 응답의 JSON 파싱이 실패하면 예약 비용을 보수적으로 확정한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("{", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const { db, usageEvents, getBudgetLedger } = makeCacheDb({
      x_collection_daily_budget_cents: { value: "10" },
    });

    await expect(
      fetchXPostsForHandles(["otw_member"], {
        bearerToken: "token",
        cacheDb: db,
        maxResults: 5,
      }),
    ).rejects.toMatchObject({ code: "x_api_error" });
    expect(usageEvents[0]).toMatchObject({
      operation: "user_lookup",
      status: 200,
      resource_count: 0,
      estimated_cost_micros: 10_000,
    });
    expect(getBudgetLedger()).toMatchObject({
      reserved: 0,
      used: 10_000,
      limit: 100_000,
    });
  });

  it("측정 가능한 정상 0건 응답은 예약 비용을 사용량으로 확정하지 않는다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));

    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ data: [] }));
    const { db, usageEvents, getBudgetLedger } = makeCacheDb({
      x_collection_daily_budget_cents: { value: "10" },
    });

    const result = await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: db,
      maxResults: 5,
    });

    expect(result.byHandle[0]).toMatchObject({
      handle: "otw_member",
      error: "user_not_found",
    });
    expect(usageEvents[0]).toMatchObject({
      operation: "user_lookup",
      status: 200,
      resource_count: 0,
      estimated_cost_micros: 0,
    });
    expect(getBudgetLedger()).toMatchObject({
      reserved: 0,
      used: 0,
      limit: 100_000,
    });
  });

  it("예상 요청 비용이 일일 예산을 넘으면 첫 X API 호출도 차단한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));

    const { db } = makeCacheDb({
      x_collection_daily_budget_cents: { value: "1" },
    });

    const result = await fetchXPostsForHandles(["otw_one", "otw_two"], {
      bearerToken: "token",
      cacheDb: db,
      maxResults: 5,
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(result.byHandle).toHaveLength(2);
    expect(result.byHandle).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          handle: "otw_one",
          error: "budget_exceeded",
          errorStatus: 429,
        }),
        expect.objectContaining({
          handle: "otw_two",
          error: "budget_exceeded",
          errorStatus: 429,
        }),
      ]),
    );
  });

  it("저장된 게시글이 stale이면 since_id로 새 글만 증분 조회한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));

    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "u1", username: "otw_member", name: "OTW" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "p1",
              text: "first post",
              created_at: "2026-02-13T00:00:00Z",
              public_metrics: {},
            },
          ],
        }),
      );

    const { db, posts, sources } = makeCacheDb();
    await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: db,
      maxResults: 5,
    });

    expect(posts.has("p1")).toBe(true);
    expect(sources.get("otw_member")?.last_seen_post_id).toBe("p1");

    clearXServiceCachesForTests();
    vi.setSystemTime(new Date("2026-02-13T01:01:00Z"));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            id: "p2",
            text: "second post",
            created_at: "2026-02-13T01:00:00Z",
            public_metrics: {},
          },
        ],
      }),
    );

    const result = await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: db,
      maxResults: 5,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain("since_id=p1");
    expect(result.posts.map((post) => post.id)).toEqual(["p2", "p1"]);
    expect(sources.get("otw_member")?.last_seen_post_id).toBe("p2");
  });

  it("since_id 조회 결과가 비어 있으면 저장된 게시글을 유지하고 확인 시각만 갱신한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));

    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "u1", username: "otw_member", name: "OTW" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "p1",
              text: "first post",
              created_at: "2026-02-13T00:00:00Z",
              public_metrics: {},
            },
          ],
        }),
      );

    const { db, sources } = makeCacheDb();
    await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: db,
      maxResults: 5,
    });

    clearXServiceCachesForTests();
    vi.setSystemTime(new Date("2026-02-13T01:01:00Z"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));

    const result = await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: db,
      maxResults: 5,
    });

    expect(String(fetchMock.mock.calls[2]?.[0])).toContain("since_id=p1");
    expect(result.posts.map((post) => post.id)).toEqual(["p1"]);
    expect(sources.get("otw_member")).toMatchObject({
      last_seen_post_id: "p1",
      last_checked_at: Date.parse("2026-02-13T01:01:00Z"),
    });
  });

  it("게시글 링크 메타데이터가 부족하면 HTML 프리뷰를 보강한다", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "u1", username: "otw_member", name: "OTW" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "p1",
              text: "link https://t.co/link",
              created_at: "2026-02-13T00:00:00Z",
              public_metrics: {},
              entities: {
                urls: [
                  {
                    url: "https://t.co/link",
                    expanded_url: "https://example.com/article",
                    display_url: "example.com/article",
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          `
            <html>
              <head>
                <meta property="og:title" content="Article title">
                <meta property="og:description" content="Article description">
                <meta property="og:image" content="https://example.com/card.jpg">
              </head>
            </html>
          `,
          {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          },
        ),
      );

    const result = await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: makeCacheDb().db,
      maxResults: 5,
      richXLinkPreviewEnabled: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe(
      "https://example.com/article",
    );
    expect(result.posts[0]?.links?.[0]).toMatchObject({
      resolvedUrl: "https://example.com/article",
      domain: "example.com",
      title: "Article title",
      description: "Article description",
      imageUrl: "https://example.com/card.jpg",
      previewStatus: "ready",
    });
  });

  it("누락된 인용 표식은 옵션이 켜져 있어도 관계 preview로 보강한다", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "u1", username: "otw_member", name: "OTW" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "p1",
              text: "quoted https://t.co/status",
              created_at: "2026-02-13T00:00:00Z",
              public_metrics: {},
              entities: {
                urls: [
                  {
                    url: "https://t.co/status",
                    expanded_url: "https://x.com/linked_member/status/9876543210",
                    display_url: "x.com/linked_member/status/9876543210",
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "9876543210",
              author_id: "u2",
              text: "linked post body",
              created_at: "2026-02-12T23:00:00Z",
              public_metrics: {
                like_count: 7,
                reply_count: 1,
                retweet_count: 2,
                quote_count: 3,
              },
              attachments: { media_keys: ["m1"] },
            },
          ],
          includes: {
            users: [
              {
                id: "u2",
                username: "linked_member",
                name: "Linked Member",
                profile_image_url: "https://pbs.twimg.com/profile.jpg",
              },
            ],
            media: [
              {
                media_key: "m1",
                type: "photo",
                url: "https://pbs.twimg.com/media/photo.jpg",
                width: 1200,
                height: 675,
              },
            ],
          },
        }),
      );

    const result = await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: makeCacheDb().db,
      maxResults: 5,
      richXLinkPreviewEnabled: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain(
      "/tweets?ids=9876543210",
    );
    expect(result.posts[0]?.quote).toMatchObject({
      postId: "9876543210",
      post: {
        id: "9876543210",
        text: "linked post body",
        username: "linked_member",
        name: "Linked Member",
        profileImageUrl: "https://pbs.twimg.com/profile.jpg",
        metrics: {
          likeCount: 7,
          replyCount: 1,
          repostCount: 2,
          quoteCount: 3,
        },
      },
    });
    expect(result.posts[0]?.links?.[0]?.linkedPost).toBeUndefined();
  });

  it("캐시된 추론 인용 프리뷰는 추가 lookup 없이 사용한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));

    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "u1", username: "otw_member", name: "OTW" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "p1",
              text: "quoted https://t.co/status",
              created_at: "2026-02-13T00:00:00Z",
              public_metrics: {},
              entities: {
                urls: [
                  {
                    url: "https://t.co/status",
                    expanded_url: "https://x.com/linked_member/status/9876543210",
                    display_url: "x.com/linked_member/status/9876543210",
                  },
                ],
              },
            },
          ],
        }),
      );

    const cachedPreview = {
      id: "9876543210",
      text: "cached linked body",
      createdAt: "2026-02-12T23:00:00Z",
      url: "https://x.com/linked_member/status/9876543210",
      username: "linked_member",
      name: "Linked Member",
      profileImageUrl: null,
      metrics: {
        likeCount: 1,
        replyCount: 0,
        repostCount: 0,
        quoteCount: 0,
      },
      media: [],
    };
    const { db } = makeCacheDb({
      "x:linked-post:v1:9876543210": {
        type: "linked_post",
        value: JSON.stringify({ post: cachedPreview }),
        fetched_at: Date.now(),
        expires_at: Date.now() + 7 * 24 * 60 * 60_000,
      },
    });

    const result = await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: db,
      maxResults: 5,
      richXLinkPreviewEnabled: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.posts[0]?.quote).toMatchObject({
      postId: "9876543210",
      post: {
        id: "9876543210",
        text: "cached linked body",
      },
    });
    expect(result.posts[0]?.links?.[0]?.linkedPost).toBeUndefined();
  });

  it("일반 링크 프리뷰 옵션이 꺼져 있으면 추가 lookup을 호출하지 않는다", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "u1", username: "otw_member", name: "OTW" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "p1",
              text: "linked https://t.co/status",
              created_at: "2026-02-13T00:00:00Z",
              public_metrics: {},
              entities: {
                urls: [
                  {
                    url: "https://t.co/status",
                    expanded_url: "https://example.com/article",
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        new Response("<html><head><title>Article</title></head></html>", {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
      );

    const { db, store } = makeCacheDb();
    const result = await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: db,
      maxResults: 5,
      richXLinkPreviewEnabled: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe(
      "https://example.com/article",
    );
    expect(result.posts[0]?.quote).toBeNull();
    expect(result.posts[0]?.links?.[0]).toMatchObject({
      previewStatus: "ready",
    });
    expect(result.posts[0]?.links?.[0]?.linkedPost).toBeUndefined();
    expect(store.has("x:posts:v4:otw_member:5:plain")).toBe(true);
  });

  it("인용 표식이 누락된 status 링크와 답글 대상을 한 번의 배치 lookup으로 보강하고 저장한다", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "u1", username: "otw_member", name: "OTW" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "2059529979700846592",
              text: "linked https://t.co/status",
              created_at: "2026-02-13T00:00:00Z",
              conversation_id: "2059529979700846592",
              public_metrics: {},
              entities: {
                urls: [
                  {
                    url: "https://t.co/status",
                    expanded_url:
                      "https://x.com/linked_member/status/2059529979700846500",
                  },
                ],
              },
            },
            {
              id: "2059529979700846492",
              text: "@parent reply body",
              created_at: "2026-02-12T23:30:00Z",
              conversation_id: "2059529979700846400",
              referenced_tweets: [
                { type: "replied_to", id: "2059529979700846400" },
              ],
              public_metrics: {},
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "2059529979700846500",
              author_id: "u2",
              text: "quoted post body",
              created_at: "2026-02-12T23:00:00Z",
              public_metrics: {},
            },
            {
              id: "2059529979700846400",
              author_id: "u3",
              text: "reply parent body",
              created_at: "2026-02-12T22:00:00Z",
              public_metrics: {},
            },
          ],
          includes: {
            users: [
              {
                id: "u2",
                username: "linked_member",
                name: "Linked Member",
              },
              {
                id: "u3",
                username: "parent_member",
                name: "Parent Member",
              },
            ],
          },
        }),
      );

    const { db, posts, usageEvents } = makeCacheDb();
    const result = await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: db,
      maxResults: 5,
      richXLinkPreviewEnabled: true,
      usageSource: "scheduled",
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const lookupCalls = fetchMock.mock.calls.filter(
      ([input]) => new URL(String(input)).pathname === "/2/tweets",
    );
    expect(lookupCalls).toHaveLength(1);
    const lookupUrl = new URL(String(lookupCalls[0]?.[0]));
    expect(lookupUrl.pathname).toBe("/2/tweets");
    expect(lookupUrl.searchParams.get("ids")).toBe(
      "2059529979700846500,2059529979700846400",
    );
    expect(result.posts.find((post) => post.id === "2059529979700846592"))
      .toMatchObject({
      quote: {
        postId: "2059529979700846500",
        post: {
          id: "2059529979700846500",
          text: "quoted post body",
          username: "linked_member",
        },
      },
    });
    expect(result.posts.find((post) => post.id === "2059529979700846492"))
      .toMatchObject({
        reply: {
          postId: "2059529979700846400",
          conversationId: "2059529979700846400",
          post: {
            id: "2059529979700846400",
            text: "reply parent body",
            username: "parent_member",
          },
        },
      });
    expect(
      result.posts.find((post) => post.id === "2059529979700846592")
        ?.links?.[0]?.linkedPost,
    ).toBeUndefined();
    const storedQuote = JSON.parse(
      posts.get("2059529979700846592")?.value ?? "null",
    ) as XPostItem | null;
    const storedReply = JSON.parse(
      posts.get("2059529979700846492")?.value ?? "null",
    ) as XPostItem | null;
    expect(storedQuote?.quote?.post?.id).toBe("2059529979700846500");
    expect(storedReply?.reply?.post?.id).toBe("2059529979700846400");
    expect(usageEvents.at(-1)).toMatchObject({
      operation: "tweet_lookup",
      resource_count: 4,
    });
  });

  it("캐시된 구조화된 인용 게시글은 외부 lookup 없이 보강한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "u1", username: "otw_member", name: "OTW" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "2059529979700846592",
              text: "quoted https://t.co/status",
              created_at: "2026-02-13T00:00:00Z",
              referenced_tweets: [
                { type: "quoted", id: "2059529979700846500" },
              ],
              public_metrics: {},
            },
          ],
        }),
      );
    const cachedPreview = {
      id: "2059529979700846500",
      text: "cached quote",
      createdAt: "2026-02-12T23:00:00Z",
      url: "https://x.com/linked_member/status/2059529979700846500",
      username: "linked_member",
      name: "Linked Member",
      profileImageUrl: null,
      metrics: {
        likeCount: 0,
        replyCount: 0,
        repostCount: 0,
        quoteCount: 0,
      },
      media: [],
    };
    const { db } = makeCacheDb({
      "x:linked-post:v1:2059529979700846500": {
        type: "linked_post",
        value: JSON.stringify({ post: cachedPreview }),
        fetched_at: Date.now(),
        expires_at: Date.now() + 7 * 24 * 60 * 60_000,
      },
    });

    const result = await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: db,
      maxResults: 5,
      richXLinkPreviewEnabled: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.posts[0]?.quote?.post).toMatchObject({
      id: "2059529979700846500",
      text: "cached quote",
    });
  });

  it("누락되거나 보호·삭제된 답글 대상은 null fallback과 7일 캐시를 남긴다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));
    const parentIds = [
      "2059529979700846100",
      "2059529979700846200",
      "2059529979700846300",
    ];
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "u1", username: "otw_member", name: "OTW" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: parentIds.map((parentId, index) => ({
            id: `20595299797008464${index}0`,
            text: `@parent reply ${index}`,
            created_at: `2026-02-13T00:0${index}:00Z`,
            conversation_id: parentId,
            referenced_tweets: [{ type: "replied_to", id: parentId }],
            public_metrics: {},
          })),
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: parentIds[1],
              author_id: "protected-user",
              text: "protected parent",
              created_at: "2026-02-12T23:00:00Z",
              public_metrics: {},
            },
          ],
          includes: {
            users: [
              {
                id: "protected-user",
                username: "protected_parent",
                name: "Protected Parent",
                protected: true,
              },
            ],
          },
          errors: [
            { value: parentIds[0], detail: "not found" },
            { value: parentIds[2], detail: "deleted" },
          ],
        }),
      );

    const { db, store } = makeCacheDb();
    const result = await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: db,
      maxResults: 5,
      richXLinkPreviewEnabled: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      new Set(
        new URL(String(fetchMock.mock.calls[2]?.[0]))
          .searchParams.get("ids")
          ?.split(","),
      ),
    ).toEqual(new Set(parentIds));
    expect(result.posts).toHaveLength(3);
    expect(result.posts.every((post) => post.reply?.post === null)).toBe(true);
    for (const parentId of parentIds) {
      const cache = store.get(`x:linked-post:v1:${parentId}`);
      expect(JSON.parse(cache?.value ?? "null")).toEqual({ post: null });
      expect(cache?.expires_at).toBe(Date.now() + 15 * 60_000);
    }
  });

  it("구조화된 인용 lookup 실패 시 원문 링크 폴백을 남기고 피드를 반환한다", async () => {
    const fetchMock = vi.mocked(fetch);
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "u1", username: "otw_member", name: "OTW" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "2059529979700846592",
              text: "quoted https://t.co/status",
              created_at: "2026-02-13T00:00:00Z",
              referenced_tweets: [
                { type: "quoted", id: "2059529979700846500" },
              ],
              public_metrics: {},
            },
          ],
        }),
      )
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }));

    const result = await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: makeCacheDb().db,
      maxResults: 5,
      richXLinkPreviewEnabled: false,
    });

    expect(result.posts[0]).toMatchObject({
      id: "2059529979700846592",
      quote: { postId: "2059529979700846500", post: null },
    });
    expect(consoleWarn).toHaveBeenCalledWith(
      "Failed to enrich referenced X posts",
      expect.any(Error),
    );
  });

  it("증분 수집에서 일시적으로 실패한 기존 답글 대상 lookup을 다시 시도한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));
    const fetchMock = vi.mocked(fetch);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "u1", username: "otw_member", name: "OTW" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "2059529979700846592",
              text: "@parent reply body",
              created_at: "2026-02-13T00:00:00Z",
              conversation_id: "2059529979700846500",
              referenced_tweets: [
                { type: "replied_to", id: "2059529979700846500" },
              ],
              public_metrics: {},
            },
          ],
        }),
      )
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }));

    const target = makeCacheDb();
    const first = await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: target.db,
      maxResults: 5,
      richXLinkPreviewEnabled: false,
    });

    expect(first.posts[0]?.reply).toEqual({
      postId: "2059529979700846500",
      conversationId: "2059529979700846500",
      post: null,
    });
    expect(target.sources.get("otw_member")?.last_seen_post_id).toBe(
      "2059529979700846592",
    );

    clearXServiceCachesForTests();
    vi.setSystemTime(new Date("2026-02-13T01:01:00Z"));
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "2059529979700846692",
              text: "new incremental post",
              created_at: "2026-02-13T01:00:00Z",
              public_metrics: {},
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "2059529979700846500",
              author_id: "u2",
              text: "recovered reply parent",
              created_at: "2026-02-12T23:00:00Z",
              public_metrics: {},
            },
          ],
          includes: {
            users: [
              {
                id: "u2",
                username: "linked_member",
                name: "Linked Member",
              },
            ],
          },
        }),
      );

    const second = await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: target.db,
      maxResults: 5,
      richXLinkPreviewEnabled: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(String(fetchMock.mock.calls[3]?.[0])).toContain(
      "since_id=2059529979700846592",
    );
    expect(String(fetchMock.mock.calls[4]?.[0])).toContain(
      "/tweets?ids=2059529979700846500",
    );
    expect(
      second.posts.find((post) => post.id === "2059529979700846592")?.reply
        ?.post,
    ).toMatchObject({
      id: "2059529979700846500",
      text: "recovered reply parent",
      username: "linked_member",
    });
    const storedPost = JSON.parse(
      target.posts.get("2059529979700846592")?.value ?? "null",
    ) as XPostItem | null;
    expect(storedPost?.reply?.post).toMatchObject({
      id: "2059529979700846500",
      text: "recovered reply parent",
    });
  });

  it("X 게시글 링크 lookup 실패는 피드 전체 실패로 전파하지 않는다", async () => {
    const fetchMock = vi.mocked(fetch);
    const consoleWarn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "u1", username: "otw_member", name: "OTW" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "p1",
              text: "quoted https://t.co/status",
              created_at: "2026-02-13T00:00:00Z",
              public_metrics: {},
              entities: {
                urls: [
                  {
                    url: "https://t.co/status",
                    expanded_url: "https://x.com/linked_member/status/9876543210",
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }));

    const result = await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: makeCacheDb().db,
      maxResults: 5,
      richXLinkPreviewEnabled: true,
    });

    expect(result.posts[0]?.id).toBe("p1");
    expect(result.posts[0]?.links?.[0]?.linkedPost).toBeUndefined();
    expect(result.posts[0]?.quote).toEqual({
      postId: "9876543210",
      post: null,
    });
    expect(consoleWarn).toHaveBeenCalledWith(
      "Failed to enrich referenced X posts",
      expect.any(Error),
    );
  });

  it("위험한 링크 프리뷰는 fetch하지 않고 게시글은 유지한다", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "u1", username: "otw_member", name: "OTW" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "p1",
              text: "link https://t.co/private",
              created_at: "2026-02-13T00:00:00Z",
              public_metrics: {},
              entities: {
                urls: [
                  {
                    url: "https://t.co/private",
                    expanded_url: "https://127.0.0.1/admin",
                  },
                ],
              },
            },
          ],
        }),
      );

    const result = await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: makeCacheDb().db,
      maxResults: 5,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.posts[0]).toMatchObject({ id: "p1" });
    expect(result.posts[0]?.links?.[0]).toMatchObject({
      previewStatus: "skipped",
    });
  });

  it("debug GET은 외부 X API를 강제 호출하지 않고 저장 데이터만 진단한다", async () => {
    const fetchMock = vi.mocked(fetch);
    const request = await makeAdminRequest(
      "https://example.com/api/x/posts?handles=otw_member&debug=1",
    );
    const response = await handleXPosts(
      request,
      makeRouteEnv(makeCacheDb(publicXSettings).db),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toMatchObject({
      posts: [],
      byHandle: [{ handle: "otw_member", posts: [] }],
    });
  });

  it("라우트는 기본 요청에서 X API를 호출하지 않고 저장 데이터만 반환한다", async () => {
    const response = await handleXPosts(
      new Request("https://example.com/api/x/posts?handles=otw_member"),
      {
        YOUTUBE_API_KEY: "",
        X_BEARER_TOKEN: "token",
        otw_db: makeCacheDb(publicXSettings).db,
      } as Parameters<typeof handleXPosts>[1],
    );

    expect(response.status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      posts: [],
      byHandle: [
        {
          handle: "otw_member",
          posts: [],
          error: null,
        },
      ],
    });
  });

  it("기존 D1 답글 JSON에 post가 없어도 공개 응답에서는 null로 정규화한다", async () => {
    const target = makeCacheDb(publicXSettings);
    const sourcePostId = "2059529979700846592";
    const replyToPostId = "2059529979700846500";
    const legacyPost = {
      ...makePost(sourcePostId, "otw_member"),
      reply: {
        postId: replyToPostId,
        conversationId: replyToPostId,
      },
    };
    target.posts.set(sourcePostId, {
      id: sourcePostId,
      handle: "otw_member",
      user_id: "u1",
      username: "otw_member",
      value: JSON.stringify(legacyPost),
      created_at: legacyPost.createdAt,
      fetched_at: Date.now(),
      hidden_at: null,
    });

    const response = await handleXPosts(
      new Request("https://example.com/api/x/posts?handles=otw_member"),
      makeRouteEnv(target.db),
    );
    const body = (await response.json()) as { posts: XPostItem[] };

    expect(response.status).toBe(200);
    expect(body.posts[0]?.reply).toEqual({
      postId: replyToPostId,
      conversationId: replyToPostId,
      post: null,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("답글 문맥 API는 저장된 공개 답글에서 서버가 도출한 바로 위 게시글만 조회한다", async () => {
    const target = makeCacheDb(publicXSettings);
    const { sourcePostId, replyToPostId } = seedReplyPost(target);
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            id: replyToPostId,
            author_id: "u0",
            text: "parent post",
            created_at: "2026-02-12T23:00:00Z",
            public_metrics: {},
          },
        ],
        includes: {
          users: [
            { id: "u0", username: "parent_user", name: "Parent User" },
          ],
        },
      }),
    );

    const response = await handleXPosts(
      new Request(`https://example.com/api/x/posts/${sourcePostId}/context`),
      makeRouteEnv(target.db),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600",
    );
    await expect(response.json()).resolves.toMatchObject({
      sourcePostId,
      replyTo: {
        id: replyToPostId,
        text: "parent post",
        username: "parent_user",
      },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain(
      `/tweets?ids=${replyToPostId}`,
    );
  });

  it("답글 문맥 캐시가 적중하면 토큰이나 외부 호출 없이 반환한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));
    const replyToPostId = "2059529979700846500";
    const cachedPreview = {
      id: replyToPostId,
      text: "cached parent",
      createdAt: "2026-02-12T23:00:00Z",
      url: `https://x.com/parent_user/status/${replyToPostId}`,
      username: "parent_user",
      name: "Parent User",
      profileImageUrl: null,
      metrics: {
        likeCount: 0,
        replyCount: 0,
        repostCount: 0,
        quoteCount: 0,
      },
      media: [],
    };
    const target = makeCacheDb({
      ...publicXSettings,
      [`x:linked-post:v1:${replyToPostId}`]: {
        type: "linked_post",
        value: JSON.stringify({ post: cachedPreview }),
        fetched_at: Date.now(),
        expires_at: Date.now() + 7 * 24 * 60 * 60_000,
      },
    });
    const { sourcePostId } = seedReplyPost(target, { replyToPostId });

    const response = await handleXPosts(
      new Request(`https://example.com/api/x/posts/${sourcePostId}/context`),
      makeRouteEnv(target.db, { X_BEARER_TOKEN: "" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      sourcePostId,
      replyTo: { id: replyToPostId, text: "cached parent" },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("15분이 지난 답글 문맥 미발견 캐시는 외부 조회를 다시 시도한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:30:00Z"));
    const replyToPostId = "2059529979700846500";
    const target = makeCacheDb({
      ...publicXSettings,
      [`x:linked-post:v1:${replyToPostId}`]: {
        type: "linked_post",
        value: JSON.stringify({ post: null }),
        fetched_at: Date.now() - 16 * 60_000,
        expires_at: Date.now() - 60_000,
      },
    });
    const { sourcePostId } = seedReplyPost(target, { replyToPostId });
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            id: replyToPostId,
            author_id: "u0",
            text: "recovered parent post",
            created_at: "2026-02-12T23:00:00Z",
            public_metrics: {},
          },
        ],
        includes: {
          users: [{ id: "u0", username: "parent_user", name: "Parent User" }],
        },
      }),
    );

    const response = await handleXPosts(
      new Request(`https://example.com/api/x/posts/${sourcePostId}/context`),
      makeRouteEnv(target.db),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      sourcePostId,
      replyTo: { id: replyToPostId, text: "recovered parent post" },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("답글 문맥 API는 잘못된 ID와 임의 또는 숨김 게시글 ID를 차단한다", async () => {
    const invalidTarget = makeCacheDb(publicXSettings);
    const invalidResponse = await handleXPosts(
      new Request("https://example.com/api/x/posts/not-a-post/context"),
      makeRouteEnv(invalidTarget.db),
    );
    expect(invalidResponse.status).toBe(400);

    const missingResponse = await handleXPosts(
      new Request("https://example.com/api/x/posts/2059529979700846592/context"),
      makeRouteEnv(makeCacheDb(publicXSettings).db),
    );
    expect(missingResponse.status).toBe(404);

    const hiddenTarget = makeCacheDb(publicXSettings);
    const { sourcePostId } = seedReplyPost(hiddenTarget, { hidden: true });
    const hiddenResponse = await handleXPosts(
      new Request(`https://example.com/api/x/posts/${sourcePostId}/context`),
      makeRouteEnv(hiddenTarget.db),
    );
    expect(hiddenResponse.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [429, 429],
    [503, 502],
  ])(
    "답글 문맥 외부 lookup의 %i 응답을 공개 API %i로 매핑한다",
    async (sourceStatus, expectedStatus) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const target = makeCacheDb(publicXSettings);
      const { sourcePostId } = seedReplyPost(target);
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response("upstream error", { status: sourceStatus }),
      );

      const response = await handleXPosts(
        new Request(`https://example.com/api/x/posts/${sourcePostId}/context`),
        makeRouteEnv(target.db),
      );

      expect(response.status).toBe(expectedStatus);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    },
  );

  it("답글 문맥 API도 members와 private 공개 범위 인증 정책을 따른다", async () => {
    const membersTarget = makeCacheDb();
    const { sourcePostId } = seedReplyPost(membersTarget);
    const membersResponse = await handleXPosts(
      new Request(`https://example.com/api/x/posts/${sourcePostId}/context`),
      makeRouteEnv(membersTarget.db),
    );
    expect(membersResponse.status).toBe(401);

    const privateTarget = makeCacheDb({
      x_posts_visibility: { value: "private" },
    });
    seedReplyPost(privateTarget, { sourcePostId });
    const privateResponse = await handleXPosts(
      new Request(`https://example.com/api/x/posts/${sourcePostId}/context`),
      makeRouteEnv(privateTarget.db),
    );
    expect(privateResponse.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("공개 설정 조회 endpoint는 로그인 없이 공개 범위를 반환한다", async () => {
    const response = await handleXPosts(
      new Request("https://example.com/api/x/config"),
      {
        YOUTUBE_API_KEY: "",
        X_BEARER_TOKEN: "token",
        otw_db: makeCacheDb(publicXSettings).db,
      } as Parameters<typeof handleXPosts>[1],
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ visibility: "public" });
  });

  it("멤버 게시글 공개 범위가 public이면 로그인 없이 저장 조회 API를 허용한다", async () => {
    const response = await handleXPosts(
      new Request("https://example.com/api/x/posts?handles=otw_member"),
      {
        YOUTUBE_API_KEY: "",
        X_BEARER_TOKEN: "token",
        otw_db: makeCacheDb(publicXSettings).db,
      } as Parameters<typeof handleXPosts>[1],
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600",
    );
    await expect(response.json()).resolves.toMatchObject({
      posts: [],
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("회원 전용 X 게시글 응답은 공용 캐시에 저장되지 않도록 no-store로 반환한다", async () => {
    const request = await makeAdminRequest(
      "https://example.com/api/x/posts?handles=otw_member",
    );

    const response = await handleXPosts(
      request,
      makeRouteEnv(makeCacheDb().db),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Vary")).toBe("Authorization");
    await expect(response.json()).resolves.toMatchObject({
      posts: [],
    });
  });

  it("public 공개 범위에서도 debug refresh는 관리자 인증 없이는 차단한다", async () => {
    const response = await handleXPosts(
      new Request("https://example.com/api/x/posts?handles=otw_member&debug=1"),
      makeRouteEnv(makeCacheDb(publicXSettings).db),
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Login required");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("멤버 게시글 공개 범위가 private이면 게시글 API를 차단한다", async () => {
    const response = await handleXPosts(
      new Request("https://example.com/api/x/posts?handles=otw_member"),
      {
        YOUTUBE_API_KEY: "",
        X_BEARER_TOKEN: "token",
        otw_db: makeCacheDb({
          x_posts_visibility: { value: "private" },
        }).db,
      } as Parameters<typeof handleXPosts>[1],
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Member posts are private");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("관리자 모니터링 요청은 private 공개 범위에서도 저장 데이터만 조회한다", async () => {
    const request = await makeAdminRequest(
      "https://example.com/api/x/posts?handles=otw_member&admin=1",
    );

    const response = await handleXPosts(
      request,
      makeRouteEnv(
        makeCacheDb({
          x_posts_visibility: { value: "private" },
        }).db,
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Vary")).toBe("Authorization");
    await expect(response.json()).resolves.toMatchObject({
      posts: [],
      byHandle: [{ handle: "otw_member", posts: [] }],
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("debug 라우트는 링크 설정과 무관하게 외부 lookup을 수행하지 않는다", async () => {
    const fetchMock = vi.mocked(fetch);
    const request = await makeAdminRequest(
      "https://example.com/api/x/posts?handles=otw_member&debug=1",
    );
    const response = await handleXPosts(
      request,
      makeRouteEnv(
        makeCacheDb({
          ...publicXSettings,
          x_rich_link_preview_enabled: { value: "false" },
        }).db,
      ),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toMatchObject({
      posts: [],
      byHandle: [{ handle: "otw_member", posts: [] }],
    });
  });

  it("D1 fresh cache가 있으면 토큰 없이도 X API를 호출하지 않는다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));

    const cachedPost = makePost("cached", "otw_member");
    const { db } = makeCacheDb({
      "x:relations:v3:otw_member": {
        type: "relation_version",
        value: JSON.stringify({ version: "v3" }),
        fetched_at: Date.now(),
        expires_at: Date.now() + 365 * 24 * 60 * 60_000,
      },
      "x:posts:v4:otw_member:5:plain": {
        type: "posts",
        value: JSON.stringify({ userId: "u1", posts: [cachedPost] }),
        fetched_at: Date.now(),
        expires_at: Date.now() + 60 * 60_000,
      },
    });

    const result = await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "",
      cacheDb: db,
      maxResults: 5,
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(result.posts[0]?.id).toBe("cached");
    expect(result.byHandle[0]).toMatchObject({
      userId: "u1",
      stale: false,
    });
  });

  it("기존 D1 피드 캐시의 답글 post 누락도 null로 정규화한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));
    const cachedPost = {
      ...makePost("cached-reply", "otw_member"),
      reply: {
        postId: "parent",
        conversationId: "parent",
      },
    };
    const { db } = makeCacheDb({
      "x:relations:v3:otw_member": {
        type: "relation_version",
        value: JSON.stringify({ version: "v3" }),
        fetched_at: Date.now(),
        expires_at: Date.now() + 365 * 24 * 60 * 60_000,
      },
      "x:posts:v4:otw_member:5:plain": {
        type: "posts",
        value: JSON.stringify({ userId: "u1", posts: [cachedPost] }),
        fetched_at: Date.now(),
        expires_at: Date.now() + 60 * 60_000,
      },
    });

    const result = await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "",
      cacheDb: db,
      maxResults: 5,
    });

    expect(result.posts[0]?.reply).toEqual({
      postId: "parent",
      conversationId: "parent",
      post: null,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("토큰이 없을 때 D1 stale cache가 있으면 fallback으로 반환한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T03:00:00Z"));

    const cachedPost = makePost("stale", "otw_member");
    const fetchedAt = Date.parse("2026-02-13T01:30:00Z");
    const { db } = makeCacheDb({
      "x:relations:v3:otw_member": {
        type: "relation_version",
        value: JSON.stringify({ version: "v3" }),
        fetched_at: fetchedAt,
        expires_at: fetchedAt + 365 * 24 * 60 * 60_000,
      },
      "x:posts:v4:otw_member:5:plain": {
        type: "posts",
        value: JSON.stringify({ userId: "u1", posts: [cachedPost] }),
        fetched_at: fetchedAt,
        expires_at: fetchedAt + 60 * 60_000,
      },
    });

    const result = await fetchXPostsForHandles(["otw_member"], {
      cacheDb: db,
      maxResults: 5,
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(result.posts[0]?.id).toBe("stale");
    expect(result.byHandle[0]?.stale).toBe(true);
  });

  it("refresh:false이면 stale 저장 게시글을 반환하고 X API 사용 이벤트를 쓰지 않는다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T03:00:00Z"));

    const storedPost = makePost("stored-stale", "otw_member");
    const fetchedAt = Date.parse("2026-02-13T01:30:00Z");
    const { db, posts, sources, usageEvents } = makeCacheDb();
    posts.set(storedPost.id, {
      id: storedPost.id,
      handle: "otw_member",
      user_id: "u1",
      username: "otw_member",
      value: JSON.stringify(storedPost),
      created_at: storedPost.createdAt,
      fetched_at: fetchedAt,
      hidden_at: null,
    });
    sources.set("otw_member", {
      handle: "otw_member",
      user_id: "u1",
      username: "otw_member",
      last_seen_post_id: storedPost.id,
      last_checked_at: fetchedAt,
      updated_at: fetchedAt,
      last_error: null,
    });

    const result = await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      cacheDb: db,
      maxResults: 5,
      refresh: false,
      usageSource: "member-posts",
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(usageEvents).toHaveLength(0);
    expect(result.posts[0]?.id).toBe("stored-stale");
    expect(result.byHandle[0]).toMatchObject({
      userId: "u1",
      stale: true,
    });
  });

  it("게시글 fetch 실패 시 기존 캐시를 stale 데이터로 반환한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));

    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "u1", username: "otw_member", name: "OTW" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "cached",
              text: "cached post",
              created_at: "2026-02-13T00:00:00Z",
              public_metrics: {},
            },
          ],
        }),
      );

    await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      maxResults: 5,
    });

    vi.setSystemTime(new Date("2026-02-13T01:01:00Z"));
    fetchMock.mockResolvedValueOnce(new Response("rate limited", { status: 429 }));

    const result = await fetchXPostsForHandles(["otw_member"], {
      bearerToken: "token",
      maxResults: 5,
    });

    expect(result.posts[0]?.id).toBe("cached");
    expect(result.byHandle[0]?.stale).toBe(true);
  });

  it("Clerk 토큰이 없으면 회원 전용 X API 호출을 막는다", async () => {
    const response = await handleXPosts(
      new Request("https://example.com/api/x/posts?handles=otw_member"),
      {
        YOUTUBE_API_KEY: "",
        X_BEARER_TOKEN: "token",
        otw_db: makeCacheDb().db,
      } as Parameters<typeof handleXPosts>[1],
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Login required");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("클라이언트 사용자 헤더만으로는 회원 전용 X API를 허용하지 않는다", async () => {
    const response = await handleXPosts(
      new Request("https://example.com/api/x/posts?handles=otw_member", {
        headers: {
          "x-otw-user-id": "user_1",
        },
      }),
      {
        YOUTUBE_API_KEY: "",
        X_BEARER_TOKEN: "token",
        otw_db: makeCacheDb().db,
      } as Parameters<typeof handleXPosts>[1],
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Login required");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("debug 요청은 외부 X 오류 응답을 소비하지 않는다", async () => {
    const fetchMock = vi.mocked(fetch);
    const request = await makeAdminRequest(
      "https://example.com/api/x/posts?handles=otw_member&debug=1",
    );

    const response = await handleXPosts(
      request,
      makeRouteEnv(makeCacheDb(publicXSettings).db),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      posts: [],
      byHandle: [{ handle: "otw_member", posts: [] }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("debug GET은 외부 계정 식별자가 포함된 원본 응답을 노출하지 않는다", async () => {
    const fetchMock = vi.mocked(fetch);
    const request = await makeAdminRequest(
      "https://example.com/api/x/posts?handles=otw_member&debug=1",
    );

    const response = await handleXPosts(
      request,
      makeRouteEnv(makeCacheDb(publicXSettings).db),
    );
    const responseText = await response.text();

    expect(response.status).toBe(200);
    expect(responseText).not.toContain("2059529979700846592");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("저장 조회 GET은 X_BEARER_TOKEN 없이도 동작한다", async () => {
    const request = await makeAdminRequest(
      "https://example.com/api/x/posts?handles=otw_member&debug=1",
    );
    const response = await handleXPosts(
      request,
      makeRouteEnv(makeCacheDb(publicXSettings).db, {
        X_BEARER_TOKEN: "",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      posts: [],
      byHandle: [{ handle: "otw_member", posts: [] }],
    });
  });
});
