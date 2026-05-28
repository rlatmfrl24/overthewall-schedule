import { describe, expect, it, vi } from "vitest";
import type { Env } from "../../../worker/types";

vi.mock("../../../worker/db", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("../../../worker/utils/helpers", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../worker/utils/helpers")>();
  return {
    ...actual,
    getSetting: vi.fn(async (_db: unknown, key: string) => {
      if (key === "naver_cafe_posts_enabled") return "true";
      if (key === "naver_cafe_posts_visibility") return "members";
      return null;
    }),
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
});
