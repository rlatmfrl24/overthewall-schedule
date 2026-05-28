import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAuthCachesForTests } from "../../../worker/auth";
import { handleXPosts } from "../../../worker/routes/x";
import {
  collectXPostsForHandles,
  clearXServiceCachesForTests,
  fetchXPostsForHandles,
  normalizeXTimelineResponse,
} from "../../../worker/services/x";
import type { XPostItem } from "../../../worker/types";

const AUTH_ISSUER = "https://test-clerk.example.com";
const AUTH_JWKS_URL = `${AUTH_ISSUER}/.well-known/jwks.json`;
const AUTH_KEY_ID = "test-key";
const textEncoder = new TextEncoder();

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
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes("FROM x_post_sources")) {
                return (sources.get(String(args[0])) ?? null) as T | null;
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
                const [
                  id,
                  handle,
                  userId,
                  username,
                  value,
                  createdAt,
                  fetchedAt,
                ] = args;
                posts.set(String(id), {
                  id: String(id),
                  handle: String(handle),
                  user_id: userId === null ? null : String(userId),
                  username: String(username),
                  value: String(value),
                  created_at: String(createdAt),
                  fetched_at: Number(fetchedAt),
                  hidden_at: null,
                });
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
                  user_id: userId === null ? null : String(userId),
                  username: username === null ? null : String(username),
                  last_seen_post_id:
                    lastSeenPostId === null
                      ? current?.last_seen_post_id ?? null
                      : String(lastSeenPostId),
                  last_checked_at: Number(lastCheckedAt),
                  updated_at: Number(updatedAt),
                  last_error: lastError === null ? null : String(lastError),
                });
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

  return { db, store, posts, sources, usageEvents, collectionRuns };
};

