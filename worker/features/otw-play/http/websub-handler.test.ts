import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import type { WebsubService } from "../application/websub-service";
import {
  createWebsubAdminHandler,
  createWebsubCallbackHandler,
} from "./websub-handler";

const requireAdminUserMock = vi.hoisted(() => vi.fn());
vi.mock("../../../platform/auth", () => ({ requireAdminUser: requireAdminUserMock }));
const env = {} as Env;
const token = "a".repeat(43);

describe("WebSub HTTP handlers", () => {
  beforeEach(() => {
    requireAdminUserMock.mockReset();
    requireAdminUserMock.mockResolvedValue({
      ok: true,
      user: { id: "admin-1", displayName: "Admin", claims: {}, sessionId: null },
    });
  });

  it("returns a verified challenge with a safe content type", async () => {
    const verifyIntent = vi.fn(async () => ({ denied: false, challenge: "challenge" }));
    const handler = createWebsubCallbackHandler(
      () => ({ verifyIntent }) as unknown as WebsubService,
    );
    const topic = "https://www.youtube.com/xml/feeds/videos.xml?channel_id=UCmmmmmmmmmmmmmmmmmmmmmm";
    const response = await handler(new Request(
      `https://example.com/api/play/webhooks/youtube/${token}?hub.mode=subscribe&hub.topic=${encodeURIComponent(topic)}&hub.challenge=challenge&hub.lease_seconds=86400`,
    ), env);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/octet-stream; charset=utf-8");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await response.text()).toBe("challenge");
  });

  it("enforces XML content type and the 64KiB body limit", async () => {
    const receiveNotification = vi.fn(async () => undefined);
    const handler = createWebsubCallbackHandler(
      () => ({ receiveNotification }) as unknown as WebsubService,
    );
    const unsupported = await handler(new Request(
      `https://example.com/api/play/webhooks/youtube/${token}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
    ), env);
    const oversized = await handler(new Request(
      `https://example.com/api/play/webhooks/youtube/${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/atom+xml" },
        body: "x".repeat(64 * 1024 + 1),
      },
    ), env);

    expect(unsupported.status).toBe(415);
    expect(oversized.status).toBe(413);
    expect(receiveNotification).not.toHaveBeenCalled();
  });

  it("routes explicit admin subscribe, renew, and unsubscribe commands", async () => {
    const subscribe = vi.fn(async () => ({ id: "monitor-1" }));
    const renew = vi.fn(async () => ({ id: "monitor-1" }));
    const unsubscribe = vi.fn(async () => ({ id: "monitor-1" }));
    const handler = createWebsubAdminHandler(
      () => ({ subscribe, renew, unsubscribe }) as unknown as WebsubService,
    );
    for (const action of ["subscribe", "renew", "unsubscribe"] as const) {
      const response = await handler(new Request(
        `https://example.com/api/play/admin/channel-monitors/monitor-1/${action}`,
        { method: "POST", body: "{}" },
      ), env);
      expect(response.status).toBe(200);
    }
    expect(subscribe).toHaveBeenCalledWith("monitor-1", "admin-1");
    expect(renew).toHaveBeenCalledWith("monitor-1", "admin-1");
    expect(unsubscribe).toHaveBeenCalledWith("monitor-1", "admin-1");
  });
});
