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
const fetchNaverCafePostsForSourcesMock = vi.hoisted(() => vi.fn());
const fakeState = vi.hoisted(() => ({
  members: [] as Array<{ uid: number; url_twitter: string | null }>,
  cafeSources: [] as Array<{
    id: number;
    name: string;
    cafeId: string;
    menuId: string;
    enabled: boolean;
    memberUid: number | null;
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
  NaverCafeApiError: class NaverCafeApiError extends Error {},
  fetchNaverCafePostsForSources: fetchNaverCafePostsForSourcesMock,
}));

const makeEnv = (): Env =>
  ({
    YOUTUBE_API_KEY: "",
    X_BEARER_TOKEN: "token",
    otw_db: {} as D1Database,
  }) as Env;

describe("member-posts aggregate worker route", () => {
  beforeEach(() => {
    getSettingMock.mockReset();
    authenticateRequestMock.mockClear();
    requireAdminUserMock.mockClear();
    fetchXPostsForHandlesMock.mockReset();
    fetchNaverCafePostsForSourcesMock.mockReset();
    fakeState.members = [
      { uid: 1, url_twitter: "https://x.com/otw_member" },
    ];
    fakeState.cafeSources = [
      {
        id: 1,
        name: "공지",
        cafeId: "31352147",
        menuId: "9",
        enabled: true,
        memberUid: 2,
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
    fetchXPostsForHandlesMock.mockResolvedValueOnce({
      posts: [
        {
          id: "x1",
          text: "X 글",
          createdAt: "2026-05-27T12:00:00Z",
          url: "https://x.com/otw_member/status/x1",
          username: "otw_member",
          metrics: {},
          media: [],
        },
      ],
      byHandle: [{ handle: "otw_member", posts: [], error: null }],
    });
    fetchNaverCafePostsForSourcesMock.mockResolvedValueOnce({
      updatedAt: "2026-05-28T01:05:00Z",
      sources: fakeState.cafeSources,
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
          createdAt: "2026-05-28T01:00:00Z",
          url: "https://cafe.naver.com/articles/1",
          thumbnailUrl: null,
          metrics: {},
          isNew: true,
        },
      ],
    });

    const response = await handleMemberPosts(
      new Request(
        "https://example.com/api/member-posts?sources=x,naver-cafe&maxResults=5&size=5",
      ),
      makeEnv(),
    );
    const body = (await response.json()) as {
      posts: Array<{ kind: string; memberUid: number | null }>;
      x: { posts: unknown[] };
      naverCafe: { posts: unknown[] };
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("max-age=300");
    expect(fetchXPostsForHandlesMock).toHaveBeenCalledWith(["otw_member"], {
      bearerToken: "token",
      cacheDb: {},
      forceRefresh: false,
      maxResults: 5,
      richXLinkPreviewEnabled: true,
    });
    expect(fetchNaverCafePostsForSourcesMock).toHaveBeenCalledWith(
      fakeState.cafeSources,
      { size: 5 },
    );
    expect(body.posts.map((post) => post.kind)).toEqual(["cafe", "x"]);
    expect(body.posts.map((post) => post.memberUid)).toEqual([2, 1]);
    expect(body.x.posts).toHaveLength(1);
    expect(body.naverCafe.posts).toHaveLength(1);
  });

  it("잘못된 page size는 서비스 호출 전에 거부한다", async () => {
    const response = await handleMemberPosts(
      new Request("https://example.com/api/member-posts?size=100"),
      makeEnv(),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("size must be an integer between 5 and 20");
    expect(fetchXPostsForHandlesMock).not.toHaveBeenCalled();
    expect(fetchNaverCafePostsForSourcesMock).not.toHaveBeenCalled();
  });

  it("비관리자 aggregate feed의 cache-busting 요청은 X API 강제 갱신으로 전달하지 않는다", async () => {
    fetchXPostsForHandlesMock.mockResolvedValueOnce({
      posts: [],
      byHandle: [{ handle: "otw_member", posts: [], error: null }],
    });
    fetchNaverCafePostsForSourcesMock.mockResolvedValueOnce({
      updatedAt: "2026-05-28T01:05:00Z",
      sources: [],
      posts: [],
    });

    const response = await handleMemberPosts(
      new Request(
        "https://example.com/api/member-posts?sources=x,naver-cafe&maxResults=5&size=5&_=123",
        { cache: "no-store" },
      ),
      makeEnv(),
    );

    expect(response.status).toBe(200);
    expect(fetchXPostsForHandlesMock).toHaveBeenCalledWith(["otw_member"], {
      bearerToken: "token",
      cacheDb: {},
      forceRefresh: false,
      maxResults: 5,
      richXLinkPreviewEnabled: true,
    });
    expect(response.headers.get("Cache-Control")).toContain("max-age=300");
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
    const body = (await response.json()) as { x: { error: string | null } };

    expect(response.status).toBe(200);
    expect(fetchXPostsForHandlesMock).not.toHaveBeenCalled();
    expect(body.x.error).toBe("X posts are private");
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
