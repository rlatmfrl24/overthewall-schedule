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

const getErrorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const isTerminalItemStatus = (status: string) =>
  ["succeeded", "failed", "skipped", "throttled"].includes(status);

export const handleScheduledControlQueue = async (
  batch: MessageBatch<unknown>,
  env: Env,
) => {
  const coordinator = new ScheduledJobCoordinator(env);
  const repository = coordinator.repository;
  for (const message of batch.messages) {
    if (!isScheduledControlQueueMessage(message.body)) {
      message.ack();
      continue;
    }
    try {
      await coordinator.planManualRun(message.body.runId);
      message.ack();
    } catch (error) {
      console.error("[scheduled-control] planning failed", {
        runId: message.body.runId,
        error: getErrorText(error),
      });
      const reserved = await repository.reserveQueueOperations("control");
      if (reserved) {
        message.retry({ delaySeconds: 60 });
      } else {
        await repository.markRunThrottled(
          message.body.runId,
          "daily_queue_budget_exhausted_during_retry",
        );
        message.ack();
      }
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
  const isDeadLetter = batch.queue === "otw-dead-letter";
  const reconcileTerminalItem = async (
    item: NonNullable<Awaited<ReturnType<typeof repository.readItem>>>,
  ) => {
    if (item.status === "succeeded") {
      await coordinator.advanceRun(item);
    }
    await coordinator.dispatchRun(item.run_id);
    await repository.refreshRun(item.run_id);
    await executor.finalizeLegacyState(item.run_id);
  };
  const retryReconciliation = async (
    message: Message<unknown>,
    item: NonNullable<Awaited<ReturnType<typeof repository.readItem>>>,
    error: unknown,
  ) => {
    const reserved = await repository.reserveQueueOperations(item.lane);
    if (reserved) {
      message.retry({ delaySeconds: 60 });
      return;
    }
    await repository.markRunFailed(
      item.run_id,
      `post_completion_reconciliation_failed:${getErrorText(error)}`,
      true,
    );
    message.ack();
  };
  for (const message of batch.messages) {
    if (!isScheduledJobQueueMessage(message.body)) {
      if (isDeadLetter && isScheduledControlQueueMessage(message.body)) {
        await repository.markRunFailed(
          message.body.runId,
          "control_queue_retries_exhausted",
        );
      }
      message.ack();
      continue;
    }
    if (isDeadLetter) {
      const existing = await repository.readItem(message.body.itemId);
      if (existing && isTerminalItemStatus(existing.status)) {
        try {
          await reconcileTerminalItem(existing);
        } catch (error) {
          await repository.markRunFailed(
            existing.run_id,
            `post_completion_reconciliation_dead_letter:${getErrorText(error)}`,
            true,
          );
        }
      } else {
        await repository.markItemDeadLetter(message.body.itemId);
      }
      message.ack();
      continue;
    }
    const item = await repository.claimItem(message.body.itemId);
    if (!item) {
      const existing = await repository.readItem(message.body.itemId);
      if (!existing || !isTerminalItemStatus(existing.status)) {
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
      const completed = await repository.completeItem(item, {
        status: outcome.status,
        result: outcome.result,
        errorCode: outcome.errorCode,
        error: outcome.error,
      });
      if (!completed) {
        message.ack();
        continue;
      }
      await reconcileTerminalItem({ ...item, status: outcome.status });
      message.ack();
    } catch (error) {
      const errorText = getErrorText(error);
      const errorCode = error instanceof Error ? error.name : "UnknownError";
      const current = await repository.readItem(item.id);
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
          await repository.completeItem(item, {
            status: "throttled",
            errorCode: "queue_budget_exhausted",
            error: "Queue retry was denied by the daily admission budget",
          });
          const throttled = await repository.readItem(item.id);
          if (throttled && isTerminalItemStatus(throttled.status)) {
            await reconcileTerminalItem(throttled);
          }
          message.ack();
        }
      } else {
        await repository.completeItem(item, {
          status: "failed",
          errorCode,
          error: errorText,
        });
        const failed = await repository.readItem(item.id);
        if (failed && isTerminalItemStatus(failed.status)) {
          await reconcileTerminalItem(failed);
        }
        message.ack();
      }
    }
  }
};
