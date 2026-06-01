DELETE FROM member_links;
DELETE FROM member_profile_images;
DELETE FROM naver_cafe_sources;
DELETE FROM kirinuki_channels;
DELETE FROM pending_schedules;
DELETE FROM update_logs;
DELETE FROM schedules;
DELETE FROM notices;
DELETE FROM ddays;
DELETE FROM settings;
DELETE FROM members;

INSERT INTO members (
  uid,
  code,
  name,
  main_color,
  sub_color,
  oshi_mark,
  url_twitter,
  url_youtube,
  url_chzzk,
  youtube_channel_id,
  birth_date,
  debut_date,
  unit_name,
  fan_name,
  introduction,
  is_deprecated
) VALUES
  (1, 'local_sora', 'Local Sora', '#3b82f6', '#93c5fd', '★', 'https://x.com/local_sora', 'https://www.youtube.com/@local_sora', 'https://chzzk.naver.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'UClocalSora00000000000001', '2000-06-01', '2025-01-10', 'Local Unit', 'Skyline', 'Local D1 fixture member for schedule testing.', 0),
  (2, 'local_mina', 'Local Mina', '#ef4444', '#fecaca', '◆', 'https://x.com/local_mina', 'https://www.youtube.com/@local_mina', 'https://chzzk.naver.com/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'UClocalMina00000000000001', '1999-12-24', '2025-02-14', 'Local Unit', 'Mints', 'Second fixture member with multiple schedule states.', 0),
  (3, 'local_noa', 'Local Noa', '#10b981', '#a7f3d0', '●', NULL, 'https://www.youtube.com/@local_noa', NULL, 'UClocalNoa000000000000001', '9999-03-15', '2025-03-01', 'Local Unit', 'Nodes', 'Fixture member without a CHZZK channel.', 0);

INSERT INTO member_profile_images (
  member_uid,
  image_url,
  alt,
  sort_order
) VALUES
  (1, '/profile/local_sora.webp', 'Local Sora profile image', 0),
  (2, '/profile/local_mina.webp', 'Local Mina profile image', 0),
  (3, '/profile/local_noa.webp', 'Local Noa profile image', 0);

INSERT INTO member_links (
  member_uid,
  type,
  label,
  url,
  youtube_channel_id,
  sort_order,
  enabled
) VALUES
  (1, 'youtube_vod', 'VOD Channel', 'https://www.youtube.com/@local_sora_vod', 'UClocalSoraVod0000000001', 10, 1),
  (2, 'youtube_sub', 'Sub Channel', 'https://www.youtube.com/@local_mina_sub', 'UClocalMinaSub0000000001', 10, 1);

INSERT INTO schedules (
  id,
  member_uid,
  date,
  start_time,
  title,
  status
) VALUES
  (1, 1, '2026-06-01', '20:00', 'Local D1 test stream', '방송'),
  (2, 2, '2026-06-01', NULL, 'Rest day', '휴방'),
  (3, 1, '2026-06-02', '21:00', 'Tomorrow collab', '방송'),
  (4, 3, '2026-06-03', NULL, 'TBD slot', '미정');

INSERT INTO notices (
  id,
  content,
  url,
  type,
  is_active,
  started_at,
  ended_at
) VALUES
  (1, 'Local D1 notice', NULL, 'notice', 1, '2026-01-01', NULL),
  (2, 'Local event banner', 'https://otw-schedule.info', 'event', 1, '2026-06-01', '2026-06-30');

INSERT INTO ddays (
  id,
  title,
  date,
  description,
  color,
  type
) VALUES
  (1, 'Local Sora Birthday', '2026-06-01', 'Fixture birthday', '#3b82f6', 'birthday'),
  (2, 'Local Unit Debut', '2026-07-01', 'Fixture debut event', '#10b981,#3b82f6', 'debut');

INSERT INTO settings (
  key,
  value
) VALUES
  ('auto_update_enabled', 'false'),
  ('auto_update_interval_hours', '6'),
  ('auto_update_range_days', '3'),
  ('x_rich_link_preview_enabled', 'false'),
  ('x_posts_visibility', 'public'),
  ('naver_cafe_posts_enabled', 'true'),
  ('naver_cafe_posts_visibility', 'public'),
  ('x_collection_enabled', 'false'),
  ('x_collection_daily_budget_cents', '100'),
  ('x_collection_interval_hours', '6');

INSERT INTO naver_cafe_sources (
  id,
  name,
  cafe_id,
  menu_id,
  cafe_url,
  member_uid,
  enabled,
  sort_order
) VALUES
  (1, 'Local Sora Cafe', 'local-cafe', '1', 'https://cafe.naver.com/local-sora', 1, 1, 10),
  (2, 'Local Mina Cafe', 'local-cafe', '2', 'https://cafe.naver.com/local-mina', 2, 1, 20);

INSERT INTO kirinuki_channels (
  id,
  channel_name,
  channel_url,
  youtube_channel_id
) VALUES
  (1, 'Local Clips Channel', 'https://www.youtube.com/@local-clips', 'UClocalClips000000000001');
