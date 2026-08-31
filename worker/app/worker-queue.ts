import {
  isScheduledControlQueueMessage,
  isScheduledJobQueueMessage,
} from "@contracts/scheduled-operations";
import type { Env } from "../platform/types";
import { handleQueue } from "./queue";
import {
  handleScheduledControlQueue,
  handleScheduledJobQueue,
} from "./scheduled-queue";

const CONTROL_QUEUE = "otw-ops-control";
const SCHEDULED_JOB_QUEUES = new Set([
  "otw-ops-critical",
  "otw-ops-background",
]);
const MEDIA_QUEUES = new Set([
  "otw-play-ingestion",
  "otw-websub",
]);
const DEAD_LETTER_QUEUE = "otw-dead-letter";

const asBatch = (
  batch: MessageBatch<unknown>,
  messages: Message<unknown>[],
) => ({ queue: batch.queue, messages }) as unknown as MessageBatch<unknown>;

export const handleWorkerQueue = async (
  batch: MessageBatch<unknown>,
  env: Env,
) => {
  if (batch.queue === CONTROL_QUEUE) {
    await handleScheduledControlQueue(batch, env);
    return;
  }
  if (SCHEDULED_JOB_QUEUES.has(batch.queue)) {
    await handleScheduledJobQueue(batch, env);
    return;
  }
  if (MEDIA_QUEUES.has(batch.queue)) {
    await handleQueue(batch, env);
    return;
  }
  if (batch.queue === DEAD_LETTER_QUEUE) {
    const scheduledMessages = batch.messages.filter((message) =>
      isScheduledControlQueueMessage(message.body) ||
      isScheduledJobQueueMessage(message.body)
    );
    const mediaMessages = batch.messages.filter((message) =>
      !isScheduledControlQueueMessage(message.body) &&
      !isScheduledJobQueueMessage(message.body)
    );
    await Promise.all([
      scheduledMessages.length > 0
        ? handleScheduledJobQueue(asBatch(batch, scheduledMessages), env)
        : Promise.resolve(),
      mediaMessages.length > 0
        ? handleQueue(asBatch(batch, mediaMessages), env)
        : Promise.resolve(),
    ]);
    return;
  }
  for (const message of batch.messages) message.ack();
};
