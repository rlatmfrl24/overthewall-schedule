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
  music_public_performance_sort_keys: [
    "performance_id",
    "song_id",
    "representative_participant_entity_id",
    "normalized_participant",
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
  music_search_grams: ["song_id", "gram_size", "normalized_gram"],
  music_search_gram_stats: [
    "gram_size",
    "normalized_gram",
    "song_count",
  ],
  music_catalog_meta: [
    "id",
    "revision",
    "public_read_enabled",
    "navigation_visible",
    "updated_at",
  ],
  music_public_read_model_meta: ["id", "revision", "updated_at"],
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

const PUBLIC_READ_MODEL_META_INTEGER_FIELDS = [
  "id",
  "revision",
  "updated_at",
  "catalog_revision",
];

export const getMusicPublicReadModelMetaStatus = (rows) => {
  if (!Array.isArray(rows)) {
    return { ok: false, message: "could not read public read-model meta" };
  }
  if (rows.length !== 1) {
    return {
      ok: false,
      message: `expected exactly one public read-model meta row, found ${rows.length}`,
    };
  }

  const [row] = rows;
  const invalidIntegerField = PUBLIC_READ_MODEL_META_INTEGER_FIELDS.find(
    (field) =>
      row?.[`${field}_type`] !== "integer" ||
      !Number.isSafeInteger(Number(row?.[field])),
  );
  if (invalidIntegerField) {
    return {
      ok: false,
      message: `public read-model meta ${invalidIntegerField} must be an integer`,
    };
  }

  const id = Number(row.id);
  const revision = Number(row.revision);
  const updatedAt = Number(row.updated_at);
  const catalogRevision = Number(row.catalog_revision);

  if (id !== MUSIC_CATALOG_META_SINGLETON_ID) {
    return {
      ok: false,
      message: `public read-model meta singleton id must be ${MUSIC_CATALOG_META_SINGLETON_ID}`,
    };
  }
  if (revision < 0 || updatedAt < 0 || catalogRevision < 0) {
    return {
      ok: false,
      message:
        "public read-model meta revision, catalog_revision, and updated_at must be non-negative",
    };
  }
  if (revision !== catalogRevision) {
    return {
      ok: false,
      message: `public read-model revision ${revision} does not match catalog revision ${catalogRevision}`,
    };
  }

  return {
    ok: true,
    message: `singleton id=${id}, revision=${revision}, catalog_revision=${catalogRevision}, updated_at=${updatedAt}`,
  };
};

const getNonNegativeIntegerCount = (row, field, label) => {
  const value = Number(row?.[field]);
  if (!Number.isSafeInteger(value) || value < 0) {
    return {
      ok: false,
      message: `${label} ${field} must be a non-negative integer`,
    };
  }
  return { ok: true, value };
};

const readCountStatus = (rows, fields, label) => {
  if (!Array.isArray(rows) || rows.length !== 1) {
    return {
      ok: false,
      message: `expected exactly one ${label} status row, found ${Array.isArray(rows) ? rows.length : 0}`,
    };
  }

  const values = {};
  for (const field of fields) {
    const status = getNonNegativeIntegerCount(rows[0], field, label);
    if (!status.ok) return status;
    values[field] = status.value;
  }
  return { ok: true, values };
};

export const getMusicPublicSortKeyStatus = (rows) => {
  const status = readCountStatus(
    rows,
    [
      "performance_count",
      "sort_key_count",
      "missing_count",
      "unexpected_count",
      "value_drift_count",
    ],
    "public sort-key",
  );
  if (!status.ok) return status;

  const {
    performance_count: performanceCount,
    sort_key_count: sortKeyCount,
    missing_count: missingCount,
    unexpected_count: unexpectedCount,
    value_drift_count: valueDriftCount,
  } = status.values;
  const isComplete =
    performanceCount === sortKeyCount &&
    missingCount === 0 &&
    unexpectedCount === 0 &&
    valueDriftCount === 0;

  return {
    ok: isComplete,
    message: `performances=${performanceCount}, sort_keys=${sortKeyCount}, missing=${missingCount}, unexpected=${unexpectedCount}, value_drift=${valueDriftCount}`,
  };
};

export const getMusicSearchGramStatsStatus = (rows) => {
  const status = readCountStatus(
    rows,
    [
      "expected_posting_count",
      "posting_count",
      "distinct_gram_count",
      "stat_count",
      "missing_posting_count",
      "unexpected_posting_count",
      "missing_stat_count",
      "unexpected_stat_count",
      "value_drift_count",
    ],
    "search gram-stat",
  );
  if (!status.ok) return status;

  const {
    expected_posting_count: expectedPostingCount,
    posting_count: postingCount,
    distinct_gram_count: distinctGramCount,
    stat_count: statCount,
    missing_posting_count: missingPostingCount,
    unexpected_posting_count: unexpectedPostingCount,
    missing_stat_count: missingStatCount,
    unexpected_stat_count: unexpectedStatCount,
    value_drift_count: valueDriftCount,
  } = status.values;
  const isComplete =
    expectedPostingCount === postingCount &&
    distinctGramCount === statCount &&
    missingPostingCount === 0 &&
    unexpectedPostingCount === 0 &&
    missingStatCount === 0 &&
    unexpectedStatCount === 0 &&
    valueDriftCount === 0;

  return {
    ok: isComplete,
    message: `expected_postings=${expectedPostingCount}, postings=${postingCount}, distinct_grams=${distinctGramCount}, stats=${statCount}, missing_postings=${missingPostingCount}, unexpected_postings=${unexpectedPostingCount}, missing_stats=${missingStatCount}, unexpected_stats=${unexpectedStatCount}, value_drift=${valueDriftCount}`,
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
