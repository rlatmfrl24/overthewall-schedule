PRAGMA foreign_keys=OFF;

CREATE TABLE `__new_notices` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `content` text NOT NULL,
  `url` text,
  `type` text NOT NULL DEFAULT 'notice',
  `is_active` numeric DEFAULT '1',
  `started_at` text,
  `ended_at` text,
  `created_at` numeric DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notices_type_check" CHECK(`type` IN ('notice','event'))
);

INSERT INTO `__new_notices` ("id", "content", "url", "type", "is_active", "started_at", "ended_at", "created_at")
SELECT "id", "content", "url", 'notice', "is_active", "started_at", "ended_at", "created_at" FROM `notices`;

DROP TABLE `notices`;
ALTER TABLE `__new_notices` RENAME TO `notices`;

PRAGMA foreign_keys=ON;
