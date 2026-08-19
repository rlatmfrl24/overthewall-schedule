INSERT INTO settings (key, value, updated_at)
VALUES (
	'otw_play_submission_daily_limit',
	'5',
	CAST(strftime('%s', 'now') AS INTEGER) * 1000
)
ON CONFLICT(key) DO NOTHING;
