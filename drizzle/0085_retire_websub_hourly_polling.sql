-- Data-only retirement: preserve monitors, approval, candidates, watermark,
-- generations, paused state and all historical WebSub records.
INSERT INTO music_catalog_events (
  id, aggregate_type, aggregate_id, event_type, actor_kind, detail_json, created_at
)
SELECT lower(hex(randomblob(16))), 'channel_monitor', id,
  'channel_monitor.polling_configured', 'system',
  json_object('previousIntervalMinutes', check_interval_minutes,
    'intervalMinutes', 60, 'transport', 'youtube_uploads_polling'),
  unixepoch() * 1000
FROM music_channel_upload_monitors
WHERE deleted_at IS NULL AND check_interval_minutes <> 60;
--> statement-breakpoint
UPDATE music_channel_upload_monitors
SET check_interval_minutes = 60,
  next_check_at = CASE WHEN status = 'active' THEN MIN(next_check_at,
    ((unixepoch() * 1000 - 1380000) / 3600000 + 1) * 3600000 + 1380000)
    ELSE next_check_at END,
  version = version + 1, updated_at = unixepoch() * 1000
WHERE deleted_at IS NULL AND check_interval_minutes <> 60;
--> statement-breakpoint
INSERT INTO settings (key, value, updated_at)
VALUES ('scheduled_v2_websub_maintenance_enabled', 'false', CAST(unixepoch() * 1000 AS TEXT)),
       ('scheduled_v2_recent_reconcile_enabled', 'false', CAST(unixepoch() * 1000 AS TEXT))
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
