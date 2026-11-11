import {
  isScheduledControlQueueMessage,
  isScheduledJobQueueMessage,
} from "@contracts/scheduled-operations";
import {
  ScheduledJobCoordinator,
  ScheduledJobExecutor,
} from "../features/scheduled-operations";
import { D1ScheduledJobRepository } from "../platform/scheduled-jobs";
import type { Env } from "../platform/types";
import { getWorkerSiteResources } from "../platform/site";
import { ScheduledAutoUpdateBlocked } from "../features/schedules";

const getErrorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const isTerminalItemStatus = (status: string) =>
  ["succeeded", "partial", "failed", "skipped", "throttled"].includes(status);

const matchesDelivery = (item: { continuation_json: string | null }, generation: number) => {
  try { return (JSON.parse(item.continuation_json ?? "null")?.deliveryGeneration ?? 0) === generation; }
  catch { return generation === 0; }
};

export const handleScheduledControlQueue = async (
  batch: MessageBatch<unknown>,
  env: Env,
) => {
  getWorkerSiteResources(env);
  const coordinator = new ScheduledJobCoordinator(env);
  const repository = coordinator.repository;
  for (const message of batch.messages) {
    if (!isScheduledControlQueueMessage(message.body)) {
      message.ack();
      continue;
    }
    try {
      await coordinator.planManualRun(message.body.runId,message.body.deliveryGeneration ?? 0);
      message.ack();
    } catch (error) {
      console.error("[scheduled-control] planning failed", {
        runId: message.body.runId,
        error: getErrorText(error),
      });
      const admission = await repository.reserveControlRetry(message.body.runId, message.body.deliveryGeneration ?? 0);
      if (admission === "reserved") {
        message.retry({ delaySeconds: 60 });
        continue;
      }
      if (admission === "denied") await repository.completeUnplannedRun(
        message.body.runId,
        "throttled",
        "daily_queue_budget_exhausted_during_retry",
        message.body.deliveryGeneration ?? 0,
      );
      message.ack();
    }
  }
};

