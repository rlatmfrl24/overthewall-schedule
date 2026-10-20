import { autoUpdatePhaseReadySql } from "../../../platform/scheduled-jobs";

export type ScheduledAutoUpdateItem = {
  id: string;
  runId: string;
  leaseToken: string | null;
};

export class ScheduledAutoUpdateBlocked extends Error {}

const activeItem = (db: D1Database, item: ScheduledAutoUpdateItem, atomic: boolean) => {
  const reason = `SELECT CASE
    WHEN NOT EXISTS(SELECT 1 FROM scheduled_job_items i JOIN scheduled_job_runs r ON r.id=i.run_id
      WHERE i.id=? AND i.run_id=? AND r.job_type='schedule_auto_update'
        AND r.status IN ('queued','running') AND i.phase IN ('scan','match')
        AND i.status='running' AND i.lease_token=? AND i.lease_until>?
        AND ${autoUpdatePhaseReadySql("i","r")})
      THEN 'auto_update_lease_lost'
    WHEN EXISTS(SELECT 1 FROM scheduled_job_runs WHERE id=? AND source='scheduled')
      AND NOT EXISTS(SELECT 1 FROM settings WHERE key='auto_update_enabled' AND value='true')
      THEN 'auto_update_disabled' END AS reason`;
  return db.prepare(atomic
    ? `SELECT iif(reason IS NULL,1,json('scheduled_auto_update_write_blocked')) FROM (${reason})`
    : reason).bind(item.id, item.runId, item.leaseToken, Date.now(), item.runId);
};

export async function assertAutoUpdateItemActive(db: D1Database, item: ScheduledAutoUpdateItem) {
  const reason = await activeItem(db, item, false).first<string | null>("reason");
  if (reason) throw new ScheduledAutoUpdateBlocked(reason);
}

export const autoUpdateItemWriteGuard = (db: D1Database, item: ScheduledAutoUpdateItem) => activeItem(db, item, true);
