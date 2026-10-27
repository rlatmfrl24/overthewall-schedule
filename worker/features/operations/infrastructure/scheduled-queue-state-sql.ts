// Keep one snapshot and skip retained outboxes only when no run can own backlog.
export const SCHEDULED_QUEUE_STATE_SQL = `WITH state AS MATERIALIZED (SELECT
  (SELECT COUNT(*) FROM scheduled_job_runs
    WHERE status IN ('queued', 'running')) AS activeRunCount,
  (SELECT COUNT(*) FROM scheduled_job_items
    WHERE status = 'running' AND lease_until < ?) AS staleLeaseCount
), snapshot AS MATERIALIZED (
  SELECT CASE WHEN activeRunCount = 0 THEN json_object('count', 0, 'oldest', NULL)
    ELSE (
      SELECT json_object('count', COUNT(*), 'oldest', MIN(o.available_at))
      FROM scheduled_outbox AS o INDEXED BY idx_scheduled_outbox_status_available
      INNER JOIN scheduled_job_items i ON i.id = o.item_id
      INNER JOIN scheduled_job_runs r ON r.id = o.run_id
      WHERE o.status IN ('pending', 'failed', 'dispatching')
        AND (o.status <> 'dispatching' OR o.lease_until < ?)
        AND r.status IN ('queued', 'running')
        AND ((o.event_type = 'execute' AND i.status = 'queued')
          OR (o.event_type = 'reconcile' AND i.status IN
            ('succeeded', 'partial', 'failed', 'skipped', 'throttled')))
    ) END AS backlog FROM state
)
SELECT state.activeRunCount, state.staleLeaseCount,
  json_extract(snapshot.backlog, '$.count') AS outboxBacklog,
  json_extract(snapshot.backlog, '$.oldest') AS oldestOutboxAvailableAt
FROM state CROSS JOIN snapshot`;
