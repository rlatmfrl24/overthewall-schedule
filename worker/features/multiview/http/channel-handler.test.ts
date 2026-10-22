import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import { createMultiviewChannelHandler } from "./channel-handler";
import { createMultiviewService } from "../application/multiview-service";
const auth = vi.hoisted(() => vi.fn());
vi.mock("../../../platform/auth", () => ({ authenticateRequest: auth }));
const id = "a".repeat(32);
const service = () => createMultiviewService({ list: async () => [], find: async () => null, addWithLimit: async (_, value) => ({ ...value, addedAt: 1 }), remove: async () => {} }, {
  resolveChannel: async channelId => ({ channelId, channelName: "A", channelImageUrl: null }), readLiveStatuses: async () => [],
});
const env = { SITE_ID: "otw", MULTIVIEW_RATE_LIMITER: { limit: async () => ({ success: true }) } } as unknown as Env;
const handler = createMultiviewChannelHandler(service);
const request = (path = "/api/multiview/me/channels", method = "GET", body?: string) => new Request(`https://example.com${path}`, { method, ...(body !== undefined ? { body } : {}) });
beforeEach(() => { auth.mockResolvedValue({ ok: true, user: { id: "alice" } }); });
afterEach(() => vi.restoreAllMocks());
describe("private multiview HTTP boundaries", () => {
  it("requires authentication and prevents caching even on failure", async () => {
    auth.mockResolvedValue({ ok: false, response: new Response("Login required", { status: 401 }) });
    const response = await handler(request(), env);
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Vary")).toBe("Authorization, Cookie");
  });
  it.each(["{", "{}", JSON.stringify({ input: id, ownerUserId: "bob" }), JSON.stringify({ input: "https://evil.test/" })])("rejects invalid POST data without saving", async body => {
    expect((await handler(request(undefined, "POST", body), env)).status).toBe(400);
  });
  it("limits actual UTF-8 body bytes even without a content length header", async () => {
    expect((await handler(request(undefined, "POST", JSON.stringify({ input: "가".repeat(1500) })), env)).status).toBe(413);
  });
  it("does not accept arbitrary state targets or owners", async () => {
    expect((await handler(request(`/api/multiview/me/live-status?channelIds=${id}`), env)).status).toBe(400);
    expect((await handler(request("/api/multiview/me/channels?siteId=luvdia"), env)).status).toBe(400);
    expect((await handler(request("/api/multiview/me/channels/not-an-id", "DELETE"), env)).status).toBe(400);
  });
  it("applies the site-and-owner rate key only to upstream operations", async () => {
    const keys: string[] = [];
    const limited = { ...env, MULTIVIEW_RATE_LIMITER: { limit: async ({ key }: { key: string }) => { keys.push(key); return { success: false }; } } } as unknown as Env;
    expect((await handler(request(undefined, "POST", JSON.stringify({ input: id })), limited)).status).toBe(429);
    expect((await handler(request("/api/multiview/me/live-status"), limited)).status).toBe(429);
    expect(keys).toEqual(["otw:alice:add", "otw:alice:status"]);
    expect((await handler(request(), { ...env, MULTIVIEW_RATE_LIMITER: undefined })).status).toBe(200);
    expect((await handler(request(`/api/multiview/me/channels/${id}`, "DELETE"), { ...env, MULTIVIEW_RATE_LIMITER: undefined })).status).toBe(200);
    expect((await handler(request(undefined, "POST", JSON.stringify({ input: id })), { ...env, MULTIVIEW_RATE_LIMITER: undefined })).status).toBe(503);
  });
  it("returns authoritative saved metadata with private response headers", async () => {
    const response = await handler(request(undefined, "POST", JSON.stringify({ input: id })), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ item: { channelId: id, channelName: "A", channelImageUrl: null, addedAt: 1 } });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
