import { IngestionProcessingError } from "../features/otw-play";
import type {
  OtwPlayIngestionQueueMessage,
  OtwPlayWebsubQueueMessage,
} from "../features/otw-play";
import type { Env } from "../platform/types";
import { createOtwPlayIngestionService } from "./ingestion";
import { createOtwPlayWebsubService } from "./websub";

export const handleQueue = async (batch: MessageBatch<unknown>, env: Env) => {
  const service = createOtwPlayIngestionService(env);
  const isDeadLetter = batch.queue === "otw-play-ingestion-dlq";
  for (const message of batch.messages) {
    const body = message.body;
    const isWebsubMessage = typeof body === "object" && body !== null &&
      (body as { schemaVersion?: unknown }).schemaVersion === 1 &&
      (body as { messageType?: unknown }).messageType === "channel_websub" &&
      typeof (body as { deliveryId?: unknown }).deliveryId === "string";
    if (isWebsubMessage) {
      const websubService = createOtwPlayWebsubService(env);
      const websubMessage = body as OtwPlayWebsubQueueMessage;
      if (isDeadLetter) {
        await websubService.markDeadLetter(websubMessage);
        message.ack();
        continue;
      }
      try {
        await websubService.process(websubMessage);
        message.ack();
      } catch {
        message.retry();
      }
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
