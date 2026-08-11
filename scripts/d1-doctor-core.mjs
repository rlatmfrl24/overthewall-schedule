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
  music_cover_proposals: [
    "id",
    "submitted_by_user_id",
    "idempotency_key",
    "submitted_url",
    "youtube_video_id",
    "segment_start_seconds",
    "submitted_title",
    "suggested_song_id",
    "submitted_note",
    "status",
    "version",
    "review_lock_token",
    "review_lock_expires_at",
    "reviewed_by_user_id",
    "reviewed_at",
    "review_result_code",
    "review_note",
    "approved_performance_id",
    "created_at",
    "updated_at",
  ],
  music_cover_proposal_participants: [
    "proposal_id",
    "credit_order",
    "resolved_entity_id",
    "submitted_name_snapshot",
    "participant_role",
  ],
  music_cover_proposal_original_artists: [
    "proposal_id",
    "credit_order",
    "resolved_entity_id",
    "submitted_name_snapshot",
  ],
  music_catalog_events: [
    "id",
    "aggregate_type",
    "aggregate_id",
    "event_type",
    "actor_kind",
    "actor_user_id",
    "before_json",
    "after_json",
    "detail_json",
    "created_at",
  ],
  music_search_terms: [
    "song_id",
    "term_kind",
    "display_value",
    "normalized_term",
  ],
  music_catalog_meta: [
    "id",
    "revision",
    "public_read_enabled",
    "navigation_visible",
    "updated_at",
  ],
};

export const MUSIC_CATALOG_META_SINGLETON_ID = 1;

const CATALOG_META_INTEGER_FIELDS = [
  "id",
  "revision",
  "public_read_enabled",
  "navigation_visible",
  "updated_at",
];

export const getMusicCatalogMetaStatus = (rows) => {
  if (!Array.isArray(rows)) {
    return { ok: false, message: "could not read catalog meta singleton" };
  }
  if (rows.length !== 1) {
    return {
      ok: false,
      message: `expected exactly one catalog meta row, found ${rows.length}`,
    };
  }

  const [row] = rows;
  const invalidIntegerField = CATALOG_META_INTEGER_FIELDS.find(
    (field) =>
      row?.[`${field}_type`] !== "integer" ||
      !Number.isSafeInteger(Number(row?.[field])),
  );
  if (invalidIntegerField) {
    return {
      ok: false,
      message: `catalog meta ${invalidIntegerField} must be an integer`,
    };
  }

  const id = Number(row.id);
  const revision = Number(row.revision);
  const publicReadEnabled = Number(row.public_read_enabled);
  const navigationVisible = Number(row.navigation_visible);
  const updatedAt = Number(row.updated_at);

  if (id !== MUSIC_CATALOG_META_SINGLETON_ID) {
    return {
      ok: false,
      message: `catalog meta singleton id must be ${MUSIC_CATALOG_META_SINGLETON_ID}`,
    };
  }
  if (revision < 0 || updatedAt < 0) {
    return {
      ok: false,
      message: "catalog meta revision and updated_at must be non-negative",
    };
  }
  if (
    ![0, 1].includes(publicReadEnabled) ||
    ![0, 1].includes(navigationVisible)
  ) {
    return {
      ok: false,
      message: "catalog meta flags must be 0 or 1",
    };
  }
  if (navigationVisible === 1 && publicReadEnabled !== 1) {
    return {
      ok: false,
      message: "catalog navigation requires public read to be enabled",
    };
  }

  return {
    ok: true,
    message: `singleton id=${id}, revision=${revision}, public_read_enabled=${publicReadEnabled}, navigation_visible=${navigationVisible}, updated_at=${updatedAt}`,
  };
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
