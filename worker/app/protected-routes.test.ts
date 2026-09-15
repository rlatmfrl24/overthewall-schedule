import { describe, expect, it } from "vitest";
import type { Env } from "../platform/types";
import { workerRouteRegistry } from "./routes";

const makeEnv = (): Env =>
  ({
    YOUTUBE_API_KEY: "",
    X_BEARER_TOKEN: "token",
    otw_db: {} as D1Database,
  }) as Env;
const dispatch = async (request: Request) => {
  const response = await workerRouteRegistry.dispatch(request, makeEnv());
  if (!response) throw new Error("Expected a Worker API response");
  return response;
};

describe("protected worker routes", () => {
  it.each([
    ["GET", "/api/play/catalog"], ["GET", "/api/play/facets"],
    ["GET", "/api/play/members"], ["GET", "/api/play/members/member/songbook"],
    ["GET", "/api/play/songs/song?scope=all"], ["GET", "/api/play/performances/clip"],
    ["GET", "/api/play/performances?scope=broadcast"], ["POST", "/api/play/performances/resolve"],
    ["GET", "/api/play/playlists/defaults"], ["POST", "/api/play/admin/ai-reviews"],
  ])("requires authentication through the real route dispatcher: %s %s", async (method, path) => {
    const response = await dispatch(new Request(`https://example.com${path}`, {
      method, headers: { "If-None-Match": "*" },
    }));
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("/api/settings rejects unauthenticated requests", async () => {
    const response = await dispatch(
      new Request("https://example.com/api/settings"),
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Login required");
  });

  it("/api/naver-cafe/sources rejects unauthenticated requests", async () => {
    const response = await dispatch(
      new Request("https://example.com/api/naver-cafe/sources"),
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Login required");
  });

  it("/api/notices admin-only operations reject unauthenticated requests", async () => {
    const responses = await Promise.all([
      dispatch(
        new Request("https://example.com/api/notices?includeInactive=1"),
      ),
      dispatch(
        new Request("https://example.com/api/notices", { method: "POST" }),
      ),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(await response.text()).toBe("Login required");
    }
  });

  it("/api/ddays writes reject unauthenticated requests", async () => {
    const response = await dispatch(
      new Request("https://example.com/api/ddays", { method: "POST" }),
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Login required");
  });

  it("/api/kirinuki/channels rejects unauthenticated requests", async () => {
    const response = await dispatch(
      new Request("https://example.com/api/kirinuki/channels"),
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Login required");
  });

  it("OTW Play admin catalog routes reject unauthenticated requests", async () => {
    const responses = await Promise.all([
      dispatch(new Request("https://example.com/api/play/admin/catalog")),
      dispatch(new Request("https://example.com/api/play/admin/imports/playlist/preflight", { method: "POST" })),
      dispatch(new Request("https://example.com/api/play/admin/imports/playlist", { method: "POST" })),
      dispatch(new Request("https://example.com/api/play/admin/imports/job-1")),
      dispatch(new Request("https://example.com/api/play/admin/imports/job-1/items")),
      dispatch(new Request("https://example.com/api/play/admin/import-candidates/candidate-1", { method: "PATCH" })),
      dispatch(new Request("https://example.com/api/play/admin/imports/job-1/convert", { method: "POST" })),
      dispatch(new Request("https://example.com/api/play/admin/imports/job-1/ignore", { method: "POST" })),
      dispatch(new Request("https://example.com/api/play/admin/imports/job-1/retry", { method: "POST" })),
      dispatch(new Request("https://example.com/api/play/admin/catalog-entries/preflight", { method: "POST" })),
      dispatch(new Request("https://example.com/api/play/admin/catalog-entries", { method: "POST" })),
      dispatch(new Request("https://example.com/api/play/admin/songs", { method: "POST" })),
      dispatch(new Request("https://example.com/api/play/admin/performances/p-1/publish", { method: "POST" })),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(await response.text()).toBe("Login required");
    }
  });
});
