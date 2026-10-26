import { handleWorkerFetch } from "./app/fetch";
import { handleWorkerQueue } from "./app/worker-queue";
import { handleScheduledWorkflowCron } from "./app/scheduled-workflow-cron";
import type { Env } from "./platform/types";

export { ScheduledOperationsWorkflow } from "./workflows/scheduled-workflows";
export { XActivityCoordinatorRpc, XActivitySiteRpc } from "./app/x-rpc";

export default {
  fetch(request, env, ctx) {
    return handleWorkerFetch(request, env, ctx);
  },
  queue: handleWorkerQueue,
  scheduled: handleScheduledWorkflowCron,
} satisfies ExportedHandler<Env>;
