import { IngestionProcessingError } from "../features/otw-play";
import type { OtwPlayIngestionQueueMessage } from "../features/otw-play";
import type { Env } from "../platform/types";
import { createOtwPlayIngestionService } from "./ingestion";

export const handleQueue = async (batch: MessageBatch<unknown>, env: Env) => {
  const service = createOtwPlayIngestionService(env);
  const isDeadLetter = batch.queue === "otw-play-ingestion-dlq";
  for (const message of batch.messages) {
    const body = message.body;
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
