import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../platform/types";

const mocks = vi.hoisted(() => ({
  handleQueue: vi.fn(async () => undefined),
  handleAiReviewQueue: vi.fn(async () => undefined),
  handleScheduledControlQueue: vi.fn(async () => undefined),
  handleScheduledJobQueue: vi.fn(async () => undefined),
}));

vi.mock("./queue", () => ({ handleQueue: mocks.handleQueue }));
vi.mock("./ai-review", async importOriginal => ({ ...await importOriginal<typeof import("./ai-review")>(), handleAiReviewQueue: mocks.handleAiReviewQueue }));
vi.mock("./scheduled-queue", () => ({
  handleScheduledControlQueue: mocks.handleScheduledControlQueue,
  handleScheduledJobQueue: mocks.handleScheduledJobQueue,
}));

import { handleWorkerQueue } from "./worker-queue";

describe("consolidated Worker queue routing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("routes manual control without waiting behind background work", async () => {
    const batch = {
      queue: "otw-ops-control",
      messages: [{ body: { messageType: "scheduled_job_control" } }],
    } as unknown as MessageBatch<unknown>;

    await handleWorkerQueue(batch, {} as Env);

    expect(mocks.handleScheduledControlQueue).toHaveBeenCalledWith(
      batch,
      expect.anything(),
    );
    expect(mocks.handleScheduledJobQueue).not.toHaveBeenCalled();
    expect(mocks.handleQueue).not.toHaveBeenCalled();
  });

  it.each(["otw-ops-critical", "otw-ops-background"])(
    "routes %s through the scheduled executor",
    async (queue) => {
      const batch = { queue, messages: [] } as unknown as MessageBatch<unknown>;

      await handleWorkerQueue(batch, {} as Env);

      expect(mocks.handleScheduledJobQueue).toHaveBeenCalledWith(
        batch,
        expect.anything(),
      );
      expect(mocks.handleQueue).not.toHaveBeenCalled();
    },
  );

  it.each(["otw-play-ingestion"])(
    "routes %s through the media protocol handler",
    async (queue) => {
      const batch = { queue, messages: [] } as unknown as MessageBatch<unknown>;

      await handleWorkerQueue(batch, {} as Env);

      expect(mocks.handleQueue).toHaveBeenCalledWith(batch, expect.anything());
      expect(mocks.handleScheduledJobQueue).not.toHaveBeenCalled();
    },
  );

  it("splits a mixed dead-letter batch by message protocol", async () => {
    const scheduledMessage = {
      body: {
        schemaVersion: 1,
        messageType: "scheduled_job_item",
        runId: "run-1",
        itemId: "item-1",
        phase: "recover-scheduled",
      },
    };
    const controlMessage = {
      body: {
        schemaVersion: 1,
        messageType: "scheduled_job_control",
        runId: "run-2",
      },
    };
    const ingestionMessage = {
      body: {
        schemaVersion: 1,
        jobId: "job-1",
        idempotencyKey: "legacy-1",
      },
    };
    const aiMessage = { body: { kind: "otw_play_ai_batch", schemaVersion: 1, itemId: "batch-item" } };

    await handleWorkerQueue({
      queue: "otw-dead-letter",
      messages: [ingestionMessage, scheduledMessage, controlMessage, aiMessage],
    } as unknown as MessageBatch<unknown>, {} as Env);

    expect(mocks.handleScheduledJobQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: "otw-dead-letter",
        messages: [scheduledMessage, controlMessage],
      }),
      expect.anything(),
    );
    expect(mocks.handleQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: "otw-dead-letter",
        messages: [ingestionMessage],
      }),
      expect.anything(),
    );
    expect(mocks.handleAiReviewQueue).toHaveBeenCalledWith(expect.objectContaining({ queue: "otw-dead-letter", messages: [aiMessage] }), expect.anything());
  });

  it("acknowledges messages from an unknown binding", async () => {
    const ack = vi.fn();

    await handleWorkerQueue({
      queue: "unknown-queue",
      messages: [{ body: {}, ack }],
    } as unknown as MessageBatch<unknown>, {} as Env);

    expect(ack).toHaveBeenCalledOnce();
  });
});
