-- X handles are case-insensitive. Older collection paths could create a second
-- source row with display-case spelling even when a populated lower-case row
-- already owned the cursor. Only discard duplicate rows that never acquired
-- collection state; abort below if any stateful non-normalized row remains.
DELETE FROM `x_post_sources`
WHERE `handle` <> lower(`handle`)
  AND `last_seen_post_id` IS NULL
  AND `sync_pagination_token` IS NULL
  AND `sync_base_post_id` IS NULL
  AND `sync_newest_post_id` IS NULL
  AND `last_attempt_at` IS NULL
  AND `last_success_at` IS NULL
  AND EXISTS (
    SELECT 1
    FROM `x_post_sources` AS canonical
    WHERE canonical.`handle` = lower(`x_post_sources`.`handle`)
  );
--> statement-breakpoint
UPDATE `x_post_sources`
SET `handle` = lower(`handle`)
WHERE `handle` <> lower(`handle`)
  AND NOT EXISTS (
    SELECT 1
    FROM `x_post_sources` AS canonical
    WHERE canonical.`handle` = lower(`x_post_sources`.`handle`)
  );
