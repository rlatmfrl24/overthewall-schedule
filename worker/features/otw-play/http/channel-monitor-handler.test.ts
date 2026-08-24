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

  it("creates an explicit monitor by YouTube channel ID and reconciles it", async () => {
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
      {
        method: "POST",
        body: JSON.stringify({ externalChannelId: "UC1234567890123456789012" }),
      },
    ), env);
    const checked = await handler(new Request(
      "https://example.com/api/play/admin/channel-monitors/monitor-1/reconcile",
      { method: "POST", body: "{}" },
    ), env);

    expect(created.status).toBe(201);
    expect(create).toHaveBeenCalledWith("UC1234567890123456789012", "admin-1");
    expect(checked.status).toBe(200);
    expect(reconcile).toHaveBeenCalledWith("monitor-1");
  });

  it("updates and deletes a collection target with its expected version", async () => {
    const updateTarget = vi.fn(async () => ({ id: "monitor-1", version: 5 }));
    const remove = vi.fn(async () => ({ id: "monitor-1" }));
    const handler = createChannelMonitorHandler(
      () => ({ updateTarget, remove }) as unknown as ChannelMonitorService,
    );

    const updated = await handler(new Request(
      "https://example.com/api/play/admin/channel-monitors/monitor-1",
      {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: 4,
          externalChannelId: "UC2222222222222222222222",
        }),
      },
    ), env);
    const deleted = await handler(new Request(
      "https://example.com/api/play/admin/channel-monitors/monitor-1",
      { method: "DELETE", body: JSON.stringify({ expectedVersion: 5 }) },
    ), env);

    expect(updated.status).toBe(200);
    expect(updateTarget).toHaveBeenCalledWith(
      "monitor-1",
      4,
      "UC2222222222222222222222",
    );
    expect(deleted.status).toBe(200);
    expect(remove).toHaveBeenCalledWith("monitor-1", 5);
  });

  it("rejects malformed channel IDs before calling the service", async () => {
    const create = vi.fn();
    const handler = createChannelMonitorHandler(
      () => ({ create }) as unknown as ChannelMonitorService,
    );
    const response = await handler(new Request(
      "https://example.com/api/play/admin/channel-monitors",
      {
        method: "POST",
        body: JSON.stringify({ externalChannelId: "not-a-channel" }),
      },
    ), env);

    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});
