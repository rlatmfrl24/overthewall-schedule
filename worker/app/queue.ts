import {
  IngestionProcessingError,
} from "../features/otw-play";
import type {
  OtwPlayIngestionQueueMessage,
} from "../features/otw-play";
import type { Env } from "../platform/types";
import { createOtwPlayIngestionService } from "./ingestion";
import { createOtwPlayWorkQueueService, isWorkQueueMessage } from "./work-queue";

export const handleQueue = async (batch: MessageBatch<unknown>, env: Env) => {
  const service = createOtwPlayIngestionService(env);
  const isDeadLetter = batch.queue === "otw-dead-letter";
  for (const message of batch.messages) {
    const body = message.body;
    if (isWorkQueueMessage(body)) {
      try {
        const work=createOtwPlayWorkQueueService(env);
        if (isDeadLetter) await work.dead(body); else await work.process(body);
        message.ack();
      } catch { message.retry(); }
      continue;
    }
    if (
      typeof body !== "object" ||
      body === null ||
      (body as { schemaVersion?: unknown }).schemaVersion !== 1 ||
      typeof (body as { jobId?: unknown }).jobId !== "string" ||
      typeof (body as { idempotencyKey?: unknown }).idempotencyKey !== "string"
    ) {
      message.ack();
      continue;
    }
    const ingestionMessage = body as OtwPlayIngestionQueueMessage;
    if (isDeadLetter) {
      await service.markDeadLetter(
        ingestionMessage,
        "queue_retries_exhausted",
      );
      message.ack();
      continue;
    }
    try {
      await service.process(ingestionMessage);
      try { await createOtwPlayWorkQueueService(env).afterIngestion(ingestionMessage.jobId); } catch { /* Maintenance recovers the durable work batch. */ }
      message.ack();
    } catch (error) {
      if (error instanceof IngestionProcessingError && !error.retryable) {
        await service.markDeadLetter(ingestionMessage, error.errorCode);
        message.ack();
      } else {
        message.retry();
      }
    }
  }
};
