import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import type { ChannelMonitorService } from "../application/channel-monitor-service";
import { createChannelMonitorHandler } from "./channel-monitor-handler";

const requireAdminUserMock = vi.hoisted(() => vi.fn());
vi.mock("../../../platform/auth", () => ({ requireAdminUser: requireAdminUserMock }));
const env = {} as Env;

describe("OTW Play channel monitor handler", () => {
  beforeEach(() => {
    requireAdminUserMock.mockReset();
    requireAdminUserMock.mockResolvedValue({
      ok: true,
      user: { id: "admin-1", displayName: "Admin", claims: {}, sessionId: null },
    });
  });

  it("creates an explicit monitor and reconciles it through authenticated routes", async () => {
    const create = vi.fn(async () => ({ id: "monitor-1", status: "active" }));
    const reconcile = vi.fn(async () => ({
      discoveredCount: 1,
      checkedVideoCount: 1,
      capped: false,
    }));
    const handler = createChannelMonitorHandler(
      () => ({ create, reconcile }) as unknown as ChannelMonitorService,
    );

    const created = await handler(new Request(
      "https://example.com/api/play/admin/channel-monitors",
      { method: "POST", body: JSON.stringify({ channelId: "channel-1" }) },
    ), env);
    const checked = await handler(new Request(
      "https://example.com/api/play/admin/channel-monitors/monitor-1/reconcile",
      { method: "POST", body: "{}" },
    ), env);

    expect(created.status).toBe(201);
    expect(create).toHaveBeenCalledWith("channel-1", "admin-1");
    expect(checked.status).toBe(200);
    expect(reconcile).toHaveBeenCalledWith("monitor-1");
  });
});
