// Channel ownership for collection; public endpoints retain their own audience filters.
export const OFFICIAL_CHANNEL_TARGETS_SQL = `
  SELECT youtube_channel_id, COALESCE(MIN(CASE WHEN is_main = 1 THEN member_uid END), MIN(member_uid)) AS member_uid FROM (
    SELECT member.youtube_channel_id, member.uid AS member_uid, 1 AS is_main
    FROM members member
    WHERE member.youtube_channel_id IS NOT NULL AND length(trim(member.youtube_channel_id)) > 0
      AND (member.is_deprecated IS NULL OR member.is_deprecated != 1)
    UNION ALL
    SELECT link.youtube_channel_id, member.uid AS member_uid, 0 AS is_main
    FROM member_links link JOIN members member ON member.uid = link.member_uid
    WHERE link.type = 'youtube_vod' AND link.enabled = 1
      AND (member.is_deprecated IS NULL OR member.is_deprecated != 1)
      AND length(link.youtube_channel_id) = 24 AND substr(link.youtube_channel_id, 1, 2) = 'UC'
      AND link.youtube_channel_id NOT GLOB '*[^A-Za-z0-9_-]*'
  ) GROUP BY youtube_channel_id`;
