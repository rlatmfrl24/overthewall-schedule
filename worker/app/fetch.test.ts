import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { handleWorkerFetch } from "./fetch";
import type { Env } from "../platform/types";
import { siteEnv } from "../test-support/site-env";

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());
it.each([
  { SITE_ID: undefined },
  { SITE_CONTROL_QUEUE_NAME: "otw-ops-control" },
  { PLAY_ANALYTICS_DATASET: "otw_play_events" },
])("rejects invalid runtime resources before HTTP consumers: %j", async overrides => {
  for (const path of ["/api/settings", "/api/auth/status", "/favicon.ico", "/feed/"]) {
    const prepare = vi.fn(), authConfig = vi.fn(), assets = vi.fn(async () => new Response("asset"));
    const env = { ...siteEnv("luvdia"), ...overrides, YOUTUBE_API_KEY: "", otw_db: { prepare }, ASSETS: { fetch: assets },
      get CLERK_ISSUER() { authConfig(); return "https://selected.clerk.invalid"; },
    } as unknown as Env;
    const request = new Request(`http://localhost:9999${path}`, { headers: { Authorization: "Bearer invalid-token" } });
    if (path.startsWith("/api/")) {
      const response = await handleWorkerFetch(request, env);
      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({ details: { message: expect.stringMatching(/site|Queue|Analytics/) } });
    } else {
      await expect(handleWorkerFetch(request, env)).rejects.toThrow(/site|Queue|Analytics/);
    }
    expect(prepare).not.toHaveBeenCalled();
    expect(authConfig).not.toHaveBeenCalled();
    expect(assets).not.toHaveBeenCalled();
  }
});
