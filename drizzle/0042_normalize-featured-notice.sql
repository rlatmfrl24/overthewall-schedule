UPDATE `notices`
SET `is_home_visible` = CASE
  WHEN `id` = (
    SELECT `id`
    FROM `notices`
    WHERE `is_active` = 1
    ORDER BY `id` DESC
    LIMIT 1
  ) THEN 1
  ELSE 0
END;
