import { handleScheduledControlQueue } from "../app/scheduled-queue";
import type { Env } from "../platform/types";

export {
  ChannelReconcileWorkflow,
  IngestionRecoveryWorkflow,
  NaverCafeCollectionWorkflow,
  RecentReconcileWorkflow,
  RetentionPruneWorkflow,
  ScheduleAutoUpdateWorkflow,
  SourceHealthWorkflow,
  WebsubMaintenanceWorkflow,
  XCollectionWorkflow,
} from "../workflows/scheduled-workflows";

export default {
  queue: handleScheduledControlQueue,
} satisfies ExportedHandler<Env>;
