import { isScheduledJobQueueMessage } from "@contracts/scheduled-operations";
import { handleQueue } from "../app/queue";
import { handleScheduledJobQueue } from "../app/scheduled-queue";
import type { Env } from "../platform/types";

export const handleMediaQueue = async (
  batch: MessageBatch<unknown>,
  env: Env,
) => {
  const scheduledMessages = batch.messages.filter((message) =>
    isScheduledJobQueueMessage(message.body)
  );
  const legacyMessages = batch.messages.filter((message) =>
    !isScheduledJobQueueMessage(message.body)
  );
  const asBatch = (messages: typeof batch.messages) => ({
    queue: batch.queue,
    messages,
  }) as MessageBatch<unknown>;
  await Promise.all([
    scheduledMessages.length > 0
      ? handleScheduledJobQueue(asBatch(scheduledMessages), env)
      : Promise.resolve(),
    legacyMessages.length > 0
      ? handleQueue(asBatch(legacyMessages), env)
      : Promise.resolve(),
  ]);
};

export default {
  queue: handleMediaQueue,
} satisfies ExportedHandler<Env>;
