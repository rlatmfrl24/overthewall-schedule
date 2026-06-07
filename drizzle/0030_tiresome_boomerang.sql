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
    'youtube_sub',
    '나츠키의 긴 뿔',
    'https://youtube.com/channel/UCR_brTLqK02_YQNrasQAqrA',
    'UCR_brTLqK02_YQNrasQAqrA',
    10,
    1
  ),
  (
    (SELECT uid FROM members WHERE code = 'terri_nunna'),
    'youtube_vod',
    '테리눈나 다시보기',
    'https://www.youtube.com/@Terri_Archive',
    'UCKDU5gzraMh4OHgTg3LJZeg',
    10,
    1
  ),
  (
    (SELECT uid FROM members WHERE code = 'bing_hayu'),
    'youtube_vod',
    '빙하유 VOD',
    'https://www.youtube.com/@%EB%B9%99%ED%95%98%EC%9C%A0',
    'UC9GBmdwFYuiirNGrPn5Wb0Q',
    10,
    1
  ),
  (
    (SELECT uid FROM members WHERE code = 'bing_hayu'),
    'youtube_sub',
    '빙하유 ASMR',
    'https://www.youtube.com/@HayuASMR',
    'UC1NnllmOZWFHcStCQr-WicQ',
    20,
    1
  ),
  (
    (SELECT uid FROM members WHERE code = 'yang_mei'),
    'youtube_vod',
    '양메이 VOD',
    'https://www.youtube.com/@MEIVOD',
    'UCKPJ_DIzClb2uP6cN2RlSBw',
    10,
    1
  ),
  (
    (SELECT uid FROM members WHERE code = 'u_lili'),
    'youtube_vod',
    '유리리 VOD',
    'https://www.youtube.com/@U_Lili',
    'UCuCwJt4AAxjHiPFOY01H0zg',
    10,
    1
  ),
  (
    (SELECT uid FROM members WHERE code = 'u_lili'),
    'youtube_sub',
    'U-LiLi ch. 유리리',
    'https://www.youtube.com/@u-LiLi',
    'UCISQ9DgJdyTUCMtBNC-dl4A',
    20,
    1
  ),
  (
    (SELECT uid FROM members WHERE code = 'on_haru'),
    'youtube_sub',
    '오프하루',
    'https://www.youtube.com/@off_haru',
    'UChKwH5bw8WPxCeiXWa0Ny8A',
    10,
    1
  ),
  (
    (SELECT uid FROM members WHERE code = 'on_haru'),
    'youtube_sub',
    '온하루 Music Official',
    'https://www.youtube.com/@otw_haru',
    'UCTsUYRZR13hllWtHigQQGyw',
    20,
    1
  ),
  (
    (SELECT uid FROM members WHERE code = 'hane'),
    'youtube_vod',
    '다시하네',
    'https://www.youtube.com/@%ED%95%98%EB%84%A4%EB%8B%A4%EC%8B%9C%EB%B3%B4%EA%B8%B0',
    'UCcZFelgTMiob5kFYdO_q_HQ',
    10,
    1
  ),
  (
    (SELECT uid FROM members WHERE code = 'kim_ate'),
    'youtube_sub',
    '김뒷태의 이중생활',
    'https://www.youtube.com/@%EA%B9%80%EB%92%B7%ED%83%9C%EC%9D%98%EC%9D%B4%EC%A4%91%EC%83%9D%ED%99%9C',
    'UC_wovpl7Vqg6P2DNCxIhUZg',
    10,
    1
  );
