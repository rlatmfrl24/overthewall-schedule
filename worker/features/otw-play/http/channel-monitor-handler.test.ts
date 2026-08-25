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
        body: JSON.stringify({
          externalChannelId: "UC1234567890123456789012",
          approval: {
            scope: "candidate_collection",
            operatorReference: "operator-proof",
            approvalReference: "rights-ticket",
            revocationProcedure: "pause and unsubscribe",
            confirmed: true,
          },
        }),
      },
    ), env);
    const checked = await handler(new Request(
      "https://example.com/api/play/admin/channel-monitors/monitor-1/reconcile",
      { method: "POST", body: "{}" },
    ), env);

    expect(created.status).toBe(201);
    expect(create).toHaveBeenCalledWith(
      "UC1234567890123456789012",
      {
        scope: "candidate_collection",
        operatorReference: "operator-proof",
        approvalReference: "rights-ticket",
        revocationProcedure: "pause and unsubscribe",
        confirmed: true,
      },
      "admin-1",
    );
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
      "admin-1",
    );
    expect(deleted.status).toBe(200);
    expect(remove).toHaveBeenCalledWith("monitor-1", 5, "admin-1");
  });

  it("resets a suspected-gap watermark through an explicit command", async () => {
    const resetWatermark = vi.fn(async () => ({
      id: "monitor-1",
      version: 6,
      status: "active",
      lastErrorCode: null,
    }));
    const handler = createChannelMonitorHandler(
      () => ({ resetWatermark }) as unknown as ChannelMonitorService,
    );

    const response = await handler(new Request(
      "https://example.com/api/play/admin/channel-monitors/monitor-1",
      {
        method: "PATCH",
        body: JSON.stringify({ expectedVersion: 5, resetWatermark: true }),
      },
    ), env);

    expect(response.status).toBe(200);
    expect(resetWatermark).toHaveBeenCalledWith("monitor-1", 5, "admin-1");
  });

  it("passes candidate pagination to the service and rejects malformed cursors", async () => {
    const listCandidates = vi.fn(async () => ({ items: [], nextCursor: null }));
    const handler = createChannelMonitorHandler(
      () => ({ listCandidates }) as unknown as ChannelMonitorService,
    );

    const response = await handler(new Request(
      "https://example.com/api/play/admin/channel-monitors/monitor-1/candidates?limit=25&cursor=opaque",
    ), env);
    expect(response.status).toBe(200);
    expect(listCandidates).toHaveBeenCalledWith("monitor-1", 25, "opaque");

    const duplicate = await handler(new Request(
      "https://example.com/api/play/admin/channel-monitors/monitor-1/candidates?cursor=a&cursor=b",
    ), env);
    expect(duplicate.status).toBe(400);
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

  it("rejects monitor creation without explicit candidate-collection rights", async () => {
    const create = vi.fn();
    const handler = createChannelMonitorHandler(
      () => ({ create }) as unknown as ChannelMonitorService,
    );
    const missing = await handler(new Request(
      "https://example.com/api/play/admin/channel-monitors",
      {
        method: "POST",
        body: JSON.stringify({ externalChannelId: "UC1234567890123456789012" }),
      },
    ), env);
    const unconfirmed = await handler(new Request(
      "https://example.com/api/play/admin/channel-monitors",
      {
        method: "POST",
        body: JSON.stringify({
          externalChannelId: "UC1234567890123456789012",
          approval: {
            scope: "candidate_collection",
            operatorReference: "operator-proof",
            approvalReference: "rights-ticket",
            revocationProcedure: "pause and unsubscribe",
            confirmed: false,
          },
        }),
      },
    ), env);

    expect(missing.status).toBe(400);
    expect(unconfirmed.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("allows only an explicit recent 1 to 20 item backfill", async () => {
    const backfill = vi.fn(async () => ({
      discoveredCount: 2,
      checkedVideoCount: 20,
      capped: false,
    }));
    const handler = createChannelMonitorHandler(
      () => ({ backfill }) as unknown as ChannelMonitorService,
    );

    const accepted = await handler(new Request(
      "https://example.com/api/play/admin/channel-monitors/monitor-1/backfill",
      { method: "POST", body: JSON.stringify({ count: 20 }) },
    ), env);
    const rejected = await handler(new Request(
      "https://example.com/api/play/admin/channel-monitors/monitor-1/backfill",
      { method: "POST", body: JSON.stringify({ count: 21 }) },
    ), env);

    expect(accepted.status).toBe(200);
    expect(backfill).toHaveBeenCalledWith("monitor-1", 20);
    expect(rejected.status).toBe(400);
    expect(backfill).toHaveBeenCalledOnce();
  });
});
