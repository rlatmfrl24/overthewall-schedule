-- drizzle/0005_kind_dday_type.sql (예시)
-- Drop existing index first to avoid "already exists" errors on D1
DROP INDEX IF EXISTS `idx_ddays_date`;

CREATE TABLE `ddays_new` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `title` text NOT NULL,
  `date` text NOT NULL,
  `description` text,
  `color` text,
  `type` text NOT NULL DEFAULT 'event',
  `created_at` numeric DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `ddays_type_check` CHECK(type IN ('debut','birthday','event'))
);
CREATE INDEX `idx_ddays_date_new` ON `ddays_new` (`date`);

INSERT INTO `ddays_new` (`id`,`title`,`date`,`description`,`color`,`created_at`,`type`)
SELECT `id`,`title`,`date`,`description`,`color`,`created_at`,`type`
FROM `ddays`;

DROP TABLE `ddays`;
ALTER TABLE `ddays_new` RENAME TO `ddays`;
-- Recreate index; IF NOT EXISTS avoids double creation if retained
CREATE INDEX IF NOT EXISTS `idx_ddays_date` ON `ddays` (`date`);