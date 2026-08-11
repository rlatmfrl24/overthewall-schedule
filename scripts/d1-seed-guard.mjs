export const LOCAL_SEED_PROTECTED_TABLES = [
  "members",
  "member_links",
  "member_profile_images",
  "naver_cafe_sources",
  "kirinuki_channels",
  "schedules",
  "pending_schedules",
  "update_logs",
  "notices",
  "ddays",
  "settings",
  "music_cover_proposal_participants",
  "music_cover_proposal_original_artists",
  "music_search_terms",
  "music_catalog_events",
  "music_cover_proposals",
  "music_performance_sources",
  "music_performance_participants",
  "music_media_source_relations",
  "music_channel_entities",
  "music_song_original_artists",
  "music_song_aliases",
  "music_entity_aliases",
  "music_performances",
  "music_media_sources",
  "music_songs",
  "music_channels",
  "music_entities",
];

export const buildDestructiveRowCountSql = () =>
  LOCAL_SEED_PROTECTED_TABLES.map(
    (tableName) => `(SELECT COUNT(*) FROM ${tableName})`,
  ).join(" +\n          ");

export const hasProtectedLocalSeedData = (row) => {
  const destructiveRowCount = Number(row?.destructive_row_count);
  return destructiveRowCount !== 0;
};
