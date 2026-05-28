import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../worker/types";

const getSettingMock = vi.hoisted(() => vi.fn());

vi.mock("../../../worker/db", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("../../../worker/utils/helpers", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../worker/utils/helpers")>();
  return {
    ...actual,
    getSetting: getSettingMock,
  };
});

import { handleNaverCafe } from "../../../worker/routes/naver-cafe";

const makeEnv = (): Env =>
  ({
    YOUTUBE_API_KEY: "",
    X_BEARER_TOKEN: "token",
    otw_db: {} as D1Database,
  }) as Env;

describe("naver cafe posts route auth", () => {
  beforeEach(() => {
    getSettingMock.mockReset();
    getSettingMock.mockImplementation(async (_db: unknown, key: string) => {
      if (key === "naver_cafe_posts_enabled") return "true";
      if (key === "naver_cafe_posts_visibility") return "members";
      return null;
    });
  });

  it("Clerk 토큰이 없으면 회원 전용 카페 게시글 API 호출을 막는다", async () => {
    const response = await handleNaverCafe(
      new Request("https://example.com/api/naver-cafe/posts"),
      makeEnv(),
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Login required");
  });

  it("클라이언트 사용자 헤더만으로는 회원 전용 카페 게시글 API를 허용하지 않는다", async () => {
    const response = await handleNaverCafe(
      new Request("https://example.com/api/naver-cafe/posts", {
        headers: {
          "x-otw-user-id": "user_1",
        },
      }),
      makeEnv(),
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Login required");
  });

  it("관리자 모니터링 모드는 관리자 인증 없이는 허용하지 않는다", async () => {
    const response = await handleNaverCafe(
      new Request("https://example.com/api/naver-cafe/posts?admin=1"),
      makeEnv(),
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Login required");
  });

  it("설정 조회 실패 시 config endpoint는 기본값으로 응답한다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    getSettingMock.mockRejectedValue(new Error("D1 unavailable"));

    const response = await handleNaverCafe(
      new Request("https://example.com/api/naver-cafe/config"),
      makeEnv(),
    );
    const body = (await response.json()) as {
      enabled: boolean;
      visibility: string;
    };

    expect(response.status).toBe(200);
    expect(body).toEqual({ enabled: true, visibility: "members" });
  });
});
