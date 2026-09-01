import { describe, expect, it, vi } from "vitest";
import type { Env } from "../platform/types";
import {
  handleScheduledWorkflowCron,
  SCHEDULED_WORKFLOW_CRON,
  selectScheduledWorkflowJobs,
} from "./scheduled-workflow-cron";

const utc = (hour: number, minute: number) =>
  Date.UTC(2026, 7, 31, hour, minute);

describe("scheduled Workflow cron bridge", () => {
  it("hourly lanes remain staggered across one Free-plan cron expression", () => {
    expect(selectScheduledWorkflowJobs(SCHEDULED_WORKFLOW_CRON, utc(5, 13))).toEqual([
      "websub_maintenance",
      "naver_cafe_collection",
    ]);
    expect(selectScheduledWorkflowJobs(SCHEDULED_WORKFLOW_CRON, utc(5, 33))).toEqual([
      "source_health",
      "x_metrics_refresh",
      "x_compliance",
    ]);
  });

  it("starts X collection only on even UTC hours", () => {
    expect(selectScheduledWorkflowJobs(SCHEDULED_WORKFLOW_CRON, utc(4, 23))).toEqual([
      "channel_reconcile",
      "youtube_feed_collection",
      "x_collection",
    ]);
    expect(selectScheduledWorkflowJobs(SCHEDULED_WORKFLOW_CRON, utc(5, 23))).toEqual([
      "channel_reconcile",
      "youtube_feed_collection",
    ]);
  });

  it("adds daily reconciliation and retention to the 18 UTC run", () => {
    expect(selectScheduledWorkflowJobs(SCHEDULED_WORKFLOW_CRON, utc(18, 3))).toEqual([
      "ingestion_recovery",
      "schedule_auto_update",
      "recent_reconcile",
      "retention_prune",
    ]);
  });

  it("starts one generic Workflow instance for every selected job", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const env = {
      SCHEDULED_OPERATIONS_WORKFLOW: { create },
    } as unknown as Env;
    const scheduledTime = utc(5, 3);

    await handleScheduledWorkflowCron({
      cron: SCHEDULED_WORKFLOW_CRON,
      scheduledTime,
    } as ScheduledController, env);

    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenNthCalledWith(1, {
      params: { jobType: "ingestion_recovery", scheduledFor: scheduledTime },
    });
    expect(create).toHaveBeenNthCalledWith(2, {
      params: { jobType: "schedule_auto_update", scheduledFor: scheduledTime },
    });
  });

  it("fails loudly when a configured Workflow binding is absent", async () => {
    await expect(handleScheduledWorkflowCron({
      cron: SCHEDULED_WORKFLOW_CRON,
      scheduledTime: utc(5, 33),
    } as ScheduledController, {} as Env)).rejects.toThrow(
      "Missing scheduled Workflow binding: SCHEDULED_OPERATIONS_WORKFLOW",
    );
  });
});
