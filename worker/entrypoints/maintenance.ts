import { handleScheduledJobQueue } from "../app/scheduled-queue";
import type { Env } from "../platform/types";

export default {
  queue: handleScheduledJobQueue,
} satisfies ExportedHandler<Env>;
