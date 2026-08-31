import { describe, expect, it, vi } from "vitest";
import type { Env } from "../platform/types";
import {
  handleScheduledWorkflowCron,
  selectScheduledWorkflowBindings,
} from "./scheduled-workflow-cron";

const utc = (hour: number) => Date.UTC(2026, 7, 31, hour, 3);

describe("scheduled Workflow cron bridge", () => {
  it("hourly lanes remain staggered across four Free-plan cron triggers", () => {
    expect(selectScheduledWorkflowBindings("13 * * * *", utc(5))).toEqual([
      "WEBSUB_MAINTENANCE_WORKFLOW",
      "NAVER_CAFE_COLLECTION_WORKFLOW",
    ]);
    expect(selectScheduledWorkflowBindings("33 * * * *", utc(5))).toEqual([
      "SOURCE_HEALTH_WORKFLOW",
    ]);
  });

  it("starts X collection only on even UTC hours", () => {
    expect(selectScheduledWorkflowBindings("23 * * * *", utc(4))).toEqual([
      "CHANNEL_RECONCILE_WORKFLOW",
      "X_COLLECTION_WORKFLOW",
    ]);
    expect(selectScheduledWorkflowBindings("23 * * * *", utc(5))).toEqual([
      "CHANNEL_RECONCILE_WORKFLOW",
    ]);
  });

  it("adds daily reconciliation and retention to the 18 UTC run", () => {
    expect(selectScheduledWorkflowBindings("3 * * * *", utc(18))).toEqual([
      "INGESTION_RECOVERY_WORKFLOW",
      "SCHEDULE_AUTO_UPDATE_WORKFLOW",
      "RECENT_RECONCILE_WORKFLOW",
      "RETENTION_PRUNE_WORKFLOW",
    ]);
  });

  it("starts every selected Workflow binding", async () => {
    const ingestionCreate = vi.fn().mockResolvedValue(undefined);
    const autoUpdateCreate = vi.fn().mockResolvedValue(undefined);
    const env = {
      INGESTION_RECOVERY_WORKFLOW: { create: ingestionCreate },
      SCHEDULE_AUTO_UPDATE_WORKFLOW: { create: autoUpdateCreate },
    } as unknown as Env;

    await handleScheduledWorkflowCron({
      cron: "3 * * * *",
      scheduledTime: utc(5),
    } as ScheduledController, env);

    expect(ingestionCreate).toHaveBeenCalledTimes(1);
    expect(autoUpdateCreate).toHaveBeenCalledTimes(1);
  });

  it("fails loudly when a configured Workflow binding is absent", async () => {
    await expect(handleScheduledWorkflowCron({
      cron: "33 * * * *",
      scheduledTime: utc(5),
    } as ScheduledController, {} as Env)).rejects.toThrow(
      "Missing scheduled Workflow binding: SOURCE_HEALTH_WORKFLOW",
    );
  });
});
