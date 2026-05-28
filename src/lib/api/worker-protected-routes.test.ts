import { describe, expect, it } from "vitest";
import { handleNaverCafe } from "../../../worker/routes/naver-cafe";
import { handleSettings } from "../../../worker/routes/settings";
import type { Env } from "../../../worker/types";

const makeEnv = (): Env =>
  ({
    YOUTUBE_API_KEY: "",
    X_BEARER_TOKEN: "token",
    otw_db: {} as D1Database,
  }) as Env;

describe("protected worker routes", () => {
  it("/api/settings rejects unauthenticated requests", async () => {
    const response = await handleSettings(
      new Request("https://example.com/api/settings"),
      makeEnv(),
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Login required");
  });

  it("/api/naver-cafe/sources rejects unauthenticated requests", async () => {
    const response = await handleNaverCafe(
      new Request("https://example.com/api/naver-cafe/sources"),
      makeEnv(),
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Login required");
  });
});
