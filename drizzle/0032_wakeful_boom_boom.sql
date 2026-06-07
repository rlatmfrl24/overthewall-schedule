INSERT INTO member_links (
  member_uid,
  type,
  label,
  url,
  youtube_channel_id,
  sort_order,
  enabled
) VALUES
  (
    (SELECT uid FROM members WHERE code = 'kurenai_natsuki'),
    'twitcasting',
    '트윗캐스팅',
    'https://twitcasting.tv/kurenai_natsuki',
    NULL,
    20,
    1
  ),
  (
    (SELECT uid FROM members WHERE code = 'terri_nunna'),
    'twitcasting',
    '트윗캐스팅',
    'https://twitcasting.tv/terri_nunna',
    NULL,
    20,
    1
  );
