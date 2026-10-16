import {
  isScheduledControlQueueMessage,
  isScheduledJobQueueMessage,
} from "@contracts/scheduled-operations";
import type { Env } from "../platform/types";
import { getWorkerSiteResources } from "../platform/site";
import {handleTransitionQueue} from "./content-transition-queue";
import {readTransitionMaintenance} from '../features/content-transition';
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
  const maintenance=await readTransitionMaintenance(env.otw_db);
  if(maintenance) {
    const admitted:Message<unknown>[]=[];
    for(const message of batch.messages) {
      const body=message.body;
      let original: {outcome_json:string|null;response:string|null;codec:string}|null=null;
      if(maintenance.state==='draining'&&body&&typeof body==='object') {
        if('type' in body&&body.type==='content-transition.operation'&&'transitionId' in body&&body.transitionId===maintenance.id&&'operationId' in body&&typeof body.operationId==='string'&&'payloadHash' in body&&typeof body.payloadHash==='string') {
          original=await env.otw_db.prepare("SELECT outcome_json,json_extract(envelope_json,'$.sourceReceipt.aiReview.response') response,json_extract(envelope_json,'$.codec.id') codec FROM content_transition_operations WHERE transition_id=? AND operation_id=? AND payload_hash=? AND source_seq IS NULL").bind(maintenance.id,body.operationId,body.payloadHash).first();
        } else if(isAiReviewMessage(body)) {
          original=await env.otw_db.prepare("SELECT outcome_json,json_extract(envelope_json,'$.sourceReceipt.aiReview.response') response,json_extract(envelope_json,'$.codec.id') codec FROM content_transition_operations WHERE transition_id=? AND source_seq IS NULL AND json_extract(envelope_json,'$.codec.id')='otw-play.ai.unknown' AND json_extract(envelope_json,'$.payload.reviewId')=?").bind(maintenance.id,body.reviewId).first();
        } else if(isAiBatchMessage(body)) {
          const saved=await env.otw_db.prepare("SELECT 1 FROM music_ai_review_batch_items i WHERE i.id=? AND i.generation=? AND (i.status IN ('saved','needs_selection','failed','changed') OR i.result_json IS NOT NULL OR EXISTS(SELECT 1 FROM music_ai_reviews r WHERE r.id=i.review_id AND r.status IN ('succeeded','partial','failed')))").bind(body.itemId,body.generation).first();
          if(saved){admitted.push(message);continue;}
        }
      }
      // Only an existing terminal receipt or recorded non-repeatable response
      // can finish here. A queued/unissued operation never starts during drain.
      if(original&&(original.outcome_json&&JSON.parse(original.outcome_json).sideEffectReconciled||original.codec==='otw-play.ai.unknown'&&original.response)) admitted.push(message);
      else message.retry({delaySeconds:60});
    }
    if(!admitted.length)return;
    batch=asBatch(batch,admitted);
  }
  if(batch.queue===queues.background || batch.queue===queues.deadLetter) {
    const transition=batch.messages.filter(message=>!!message.body && typeof message.body==="object" && "type" in message.body && message.body.type==="content-transition.operation");
    if(transition.length) {
      await handleTransitionQueue(transition,env);
      const rest=batch.messages.filter(message=>!transition.includes(message));
      if(!rest.length) return;
      batch=asBatch(batch,rest);
    }
  }
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
