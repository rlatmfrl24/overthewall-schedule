import { handleWorkerFetch } from "./app/fetch";
import { handleScheduled } from "./app/scheduled";
import { handleQueue } from "./app/queue";
import type { Env } from "./platform/types";

export default {
  fetch: handleWorkerFetch,
  scheduled: handleScheduled,
  queue: handleQueue,
} satisfies ExportedHandler<Env>;
