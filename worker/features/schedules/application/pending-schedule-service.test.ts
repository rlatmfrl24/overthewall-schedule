import { describe, expect, it, vi } from "vitest";
import type { PendingScheduleRow } from "../domain/pending-schedule";
import type { ScheduleActor } from "../domain/schedule";
import { PendingScheduleService } from "./pending-schedule-service";
import type { PendingBulkAudit } from "./ports/pending-bulk-audit";
import type { PendingScheduleRepository } from "./ports/pending-schedule-repository";

const actor: ScheduleActor = {
  actorId: "admin",
  actorName: "Admin User",
  actorIp: "127.0.0.1",
};

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

const makeRepository = (
  overrides: Partial<PendingScheduleRepository> = {},
): PendingScheduleRepository => ({
  findById: async (id) => makeItem(id),
  listIds: async () => [],
  findEmptyTarget: async () => null,
  approve: async (item) => ({
    success: true,
    action: "create",
    scheduleId: item.id + 100,
  }),
  applyToEmptyTarget: async (item) => ({
    success: true,
    action: "update",
    scheduleId: item.id + 100,
  }),
  reject: async () => ({
    success: true,
    action: "reject",
  }),
  resetProcessed: async () => ({
    success: true,
    action: "reset_processed",
  }),
  ...overrides,
});

const makeAudit = () => ({
  insert: vi.fn<PendingBulkAudit["insert"]>(async () => undefined),
});

describe("PendingScheduleService", () => {
  it("isolates repository exceptions while preserving order and concurrency", async () => {
    const ids = [6, 2, 5, 1, 4, 3];
    let active = 0;
    let maxActive = 0;
    let releaseFirstWave: (() => void) | undefined;
    const firstWave = new Promise<void>((resolve) => {
      releaseFirstWave = resolve;
    });
    const approve = vi.fn<PendingScheduleRepository["approve"]>(
      async (item) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        if (active === 4) {
          releaseFirstWave?.();
        }

        await firstWave;
        try {
          if (item.id === 2) {
            throw new Error("sensitive database failure");
          }
          return {
            success: true,
            action: "create",
            scheduleId: item.id + 100,
          };
        } finally {
          active -= 1;
        }
      },
    );
    const audit = makeAudit();
    const service = new PendingScheduleService(
      makeRepository({ approve }),
      audit,
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      const result = await service.runBatch({
        ids,
        action: "approve",
        options: null,
        actor,
      });

      expect(maxActive).toBe(4);
      expect(approve).toHaveBeenCalledTimes(ids.length);
      expect(result).toEqual({
        success: false,
        totalRequested: 6,
        successCount: 5,
        failedCount: 1,
        results: [
          { id: 6, success: true, action: "create", scheduleId: 106 },
          {
            id: 2,
            success: false,
            error: "error",
            message: "대기 스케줄 처리 중 오류가 발생했습니다.",
          },
          { id: 5, success: true, action: "create", scheduleId: 105 },
          { id: 1, success: true, action: "create", scheduleId: 101 },
          { id: 4, success: true, action: "create", scheduleId: 104 },
          { id: 3, success: true, action: "create", scheduleId: 103 },
        ],
      });
      expect(JSON.stringify(result)).not.toContain("sensitive database failure");

      await service.auditBatch({
        actor,
        action: "approve",
        mode: "selected",
        ids,
        result,
        endpoint: "/api/settings/pending/actions",
      });

      expect(audit.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "pending.bulk_approve",
          status: "partial",
          targetCount: 6,
          successCount: 5,
          failureCount: 1,
        }),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("keeps single-item exceptions observable to the route boundary", async () => {
    const service = new PendingScheduleService(
      makeRepository({
        approve: async () => {
          throw new Error("single repository failure");
        },
      }),
      makeAudit(),
    );

    await expect(
      service.runOne({
        id: 7,
        action: "approve",
        options: null,
        actor,
      }),
    ).rejects.toThrow("single repository failure");
  });
});
