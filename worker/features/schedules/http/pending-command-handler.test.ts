import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import { PendingScheduleService } from "../application/pending-schedule-service";
import type { PendingScheduleRow } from "../domain/pending-schedule";
import { createPendingScheduleCommandHandler } from "./pending-command-handler";

const requireAdminUserMock = vi.hoisted(() => vi.fn());
const repositoryMock = vi.hoisted(() => ({
  findById: vi.fn(),
  listIds: vi.fn(),
  findEmptyTarget: vi.fn(),
  approve: vi.fn(),
  applyToEmptyTarget: vi.fn(),
  reject: vi.fn(),
  resetProcessed: vi.fn(),
}));
const insertPendingBulkAuditMock = vi.hoisted(() => vi.fn());

vi.mock("../../../platform/auth", () => ({
  requireAdminUser: requireAdminUserMock,
}));
const makeEnv = (): Env =>
  ({
    YOUTUBE_API_KEY: "",
    X_BEARER_TOKEN: "token",
    otw_db: {} as D1Database,
  }) as Env;
const handlePendingScheduleCommand = createPendingScheduleCommandHandler(
  () =>
    new PendingScheduleService(repositoryMock, {
      insert: insertPendingBulkAuditMock,
    }),
);

const makeItem = (id: number): PendingScheduleRow => ({
  id,
  member_uid: id,
  member_name: `Member ${id}`,
  date: "2026-07-28",
  start_time: "12:30",
  title: `Schedule ${id}`,
  status: "pending",
  action_type: "create",
  existing_schedule_id: null,
  previous_status: null,
  previous_title: null,
});

const makeRequest = (path: string, body?: unknown) =>
  new Request(`https://example.com${path}`, {
    method: "POST",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });

