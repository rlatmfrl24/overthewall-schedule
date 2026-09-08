// Count the backlog and its oldest entry in one indexed pass. Future retries
// remain visible here even though the dispatcher only claims entries due now.
export const SCHEDULED_QUEUE_STATE_SQL = `SELECT
  (SELECT COUNT(*) FROM scheduled_job_runs
    WHERE status IN ('queued', 'running')) AS activeRunCount,
  (SELECT COUNT(*) FROM scheduled_job_items
    WHERE status = 'running' AND lease_until < ?) AS staleLeaseCount,
  COUNT(*) AS outboxBacklog,
  MIN(o.available_at) AS oldestOutboxAvailableAt
FROM scheduled_outbox AS o INDEXED BY idx_scheduled_outbox_status_available
INNER JOIN scheduled_job_items i ON i.id = o.item_id
INNER JOIN scheduled_job_runs r ON r.id = o.run_id
WHERE o.status IN ('pending', 'failed', 'dispatching')
  AND (o.status <> 'dispatching' OR o.lease_until < ?)
  AND r.status IN ('queued', 'running')
  AND ((o.event_type = 'execute' AND i.status = 'queued')
    OR (o.event_type = 'reconcile' AND i.status IN
      ('succeeded', 'partial', 'failed', 'skipped', 'throttled')))`;
