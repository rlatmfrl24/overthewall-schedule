export const REQUIRED_D1_COLUMNS = {
  members: ["uid", "code", "name", "youtube_channel_id", "is_deprecated"],
  ddays: ["id", "title", "date", "type", "created_at"],
  music_entities: [
    "id",
    "member_uid",
    "entity_kind",
    "display_name",
    "normalized_name",
    "slug",
    "version",
  ],
  music_entity_aliases: [
    "entity_id",
    "alias",
    "normalized_alias",
    "locale",
    "alias_kind",
  ],
  music_songs: [
    "id",
    "slug",
    "title",
    "normalized_title",
    "dedupe_key",
    "is_otw_original",
    "original_release_date",
    "original_release_precision",
    "version",
  ],
  music_song_aliases: [
    "song_id",
    "alias",
    "normalized_alias",
    "locale",
    "alias_kind",
  ],
  music_song_original_artists: [
    "song_id",
    "entity_id",
    "credit_order",
    "is_primary",
  ],
  music_channels: [
    "id",
    "provider",
    "external_channel_id",
    "channel_role",
    "verification_status",
    "active",
    "version",
  ],
  music_channel_entities: ["channel_id", "entity_id"],
  music_media_sources: [
    "id",
    "provider",
    "external_id",
    "channel_id",
    "availability_status",
    "last_checked_at",
    "next_check_at",
    "version",
  ],
  music_media_source_relations: [
    "source_id",
    "related_source_id",
    "relation_type",
  ],
  music_performances: [
    "id",
    "song_id",
    "dedupe_key",
    "relation_type",
    "release_type",
    "participation_type",
    "publication_status",
    "quality_status",
    "released_at",
    "version",
  ],
  music_performance_participants: [
    "performance_id",
    "entity_id",
    "participant_role",
    "credit_order",
    "credit_name_snapshot",
  ],
  music_performance_sources: [
    "performance_id",
    "source_id",
    "start_seconds",
    "end_seconds",
    "source_role",
    "priority",
    "is_primary",
  ],
};

export const getMigrationListStatus = (output) => {
  if (output.includes("No migrations to apply")) {
    return {
      ok: true,
      message: "no pending migrations",
    };
  }

  return {
    ok: false,
    message: "pending migrations detected; apply local migrations before continuing",
  };
};
