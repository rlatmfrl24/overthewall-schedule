import {
  isScheduledControlQueueMessage,
  isScheduledJobQueueMessage,
} from "@contracts/scheduled-operations";
import type { Env } from "../platform/types";
import { getWorkerSiteResources } from "../platform/site";
import { handleQueue } from "./queue";
import { isXActivityQueueMessage } from "@contracts/x-activity";
import { handleXActivityQueue } from "./x-activity";
import { withXGateway } from "./x-gateway";
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
  env = withXGateway(env);

  if (batch.queue === queues.aiReview) { await handleAiReviewQueue(batch, env); return; }
  if (batch.queue === queues.control) {
    await handleScheduledControlQueue(batch, env);
    return;
  }
  if (batch.queue === queues.critical || batch.queue === queues.background) {
    const activity = batch.messages.filter(message => isXActivityQueueMessage(message.body));
    if (activity.length) {
      await handleXActivityQueue(asBatch(batch, activity), env);
      const scheduled = batch.messages.filter(message => !isXActivityQueueMessage(message.body));
      if (scheduled.length) await handleScheduledJobQueue(asBatch(batch, scheduled), env);
      return;
    }
    await handleScheduledJobQueue(batch, env);
    return;
  }
  if (batch.queue === queues.ingestion) {
    await handleQueue(batch, env);
    return;
  }
  if (batch.queue === queues.deadLetter) {
    const activityMessages = batch.messages.filter(message => isXActivityQueueMessage(message.body));
    const scheduledMessages = batch.messages.filter((message) =>
      isScheduledControlQueueMessage(message.body) ||
      isScheduledJobQueueMessage(message.body)
    );
    const mediaMessages = batch.messages.filter((message) =>
      !isScheduledControlQueueMessage(message.body) &&
      !isScheduledJobQueueMessage(message.body) && !isAiReviewMessage(message.body) && !isAiBatchMessage(message.body) && !isXActivityQueueMessage(message.body)
    );
    const aiMessages = batch.messages.filter(message => isAiReviewMessage(message.body) || isAiBatchMessage(message.body));
    await Promise.all([
      activityMessages.length ? handleXActivityQueue(asBatch(batch, activityMessages), env) : Promise.resolve(),
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
