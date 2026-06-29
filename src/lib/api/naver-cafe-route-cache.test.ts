import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../worker/types";

const getDbMock = vi.hoisted(() => vi.fn());
const getSettingMock = vi.hoisted(() => vi.fn());
const fetchNaverCafePostsForSourcesMock = vi.hoisted(() => vi.fn());
const authenticateRequestMock = vi.hoisted(() => vi.fn());
const requireAdminUserMock = vi.hoisted(() => vi.fn());

vi.mock("../../../worker/db", () => ({
  getDb: getDbMock,
}));

vi.mock("../../../worker/auth", () => ({
  authenticateRequest: authenticateRequestMock,
  requireAdminUser: requireAdminUserMock,
}));

vi.mock("../../../worker/utils/helpers", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../worker/utils/helpers")>();
  return {
    ...actual,
    getSetting: getSettingMock,
  };
});

vi.mock("../../../worker/services/naver-cafe", () => {
  class NaverCafeApiError extends Error {
    status: number;
    diagnostics: unknown[];

    constructor(message: string, status: number, diagnostics: unknown[] = []) {
      super(message);
      this.name = "NaverCafeApiError";
      this.status = status;
      this.diagnostics = diagnostics;
    }
  }

  return {
    fetchNaverCafePostsForSources: fetchNaverCafePostsForSourcesMock,
    NaverCafeApiError,
  };
});

import { handleNaverCafe } from "../../../worker/routes/naver-cafe";

const source = {
  id: 1,
  name: "테스트 게시판",
  cafe_id: "31352147",
  menu_id: "9",
  cafe_url: "https://cafe.naver.com/f-e/cafes/31352147/menus/9",
  member_uid: 1,
  enabled: true,
  sort_order: 0,
  created_at: "2026-05-28T00:00:00Z",
  updated_at: "2026-05-28T00:00:00Z",
};

const makeEnv = (): Env =>
  ({
    YOUTUBE_API_KEY: "",
    X_BEARER_TOKEN: "token",
    otw_db: {} as D1Database,
  }) as Env;

const makeDb = () => ({
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      orderBy: vi.fn(async () => [source]),
    })),
  })),
});

const stubCache = () => {
  const store = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (request: Request) => {
      return store.get(request.url)?.clone();
    }),
    put: vi.fn(async (request: Request, response: Response) => {
      store.set(request.url, response.clone());
    }),
  };
  vi.stubGlobal("caches", { default: cache });
  return cache;
};

describe("naver cafe posts route cache", () => {
  let responseCache: ReturnType<typeof stubCache>;

  beforeEach(() => {
    getDbMock.mockReset();
    getDbMock.mockReturnValue(makeDb());
    authenticateRequestMock.mockReset();
    authenticateRequestMock.mockResolvedValue({ ok: true });
    requireAdminUserMock.mockReset();
    requireAdminUserMock.mockResolvedValue({ ok: true });
    getSettingMock.mockReset();
    getSettingMock.mockImplementation(async (_db: unknown, key: string) => {
      if (key === "naver_cafe_posts_enabled") return "true";
      if (key === "naver_cafe_posts_visibility") return "public";
      return null;
    });
    fetchNaverCafePostsForSourcesMock.mockReset();
    fetchNaverCafePostsForSourcesMock.mockResolvedValue({
      posts: [{ id: "post1" }],
      sources: [{ id: 1, status: "ok", stale: false }],
    });
    responseCache = stubCache();
  });

  it("fresh response cache가 있으면 네이버 수집 서비스를 다시 호출하지 않는다", async () => {
    const first = await handleNaverCafe(
      new Request("https://example.com/api/naver-cafe/posts?size=10"),
      makeEnv(),
    );
    const second = await handleNaverCafe(
      new Request("https://example.com/api/naver-cafe/posts?size=10"),
      makeEnv(),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(fetchNaverCafePostsForSourcesMock).toHaveBeenCalledTimes(1);
    expect(await second.json()).toMatchObject({
      posts: [{ id: "post1" }],
      sources: [{ id: 1, status: "ok", stale: false }],
    });
  });

  it("force 요청은 response cache를 우회한다", async () => {
    await handleNaverCafe(
      new Request("https://example.com/api/naver-cafe/posts?size=10"),
      makeEnv(),
    );
    await handleNaverCafe(
      new Request("https://example.com/api/naver-cafe/posts?size=10&_=1"),
      makeEnv(),
    );

    expect(fetchNaverCafePostsForSourcesMock).toHaveBeenCalledTimes(2);
  });

  it("회원 전용 카페 게시글 응답은 response cache를 쓰지 않고 no-store로 반환한다", async () => {
    getSettingMock.mockImplementation(async (_db: unknown, key: string) => {
      if (key === "naver_cafe_posts_enabled") return "true";
      if (key === "naver_cafe_posts_visibility") return "members";
      return null;
    });

    const first = await handleNaverCafe(
      new Request("https://example.com/api/naver-cafe/posts?size=10"),
      makeEnv(),
    );
    const second = await handleNaverCafe(
      new Request("https://example.com/api/naver-cafe/posts?size=10"),
      makeEnv(),
    );

    expect(first.status).toBe(200);
    expect(first.headers.get("Cache-Control")).toBe("no-store");
    expect(first.headers.get("Vary")).toBe("Authorization");
    expect(second.status).toBe(200);
    expect(fetchNaverCafePostsForSourcesMock).toHaveBeenCalledTimes(2);
    expect(responseCache.match).not.toHaveBeenCalled();
    expect(responseCache.put).not.toHaveBeenCalled();
  });

  it("관리자 카페 게시글 응답은 response cache를 쓰지 않고 no-store로 반환한다", async () => {
    const first = await handleNaverCafe(
      new Request("https://example.com/api/naver-cafe/posts?size=10&admin=1"),
      makeEnv(),
    );
    const second = await handleNaverCafe(
      new Request("https://example.com/api/naver-cafe/posts?size=10&admin=1"),
      makeEnv(),
    );

    expect(first.status).toBe(200);
    expect(first.headers.get("Cache-Control")).toBe("no-store");
    expect(first.headers.get("Vary")).toBe("Authorization");
    expect(second.status).toBe(200);
    expect(fetchNaverCafePostsForSourcesMock).toHaveBeenCalledTimes(2);
    expect(responseCache.match).not.toHaveBeenCalled();
    expect(responseCache.put).not.toHaveBeenCalled();
  });
});
