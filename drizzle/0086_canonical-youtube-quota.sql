-- Validate the effective existing budget before changing anything. An invalid
-- canonical value must never fall back to the retired setting or a default.
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM settings
  WHERE key = CASE
    WHEN EXISTS (SELECT 1 FROM settings WHERE key = 'youtube_api_daily_quota_units')
      THEN 'youtube_api_daily_quota_units'
    ELSE 'youtube_warmup_daily_quota_units'
  END
  AND (value IS NULL OR TRIM(value) = '' OR TRIM(value) GLOB '*[^0-9]*'
       OR CAST(value AS INTEGER) NOT BETWEEN 1 AND 10000)
) THEN json('invalid_youtube_quota_configuration') ELSE 1 END;
--> statement-breakpoint
INSERT INTO settings (key, value, updated_at)
SELECT 'youtube_api_daily_quota_units',
       COALESCE((SELECT value FROM settings WHERE key = 'youtube_warmup_daily_quota_units'), '1000'),
       CAST(unixepoch() * 1000 AS TEXT)
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'youtube_api_daily_quota_units');
