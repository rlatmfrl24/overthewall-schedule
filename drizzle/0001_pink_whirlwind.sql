PRAGMA foreign_keys=OFF;

CREATE TABLE `__new_members` (
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

INSERT INTO `__new_members` ("uid", "code", "name", "main_color", "sub_color", "oshi_mark", "url_twitter", "url_youtube", "url_chzzk", "birth_date", "debut_date", "unit_name", "fan_name", "introduction", "is_deprecated")
SELECT "uid", "code", "name", "main_color", "sub_color", "oshi_mark", "url_twitter", "url_youtube", "url_chzzk", "birth_date", "debut_date", "unit_name", "fan_name", "introduction", "is_deprecated" FROM `members`;

DROP TABLE `members`;
ALTER TABLE `__new_members` RENAME TO `members`;

PRAGMA foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE `__new_schedules` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `member_uid` integer NOT NULL,
  `date` text NOT NULL,
  `start_time` text,
  `title` text,
  `status` text NOT NULL,
  `created_at` numeric DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "schedules_status_check" CHECK(status IN ('방송', '휴방', '게릴라', '미정'))
);

INSERT INTO `__new_schedules` ("id", "member_uid", "date", "start_time", "title", "status", "created_at")
SELECT "id", "member_uid", "date", "start_time", "title", "status", "created_at" FROM `schedules`;

DROP TABLE `schedules`;
ALTER TABLE `__new_schedules` RENAME TO `schedules`;

CREATE INDEX `idx_schedules_date` ON `schedules` (`date`);

PRAGMA foreign_keys=ON;