export const handleScheduledJobQueue = async (
  batch: MessageBatch<unknown>,
  env: Env,
) => {
  const repository = new D1ScheduledJobRepository(env.otw_db);
  const executor = new ScheduledJobExecutor(env, repository);
  const coordinator = new ScheduledJobCoordinator(env);
  const isDeadLetter = batch.queue === getWorkerSiteResources(env).queues.deadLetter;
  const reconcileTerminalItem = async (
    item: NonNullable<Awaited<ReturnType<typeof repository.readItem>>>,
  ) => {
    if (item.status==="succeeded" || item.status==="partial" || ["scan","match"].includes(item.phase) && isTerminalItemStatus(item.status)) {
      await coordinator.advanceRun(item);
    }
    await coordinator.dispatchRun(item.run_id, { items: [item] });
    await repository.refreshRun(item.run_id, [item]);
    await executor.finalizeLegacyState(item.run_id);
    await repository.acknowledgeReconciliation(item);
  };
  const retryReconciliation = async (
    message: Message<unknown>,
    item: NonNullable<Awaited<ReturnType<typeof repository.readItem>>>,
    error: unknown,
  ) => {
    const reserved = await repository.reserveReconciliationRetry(
      item.run_id,
      `post_completion_reconciliation_failed:${getErrorText(error)}`,
      [item],
    );
    if (reserved) {
      message.retry({ delaySeconds: 60 });
      return;
    }

    message.ack();
  };
  // X collection deliveries share reconciliation, including mixed RSS and official results.
  const deliveries = batch.messages.map(message => message.body);
  if (isDeadLetter && deliveries.length > 1 && deliveries.every(isScheduledJobQueueMessage)) {
    const items = await repository.readItems(deliveries.map(body => body.itemId));
    if (items.every(item => item.job_type === "x_collection" && item.phase === "collect")) {
      const current = items.filter(item => deliveries.some(body => body.itemId === item.id && matchesDelivery(item, body.deliveryGeneration ?? 0)));
      const terminal=current.filter(item=>isTerminalItemStatus(item.status));
      for(const item of current.filter(item=>!isTerminalItemStatus(item.status))) {
        const delivery = deliveries.find(body => body.itemId === item.id && matchesDelivery(item, body.deliveryGeneration ?? 0))!;
        await repository.markItemDeadLetter(item.id, undefined, item, delivery.deliveryGeneration ?? 0);
      }
      const runs=[...new Set(terminal.map(item=>item.run_id))];
      if(runs.length) {
        try {
          for(const run of runs)await coordinator.dispatchRun(run, { items: terminal.filter(item => item.run_id === run) });
          await repository.refreshRuns(runs, terminal);
          await executor.finalizeLegacyStates(runs);
          await repository.acknowledgeReconciliations(terminal);
        } catch(error) {
          await repository.markReconciliationsFailed(terminal, `post_completion_reconciliation_dead_letter:${getErrorText(error)}`);
        }
      }
      for(const message of batch.messages)message.ack();
      return;
    }
  }
  for (const message of batch.messages) {
    if (!isScheduledJobQueueMessage(message.body)) {
      if (isDeadLetter && isScheduledControlQueueMessage(message.body)) {
        await repository.completeUnplannedRun(
          message.body.runId,
          "failed",
          "control_queue_retries_exhausted",
          message.body.deliveryGeneration ?? 0,
        );
      }
      message.ack();
      continue;
    }
    const generation = message.body.deliveryGeneration ?? 0;
    if (isDeadLetter) {
      const existing = await repository.readItem(message.body.itemId);
      if (!existing || !matchesDelivery(existing, generation)) { message.ack(); continue; }
      if (isTerminalItemStatus(existing.status)) {
        try {
          await reconcileTerminalItem(existing);
        } catch (error) {
          await repository.markRunFailed(
            existing.run_id,
            `post_completion_reconciliation_dead_letter:${getErrorText(error)}`,
            true,
            [existing],
          );
        }
      } else {
        await repository.markItemDeadLetter(message.body.itemId, undefined, existing, generation);
      }
      message.ack();
      continue;
    }
    const item = await repository.claimItem(message.body.itemId, generation);
    if (!item) {
      const existing = await repository.readItem(message.body.itemId);
      if (existing && !matchesDelivery(existing, generation)) { message.ack(); continue; }
      if (existing?.status === "running" && existing.lease_until != null && existing.lease_until < Date.now() &&
          await repository.recoverExpiredDelivery(existing.id, generation)) {
        // A transport retry retains its original body, so the recovered lease needs a new delivery.
        try { await coordinator.dispatchRun(existing.run_id); }
        catch (error) { console.error("[scheduled-queue] recovered delivery dispatch pending", getErrorText(error)); }
        message.ack();
        continue;
      }
      if (!existing || !isTerminalItemStatus(existing.status)) {
        if (existing?.status === "queued" && await repository.rearmDeferredPriorityItem(existing.id, generation)) {
          await coordinator.dispatchRun(existing.run_id);
        }
        message.ack();
        continue;
      }
      try {
        await reconcileTerminalItem(existing);
        message.ack();
      } catch (error) {
        await retryReconciliation(message, existing, error);
      }
      continue;
    }
    try {
      const outcome = await executor.execute(item);
      if (outcome.nextContinuation) {
        if (await repository.continueItem(item, outcome.nextContinuation, outcome.result)) {
          try { await coordinator.dispatchRun(item.run_id); }
          catch (error) { console.error("[scheduled-queue] continuation dispatch pending", getErrorText(error)); }
        }
        message.ack();
        continue;
      }
      const completed = await repository.completeItemWithReadback(item, {
        status: outcome.status,
        result: outcome.result,
        errorCode: outcome.errorCode,
        error: outcome.error,
      }, false);
      if (!completed) {
        message.ack();
        continue;
      }
      await reconcileTerminalItem(completed);
      // Only fresh completions can spend the remaining D1 calls on reply previews.
      if (batch.messages.length === 1 && completed.lane === "x" &&
          (completed.status === "succeeded" || completed.status === "partial")) {
        await executor.enrichCompletedXReplies(completed);
      }
      message.ack();
    } catch (error) {
      if (error instanceof ScheduledAutoUpdateBlocked) {
        const completed = await repository.completeItemWithReadback(item, {status:"skipped",result:{reason:error.message}});
        if (completed) await reconcileTerminalItem(completed);
        message.ack();
        continue;
      }
      const errorText = getErrorText(error);
      const errorCode = error instanceof Error ? error.name : "UnknownError";
      const current = await repository.readItem(item.id);
      if (current && !matchesDelivery(current, generation)) { message.ack(); continue; }
      if (current && isTerminalItemStatus(current.status)) {
        await retryReconciliation(message, current, error);
        continue;
      }

      if (item.attempts < 3) {
        const reserved = await repository.reserveQueueOperations(item.lane);
        if (reserved) {
          const released = await repository.releaseItemForRetry(
            item,
            errorCode,
            errorText,
          );
          if (released) message.retry({ delaySeconds: 60 });
          else message.ack();
        } else {
          const throttled = await repository.completeItemWithReadback(item, {
            status: "throttled",
            errorCode: "queue_budget_exhausted",
            error: "Queue retry was denied by the daily admission budget",
          });
          if (throttled) {
            await reconcileTerminalItem(throttled);
          }
          message.ack();
        }
      } else {
        const failed = await repository.completeItemWithReadback(item, {
          status: "failed",
          errorCode,
          error: errorText,
        });
        if (failed) {
          await reconcileTerminalItem(failed);
        }
        message.ack();
      }
    }
  }
};
