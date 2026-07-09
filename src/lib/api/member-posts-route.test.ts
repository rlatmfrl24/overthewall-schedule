import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleMemberPosts } from "../../../worker/routes/member-posts";
import type { Env } from "../../../worker/types";

const getSettingMock = vi.hoisted(() => vi.fn());
const authenticateRequestMock = vi.hoisted(() =>
  vi.fn(async () => ({ ok: true, user: { id: "user" } })),
);
const requireAdminUserMock = vi.hoisted(() =>
  vi.fn(async () => ({ ok: true, user: { id: "admin" } })),
);
const fetchXPostsForHandlesMock = vi.hoisted(() => vi.fn());
const readStoredNaverCafePostsForSourcesMock = vi.hoisted(() => vi.fn());
const fakeState = vi.hoisted(() => ({
  members: [] as Array<{ uid: number; url_twitter: string | null }>,
  cafeSources: [] as Array<{
    id: number;
    name: string;
    cafe_id: string;
    menu_id: string;
    cafe_url: string | null;
    enabled: boolean;
    member_uid: number | null;
    sort_order: number | null;
  }>,
}));

const fakeDb = vi.hoisted(() => ({
  select() {
    return {
      from() {
        return {
          where() {
            return {
              orderBy: () => fakeState.members,
            };
          },
          orderBy: () => fakeState.cafeSources,
        };
      },
    };
  },
}));

vi.mock("../../../worker/auth", () => ({
  authenticateRequest: authenticateRequestMock,
  requireAdminUser: requireAdminUserMock,
}));

vi.mock("../../../worker/db", () => ({
  getDb: () => fakeDb,
}));

vi.mock("../../../worker/utils/helpers", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../worker/utils/helpers")>();
  return {
    ...actual,
    getSetting: getSettingMock,
  };
});

vi.mock("../../../worker/services/x", () => ({
  XApiError: class XApiError extends Error {},
  extractXHandleFromUrl: (url: string | null | undefined) =>
    url?.split("/").filter(Boolean).pop() ?? null,
  fetchXPostsForHandles: fetchXPostsForHandlesMock,
}));

vi.mock("../../../worker/services/naver-cafe", () => ({
  readStoredNaverCafePostsForSources: readStoredNaverCafePostsForSourcesMock,
}));

const makeEnv = (): Env =>
  ({
    YOUTUBE_API_KEY: "",
    X_BEARER_TOKEN: "token",
    otw_db: {} as D1Database,
  }) as Env;

const mockXPosts = (createdAt = "2026-05-27T12:00:00Z") => {
  fetchXPostsForHandlesMock.mockResolvedValueOnce({
    posts: [
      {
        id: "x1",
        text: "X 글",
        createdAt,
        url: "https://x.com/otw_member/status/x1",
        username: "otw_member",
        metrics: {},
        media: [],
      },
    ],
    byHandle: [
      {
        handle: "otw_member",
        userId: "u1",
        posts: [
          {
            id: "x1",
            text: "X 글",
            createdAt,
            url: "https://x.com/otw_member/status/x1",
            username: "otw_member",
            metrics: {},
            media: [],
          },
        ],
        error: null,
        stale: false,
      },
    ],
  });
};

const mockNaverCafePosts = (createdAt = "2026-05-28T01:00:00Z") => {
  readStoredNaverCafePostsForSourcesMock.mockResolvedValueOnce({
    sources: [
      {
        id: 1,
        name: "공지",
        cafeId: "31352147",
        menuId: "9",
        cafeUrl: "https://cafe.naver.com/f-e/cafes/31352147/menus/9",
        memberUid: 2,
        enabled: true,
        sortOrder: 0,
        status: "ok",
        error: null,
        postCount: 1,
        stale: false,
      },
    ],
    posts: [
      {
        id: "cafe1",
        articleId: 1,
        cafeId: "31352147",
        menuId: "9",
        sourceName: "공지",
        memberUid: 2,
        title: "카페 글",
        summary: "",
        createdAt,
        url: "https://cafe.naver.com/articles/1",
        thumbnailUrl: null,
        metrics: { commentCount: 0, readCount: 0, likeCount: 0 },
        isNew: true,
      },
    ],
  });
};

