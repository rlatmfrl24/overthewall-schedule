import { siteEnv } from "../test-support/site-env";
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
import { isAiBatchMessage } from "./ai-review";
const routingEnv=(site:'otw'|'luvdia'='otw')=>({...siteEnv(site),otw_db:{prepare:()=>({first:async()=>null})}}) as unknown as Env;

describe("consolidated Worker queue routing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("routes manual control without waiting behind background work", async () => {
    const batch = {
      queue: "otw-ops-control",
      messages: [{ body: { messageType: "scheduled_job_control" } }],
    } as unknown as MessageBatch<unknown>;

    await handleWorkerQueue(batch, routingEnv());

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

      await handleWorkerQueue(batch, routingEnv());

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

      await handleWorkerQueue(batch, routingEnv());

      expect(mocks.handleQueue).toHaveBeenCalledWith(batch, expect.anything());
      expect(mocks.handleScheduledJobQueue).not.toHaveBeenCalled();
    },
  );

  it.each(["otw", "luvdia"] as const)("splits %s mixed dead-letter batches by message protocol", async site => {
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
    const aiMessage = { body: { kind: "otw_play_ai_batch", schemaVersion: 1, itemId: "batch-item", generation: 0 } };

    await handleWorkerQueue({
      queue: `${site}-dead-letter`,
      messages: [ingestionMessage, scheduledMessage, controlMessage, aiMessage],
    } as unknown as MessageBatch<unknown>, routingEnv(site));

    expect(mocks.handleScheduledJobQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: `${site}-dead-letter`,
        messages: [scheduledMessage, controlMessage],
      }),
      expect.anything(),
    );
    expect(mocks.handleQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: `${site}-dead-letter`,
        messages: [ingestionMessage],
      }),
      expect.anything(),
    );
    expect(mocks.handleAiReviewQueue).toHaveBeenCalledWith(expect.objectContaining({ queue: `${site}-dead-letter`, messages: [aiMessage] }), expect.anything());
  });

  it("retries and reports an unknown physical queue without acknowledging", async () => {
    const ack = vi.fn();
    const retry = vi.fn();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await handleWorkerQueue({
      queue: "unknown-queue",
      messages: [{ body: {}, ack, retry }],
    } as unknown as MessageBatch<unknown>, routingEnv());

    expect(ack).not.toHaveBeenCalled();
    expect(retry).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("unknown"), expect.objectContaining({ queue: "unknown-queue", site: "otw" }));
    error.mockRestore();
  });
});

it("requires a non-negative integer retry generation for batch messages", () => {
  const message = { kind: "otw_play_ai_batch", schemaVersion: 1, itemId: "item" };
  for (const generation of [undefined, null, -1, 0.5, "1", Infinity])
    expect(isAiBatchMessage({ ...message, generation })).toBe(false);
  expect(isAiBatchMessage({ ...message, generation: 1 })).toBe(true);
});

it.each([
  ["luvdia-ops-control", "handleScheduledControlQueue"], ["luvdia-ops-critical", "handleScheduledJobQueue"],
  ["luvdia-ops-background", "handleScheduledJobQueue"], ["luvdia-play-ingestion", "handleQueue"],
  ["luvdia-play-ai-review", "handleAiReviewQueue"],
] as const)("dispatches physical %s to its role handler", async (queue, handler) => {
  vi.clearAllMocks();
  const ack = vi.fn(), retry = vi.fn();
  const batch = { queue, messages: [{ body: {}, ack, retry }] } as unknown as MessageBatch<unknown>;
  await handleWorkerQueue(batch, routingEnv('luvdia'));
  expect(mocks[handler]).toHaveBeenCalledWith(batch, expect.objectContaining({ SITE_ID: "luvdia" }));
  expect(ack).not.toHaveBeenCalled();
  expect(retry).not.toHaveBeenCalled();
});
