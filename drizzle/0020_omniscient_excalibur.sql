DELETE FROM `pending_schedules`
WHERE `id` IN (
  SELECT newer.`id`
  FROM `pending_schedules` AS newer
  INNER JOIN `pending_schedules` AS older
    ON newer.`vod_id` = older.`vod_id`
   AND newer.`vod_id` IS NOT NULL
   AND newer.`id` > older.`id`
);--> statement-breakpoint
DELETE FROM `pending_schedules`
WHERE `id` IN (
  SELECT newer.`id`
  FROM `pending_schedules` AS newer
  INNER JOIN `pending_schedules` AS older
    ON newer.`member_uid` = older.`member_uid`
   AND newer.`date` = older.`date`
   AND coalesce(newer.`start_time`, '') = coalesce(older.`start_time`, '')
   AND newer.`id` > older.`id`
);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_pending_schedules_vod_id` ON `pending_schedules` (`vod_id`) WHERE "pending_schedules"."vod_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_pending_schedules_member_date_time` ON `pending_schedules` (`member_uid`,`date`,`start_time`);
