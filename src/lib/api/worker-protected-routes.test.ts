import { describe, expect, it } from "vitest";
import { handleDDays } from "../../../worker/routes/ddays";
import { handleKirinuki } from "../../../worker/routes/kirinuki";
import { handleNaverCafe } from "../../../worker/routes/naver-cafe";
import { handleNotices } from "../../../worker/routes/notices";
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

  it("/api/notices admin-only operations reject unauthenticated requests", async () => {
    const responses = await Promise.all([
      handleNotices(
        new Request("https://example.com/api/notices?includeInactive=1"),
        makeEnv(),
      ),
      handleNotices(
        new Request("https://example.com/api/notices", { method: "POST" }),
        makeEnv(),
      ),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(await response.text()).toBe("Login required");
    }
  });

  it("/api/ddays writes reject unauthenticated requests", async () => {
    const response = await handleDDays(
      new Request("https://example.com/api/ddays", { method: "POST" }),
      makeEnv(),
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Login required");
  });

  it("/api/kirinuki/channels rejects unauthenticated requests", async () => {
    const response = await handleKirinuki(
      new Request("https://example.com/api/kirinuki/channels"),
      makeEnv(),
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Login required");
  });
});