const makeRawRequest = (path: string, body: string) =>
  new Request(`https://example.com${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

describe("pending schedule command boundary", () => {
  beforeEach(() => {
    requireAdminUserMock.mockReset();
    requireAdminUserMock.mockResolvedValue({
      ok: true,
      user: {
        id: "admin",
        displayName: "Admin User",
        sessionId: null,
        claims: {},
      },
    });

    for (const mock of Object.values(repositoryMock)) {
      mock.mockReset();
    }
    repositoryMock.findById.mockImplementation(async (id: number) =>
      makeItem(id),
    );
    repositoryMock.listIds.mockResolvedValue([1, 2]);
    repositoryMock.findEmptyTarget.mockResolvedValue({
      id: 900,
      status: "pending",
    });
    repositoryMock.approve.mockImplementation(
      async (item: PendingScheduleRow) => ({
        success: true,
        action: "create",
        scheduleId: item.id + 100,
      }),
    );
    repositoryMock.applyToEmptyTarget.mockImplementation(
      async (item: PendingScheduleRow) => ({
        success: true,
        action: "update",
        scheduleId: item.id + 900,
      }),
    );
    repositoryMock.reject.mockResolvedValue({
      success: true,
      action: "reject",
    });
    repositoryMock.resetProcessed.mockResolvedValue({
      success: true,
      action: "reset_processed",
      resetAt: "2026-07-28T00:00:00.000Z",
    });

    insertPendingBulkAuditMock.mockReset();
    insertPendingBulkAuditMock.mockResolvedValue(undefined);
  });

  it("returns 405 and Allow for non-POST direct calls", async () => {
    const response = await handlePendingScheduleCommand(
      new Request("https://example.com/api/settings/pending/actions"),
      makeEnv(),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
    expect(requireAdminUserMock).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON before repository work", async () => {
    const response = await handlePendingScheduleCommand(
      makeRawRequest("/api/settings/pending/actions", "{"),
      makeEnv(),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Malformed JSON");
    expect(repositoryMock.findById).not.toHaveBeenCalled();
    expect(repositoryMock.listIds).not.toHaveBeenCalled();
  });

  it("validates action, mode, and selected ids at the route boundary", async () => {
    const invalidAction = await handlePendingScheduleCommand(
      makeRequest("/api/settings/pending/actions", {
        action: "archive",
        ids: [1],
      }),
      makeEnv(),
    );
    const invalidMode = await handlePendingScheduleCommand(
      makeRequest("/api/settings/pending/actions", {
        action: "approve",
        mode: "later",
        ids: [1],
      }),
      makeEnv(),
    );
    const missingIds = await handlePendingScheduleCommand(
      makeRequest("/api/settings/pending/actions", {
        action: "approve",
        ids: [],
      }),
      makeEnv(),
    );
    const invalidAllMode = await handlePendingScheduleCommand(
      makeRequest("/api/settings/pending/actions", {
        action: "reset_processed",
        mode: "all",
      }),
      makeEnv(),
    );

    expect([invalidAction.status, invalidMode.status, missingIds.status]).toEqual(
      [400, 400, 400],
    );
    expect(await invalidAction.text()).toBe("Invalid pending action");
    expect(await invalidMode.text()).toBe("Invalid pending action mode");
    expect(await missingIds.text()).toBe("ids are required");
    expect(invalidAllMode.status).toBe(400);
    expect(await invalidAllMode.text()).toBe(
      "reset_processed does not support all mode",
    );
  });

  it.each([
    [[], "Invalid approval options"],
    [{ applyMode: "invalid" }, "Invalid applyMode"],
    [{ targetMode: "invalid" }, "Invalid targetMode"],
    [{ timeMode: "invalid" }, "Invalid timeMode"],
    [{ targetScheduleId: 0 }, "Invalid targetScheduleId"],
  ])("rejects invalid single approval options %#", async (body, message) => {
    const response = await handlePendingScheduleCommand(
      makeRequest("/api/settings/pending/12/approve", body),
      makeEnv(),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe(message);
    expect(repositoryMock.findById).not.toHaveBeenCalled();
    expect(repositoryMock.approve).not.toHaveBeenCalled();
  });

  it("preserves every single-command compatibility response shape", async () => {
    const approve = await handlePendingScheduleCommand(
      makeRequest("/api/settings/pending/12/approve", {
        applyMode: "time",
        targetMode: "create",
        timeMode: "exact",
        targetScheduleId: 88,
      }),
      makeEnv(),
    );
    const reject = await handlePendingScheduleCommand(
      makeRequest("/api/settings/pending/13/reject"),
      makeEnv(),
    );
    const reset = await handlePendingScheduleCommand(
      makeRequest("/api/settings/pending/14/reset-processed"),
      makeEnv(),
    );
    const applyEmpty = await handlePendingScheduleCommand(
      makeRequest("/api/settings/pending/15/apply-empty-target"),
      makeEnv(),
    );

    expect(await approve.json()).toEqual({
      success: true,
      action: "create",
      scheduleId: 112,
    });
    expect(repositoryMock.approve).toHaveBeenCalledWith(
      expect.objectContaining({ id: 12 }),
      {
        applyMode: "time",
        targetMode: "create",
        timeMode: "exact",
        targetScheduleId: 88,
      },
      expect.objectContaining({ actorId: "admin" }),
    );
    expect(await reject.json()).toEqual({
      success: true,
      action: "reject",
    });
    expect(await reset.json()).toEqual({
      success: true,
      action: "reset_processed",
      resetAt: "2026-07-28T00:00:00.000Z",
    });
    expect(await applyEmpty.json()).toEqual({
      success: true,
      action: "update",
      scheduleId: 915,
    });
  });

  it("maps single not-found and stale outcomes to 404", async () => {
    repositoryMock.findById.mockResolvedValueOnce(null);
    repositoryMock.reject.mockResolvedValueOnce({
      success: false,
      error: "stale",
      message: "Pending item is stale",
    });

    const notFound = await handlePendingScheduleCommand(
      makeRequest("/api/settings/pending/21/approve"),
      makeEnv(),
    );
    const stale = await handlePendingScheduleCommand(
      makeRequest("/api/settings/pending/22/reject"),
      makeEnv(),
    );

    expect(notFound.status).toBe(404);
    expect(await notFound.json()).toMatchObject({
      id: 21,
      success: false,
      error: "not_found",
    });
    expect(stale.status).toBe(404);
    expect(await stale.json()).toEqual({
      id: 22,
      success: false,
      error: "stale",
      message: "Pending item is stale",
    });
  });

  it("maps conflict and missing empty-target outcomes to 409", async () => {
    repositoryMock.approve.mockResolvedValueOnce({
      success: false,
      error: "conflict",
      message: "Schedule conflict",
      conflictingScheduleId: 77,
    });
    repositoryMock.findEmptyTarget.mockResolvedValueOnce(null);

    const conflict = await handlePendingScheduleCommand(
      makeRequest("/api/settings/pending/31/approve"),
      makeEnv(),
    );
    const noTarget = await handlePendingScheduleCommand(
      makeRequest("/api/settings/pending/32/apply-empty-target"),
      makeEnv(),
    );

    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({
      id: 31,
      success: false,
      error: "conflict",
      message: "Schedule conflict",
      conflictingScheduleId: 77,
    });
    expect(noTarget.status).toBe(409);
    expect(await noTarget.json()).toMatchObject({
      id: 32,
      success: false,
      error: "no_empty_target",
    });
  });

  it("keeps mixed bulk results in deduplicated input order", async () => {
    repositoryMock.approve.mockImplementation(
      async (item: PendingScheduleRow) =>
        item.id === 1
          ? {
              success: false,
              error: "conflict",
              message: "Schedule conflict",
            }
          : {
              success: true,
              action: "update",
              scheduleId: item.id + 1000,
            },
    );

    const response = await handlePendingScheduleCommand(
      makeRequest("/api/settings/pending/actions", {
        action: "approve",
        ids: [3, 1, 3, 2],
      }),
      makeEnv(),
    );
    const body = (await response.json()) as {
      success: boolean;
      totalRequested: number;
      successCount: number;
      failedCount: number;
      results: Array<{ id: number; success: boolean }>;
    };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: false,
      totalRequested: 3,
      successCount: 2,
      failedCount: 1,
    });
    expect(body.results.map(({ id }) => id)).toEqual([3, 1, 2]);
    expect(body.results.map(({ success }) => success)).toEqual([
      true,
      false,
      true,
    ]);
    expect(insertPendingBulkAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "pending.bulk_approve",
        status: "partial",
        targetCount: 3,
        successCount: 2,
        failureCount: 1,
        detail: {
          mode: "selected",
          endpoint: "/api/settings/pending/actions",
          ids: [3, 1, 2],
          omittedCount: 0,
        },
      }),
    );
  });

  it("preserves approve-selected and reject-selected batch shapes", async () => {
    repositoryMock.approve.mockImplementation(
      async (item: PendingScheduleRow) =>
        item.id === 2
          ? {
              success: false,
              error: "conflict",
              message: "Schedule conflict",
            }
          : { success: true, action: "create", scheduleId: 101 },
    );

    const approve = await handlePendingScheduleCommand(
      makeRequest("/api/settings/pending/approve-selected", {
        ids: [1, 2],
      }),
      makeEnv(),
    );
    const reject = await handlePendingScheduleCommand(
      makeRequest("/api/settings/pending/reject-selected", {
        ids: [1, 2],
      }),
      makeEnv(),
    );

    expect(await approve.json()).toMatchObject({
      success: true,
      totalRequested: 2,
      successCount: 1,
      failedCount: 1,
      results: [
        { id: 1, success: true, action: "create", scheduleId: 101 },
        { id: 2, success: false, error: "conflict" },
      ],
    });
    expect(await reject.json()).toEqual({
      success: true,
      totalRequested: 2,
      successCount: 2,
      failedCount: 0,
      results: [
        { id: 1, success: true, action: "reject" },
        { id: 2, success: true, action: "reject" },
      ],
    });
  });

  it("preserves approve-all and reject-all summary shapes", async () => {
    repositoryMock.listIds.mockResolvedValue([7, 8]);
    repositoryMock.approve.mockImplementation(
      async (item: PendingScheduleRow) =>
        item.id === 8
          ? {
              success: false,
              error: "conflict",
              message: "Schedule conflict",
            }
          : { success: true, action: "create", scheduleId: 107 },
    );

    const approve = await handlePendingScheduleCommand(
      makeRequest("/api/settings/pending/approve-all"),
      makeEnv(),
    );

    repositoryMock.reject.mockImplementation(
      async (item: PendingScheduleRow) =>
        item.id === 8
          ? {
              success: false,
              error: "stale",
              message: "Pending item is stale",
            }
          : { success: true, action: "reject" },
    );
    const reject = await handlePendingScheduleCommand(
      makeRequest("/api/settings/pending/reject-all"),
      makeEnv(),
    );

    expect(await approve.json()).toEqual({
      success: true,
      approvedCount: 1,
      skippedCount: 1,
      skippedItems: [{ id: 8, reason: "conflict" }],
    });
    expect(await reject.json()).toEqual({
      success: true,
      rejectedCount: 1,
    });
  });

  it("supports reset_processed through actions without bulk audit", async () => {
    const response = await handlePendingScheduleCommand(
      makeRequest("/api/settings/pending/actions", {
        action: "reset_processed",
        ids: [4, 5],
      }),
      makeEnv(),
    );

    expect(await response.json()).toEqual({
      success: true,
      totalRequested: 2,
      successCount: 2,
      failedCount: 0,
      results: [
        {
          id: 4,
          success: true,
          action: "reset_processed",
          resetAt: "2026-07-28T00:00:00.000Z",
        },
        {
          id: 5,
          success: true,
          action: "reset_processed",
          resetAt: "2026-07-28T00:00:00.000Z",
        },
      ],
    });
    expect(insertPendingBulkAuditMock).not.toHaveBeenCalled();
  });
});
