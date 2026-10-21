import { siteEnv } from "../test-support/site-env";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IngestionProcessingError } from "../features/otw-play";
import type { Env } from "../platform/types";
import { handleQueue } from "./queue";
import { isWorkQueueMessage } from "./work-queue";

const service = vi.hoisted(() => ({
  process: vi.fn(),
  markDeadLetter: vi.fn(),
}));
vi.mock("./ingestion", () => ({
  createOtwPlayIngestionService: () => service,
}));
const work=vi.hoisted(()=>({afterIngestion:vi.fn(),process:vi.fn(),dead:vi.fn()}));
vi.mock("./work-queue", async (importOriginal) => ({
  ...await importOriginal<typeof import("./work-queue")>(),
  createOtwPlayWorkQueueService: () => work,
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
    work.afterIngestion.mockReset();work.process.mockReset();work.dead.mockReset();
    service.process.mockReset();
    service.markDeadLetter.mockReset();
  });
  it("routes work preparation and DLQ failure through the same ingestion binding",async()=>{
    const body={kind:"otw_play_work_queue",schemaVersion:1,target:"batch",id:"batch"};
    const ack=vi.fn();
    await handleQueue(batch("otw-play-ingestion",body,ack),siteEnv() as Env);
    expect(work.process).toHaveBeenCalledWith(body);expect(ack).toHaveBeenCalledOnce();
    await handleQueue(batch("otw-dead-letter",body),siteEnv() as Env);
    expect(work.dead).toHaveBeenCalledWith(body);
  });

  it("acks successful and malformed main-queue deliveries", async () => {
    const successAck = vi.fn();
    await handleQueue(batch("otw-play-ingestion", message, successAck), siteEnv() as Env);
    expect(service.process).toHaveBeenCalledWith(message);
    expect(successAck).toHaveBeenCalledOnce();

    const invalidAck = vi.fn();
    await handleQueue(batch("otw-play-ingestion", { schemaVersion: 2 }, invalidAck), siteEnv() as Env);
    expect(invalidAck).toHaveBeenCalledOnce();
    expect(service.process).toHaveBeenCalledOnce();
  });

  it.each([false, true])("continues the committed ingestion into durable work before ACK (recovery needed: %s)", async (hookFails) => {
    const ack = vi.fn(), retry = vi.fn();
    if (hookFails) work.afterIngestion.mockRejectedValueOnce(new Error("temporary work queue failure"));
    await handleQueue(batch("otw-play-ingestion", message, ack, retry), siteEnv() as Env);
    expect(service.process).toHaveBeenCalledExactlyOnceWith(message);
    expect(work.afterIngestion).toHaveBeenCalledExactlyOnceWith(message.jobId);
    expect(service.process).toHaveBeenCalledBefore(work.afterIngestion);
    expect(work.afterIngestion).toHaveBeenCalledBefore(ack);
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
    expect(service.markDeadLetter).not.toHaveBeenCalled();
  });

  it("retries retryable failures and permanently records non-retryable failures", async () => {
    const retry = vi.fn();
    service.process.mockRejectedValueOnce(
      new IngestionProcessingError("quota_exceeded", true, 123),
    );
    await handleQueue(batch("otw-play-ingestion", message, vi.fn(), retry), siteEnv() as Env);
    expect(retry).toHaveBeenCalledOnce();

    const ack = vi.fn();
    service.process.mockRejectedValueOnce(
      new IngestionProcessingError("invalid_message", false, null),
    );
    await handleQueue(batch("otw-play-ingestion", message, ack), siteEnv() as Env);
    expect(service.markDeadLetter).toHaveBeenCalledWith(message, "invalid_message");
    expect(ack).toHaveBeenCalledOnce();
  });

  it("turns DLQ delivery into authoritative D1 partial state before ack", async () => {
    const ack = vi.fn();
    await handleQueue(batch("otw-dead-letter", message, ack), siteEnv() as Env);
    expect(service.markDeadLetter).toHaveBeenCalledWith(
      message,
      "queue_retries_exhausted",
    );
    expect(service.markDeadLetter).toHaveBeenCalledBefore(ack);
  });

  it.each(["otw-play-ingestion", "otw-dead-letter"])("does not acknowledge %s when failure persistence fails", async (queue) => {
    const ack = vi.fn(), retry = vi.fn(), error = new Error("D1 unavailable");
    service.process.mockRejectedValueOnce(new IngestionProcessingError("invalid_message", false, null));
    service.markDeadLetter.mockRejectedValueOnce(error);
    await expect(handleQueue(batch(queue, message, ack, retry), siteEnv() as Env)).rejects.toBe(error);
    expect(ack).not.toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();
  });

  it.each(["otw-play-ingestion", "otw-dead-letter"])("retries %s work messages when their durable operation fails", async (queue) => {
    const body = { kind: "otw_play_work_queue", schemaVersion: 1, target: "batch", id: "batch" };
    const ack = vi.fn(), retry = vi.fn();
    (queue === "otw-dead-letter" ? work.dead : work.process).mockRejectedValueOnce(new Error("D1 unavailable"));
    await handleQueue(batch(queue, body, ack, retry), siteEnv() as Env);
    expect(retry).toHaveBeenCalledOnce();
    expect(ack).not.toHaveBeenCalled();
  });

  it.each(["otw-play-ingestion", "otw-dead-letter"])(
    "ignores obsolete message shapes on %s without changing archived data", async (queue) => {
      const ack = vi.fn();
      const retry = vi.fn();
      const prepare = vi.fn();
      await handleQueue(batch(queue, { schemaVersion: 1, messageType: "channel_websub", deliveryId: "delivery-1" }, ack, retry), { ...siteEnv(), otw_db: { prepare } } as unknown as Env);
      expect(ack).toHaveBeenCalledOnce();
      expect(retry).not.toHaveBeenCalled();
      expect(service.process).not.toHaveBeenCalled();
      expect(service.markDeadLetter).not.toHaveBeenCalled();
      expect(prepare).not.toHaveBeenCalled();
    },
  );
});

