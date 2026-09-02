DELETE FROM `scheduled_outbox`
WHERE `run_id` IN (
  SELECT `id` FROM `scheduled_job_runs` WHERE `job_type` = 'x_compliance'
);--> statement-breakpoint
DELETE FROM `scheduled_job_items`
WHERE `run_id` IN (
  SELECT `id` FROM `scheduled_job_runs` WHERE `job_type` = 'x_compliance'
);--> statement-breakpoint
DELETE FROM `scheduled_job_runs` WHERE `job_type` = 'x_compliance';--> statement-breakpoint
DELETE FROM `settings`
WHERE `key` IN (
  'x_compliance_enabled',
  'scheduled_v2_x_compliance_enabled',
  'x_compliance_last_cycle_at'
);--> statement-breakpoint
DELETE FROM `x_api_usage_events`
WHERE `operation` = 'compliance'
   OR `detail` LIKE '%x_compliance%';--> statement-breakpoint
DELETE FROM `scheduled_usage_daily`
WHERE `resource` = 'x_compliance_cost_micros';--> statement-breakpoint
INSERT INTO `x_post_facts` (
  `post_id`,
  `member_uid`,
  `member_name_snapshot`,
  `post_type`,
  `created_at`,
  `first_seen_at`,
  `media_count`,
  `link_count`,
  `edit_root_post_id`,
  `superseded_by_post_id`,
  `hidden_at`,
  `hidden_reason`,
  `updated_at`
)
SELECT
  p.`id`,
  m.`uid`,
  m.`name`,
  CASE
    WHEN json_type(p.`value`, '$.reply') = 'object' THEN 'reply'
    WHEN json_type(p.`value`, '$.quote') = 'object' THEN 'quote'
    ELSE 'post'
  END,
  CAST(unixepoch(p.`created_at`) * 1000 AS INTEGER),
  p.`first_seen_at`,
  COALESCE(json_array_length(p.`value`, '$.media'), 0),
  COALESCE(json_array_length(p.`value`, '$.links'), 0),
  p.`id`,
  NULL,
  p.`hidden_at`,
  p.`hidden_reason`,
  p.`fetched_at`
FROM `x_posts` p
JOIN `members` m
  ON lower(trim(m.`url_twitter`, '/')) IN (
    'https://x.com/' || lower(p.`handle`),
    'https://twitter.com/' || lower(p.`handle`)
  )
LEFT JOIN `x_post_facts` f ON f.`post_id` = p.`id`
WHERE f.`post_id` IS NULL
  AND json_valid(p.`value`) = 1
  AND unixepoch(p.`created_at`) IS NOT NULL
ON CONFLICT(`post_id`) DO NOTHING;--> statement-breakpoint
DROP TABLE `x_compliance_jobs`;
