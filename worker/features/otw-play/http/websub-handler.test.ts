import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import { createWebsubAdminHandler, createWebsubCallbackHandler } from "./websub-handler";
const requireAdminUserMock = vi.hoisted(() => vi.fn());
vi.mock("../../../platform/auth", () => ({ requireAdminUser: requireAdminUserMock }));
describe("retired WebSub HTTP boundaries", () => {
  beforeEach(() => { vi.resetAllMocks(); requireAdminUserMock.mockResolvedValue({ ok: true, user: { id: "admin" } }); });
  it.each(["GET", "POST"])("returns 410 to %s callbacks without DB or queue work", async (method) => {
    const prepare = vi.fn(); const send = vi.fn();
    const env = { otw_db: { prepare }, OTW_PLAY_INGESTION_QUEUE: { send } } as unknown as Env;
    const response = await createWebsubCallbackHandler()(new Request(`https://example.com/api/play/webhooks/youtube/${"a".repeat(43)}?hub.mode=subscribe&hub.challenge=secret-challenge`, { method }), env);
    expect(response.status).toBe(410);
    expect(await response.text()).not.toContain("secret-challenge");
    expect(prepare).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });
  it.each(["subscribe", "renew", "unsubscribe"])("authenticates the retired %s admin command", async (action) => {
    const request = new Request(`https://example.com/api/play/admin/channel-monitors/id/${action}`, { method: "POST" });
    expect((await createWebsubAdminHandler()(request, {} as Env)).status).toBe(410);
    requireAdminUserMock.mockResolvedValueOnce({ ok: false, response: new Response(null, { status: 401 }) });
    expect((await createWebsubAdminHandler()(request, {} as Env)).status).toBe(401);
  });
});
