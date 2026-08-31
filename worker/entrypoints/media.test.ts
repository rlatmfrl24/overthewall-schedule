import { describe, expect, it, vi } from "vitest";
import type { Env } from "../platform/types";

const mocks = vi.hoisted(() => ({
  handleQueue: vi.fn(async () => undefined),
  handleScheduledJobQueue: vi.fn(async () => undefined),
}));

vi.mock("../app/queue", () => ({ handleQueue: mocks.handleQueue }));
vi.mock("../app/scheduled-queue", () => ({
  handleScheduledJobQueue: mocks.handleScheduledJobQueue,
}));

import { handleMediaQueue } from "./media";

describe("media queue routing", () => {
  it("혼합 DLQ batch를 message protocol별 sub-batch로 분리한다", async () => {
    const scheduledMessage = {
      body: {
        schemaVersion: 1,
        messageType: "scheduled_job_item",
        runId: "run-1",
        itemId: "item-1",
        phase: "recover-scheduled",
      },
    };
    const legacyMessage = {
      body: {
        schemaVersion: 1,
        jobId: "job-1",
        idempotencyKey: "legacy-1",
      },
    };

    await handleMediaQueue({
      queue: "otw-play-ingestion-dlq",
      messages: [legacyMessage, scheduledMessage],
    } as unknown as MessageBatch<unknown>, {} as Env);

    expect(mocks.handleScheduledJobQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: "otw-play-ingestion-dlq",
        messages: [scheduledMessage],
      }),
      expect.anything(),
    );
    expect(mocks.handleQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: "otw-play-ingestion-dlq",
        messages: [legacyMessage],
      }),
      expect.anything(),
    );
  });
});
