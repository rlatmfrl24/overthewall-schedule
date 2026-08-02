ALTER TABLE `notices` ADD `links` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `notices` ADD `image_urls` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `notices` ADD `related_member_uids` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
UPDATE `notices`
SET
  `links` = CASE
    WHEN `url` IS NOT NULL AND trim(`url`) <> ''
      THEN json_array(json_object('label', '자세히 보기', 'url', trim(`url`)))
    ELSE '[]'
  END,
  `image_urls` = CASE
    WHEN `thumbnail_url` IS NOT NULL AND trim(`thumbnail_url`) <> ''
      THEN json_array(trim(`thumbnail_url`))
    ELSE '[]'
  END,
  `related_member_uids` = CASE
    WHEN `publisher_type` = 'member' AND `publisher_member_uid` IS NOT NULL
      THEN json_array(`publisher_member_uid`)
    ELSE '[]'
  END,
  `publisher_type` = 'otw',
  `publisher_member_uid` = NULL;
