INSERT INTO `member_profile_images` (`member_uid`, `image_url`, `alt`, `sort_order`)
SELECT
  `uid`,
  '/profile/' || `code` || '.webp',
  `name` || ' 프로필 이미지',
  0
FROM `members`
WHERE (`is_deprecated` IS NULL OR `is_deprecated` = 0)
  AND NOT EXISTS (
    SELECT 1
    FROM `member_profile_images`
    WHERE `member_profile_images`.`member_uid` = `members`.`uid`
  );
