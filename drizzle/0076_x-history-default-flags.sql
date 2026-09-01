-- Custom SQL migration file, put your code below! --
INSERT INTO settings (key, value, updated_at)
VALUES
  ('x_history_analytics_enabled', 'false', CAST(unixepoch('now') * 1000 AS TEXT)),
  ('x_metrics_snapshot_enabled', 'false', CAST(unixepoch('now') * 1000 AS TEXT)),
  ('x_compliance_enabled', 'false', CAST(unixepoch('now') * 1000 AS TEXT))
ON CONFLICT(key) DO NOTHING;