describe("x worker service", () => {
  let privateKey: CryptoKey;
  let publicJwk: JsonWebKey & { kid: string };

  beforeEach(async () => {
    clearXServiceCachesForTests();
    clearAuthCachesForTests();
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
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
    expect(result.posts[0]?.id).toBe("p1");
    expect(result.byHandle[0]).toMatchObject({
      handle: "otw_member",
      userId: "u1",
      error: null,
    });
    expect(store.has("x:user:v1:otw_member")).toBe(true);
    expect(store.has("x:posts:v3:otw_member:5:plain")).toBe(true);
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

  it("백그라운드 수집은 fresh 캐시가 있어도 X API를 새로 호출해 영구 저장한다", async () => {
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
      "x:posts:v3:otw_member:5:plain": {
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
      postsStored: 2,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      "/users/u1/tweets?",
    );
    expect(posts.has("fresh")).toBe(true);
    expect(posts.has("cached")).toBe(true);
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

  it("백그라운드 수집은 예산 초과를 성공으로 기록하지 않는다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));

    const { db, usageEvents, collectionRuns } = makeCacheDb({
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
      status: "failed",
      error: "budget_exceeded",
      postsStored: 0,
      apiCalls: 0,
    });
    expect(collectionRuns[0]).toMatchObject({
      status: "failed",
      error: "budget_exceeded",
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

  it("X 게시글 링크는 옵션이 켜져 있으면 X API lookup으로 카드 데이터를 보강한다", async () => {
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
    expect(result.posts[0]?.links?.[0]).toMatchObject({
      resolvedUrl: "https://x.com/linked_member/status/9876543210",
      domain: "x.com",
      siteName: "X",
      title: "Linked Member (@linked_member)",
      description: "linked post body",
      imageUrl: "https://pbs.twimg.com/media/photo.jpg",
      previewStatus: "ready",
      linkedPost: {
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
  });

  it("X 게시글 링크 프리뷰 옵션이 꺼져 있으면 추가 lookup을 호출하지 않는다", async () => {
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
                  },
                ],
              },
            },
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

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.posts[0]?.links?.[0]).toMatchObject({
      previewStatus: "skipped",
    });
    expect(result.posts[0]?.links?.[0]?.linkedPost).toBeUndefined();
    expect(store.has("x:posts:v3:otw_member:5:plain")).toBe(true);
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
    expect(consoleWarn).toHaveBeenCalledWith(
      "Failed to enrich X linked post previews",
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

  it("debug 라우트 기본 요청 개수는 5개로 처리한다", async () => {
    const fetchMock = vi.mocked(fetch);
    const request = await makeAdminRequest(
      "https://example.com/api/x/posts?handles=otw_member&debug=1",
    );
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

    const response = await handleXPosts(
      request,
      makeRouteEnv(makeCacheDb(publicXSettings).db),
    );

    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain("max_results=5");
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
    await expect(response.json()).resolves.toMatchObject({
      posts: [],
    });
    expect(fetch).not.toHaveBeenCalled();
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
    await expect(response.json()).resolves.toMatchObject({
      posts: [],
      byHandle: [{ handle: "otw_member", posts: [] }],
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("debug 라우트는 관리자 설정이 꺼져 있으면 X 게시글 링크 lookup을 생략한다", async () => {
    const fetchMock = vi.mocked(fetch);
    const request = await makeAdminRequest(
      "https://example.com/api/x/posts?handles=otw_member&debug=1",
    );
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
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await expect(response.json()).resolves.toMatchObject({
      posts: [
        {
          links: [
            {
              previewStatus: "skipped",
            },
          ],
        },
      ],
    });
  });

  it("D1 fresh cache가 있으면 토큰 없이도 X API를 호출하지 않는다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T00:00:00Z"));

    const cachedPost = makePost("cached", "otw_member");
    const { db } = makeCacheDb({
      "x:posts:v3:otw_member:5:plain": {
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

  it("토큰이 없을 때 D1 stale cache가 있으면 fallback으로 반환한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T03:00:00Z"));

    const cachedPost = makePost("stale", "otw_member");
    const fetchedAt = Date.parse("2026-02-13T01:30:00Z");
    const { db } = makeCacheDb({
      "x:posts:v3:otw_member:5:plain": {
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

  it("debug 요청에서는 X API 원본 실패 상태와 요약을 반환한다", async () => {
    const fetchMock = vi.mocked(fetch);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const request = await makeAdminRequest(
      "https://example.com/api/x/posts?handles=otw_member&debug=1",
    );

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "u1", username: "otw_member", name: "OTW" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            title: "Forbidden",
            detail: "This app is not allowed to access user timelines.",
          },
          403,
        ),
    );

    const response = await handleXPosts(
      request,
      makeRouteEnv(makeCacheDb(publicXSettings).db),
    );

    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      error: "x_api_403",
      status: 502,
      sourceStatus: 403,
      detail: expect.stringContaining("not allowed"),
      diagnostics: [
        {
          handle: "otw_member",
          error: "x_api_403",
          status: 403,
          detail: expect.stringContaining("not allowed"),
        },
      ],
    });
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to handle /api/x/posts",
      expect.objectContaining({
        error: "x_api_403",
        sourceStatus: 403,
      }),
    );
  });

  it("debug 오류 요약에서 X 계정 식별자를 가린다", async () => {
    const fetchMock = vi.mocked(fetch);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const request = await makeAdminRequest(
      "https://example.com/api/x/posts?handles=otw_member&debug=1",
    );

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: "u1", username: "otw_member", name: "OTW" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            title: "CreditsDepleted",
            detail:
              "Your enrolled account [2059529979700846592] does not have any credits to fulfill this request.",
          },
          402,
        ),
    );

    const response = await handleXPosts(
      request,
      makeRouteEnv(makeCacheDb(publicXSettings).db),
    );
    const body = (await response.json()) as { detail: string };

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      error: "x_api_402",
      sourceStatus: 402,
      detail: expect.stringContaining("[redacted]"),
    });
    expect(body.detail).not.toContain("2059529979700846592");
  });

  it("X_BEARER_TOKEN이 없으면 500을 반환한다", async () => {
    const request = await makeAdminRequest(
      "https://example.com/api/x/posts?handles=otw_member&debug=1",
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await handleXPosts(
      request,
      makeRouteEnv(makeCacheDb(publicXSettings).db, {
        X_BEARER_TOKEN: "",
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: "missing_bearer_token",
      message: "X bearer token not configured",
    });
  });
});
