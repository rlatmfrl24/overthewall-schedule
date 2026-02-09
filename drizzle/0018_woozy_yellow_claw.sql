-- Normalize boolean-like columns to 0/1
UPDATE members
SET is_deprecated = CASE
  WHEN is_deprecated IS NULL THEN 0
  WHEN lower(is_deprecated) = 'true' OR is_deprecated = 1 OR is_deprecated = '1' THEN 1
  WHEN lower(is_deprecated) = 'false' OR is_deprecated = 0 OR is_deprecated = '0' THEN 0
  ELSE 0
END;

UPDATE notices
SET is_active = CASE
  WHEN is_active IS NULL THEN 0
  WHEN lower(is_active) = 'true' OR is_active = 1 OR is_active = '1' THEN 1
  WHEN lower(is_active) = 'false' OR is_active = 0 OR is_active = '0' THEN 0
  ELSE 0
END;

-- Performance: index for member code lookups
CREATE INDEX IF NOT EXISTS idx_members_code ON members(code);