describe("member-posts aggregate worker route", () => {
  beforeEach(() => {
    getSettingMock.mockReset();
    authenticateRequestMock.mockClear();
    requireAdminUserMock.mockClear();
    fetchXPostsForHandlesMock.mockReset();
    readStoredNaverCafePostsForSourcesMock.mockReset();
    fakeState.members = [
      { uid: 1, url_twitter: "https://x.com/otw_member" },
    ];
    fakeState.cafeSources = [
      {
        id: 1,
        name: "공지",
        cafe_id: "31352147",
        menu_id: "9",
        cafe_url: "https://cafe.naver.com/f-e/cafes/31352147/menus/9",
        enabled: true,
        member_uid: 2,
        sort_order: 0,
      },
    ];
    getSettingMock.mockImplementation(async (_db: unknown, key: string) => {
      const values: Record<string, string> = {
        x_posts_visibility: "public",
        x_rich_link_preview_enabled: "true",
        naver_cafe_posts_enabled: "true",
        naver_cafe_posts_visibility: "public",
      };
      return values[key] ?? null;
    });
  });

  it("X와 네이버 카페 게시글을 단일 최신순 타임라인으로 반환한다", async () => {
    mockXPosts();
    mockNaverCafePosts();
    const env = makeEnv();

    const response = await handleMemberPosts(
      new Request(
        "https://example.com/api/member-posts?sources=x,naver-cafe&maxResults=5&size=5",
      ),
      env,
    );
    const body = (await response.json()) as {
      posts: Array<{ kind: string; memberUid: number | null }>;
      x: { posts: unknown[]; policy: { status: string; monitorPath: string } };
      naverCafe: {
        posts: unknown[];
        policy: { status: string; monitorPath: string };
      };
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("max-age=300");
    expect(fetchXPostsForHandlesMock).toHaveBeenCalledWith(["otw_member"], {
      bearerToken: "token",
      cacheDb: env.otw_db,
      forceRefresh: false,
      forceRefreshPath: null,
      maxResults: 5,
      refresh: false,
      richXLinkPreviewEnabled: true,
      usageSource: "member-posts",
    });
    expect(readStoredNaverCafePostsForSourcesMock).toHaveBeenCalledWith(
      fakeState.cafeSources,
      { cacheDb: env.otw_db, size: 5 },
    );
    expect(body.posts.map((post) => post.kind)).toEqual(["cafe", "x"]);
    expect(body.posts.map((post) => post.memberUid)).toEqual([2, 1]);
    expect(body.x.posts).toHaveLength(1);
    expect(body.naverCafe.posts).toHaveLength(1);
    expect(body.x.policy).toMatchObject({
      status: "visible",
      monitorPath: "/admin/member-posts",
    });
    expect(body.naverCafe.policy).toMatchObject({
      status: "visible",
      monitorPath: "/admin/member-posts",
    });
  });

  it("compact 응답은 canonical posts만 유지하고 중복 post payload를 제거한다", async () => {
    mockXPosts();
    mockNaverCafePosts();

    const response = await handleMemberPosts(
      new Request(
        "https://example.com/api/member-posts?sources=x,naver-cafe&compact=1",
      ),
      makeEnv(),
    );
    const body = (await response.json()) as {
      posts: Array<{ kind: string }>;
      x: { posts: unknown[]; byHandle: Array<{ posts: unknown[] }> };
      naverCafe: { posts: unknown[] };
    };

    expect(response.status).toBe(200);
    expect(body.posts.map((post) => post.kind)).toEqual(["cafe", "x"]);
    expect(body.x.posts).toEqual([]);
    expect(body.x.byHandle[0]?.posts).toEqual([]);
    expect(body.naverCafe.posts).toEqual([]);
  });

  it("잘못된 page size는 서비스 호출 전에 거부한다", async () => {
    const response = await handleMemberPosts(
      new Request("https://example.com/api/member-posts?size=100"),
      makeEnv(),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("size must be an integer between 5 and 20");
    expect(fetchXPostsForHandlesMock).not.toHaveBeenCalled();
    expect(readStoredNaverCafePostsForSourcesMock).not.toHaveBeenCalled();
  });

  it("비관리자 aggregate feed의 cache-busting 요청은 X API 강제 갱신으로 전달하지 않는다", async () => {
    fetchXPostsForHandlesMock.mockResolvedValueOnce({
      posts: [],
      byHandle: [{ handle: "otw_member", posts: [], error: null }],
    });
    readStoredNaverCafePostsForSourcesMock.mockResolvedValueOnce({
      sources: [],
      posts: [],
    });
    const env = makeEnv();

    const response = await handleMemberPosts(
      new Request(
        "https://example.com/api/member-posts?sources=x,naver-cafe&maxResults=5&size=5&_=123",
        { cache: "no-store" },
      ),
      env,
    );

    expect(response.status).toBe(200);
    expect(fetchXPostsForHandlesMock).toHaveBeenCalledWith(["otw_member"], {
      bearerToken: "token",
      cacheDb: env.otw_db,
      forceRefresh: false,
      forceRefreshPath: null,
      maxResults: 5,
      refresh: false,
      richXLinkPreviewEnabled: true,
      usageSource: "member-posts",
    });
    expect(response.headers.get("Cache-Control")).toContain("max-age=300");
  });

  it("관리자 강제 새로고침에서만 X refresh를 켠다", async () => {
    fetchXPostsForHandlesMock.mockResolvedValueOnce({
      posts: [],
      byHandle: [{ handle: "otw_member", posts: [], error: null }],
    });
    const env = makeEnv();

    const response = await handleMemberPosts(
      new Request(
        "https://example.com/api/member-posts?sources=x&maxResults=5&admin=1&_=123",
      ),
      env,
    );

    expect(response.status).toBe(200);
    expect(requireAdminUserMock).toHaveBeenCalledTimes(1);
    expect(fetchXPostsForHandlesMock).toHaveBeenCalledWith(["otw_member"], {
      bearerToken: "token",
      cacheDb: env.otw_db,
      forceRefresh: true,
      forceRefreshPath: "member-posts:admin",
      maxResults: 5,
      refresh: true,
      richXLinkPreviewEnabled: true,
      usageSource: "member-posts:admin",
    });
  });

  it("멤버 권한이 필요한 aggregate feed는 shared cache를 허용하지 않는다", async () => {
    getSettingMock.mockImplementation(async (_db: unknown, key: string) => {
      const values: Record<string, string> = {
        x_posts_visibility: "members",
        x_rich_link_preview_enabled: "false",
        naver_cafe_posts_enabled: "true",
        naver_cafe_posts_visibility: "public",
      };
      return values[key] ?? null;
    });
    fetchXPostsForHandlesMock.mockResolvedValueOnce({
      posts: [],
      byHandle: [],
    });

    const response = await handleMemberPosts(
      new Request(
        "https://example.com/api/member-posts?sources=x&maxResults=5&size=5",
      ),
      makeEnv(),
    );

    expect(response.status).toBe(200);
    expect(authenticateRequestMock).toHaveBeenCalledTimes(1);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("private feed visibility is not publicly cacheable", async () => {
    getSettingMock.mockImplementation(async (_db: unknown, key: string) => {
      const values: Record<string, string> = {
        x_posts_visibility: "private",
        x_rich_link_preview_enabled: "false",
        naver_cafe_posts_enabled: "true",
        naver_cafe_posts_visibility: "public",
      };
      return values[key] ?? null;
    });

    const response = await handleMemberPosts(
      new Request(
        "https://example.com/api/member-posts?sources=x&maxResults=5&size=5",
      ),
      makeEnv(),
    );
    const body = (await response.json()) as {
      x: { error: string | null; policy: { status: string; accessible: boolean } };
    };

    expect(response.status).toBe(200);
    expect(fetchXPostsForHandlesMock).not.toHaveBeenCalled();
    expect(body.x.error).toBe("X posts are private");
    expect(body.x.policy).toMatchObject({
      status: "private",
      accessible: false,
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("비관리자 네이버 카페 표시 비활성은 정책 상태로 반환하고 소스를 조회하지 않는다", async () => {
    getSettingMock.mockImplementation(async (_db: unknown, key: string) => {
      const values: Record<string, string> = {
        x_posts_visibility: "public",
        x_rich_link_preview_enabled: "false",
        naver_cafe_posts_enabled: "false",
        naver_cafe_posts_visibility: "public",
      };
      return values[key] ?? null;
    });

    const response = await handleMemberPosts(
      new Request(
        "https://example.com/api/member-posts?sources=naver-cafe&maxResults=5&size=5",
      ),
      makeEnv(),
    );
    const body = (await response.json()) as {
      naverCafe: {
        error: string | null;
        sources: unknown[];
        policy: { status: string; enabled: boolean; accessible: boolean };
      };
    };

    expect(response.status).toBe(200);
    expect(readStoredNaverCafePostsForSourcesMock).not.toHaveBeenCalled();
    expect(body.naverCafe.error).toBe("Naver Cafe posts are disabled");
    expect(body.naverCafe.sources).toEqual([]);
    expect(body.naverCafe.policy).toMatchObject({
      status: "disabled",
      enabled: false,
      accessible: false,
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("admin aggregate feed is not publicly cacheable", async () => {
    getSettingMock.mockImplementation(async (_db: unknown, key: string) => {
      const values: Record<string, string> = {
        x_posts_visibility: "private",
        x_rich_link_preview_enabled: "false",
        naver_cafe_posts_enabled: "true",
        naver_cafe_posts_visibility: "public",
      };
      return values[key] ?? null;
    });
    fetchXPostsForHandlesMock.mockResolvedValueOnce({
      posts: [],
      byHandle: [],
    });

    const response = await handleMemberPosts(
      new Request(
        "https://example.com/api/member-posts?sources=x&maxResults=5&size=5&admin=1",
      ),
      makeEnv(),
    );

    expect(response.status).toBe(200);
    expect(requireAdminUserMock).toHaveBeenCalledTimes(1);
    expect(fetchXPostsForHandlesMock).toHaveBeenCalledTimes(1);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