it("validates actual work-queue messages before dispatch", () => {
  const message = { kind: "otw_play_work_queue", schemaVersion: 1, target: "batch", id: "batch_1-A" };
  for (const invalid of [null, [], {}, { ...message, kind: "other" }, { ...message, schemaVersion: 2 }, { ...message, target: "other" },
    ...[undefined, null, 1, "", "a".repeat(101), "../batch", "배치"].map(id => ({ ...message, id }))]) {
    expect(isWorkQueueMessage(invalid)).toBe(false);
  }
  expect(isWorkQueueMessage(message)).toBe(true);
  expect(isWorkQueueMessage({ ...message, target: "queue", id: "a".repeat(100) })).toBe(true);
});

it("preserves LuvDia ingestion/work DLQ state before ACK and retryable failures", async () => {
  service.process.mockReset(); service.markDeadLetter.mockReset(); work.dead.mockReset();
  const ack = vi.fn(), retry = vi.fn();
  await handleQueue(batch("luvdia-dead-letter", message, ack, retry), siteEnv("luvdia") as Env);
  expect(service.markDeadLetter).toHaveBeenCalledWith(message, "queue_retries_exhausted");
  expect(service.markDeadLetter).toHaveBeenCalledBefore(ack);
  expect(service.process).not.toHaveBeenCalled();
  const body = { kind: "otw_play_work_queue", schemaVersion: 1, target: "batch", id: "batch" };
  await handleQueue(batch("luvdia-dead-letter", body), siteEnv("luvdia") as Env);
  expect(work.dead).toHaveBeenCalledWith(body);
  service.process.mockRejectedValueOnce(new IngestionProcessingError("quota_exceeded", true, 123));
  await handleQueue(batch("luvdia-play-ingestion", message, vi.fn(), retry), siteEnv("luvdia") as Env);
  expect(retry).toHaveBeenCalledOnce();
});
