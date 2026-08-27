import {
  CloudflarePlayTelemetryWriter,
  createPlayTelemetryEvent,
  IngestionProcessingError,
} from "../features/otw-play";
import type {
  OtwPlayIngestionQueueMessage,
  OtwPlayWebsubQueueMessage,
} from "../features/otw-play";
import type { Env } from "../platform/types";
import { createOtwPlayIngestionService } from "./ingestion";
import { createOtwPlayWebsubService } from "./websub";

const writeWebsubQueueTelemetry = (
  env: Env,
  input: {
    deliveryId: string;
    transition: "processed" | "retry" | "dead_letter";
    status: number;
    durationMs: number;
    errorCode?: string;
  },
) => {
  new CloudflarePlayTelemetryWriter(env.OTW_PLAY_ANALYTICS).write(
    createPlayTelemetryEvent({
      event: "play.websub.updated",
      requestId: input.deliveryId,
      cfRay: null,
      routeId: "otw-play.websub.queue",
      trigger: "queue",
      status: input.status,
      durationMs: input.durationMs,
      cacheStatus: null,
      d1RowsRead: null,
      d1RowsWritten: null,
      resourceType: "websub-delivery",
      resourceId: input.deliveryId,
      transition: input.transition,
      ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    }),
  );
};

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
      const startedAt = Date.now();
      const websubService = createOtwPlayWebsubService(env);
      const websubMessage = body as OtwPlayWebsubQueueMessage;
      if (isDeadLetter) {
        await websubService.markDeadLetter(websubMessage);
        writeWebsubQueueTelemetry(env, {
          deliveryId: websubMessage.deliveryId,
          transition: "dead_letter",
          status: 500,
          durationMs: Math.max(0, Date.now() - startedAt),
          errorCode: "queue_retries_exhausted",
        });
        message.ack();
        continue;
      }
      try {
        await websubService.process(websubMessage);
        writeWebsubQueueTelemetry(env, {
          deliveryId: websubMessage.deliveryId,
          transition: "processed",
          status: 200,
          durationMs: Math.max(0, Date.now() - startedAt),
        });
        message.ack();
      } catch (error) {
        writeWebsubQueueTelemetry(env, {
          deliveryId: websubMessage.deliveryId,
          transition: "retry",
          status: 503,
          durationMs: Math.max(0, Date.now() - startedAt),
          errorCode: error instanceof Error ? error.name : "UnknownError",
        });
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
