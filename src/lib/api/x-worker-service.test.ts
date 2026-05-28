import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleXPosts } from "../../../worker/routes/x";
import {
  clearXServiceCachesForTests,
  fetchXPostsForHandles,
  normalizeXTimelineResponse,
} from "../../../worker/services/x";
import type { XPostItem } from "../../../worker/types";

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

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
};

type FakePostSourceRecord = {
  handle: string;
  user_id: string | null;
  username: string | null;
  last_seen_post_id: string | null;
  last_checked_at: number;
  updated_at: number;
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

const makeMemberRequest = (url: string) =>
  new Request(url, {
    headers: {
      "x-otw-user-id": "user_1",
    },
  });

const makeCacheDb = (initial: Record<string, FakeCacheRecord> = {}) => {
  const store = new Map(Object.entries(initial));
  const posts = new Map<string, FakeStoredPostRecord>();
  const sources = new Map<string, FakePostSourceRecord>();
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes("FROM x_post_sources")) {
                return (sources.get(String(args[0])) ?? null) as T | null;
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
                  .filter((post) => post.handle === handle)
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
                });
              }
              return {};
            },
          };
        },
      };
    },
  } as unknown as Pick<D1Database, "prepare">;

  return { db, store, posts, sources };
};

describe("x worker service", () => {
  beforeEach(() => {
    clearXServiceCachesForTests();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

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
    expect(store.has("x:posts:v3:otw_member:5:rich")).toBe(true);
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

  it("라우트 기본 요청 개수는 10개로 처리한다", async () => {
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

    const response = await handleXPosts(
      makeMemberRequest("https://example.com/api/x/posts?handles=otw_member"),
      {
        YOUTUBE_API_KEY: "",
        X_BEARER_TOKEN: "token",
        otw_db: makeCacheDb().db,
      } as Parameters<typeof handleXPosts>[1],
    );

    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("max_results=10");
  });

  it("공개 설정 조회 endpoint는 로그인 없이 공개 범위를 반환한다", async () => {
    const response = await handleXPosts(
      new Request("https://example.com/api/x/config"),
      {
        YOUTUBE_API_KEY: "",
        X_BEARER_TOKEN: "token",
        otw_db: makeCacheDb({
          x_posts_visibility: { value: "public" },
        }).db,
      } as Parameters<typeof handleXPosts>[1],
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ visibility: "public" });
  });

  it("멤버 게시글 공개 범위가 public이면 로그인 없이 게시글 API를 허용한다", async () => {
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
              text: "public post",
              created_at: "2026-02-13T00:00:00Z",
              public_metrics: {},
            },
          ],
        }),
      );

    const response = await handleXPosts(
      new Request("https://example.com/api/x/posts?handles=otw_member"),
      {
        YOUTUBE_API_KEY: "",
        X_BEARER_TOKEN: "token",
        otw_db: makeCacheDb({
          x_posts_visibility: { value: "public" },
        }).db,
      } as Parameters<typeof handleXPosts>[1],
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      posts: [{ id: "p1" }],
    });
  });

  it("멤버 게시글 공개 범위가 private이면 게시글 API를 차단한다", async () => {
    const response = await handleXPosts(
      makeMemberRequest("https://example.com/api/x/posts?handles=otw_member"),
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

  it("라우트는 관리자 설정이 꺼져 있으면 X 게시글 링크 lookup을 생략한다", async () => {
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

    const response = await handleXPosts(
      makeMemberRequest("https://example.com/api/x/posts?handles=otw_member"),
      {
        YOUTUBE_API_KEY: "",
        X_BEARER_TOKEN: "token",
        otw_db: makeCacheDb({
          x_rich_link_preview_enabled: { value: "false" },
        }).db,
      } as Parameters<typeof handleXPosts>[1],
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
      "x:posts:v3:otw_member:5:rich": {
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
      "x:posts:v3:otw_member:5:rich": {
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

  it("로그인 사용자 헤더가 없으면 X API 호출을 막는다", async () => {
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

  it("debug 요청에서는 X API 원본 실패 상태와 요약을 반환한다", async () => {
    const fetchMock = vi.mocked(fetch);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

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
      makeMemberRequest(
        "https://example.com/api/x/posts?handles=otw_member&debug=1",
      ),
      {
        YOUTUBE_API_KEY: "",
        X_BEARER_TOKEN: "token",
        otw_db: makeCacheDb().db,
      } as Parameters<typeof handleXPosts>[1],
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
      makeMemberRequest(
        "https://example.com/api/x/posts?handles=otw_member&debug=1",
      ),
      {
        YOUTUBE_API_KEY: "",
        X_BEARER_TOKEN: "token",
        otw_db: makeCacheDb().db,
      } as Parameters<typeof handleXPosts>[1],
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
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await handleXPosts(
      makeMemberRequest("https://example.com/api/x/posts?handles=otw_member"),
      {
        YOUTUBE_API_KEY: "",
        X_BEARER_TOKEN: "",
        otw_db: makeCacheDb().db,
      } as Parameters<typeof handleXPosts>[1],
    );

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("X bearer token not configured");
  });
});
