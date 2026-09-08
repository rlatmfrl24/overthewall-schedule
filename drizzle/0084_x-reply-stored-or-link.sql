-- Reply context is complete with a stored preview or a direct relation link.
-- Preserve content, terminal decisions, completed hydration and active leases.
UPDATE x_post_references
SET resolution_state = CASE
      WHEN hydrated_at IS NULL THEN 'link_only' ELSE resolution_state END,
    next_attempt_at = NULL,
    last_error_code = NULL,
    author_state = CASE WHEN author_state = 'pending' THEN 'not_required' ELSE author_state END,
    author_next_attempt_at = NULL,
    author_last_error_code = NULL
WHERE relation_type = 'reply' AND resolution_state <> 'terminal'
  AND ((hydrated_at IS NULL AND resolution_state <> 'link_only')
    OR next_attempt_at IS NOT NULL OR last_error_code IS NOT NULL
    OR author_state = 'pending' OR author_next_attempt_at IS NOT NULL
    OR author_last_error_code IS NOT NULL);
