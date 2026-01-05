-- Reset ddays table completely: drop and recreate with current schema
DROP INDEX IF EXISTS `idx_ddays_date`;
DROP TABLE IF EXISTS `ddays`;

CREATE TABLE `ddays` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `title` text NOT NULL,
  `date` text NOT NULL,
  `description` text,
  `color` text,
  `type` text NOT NULL DEFAULT 'event',
  `created_at` numeric DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `ddays_type_check` CHECK(type IN ('debut','birthday','event'))
);

CREATE INDEX `idx_ddays_date` ON `ddays` (`date`);

