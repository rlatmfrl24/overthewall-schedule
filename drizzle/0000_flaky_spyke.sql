PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS `members` (
  `uid` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `code` text NOT NULL,
  `name` text NOT NULL,
  `main_color` text,
  `sub_color` text,
  `oshi_mark` text,
  `url_twitter` text,
  `url_youtube` text,
  `url_chzzk` text,
  `birth_date` text,
  `debut_date` text,
  `unit_name` text,
  `fan_name` text,
  `introduction` text,
  `is_deprecated` numeric
);

CREATE TABLE IF NOT EXISTS `schedules` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `member_uid` integer NOT NULL,
  `date` text NOT NULL,
  `start_time` text,
  `title` text,
  `status` text NOT NULL CHECK (status IN ('방송', '휴방', '게릴라')),
  `created_at` numeric DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS `idx_schedules_date` ON `schedules` (`date`);

PRAGMA foreign_keys=ON;