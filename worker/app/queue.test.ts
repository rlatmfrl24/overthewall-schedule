import { beforeEach, describe, expect, it, vi } from "vitest";
import { IngestionProcessingError } from "../features/otw-play";
import type { Env } from "../platform/types";
import { handleQueue } from "./queue";

const service = vi.hoisted(() => ({
  process: vi.fn(),
  markDeadLetter: vi.fn(),
}));
vi.mock("./ingestion", () => ({
  createOtwPlayIngestionService: () => service,
}));
const websubService = vi.hoisted(() => ({
  process: vi.fn(),
  markDeadLetter: vi.fn(),
}));
vi.mock("./websub", () => ({
  createOtwPlayWebsubService: () => websubService,
}));

const batch = (
  queue: string,
  body: unknown,
  ack = vi.fn(),
  retry = vi.fn(),
) => ({
  queue,
  messages: [{ body, ack, retry }],
}) as unknown as MessageBatch<unknown>;

const message = {
  schemaVersion: 1,
  jobId: "job-1",
  idempotencyKey: "message-1",
};

describe("OTW Play ingestion queue handler", () => {
  beforeEach(() => {
    service.process.mockReset();
    service.markDeadLetter.mockReset();
    websubService.process.mockReset();
    websubService.markDeadLetter.mockReset();
  });

  it("acks successful and malformed main-queue deliveries", async () => {
    const successAck = vi.fn();
    await handleQueue(batch("otw-play-ingestion", message, successAck), {} as Env);
    expect(service.process).toHaveBeenCalledWith(message);
    expect(successAck).toHaveBeenCalledOnce();

    const invalidAck = vi.fn();
    await handleQueue(batch("otw-play-ingestion", { schemaVersion: 2 }, invalidAck), {} as Env);
    expect(invalidAck).toHaveBeenCalledOnce();
    expect(service.process).toHaveBeenCalledOnce();
  });

  it("retries retryable failures and permanently records non-retryable failures", async () => {
    const retry = vi.fn();
    service.process.mockRejectedValueOnce(
      new IngestionProcessingError("quota_exceeded", true, 123),
    );
    await handleQueue(batch("otw-play-ingestion", message, vi.fn(), retry), {} as Env);
    expect(retry).toHaveBeenCalledOnce();

    const ack = vi.fn();
    service.process.mockRejectedValueOnce(
      new IngestionProcessingError("invalid_message", false, null),
    );
    await handleQueue(batch("otw-play-ingestion", message, ack), {} as Env);
    expect(service.markDeadLetter).toHaveBeenCalledWith(message, "invalid_message");
    expect(ack).toHaveBeenCalledOnce();
  });

  it("turns DLQ delivery into authoritative D1 partial state before ack", async () => {
    const ack = vi.fn();
    await handleQueue(batch("otw-play-ingestion-dlq", message, ack), {} as Env);
    expect(service.markDeadLetter).toHaveBeenCalledWith(
      message,
      "queue_retries_exhausted",
    );
    expect(service.markDeadLetter).toHaveBeenCalledBefore(ack);
  });

  it("dispatches versioned WebSub messages without changing the playlist shape", async () => {
    const websubMessage = {
      schemaVersion: 1,
      messageType: "channel_websub",
      deliveryId: "delivery-1",
    };
    const ack = vi.fn();
    await handleQueue(batch("otw-play-ingestion", websubMessage, ack), {} as Env);
    expect(websubService.process).toHaveBeenCalledWith(websubMessage);
    expect(service.process).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledOnce();

    const retry = vi.fn();
    websubService.process.mockRejectedValueOnce(new Error("metadata unavailable"));
    await handleQueue(batch("otw-play-ingestion", websubMessage, vi.fn(), retry), {} as Env);
    expect(retry).toHaveBeenCalledOnce();

    const deadAck = vi.fn();
    await handleQueue(batch("otw-play-ingestion-dlq", websubMessage, deadAck), {} as Env);
    expect(websubService.markDeadLetter).toHaveBeenCalledWith(websubMessage);
    expect(deadAck).toHaveBeenCalledOnce();
  });
});
