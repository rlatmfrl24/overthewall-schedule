import { getTableColumns, getTableName, isTable } from "drizzle-orm";
import * as schema from "../db/schema/index.ts";

export const getD1DoctorChecks = (schemaOnly = false) => schemaOnly
  ? ["migrations", "schema"]
  : ["migrations", "schema", "catalog", "readModel", "sortKeys", "searchGrams", "submissionLimit", "youtubeQuota"];

export const REQUIRED_D1_COLUMNS = Object.fromEntries(
  Object.values(schema).filter(isTable).map(table => [getTableName(table), Object.values(getTableColumns(table)).map(column => column.name)]),
);

export const MUSIC_CATALOG_META_SINGLETON_ID = 1;
export const OTW_PLAY_SUBMISSION_DAILY_LIMIT_SETTING_KEY =
  "otw_play_submission_daily_limit";

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
      "missing_term_count",
      "unexpected_term_count",
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
    missing_term_count: missingTermCount,
    unexpected_term_count: unexpectedTermCount,
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
    missingTermCount === 0 &&
    unexpectedTermCount === 0 &&
    expectedPostingCount === postingCount &&
    distinctGramCount === statCount &&
    missingPostingCount === 0 &&
    unexpectedPostingCount === 0 &&
    missingStatCount === 0 &&
    unexpectedStatCount === 0 &&
    valueDriftCount === 0;

  return {
    ok: isComplete,
    message: `missing_terms=${missingTermCount}, unexpected_terms=${unexpectedTermCount}, expected_postings=${expectedPostingCount}, postings=${postingCount}, distinct_grams=${distinctGramCount}, stats=${statCount}, missing_postings=${missingPostingCount}, unexpected_postings=${unexpectedPostingCount}, missing_stats=${missingStatCount}, unexpected_stats=${unexpectedStatCount}, value_drift=${valueDriftCount}`,
  };
};

export const getOtwPlaySubmissionDailyLimitStatus = (rows) => {
  if (!Array.isArray(rows) || rows.length !== 1) {
    return {
      ok: false,
      message: `expected exactly one OTW Play submission limit row, found ${Array.isArray(rows) ? rows.length : 0}`,
    };
  }

  const value = rows[0]?.value;
  if (
    rows[0]?.value_type !== "text" ||
    typeof value !== "string" ||
    !/^\d+$/.test(value)
  ) {
    return {
      ok: false,
      message: "OTW Play submission daily limit must be integer text",
    };
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100) {
    return {
      ok: false,
      message: "OTW Play submission daily limit must be between 1 and 100",
    };
  }

  return { ok: true, message: `daily limit=${parsed}` };
};

export const getYouTubeDailyQuotaStatus = (rows) => {
  const value = rows?.[0]?.value;
  const valid = Array.isArray(rows) && rows.length === 1 &&
    typeof value === "string" && /^\d+$/.test(value.trim()) &&
    Number.isSafeInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 10_000;
  return valid
    ? { ok: true, message: `YouTube canonical quota=${Number(value)}` }
    : { ok: false, message: "youtube_api_daily_quota_units is missing or invalid (expected integer 1..10000)" };
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
