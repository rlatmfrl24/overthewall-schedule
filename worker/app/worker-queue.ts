import {
  isScheduledControlQueueMessage,
  isScheduledJobQueueMessage,
} from "@contracts/scheduled-operations";
import type { Env } from "../platform/types";
import { getWorkerSiteResources } from "../platform/site";
import { handleQueue } from "./queue";
import { handleAiReviewQueue, isAiReviewMessage, isAiBatchMessage } from "./ai-review";
import {
  handleScheduledControlQueue,
  handleScheduledJobQueue,
} from "./scheduled-queue";

const asBatch = (
  batch: MessageBatch<unknown>,
  messages: Message<unknown>[],
) => ({ queue: batch.queue, messages }) as unknown as MessageBatch<unknown>;

export const handleWorkerQueue = async (
  batch: MessageBatch<unknown>,
  env: Env,
) => {
  const { site, queues } = getWorkerSiteResources(env);
  if (batch.queue === queues.aiReview) { await handleAiReviewQueue(batch, env); return; }
  if (batch.queue === queues.control) {
    await handleScheduledControlQueue(batch, env);
    return;
  }
  if (batch.queue === queues.critical || batch.queue === queues.background) {
    await handleScheduledJobQueue(batch, env);
    return;
  }
  if (batch.queue === queues.ingestion) {
    await handleQueue(batch, env);
    return;
  }
  if (batch.queue === queues.deadLetter) {
    const scheduledMessages = batch.messages.filter((message) =>
      isScheduledControlQueueMessage(message.body) ||
      isScheduledJobQueueMessage(message.body)
    );
    const mediaMessages = batch.messages.filter((message) =>
      !isScheduledControlQueueMessage(message.body) &&
      !isScheduledJobQueueMessage(message.body) && !isAiReviewMessage(message.body) && !isAiBatchMessage(message.body)
    );
    const aiMessages = batch.messages.filter(message => isAiReviewMessage(message.body) || isAiBatchMessage(message.body));
    await Promise.all([
      aiMessages.length > 0 ? handleAiReviewQueue(asBatch(batch, aiMessages), env) : Promise.resolve(),
      scheduledMessages.length > 0
        ? handleScheduledJobQueue(asBatch(batch, scheduledMessages), env)
        : Promise.resolve(),
      mediaMessages.length > 0
        ? handleQueue(asBatch(batch, mediaMessages), env)
        : Promise.resolve(),
    ]);
    return;
  }
  console.error("[queue] unknown physical queue", { queue: batch.queue, site: site.id });
  for (const message of batch.messages) message.retry();
};
