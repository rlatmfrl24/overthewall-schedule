import { handleWorkerFetch } from "./app/fetch";
import { handleScheduled } from "./app/scheduled";
import type { Env } from "./platform/types";

export default {
  fetch: handleWorkerFetch,
  scheduled: handleScheduled,
} satisfies ExportedHandler<Env>;
