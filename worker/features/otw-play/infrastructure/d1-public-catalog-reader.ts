import type {
  PublicCatalogEntity,
  PublicCatalogFacets,
  PublicCatalogMeta,
  PublicCatalogOriginalArtist,
  PublicCatalogParticipant,
  PublicCatalogPerformance,
  PublicCatalogPerformanceDetail,
  PublicCatalogReader,
  PublicCatalogReaderPage,
  PublicCatalogReaderQuery,
  PublicCatalogSongCore,
  PublicCatalogSongDetail,
  PublicCatalogSongSummary,
  PublicCatalogSource,
} from "../application/ports/public-catalog-reader";
import {
  type PublicCatalogCursorPosition,
  type PublicCatalogSearchPhase,
} from "../domain/public-catalog-cursor";
import { encodePublicCatalogGroupKey } from "../domain/public-group-key";
import {
  selectPublicPlaybackSource,
  type PublicSourceCandidate,
} from "../domain/public-source-selection";

type SqlBind = string | number | null;

type SongRow = {
  song_id: string;
  slug: string;
  title: string;
  normalized_title: string;
  is_otw_original: number;
  original_release_date: string | null;
  original_release_precision: "year" | "month" | "day" | "unknown";
};

type CandidateRow = SongRow &
  PerformanceRow & {
    published_performance_count: number;
    relevance_rank: number | null;
    normalized_participant: string | null;
    search_phase: PublicCatalogSearchPhase;
  };

type PerformanceRow = {
  performance_id: string;
  relation_type: "original" | "cover";
  release_type: "official_mv" | "official_video";
  participation_type:
    | "solo"
    | "duet"
    | "unit"
    | "group"
    | "external_collab";
  released_at: number | null;
};

type ArtistRow = {
  song_id: string;
  entity_id: string;
  slug: string;
  display_name: string;
  entity_kind: "person" | "group" | "organization";
  is_primary: number;
  credit_order: number;
};
type TagRow = { song_id: string; display_name: string };

type ParticipantRow = {
  performance_id: string;
  entity_id: string;
  slug: string;
  display_name: string;
  entity_kind: "person" | "group" | "organization";
  credit_name_snapshot: string;
  participant_role: "vocal" | "featured_vocal" | "chorus" | "other";
  credit_order: number;
  member_uid: number | null;
  member_code: string | null;
  member_name: string | null;
  member_oshi_mark: string | null;
  member_unit_name: string | null;
  member_is_deprecated: number | null;
};

type SourceRow = {
  performance_id: string;
  source_id: string;
  provider: "youtube";
  external_id: string;
  title: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  provider_published_at: number | null;
  availability_status: PublicCatalogSource["availabilityStatus"];
  source_role: "official" | "alternate";
  priority: number;
  is_primary: number;
  start_seconds: number;
  end_seconds: number | null;
  channel_id: string;
  channel_display_name: string;
  channel_role: PublicCatalogSource["channel"]["channelRole"];
};

type CatalogHydrationRow = {
  song_id: string;
  performance_id: string;
  artists_json: string;
  tags_json: string;
  participants_json: string;
  sources_json: string;
};

type SearchSql = { sql: string; binds: SqlBind[] };
type FilterSql = { sql: string; binds: SqlBind[] };
type BatchQuery = { sql: string; binds: SqlBind[] };

type ContainsSearchPlan = {
  gramSize: 2 | 3;
  normalizedGram: string;
  songCount: number;
};

const CONTAINS_DENSE_SONG_THRESHOLD = 256;

export interface D1PublicCatalogReadDiagnostics {
  statements: number;
  bindParameters: number;
  rowsRead: number;
  statementRowsRead: readonly number[];
  usesOffset: boolean;
}

const PUBLIC_PERFORMANCE_PREDICATE = `
  performance.publication_status = 'published'
  AND performance.release_type IN ('official_mv', 'official_video')`;

const PUBLIC_SONG_PREDICATE = `
  song.archived_at IS NULL
  AND song.merged_into_song_id IS NULL`;

const PUBLIC_SOURCE_PREDICATE = `
  performance_source.source_role IN ('official', 'alternate')
  AND channel.verification_status = 'approved'
  AND channel.active = 1
  AND channel.channel_role IN (
    'otw_official', 'unit_official', 'member_music', 'member_main',
    'project_official'
  )`;

const PUBLIC_PERFORMANCE_ORDER = `
  CASE WHEN performance.released_at IS NULL THEN 1 ELSE 0 END ASC,
  performance.released_at DESC,
  performance.id ASC`;

const placeholders = (count: number) =>
  Array.from({ length: count }, () => "?").join(", ");

const groupBy = <Row>(rows: readonly Row[], key: (row: Row) => string) => {
  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    const value = key(row);
    const existing = grouped.get(value) ?? [];
    existing.push(row);
    grouped.set(value, existing);
  }
  return grouped;
};

const indexedSearchSql = (query: string): SearchSql => {
  const prefix = `${query}*`;
  return {
    sql: `
      search_candidates(song_id, relevance_rank) AS (
        SELECT song_search.id, 0
        FROM music_songs AS song_search
        WHERE song_search.normalized_title = ?
        UNION ALL
        SELECT song_search.id, 2
        FROM music_songs AS song_search
        WHERE song_search.normalized_title GLOB ?
          AND song_search.normalized_title <> ?
        UNION ALL
        SELECT term.song_id, 1
        FROM music_search_terms AS term
        WHERE term.term_kind = 'title_alias'
          AND term.normalized_term = ?
        UNION ALL
        SELECT term.song_id,
               CASE WHEN term.term_kind = 'original_artist' THEN 3 ELSE 5 END
        FROM music_search_terms AS term
        WHERE term.term_kind IN ('original_artist', 'participant')
          AND term.normalized_term = ?
        UNION ALL
        SELECT term.song_id,
               CASE WHEN term.term_kind = 'original_artist' THEN 4 ELSE 6 END
        FROM music_search_terms AS term
        WHERE term.term_kind IN ('original_artist', 'participant')
          AND term.normalized_term GLOB ?
          AND term.normalized_term <> ?
      ),
      search_rank(song_id, relevance_rank) AS MATERIALIZED (
        SELECT song_id, MIN(relevance_rank)
        FROM search_candidates
        GROUP BY song_id
      )`,
    binds: [
      query,
      prefix,
      query,
      query,
      query,
      prefix,
      query,
    ],
  };
};

const containsQuerySpec = (query: string) => {
  const codePoints = Array.from(query);
  const gramSize = (codePoints.length === 2 ? 2 : 3) as 2 | 3;
  return {
    codePoints,
    gramSize,
    candidateGrams: [
      ...new Set(
        Array.from(
          { length: codePoints.length - gramSize + 1 },
          (_, start) => codePoints.slice(start, start + gramSize).join(""),
        ),
      ),
    ],
  };
};

const containsPlanQuery = (query: string): BatchQuery => {
  const { candidateGrams, gramSize } = containsQuerySpec(query);
  return {
    sql: `
      WITH query_grams(normalized_gram) AS MATERIALIZED (
        SELECT DISTINCT CAST(value AS TEXT)
        FROM json_each(?)
      )
      SELECT stats.gram_size, stats.normalized_gram, stats.song_count
      FROM query_grams
      JOIN music_search_gram_stats AS stats
        ON stats.gram_size = ?
       AND stats.normalized_gram = query_grams.normalized_gram
      WHERE NOT EXISTS (
        SELECT 1
        FROM query_grams AS required_gram
        LEFT JOIN music_search_gram_stats AS required_stats
          ON required_stats.gram_size = stats.gram_size
         AND required_stats.normalized_gram = required_gram.normalized_gram
        WHERE required_stats.normalized_gram IS NULL
      )
      ORDER BY stats.song_count ASC, stats.normalized_gram ASC
      LIMIT 1`,
    binds: [JSON.stringify(candidateGrams), gramSize],
  };
};

const containsSearchSql = (
  query: string,
  plan: ContainsSearchPlan,
): SearchSql => {
  const indexed = indexedSearchSql(query);
  const { codePoints } = containsQuerySpec(query);
  const verificationSql =
    codePoints.length <= 3
      ? ""
      : `AND (
          EXISTS (
            SELECT 1
            FROM music_songs AS canonical_song
            WHERE canonical_song.id = gram.song_id
              AND instr(canonical_song.normalized_title, ?) > 0
          )
          OR EXISTS (
            SELECT 1
            FROM music_search_terms AS term
            WHERE term.song_id = gram.song_id
              AND instr(term.normalized_term, ?) > 0
          )
        )`;
  return {
    sql: `
      ${indexed.sql.replace(/search_rank\(song_id, relevance_rank\)/, "indexed_search_rank(song_id, relevance_rank)")},
      search_rank(song_id, relevance_rank) AS MATERIALIZED (
        SELECT gram.song_id, 7
        FROM music_search_grams AS gram
          INDEXED BY idx_music_search_grams_size_normalized_song
        WHERE gram.gram_size = ?
          AND gram.normalized_gram = ?
          ${verificationSql}
          AND NOT EXISTS (
            SELECT 1
            FROM indexed_search_rank
            WHERE indexed_search_rank.song_id = gram.song_id
          )
      )`,
    binds: [
      ...indexed.binds,
      plan.gramSize,
      plan.normalizedGram,
      ...(codePoints.length <= 3 ? [] : [query, query]),
    ],
  };
};

const buildPerformanceFilters = (
  query: PublicCatalogReaderQuery,
): FilterSql => {
  const predicates: string[] = [];
  const binds: SqlBind[] = [];

  if (query.relation !== null) {
    predicates.push("performance.relation_type = ?");
    binds.push(query.relation);
  }
  if (query.participation !== null) {
    predicates.push("performance.participation_type = ?");
    binds.push(query.participation);
  }
  if (query.publishedFrom !== null) {
    predicates.push("performance.released_at >= ?");
    binds.push(Date.parse(`${query.publishedFrom}T00:00:00.000Z`));
  }
  if (query.publishedTo !== null) {
    predicates.push("performance.released_at < ?");
    binds.push(Date.parse(`${query.publishedTo}T00:00:00.000Z`) + 86_400_000);
  }
  if (query.originalArtistSlug !== null) {
    predicates.push(`EXISTS (
      SELECT 1
      FROM music_song_original_artists AS original_artist_link
      JOIN music_entities AS original_artist
        ON original_artist.id = original_artist_link.entity_id
      WHERE original_artist_link.song_id = song.id
        AND original_artist.slug = ?
        AND original_artist.archived_at IS NULL
    )`);
    binds.push(query.originalArtistSlug);
  }
  if (query.participantSlug !== null) {
    predicates.push(`EXISTS (
      SELECT 1
      FROM music_performance_participants AS exact_participant
      JOIN music_entities AS exact_participant_entity
        ON exact_participant_entity.id = exact_participant.entity_id
      WHERE exact_participant.performance_id = performance.id
        AND exact_participant_entity.slug = ?
        ${query.participantRole === null ? "" : "AND exact_participant.participant_role = ?"}
        AND exact_participant_entity.archived_at IS NULL
    )`);
    binds.push(query.participantSlug);
    if (query.participantRole !== null) binds.push(query.participantRole);
  }
  if (query.memberUids.length > 0) {
    const memberPlaceholders = placeholders(query.memberUids.length);
    if (query.memberMode === "all") {
      predicates.push(`(
        SELECT COUNT(DISTINCT member_entity.member_uid)
        FROM music_performance_participants AS member_participant
        JOIN music_entities AS member_entity
          ON member_entity.id = member_participant.entity_id
        JOIN members AS selected_member
          ON selected_member.uid = member_entity.member_uid
        WHERE member_participant.performance_id = performance.id
          AND member_entity.member_uid IN (${memberPlaceholders})
          ${query.participantRole === null ? "" : "AND member_participant.participant_role = ?"}
          AND (selected_member.is_deprecated IS NULL OR selected_member.is_deprecated = 0)
      ) = ?`);
      binds.push(...query.memberUids);
      if (query.participantRole !== null) binds.push(query.participantRole);
      binds.push(query.memberUids.length);
    } else {
      predicates.push(`EXISTS (
        SELECT 1
        FROM music_performance_participants AS member_participant
        JOIN music_entities AS member_entity
          ON member_entity.id = member_participant.entity_id
        JOIN members AS selected_member
          ON selected_member.uid = member_entity.member_uid
        WHERE member_participant.performance_id = performance.id
          AND member_entity.member_uid IN (${memberPlaceholders})
          ${query.participantRole === null ? "" : "AND member_participant.participant_role = ?"}
          AND (selected_member.is_deprecated IS NULL OR selected_member.is_deprecated = 0)
      )`);
      binds.push(...query.memberUids);
      if (query.participantRole !== null) binds.push(query.participantRole);
    }
  }
  if (query.group?.entityId) {
    predicates.push(`EXISTS (
      SELECT 1
      FROM music_performance_participants AS group_participant
      JOIN music_entities AS group_entity
        ON group_entity.id = group_participant.entity_id
      WHERE group_participant.performance_id = performance.id
        AND group_entity.id = ?
        ${query.participantRole === null ? "" : "AND group_participant.participant_role = ?"}
        AND group_entity.entity_kind = 'group'
        AND group_entity.archived_at IS NULL
    )`);
    binds.push(query.group.entityId);
    if (query.participantRole !== null) binds.push(query.participantRole);
  } else if (query.group?.unitName) {
    predicates.push(`EXISTS (
      SELECT 1
      FROM music_performance_participants AS unit_participant
      JOIN music_entities AS unit_entity
        ON unit_entity.id = unit_participant.entity_id
      JOIN members AS unit_member
        ON unit_member.uid = unit_entity.member_uid
      WHERE unit_participant.performance_id = performance.id
        AND unit_member.unit_name = ?
        ${query.participantRole === null ? "" : "AND unit_participant.participant_role = ?"}
        AND (unit_member.is_deprecated IS NULL OR unit_member.is_deprecated = 0)
    )`);
    binds.push(query.group.unitName);
    if (query.participantRole !== null) binds.push(query.participantRole);
  }
  if (
    query.participantRole !== null &&
    query.participantSlug === null &&
    query.memberUids.length === 0 &&
    query.group === null
  ) {
    predicates.push(`EXISTS (
      SELECT 1
      FROM music_performance_participants AS role_participant
      WHERE role_participant.performance_id = performance.id
        AND role_participant.participant_role = ?
    )`);
    binds.push(query.participantRole);
  }

  return {
    sql: predicates.length > 0 ? `AND ${predicates.join("\nAND ")}` : "",
    binds,
  };
};

const retargetPerformanceFilters = (sql: string, alias: string) =>
  sql.replace(/\bperformance\./g, `${alias}.`);

const retargetPublicPerformancePredicate = (alias: string) =>
  PUBLIC_PERFORMANCE_PREDICATE.replace(
    /\bperformance\./g,
    `${alias}.`,
  );

const preferredPerformanceGuard = (
  filters: FilterSql,
  performanceAlias = "performance",
) => `AND NOT EXISTS (
    SELECT 1
    FROM music_performances AS preferred_performance
      INDEXED BY idx_music_performances_published_song_released_id
    WHERE preferred_performance.song_id = ${performanceAlias}.song_id
      AND ${retargetPublicPerformancePredicate("preferred_performance")}
      ${retargetPerformanceFilters(filters.sql, "preferred_performance")}
      AND (
        (${performanceAlias}.released_at IS NULL
          AND preferred_performance.released_at IS NOT NULL)
        OR (${performanceAlias}.released_at IS NOT NULL
          AND preferred_performance.released_at > ${performanceAlias}.released_at)
        OR (
          (
            preferred_performance.released_at = ${performanceAlias}.released_at
            OR (${performanceAlias}.released_at IS NULL
              AND preferred_performance.released_at IS NULL)
          )
          AND preferred_performance.id < ${performanceAlias}.id
        )
      )
  )`;

const buildCursorPredicate = (
  query: PublicCatalogReaderQuery,
  phase: PublicCatalogSearchPhase,
): FilterSql => {
  const cursor = query.cursor;
  if (!cursor || cursor.searchPhase !== phase) return { sql: "", binds: [] };

  const compareRelevanceRank =
    query.normalizedQuery !== null && phase === "indexed";
  const rankPrefix = compareRelevanceRank
    ? "(candidate.relevance_rank > ? OR (candidate.relevance_rank = ? AND "
    : "(";
  const rankSuffix = compareRelevanceRank ? "))" : ")";
  const rankBinds: SqlBind[] = compareRelevanceRank
    ? [cursor.relevanceRank, cursor.relevanceRank]
    : [];

  if (query.sort === "recent" && cursor.sort === "recent") {
    const nullRank = cursor.releasedAt === null ? 1 : 0;
    return {
      sql: `AND ${rankPrefix}(
        CASE WHEN candidate.released_at IS NULL THEN 1 ELSE 0 END > ?
        OR (
          CASE WHEN candidate.released_at IS NULL THEN 1 ELSE 0 END = ?
          AND (
            (? IS NOT NULL AND candidate.released_at < ?)
            OR ((candidate.released_at = ?) OR (? IS NULL AND candidate.released_at IS NULL))
               AND candidate.song_id > ?
          )
        )
      )${rankSuffix}`,
      binds: [
        ...rankBinds,
        nullRank,
        nullRank,
        cursor.releasedAt,
        cursor.releasedAt,
        cursor.releasedAt,
        cursor.releasedAt,
        cursor.songId,
      ],
    };
  }
  if (query.sort === "title" && cursor.sort === "title") {
    return {
      sql: `AND ${rankPrefix}(
        candidate.normalized_title > ?
        OR (candidate.normalized_title = ? AND candidate.song_id > ?)
      )${rankSuffix}`,
      binds: [
        ...rankBinds,
        cursor.normalizedTitle,
        cursor.normalizedTitle,
        cursor.songId,
      ],
    };
  }
  if (query.sort === "participant" && cursor.sort === "participant") {
    const nullRank = cursor.normalizedParticipant === null ? 1 : 0;
    return {
      sql: `AND ${rankPrefix}(
        CASE WHEN candidate.normalized_participant IS NULL THEN 1 ELSE 0 END > ?
        OR (
          CASE WHEN candidate.normalized_participant IS NULL THEN 1 ELSE 0 END = ?
          AND (
            (? IS NOT NULL AND candidate.normalized_participant > ?)
            OR ((candidate.normalized_participant = ?)
                OR (? IS NULL AND candidate.normalized_participant IS NULL))
               AND candidate.song_id > ?
          )
        )
      )${rankSuffix}`,
      binds: [
        ...rankBinds,
        nullRank,
        nullRank,
        cursor.normalizedParticipant,
        cursor.normalizedParticipant,
        cursor.normalizedParticipant,
        cursor.normalizedParticipant,
        cursor.songId,
      ],
    };
  }
  return { sql: "AND 0 = 1", binds: [] };
};

const candidateOrder = (
  query: PublicCatalogReaderQuery,
  phase: PublicCatalogSearchPhase,
) => {
  const parts: string[] = [];
  if (query.normalizedQuery !== null && phase === "indexed") {
    parts.push("candidate.relevance_rank ASC");
  }
  if (query.sort === "recent") {
    parts.push("candidate.released_at DESC");
  } else if (query.sort === "title") {
    parts.push("candidate.normalized_title ASC");
  } else {
    parts.push(
      "CASE WHEN candidate.normalized_participant IS NULL THEN 1 ELSE 0 END ASC",
      "candidate.normalized_participant ASC",
    );
  }
  parts.push("candidate.song_id ASC");
  return parts.join(",\n");
};

const denseContainsMatch = (
  query: string,
  plan: ContainsSearchPlan,
  songAlias = "song",
): FilterSql => {
  const needsCanonicalVerification = Array.from(query).length > 3;
  return {
    sql: `AND EXISTS (
      SELECT 1
      FROM music_search_grams AS dense_gram
        INDEXED BY idx_music_search_grams_size_normalized_song
      WHERE dense_gram.gram_size = ?
        AND dense_gram.normalized_gram = ?
        AND dense_gram.song_id = ${songAlias}.id
    )
    ${
      needsCanonicalVerification
        ? `AND (
      instr(${songAlias}.normalized_title, ?) > 0
      OR EXISTS (
        SELECT 1
        FROM music_search_terms AS contains_term
        WHERE contains_term.song_id = ${songAlias}.id
          AND instr(contains_term.normalized_term, ?) > 0
      )
    )`
        : ""
    }
    AND NOT EXISTS (
      SELECT 1
      FROM indexed_search_rank
      WHERE indexed_search_rank.song_id = ${songAlias}.id
    )`,
    binds: [
      plan.gramSize,
      plan.normalizedGram,
      ...(needsCanonicalVerification ? [query, query] : []),
    ],
  };
};

const indexedSearchCtes = (query: string): SearchSql => {
  const indexed = indexedSearchSql(query);
  return {
    sql: indexed.sql.replace(
      /search_rank\(song_id, relevance_rank\)/,
      "indexed_search_rank(song_id, relevance_rank)",
    ),
    binds: indexed.binds,
  };
};

const buildD1DenseContainsCandidateQuery = (
  query: PublicCatalogReaderQuery,
  limit: number,
  plan: ContainsSearchPlan,
): BatchQuery => {
  if (query.normalizedQuery === null || query.sort === "participant") {
    throw new Error("Dense contains candidate requires a searchable sort");
  }
  const indexed = indexedSearchCtes(query.normalizedQuery);
  const match = denseContainsMatch(query.normalizedQuery, plan);
  const filters = buildPerformanceFilters(query);
  const cursor = buildCursorPredicate(query, "contains");
  const recentPerformanceIndex =
    query.participation === null
      ? "idx_music_performances_published_released_song_id"
      : "idx_music_performances_published_participation_released_song_id";
  const participantSortSql = `(
    SELECT participant_entity.normalized_name
    FROM music_performance_participants AS participant
    JOIN music_entities AS participant_entity
      ON participant_entity.id = participant.entity_id
    WHERE participant.performance_id = performance.id
    ORDER BY participant.credit_order ASC, participant.entity_id ASC
    LIMIT 1
  )`;
  const publishedCountSql = `(
    SELECT COUNT(*)
    FROM music_performances AS public_performance
    WHERE public_performance.song_id = song.id
      AND public_performance.publication_status = 'published'
      AND public_performance.release_type IN ('official_mv', 'official_video')
  )`;

  if (query.sort === "recent") {
    return {
      sql: `
        WITH
        ${indexed.sql},
        candidate AS (
          SELECT
            song.id AS song_id,
            song.slug,
            song.title,
            song.normalized_title,
            song.is_otw_original,
            song.original_release_date,
            song.original_release_precision,
            performance.id AS performance_id,
            performance.relation_type,
            performance.release_type,
            performance.participation_type,
            performance.released_at,
            CAST(7 AS INTEGER) AS relevance_rank,
            ${participantSortSql} AS normalized_participant,
            ${publishedCountSql} AS published_performance_count
          FROM music_performances AS performance
            INDEXED BY ${recentPerformanceIndex}
          JOIN music_songs AS song ON song.id = performance.song_id
          WHERE ${PUBLIC_PERFORMANCE_PREDICATE}
            AND ${PUBLIC_SONG_PREDICATE}
            ${match.sql}
            ${filters.sql}
            ${preferredPerformanceGuard(filters)}
        )
        SELECT *
        FROM candidate
        WHERE 1 = 1
          ${cursor.sql}
        ORDER BY ${candidateOrder(query, "contains")}
        LIMIT ?`,
      binds: [
        ...indexed.binds,
        ...match.binds,
        ...filters.binds,
        ...filters.binds,
        ...cursor.binds,
        limit,
      ],
    };
  }

  return {
    sql: `
      WITH
      ${indexed.sql},
      candidate AS (
        SELECT
          song.id AS song_id,
          song.slug,
          song.title,
          song.normalized_title,
          song.is_otw_original,
          song.original_release_date,
          song.original_release_precision,
          performance.id AS performance_id,
          performance.relation_type,
          performance.release_type,
          performance.participation_type,
          performance.released_at,
          CAST(7 AS INTEGER) AS relevance_rank,
          ${participantSortSql} AS normalized_participant,
          ${publishedCountSql} AS published_performance_count
        FROM music_songs AS song
          INDEXED BY idx_music_songs_normalized_title_id
        CROSS JOIN music_performances AS performance
          ON performance.id = (
            SELECT representative.id
            FROM music_performances AS representative
              INDEXED BY idx_music_performances_published_song_released_id
            WHERE representative.song_id = song.id
              AND ${retargetPublicPerformancePredicate("representative")}
              ${retargetPerformanceFilters(filters.sql, "representative")}
            ORDER BY representative.released_at DESC, representative.id ASC
            LIMIT 1
          )
        WHERE ${PUBLIC_SONG_PREDICATE}
          ${match.sql}
      )
      SELECT *
      FROM candidate
      WHERE 1 = 1
        ${cursor.sql}
      ORDER BY ${candidateOrder(query, "contains")}
      LIMIT ?`,
    binds: [
      ...indexed.binds,
      ...filters.binds,
      ...match.binds,
      ...cursor.binds,
      limit,
    ],
  };
};

type ParticipantBrowsePhase = "named" | "missing";

export const buildD1ParticipantBrowseCandidateQuery = (
  query: PublicCatalogReaderQuery,
  phase: ParticipantBrowsePhase,
  limit: number,
): BatchQuery => {
  const filters = buildPerformanceFilters(query);
  const publishedCountSql = `(
    SELECT COUNT(*)
    FROM music_performances AS public_performance
    WHERE public_performance.song_id = song.id
      AND public_performance.publication_status = 'published'
      AND public_performance.release_type IN ('official_mv', 'official_video')
  )`;

  if (phase === "named") {
    const cursor =
      query.cursor?.sort === "participant" &&
      query.cursor.searchPhase === null &&
      query.cursor.normalizedParticipant !== null
        ? {
            sql: `AND (
              sort_key.normalized_participant > ?
              OR (
                sort_key.normalized_participant = ?
                AND sort_key.song_id > ?
              )
            )`,
            binds: [
              query.cursor.normalizedParticipant,
              query.cursor.normalizedParticipant,
              query.cursor.songId,
            ],
          }
        : { sql: "", binds: [] };

    return {
      sql: `
        SELECT
          song.id AS song_id,
          song.slug,
          song.title,
          song.normalized_title,
          song.is_otw_original,
          song.original_release_date,
          song.original_release_precision,
          performance.id AS performance_id,
          performance.relation_type,
          performance.release_type,
          performance.participation_type,
          performance.released_at,
          CAST(NULL AS INTEGER) AS relevance_rank,
          sort_key.normalized_participant AS normalized_participant,
          ${publishedCountSql} AS published_performance_count
        FROM music_public_performance_sort_keys AS sort_key
          INDEXED BY idx_music_public_performance_sort_keys_participant_song_performance
        CROSS JOIN music_performances AS performance
          ON performance.id = sort_key.performance_id
         AND performance.song_id = sort_key.song_id
        CROSS JOIN music_songs AS song ON song.id = sort_key.song_id
        WHERE sort_key.normalized_participant IS NOT NULL
          AND ${PUBLIC_PERFORMANCE_PREDICATE}
          AND ${PUBLIC_SONG_PREDICATE}
          ${filters.sql}
          ${preferredPerformanceGuard(filters)}
          ${cursor.sql}
        ORDER BY sort_key.normalized_participant ASC, sort_key.song_id ASC
        LIMIT ?`,
      binds: [
        ...filters.binds,
        ...filters.binds,
        ...cursor.binds,
        limit,
      ],
    };
  }

  const cursor =
    query.cursor?.sort === "participant" &&
    query.cursor.searchPhase === null &&
    query.cursor.normalizedParticipant === null
      ? { sql: "AND sort_key.song_id > ?", binds: [query.cursor.songId] }
      : { sql: "", binds: [] };

  return {
    sql: `
      SELECT
        song.id AS song_id,
        song.slug,
        song.title,
        song.normalized_title,
        song.is_otw_original,
        song.original_release_date,
        song.original_release_precision,
        performance.id AS performance_id,
        performance.relation_type,
        performance.release_type,
        performance.participation_type,
        performance.released_at,
        CAST(NULL AS INTEGER) AS relevance_rank,
        CAST(NULL AS TEXT) AS normalized_participant,
        ${publishedCountSql} AS published_performance_count
      FROM music_public_performance_sort_keys AS sort_key
        INDEXED BY idx_music_public_performance_sort_keys_missing_song_performance
      CROSS JOIN music_performances AS performance
        ON performance.id = sort_key.performance_id
       AND performance.song_id = sort_key.song_id
      CROSS JOIN music_songs AS song ON song.id = sort_key.song_id
      WHERE sort_key.normalized_participant IS NULL
        AND ${PUBLIC_PERFORMANCE_PREDICATE}
        AND ${PUBLIC_SONG_PREDICATE}
        ${filters.sql}
        ${preferredPerformanceGuard(filters)}
        ${cursor.sql}
      ORDER BY sort_key.song_id ASC
      LIMIT ?`,
    binds: [
      ...filters.binds,
      ...filters.binds,
      ...cursor.binds,
      limit,
    ],
  };
};

const buildD1DenseContainsParticipantCandidateQuery = (
  query: PublicCatalogReaderQuery,
  plan: ContainsSearchPlan,
  phase: ParticipantBrowsePhase,
  limit: number,
): BatchQuery => {
  if (query.normalizedQuery === null) {
    throw new Error("Dense participant contains requires a normalized query");
  }
  const indexed = indexedSearchCtes(query.normalizedQuery);
  const match = denseContainsMatch(query.normalizedQuery, plan);
  const filters = buildPerformanceFilters(query);
  const publishedCountSql = `(
    SELECT COUNT(*)
    FROM music_performances AS public_performance
    WHERE public_performance.song_id = song.id
      AND public_performance.publication_status = 'published'
      AND public_performance.release_type IN ('official_mv', 'official_video')
  )`;
  const participantCursor =
    query.cursor?.sort === "participant" &&
    query.cursor.searchPhase === "contains"
      ? query.cursor
      : null;
  const cursor =
    phase === "named" &&
    participantCursor !== null &&
    participantCursor.normalizedParticipant !== null
      ? {
          sql: `AND (
            sort_key.normalized_participant > ?
            OR (
              sort_key.normalized_participant = ?
              AND sort_key.song_id > ?
            )
          )`,
          binds: [
            participantCursor.normalizedParticipant,
            participantCursor.normalizedParticipant,
            participantCursor.songId,
          ] satisfies SqlBind[],
        }
      : phase === "missing" &&
          participantCursor !== null &&
          participantCursor.normalizedParticipant === null
        ? {
            sql: "AND sort_key.song_id > ?",
            binds: [participantCursor.songId] satisfies SqlBind[],
          }
        : { sql: "", binds: [] satisfies SqlBind[] };
  const participantExpression =
    phase === "named"
      ? "sort_key.normalized_participant"
      : "CAST(NULL AS TEXT)";
  const participantPredicate =
    phase === "named"
      ? "sort_key.normalized_participant IS NOT NULL"
      : "sort_key.normalized_participant IS NULL";
  const participantIndex =
    phase === "named"
      ? "idx_music_public_performance_sort_keys_participant_song_performance"
      : "idx_music_public_performance_sort_keys_missing_song_performance";
  const order =
    phase === "named"
      ? "sort_key.normalized_participant ASC, sort_key.song_id ASC"
      : "sort_key.song_id ASC";

  return {
    sql: `
      WITH
      ${indexed.sql}
      SELECT
        song.id AS song_id,
        song.slug,
        song.title,
        song.normalized_title,
        song.is_otw_original,
        song.original_release_date,
        song.original_release_precision,
        performance.id AS performance_id,
        performance.relation_type,
        performance.release_type,
        performance.participation_type,
        performance.released_at,
        CAST(7 AS INTEGER) AS relevance_rank,
        ${participantExpression} AS normalized_participant,
        ${publishedCountSql} AS published_performance_count
      FROM music_public_performance_sort_keys AS sort_key
        INDEXED BY ${participantIndex}
      CROSS JOIN music_performances AS performance
        ON performance.id = sort_key.performance_id
       AND performance.song_id = sort_key.song_id
      CROSS JOIN music_songs AS song ON song.id = sort_key.song_id
      WHERE ${participantPredicate}
        AND ${PUBLIC_PERFORMANCE_PREDICATE}
        AND ${PUBLIC_SONG_PREDICATE}
        ${match.sql}
        ${filters.sql}
        ${preferredPerformanceGuard(filters)}
        ${cursor.sql}
      ORDER BY ${order}
      LIMIT ?`,
    binds: [
      ...indexed.binds,
      ...match.binds,
      ...filters.binds,
      ...filters.binds,
      ...cursor.binds,
      limit,
    ],
  };
};

export const buildD1PublicCatalogCandidateQuery = (
  query: PublicCatalogReaderQuery,
  phase: PublicCatalogSearchPhase,
  limit: number,
  containsPlan: ContainsSearchPlan | null = null,
): BatchQuery => {
  if (
    phase === "contains" &&
    containsPlan !== null &&
    containsPlan.songCount > CONTAINS_DENSE_SONG_THRESHOLD &&
    query.sort !== "participant"
  ) {
    return buildD1DenseContainsCandidateQuery(query, limit, containsPlan);
  }
  const search =
    phase === "indexed" && query.normalizedQuery
      ? indexedSearchSql(query.normalizedQuery)
      : phase === "contains" && query.normalizedQuery && containsPlan
        ? containsSearchSql(query.normalizedQuery, containsPlan)
        : null;
  if (phase === "contains" && search === null) {
    throw new Error("Contains candidate query requires a search plan");
  }
  const filters = buildPerformanceFilters(query);
  const cursor = buildCursorPredicate(query, phase);
  const recentPerformanceIndex =
    query.participation === null
      ? "idx_music_performances_published_released_song_id"
      : "idx_music_performances_published_participation_released_song_id";
  const participantSortSql = `(
    SELECT participant_entity.normalized_name
    FROM music_performance_participants AS participant
    JOIN music_entities AS participant_entity
      ON participant_entity.id = participant.entity_id
    WHERE participant.performance_id = performance.id
    ORDER BY participant.credit_order ASC, participant.entity_id ASC
    LIMIT 1
  )`;
  const publishedCountSql = `(
    SELECT COUNT(*)
    FROM music_performances AS public_performance
    WHERE public_performance.song_id = song.id
      AND public_performance.publication_status = 'published'
      AND public_performance.release_type IN ('official_mv', 'official_video')
  )`;
  const candidateCtes = search
      ? `filtered_performance AS MATERIALIZED (
        SELECT
          performance.id AS performance_id,
          performance.song_id,
          performance.relation_type,
          performance.release_type,
          performance.participation_type,
          performance.released_at,
          search_rank.relevance_rank,
          ${participantSortSql} AS normalized_participant
        FROM search_rank
        CROSS JOIN music_songs AS song ON song.id = search_rank.song_id
        CROSS JOIN music_performances AS performance
          INDEXED BY idx_music_performances_published_song_released_id
          ON performance.song_id = search_rank.song_id
        WHERE ${PUBLIC_PERFORMANCE_PREDICATE}
          AND ${PUBLIC_SONG_PREDICATE}
          ${filters.sql}
      ),
      ranked_performance AS (
        SELECT filtered_performance.*,
               ROW_NUMBER() OVER (
                 PARTITION BY filtered_performance.song_id
                 ORDER BY
                   CASE WHEN filtered_performance.released_at IS NULL THEN 1 ELSE 0 END ASC,
                   filtered_performance.released_at DESC,
                   filtered_performance.performance_id ASC
               ) AS representative_rank
        FROM filtered_performance
      ),
      candidate AS (
        SELECT
          song.id AS song_id,
          song.slug,
          song.title,
          song.normalized_title,
          song.is_otw_original,
          song.original_release_date,
          song.original_release_precision,
          ranked_performance.performance_id,
          ranked_performance.relation_type,
          ranked_performance.release_type,
          ranked_performance.participation_type,
          ranked_performance.released_at,
          ranked_performance.relevance_rank,
          ranked_performance.normalized_participant,
          ${publishedCountSql} AS published_performance_count
        FROM ranked_performance
        JOIN music_songs AS song ON song.id = ranked_performance.song_id
        WHERE ranked_performance.representative_rank = 1
      )`
    : query.sort === "recent"
      ? `candidate AS (
          SELECT
            song.id AS song_id,
            song.slug,
            song.title,
            song.normalized_title,
            song.is_otw_original,
            song.original_release_date,
            song.original_release_precision,
            performance.id AS performance_id,
            performance.relation_type,
            performance.release_type,
            performance.participation_type,
            performance.released_at,
            CAST(NULL AS INTEGER) AS relevance_rank,
            ${participantSortSql} AS normalized_participant,
            ${publishedCountSql} AS published_performance_count
          FROM music_performances AS performance
            INDEXED BY ${recentPerformanceIndex}
          JOIN music_songs AS song ON song.id = performance.song_id
          WHERE ${PUBLIC_PERFORMANCE_PREDICATE}
            AND ${PUBLIC_SONG_PREDICATE}
            ${filters.sql}
            ${preferredPerformanceGuard(filters)}
        )`
      : query.sort === "title"
        ? `candidate AS (
            SELECT
              song.id AS song_id,
              song.slug,
              song.title,
              song.normalized_title,
              song.is_otw_original,
              song.original_release_date,
              song.original_release_precision,
              performance.id AS performance_id,
              performance.relation_type,
              performance.release_type,
              performance.participation_type,
              performance.released_at,
              CAST(NULL AS INTEGER) AS relevance_rank,
              ${participantSortSql} AS normalized_participant,
              ${publishedCountSql} AS published_performance_count
            FROM music_songs AS song
              INDEXED BY idx_music_songs_normalized_title_id
            CROSS JOIN music_performances AS performance
              ON performance.id = (
                SELECT representative.id
                FROM music_performances AS representative
                  INDEXED BY idx_music_performances_published_song_released_id
                WHERE representative.song_id = song.id
                  AND ${retargetPublicPerformancePredicate("representative")}
                  ${retargetPerformanceFilters(filters.sql, "representative")}
                ORDER BY representative.released_at DESC, representative.id ASC
                LIMIT 1
              )
            WHERE ${PUBLIC_SONG_PREDICATE}
          )`
        : `filtered_performance AS (
        SELECT
          performance.id AS performance_id,
          performance.song_id,
          performance.relation_type,
          performance.release_type,
          performance.participation_type,
          performance.released_at,
          CAST(NULL AS INTEGER) AS relevance_rank,
          ${participantSortSql} AS normalized_participant
        FROM music_performances AS performance
        JOIN music_songs AS song ON song.id = performance.song_id
        WHERE ${PUBLIC_PERFORMANCE_PREDICATE}
          AND ${PUBLIC_SONG_PREDICATE}
          ${filters.sql}
      ),
      ranked_performance AS (
        SELECT filtered_performance.*,
               ROW_NUMBER() OVER (
                 PARTITION BY filtered_performance.song_id
                 ORDER BY
                   CASE WHEN filtered_performance.released_at IS NULL THEN 1 ELSE 0 END ASC,
                   filtered_performance.released_at DESC,
                   filtered_performance.performance_id ASC
               ) AS representative_rank
        FROM filtered_performance
      ),
      candidate AS (
        SELECT
          song.id AS song_id,
          song.slug,
          song.title,
          song.normalized_title,
          song.is_otw_original,
          song.original_release_date,
          song.original_release_precision,
          ranked_performance.performance_id,
          ranked_performance.relation_type,
          ranked_performance.release_type,
          ranked_performance.participation_type,
          ranked_performance.released_at,
          ranked_performance.relevance_rank,
          ranked_performance.normalized_participant,
          ${publishedCountSql} AS published_performance_count
        FROM ranked_performance
        JOIN music_songs AS song ON song.id = ranked_performance.song_id
        WHERE ranked_performance.representative_rank = 1
      )`;

  return {
    sql: `
      WITH
      ${search ? `${search.sql},` : ""}
      ${candidateCtes}
      SELECT *
      FROM candidate
      WHERE 1 = 1
      ${cursor.sql}
      ORDER BY ${candidateOrder(query, phase)}
      LIMIT ?`,
    binds: [
      ...(search?.binds ?? []),
      ...filters.binds,
      ...(!search && query.sort === "recent" ? filters.binds : []),
      ...cursor.binds,
      limit,
    ],
  };
};

const artistQueryForSongIds = (songIds: readonly string[]): BatchQuery => ({
  sql: `
    SELECT
      original_artist.song_id,
      entity.id AS entity_id,
      entity.slug,
      entity.display_name,
      entity.entity_kind,
      original_artist.is_primary,
      original_artist.credit_order
    FROM music_song_original_artists AS original_artist
    JOIN music_entities AS entity ON entity.id = original_artist.entity_id
    WHERE original_artist.song_id IN (${placeholders(songIds.length)})
    ORDER BY original_artist.song_id, original_artist.credit_order, entity.id`,
  binds: [...songIds],
});

const tagQueryForSongIds = (songIds: readonly string[]): BatchQuery => ({
  sql: `SELECT song_id, display_name FROM music_song_tags
    WHERE song_id IN (${placeholders(songIds.length)})
    ORDER BY song_id, tag_key`,
  binds: [...songIds],
});

const participantQueryForPerformanceIds = (
  performanceIds: readonly string[],
): BatchQuery => ({
  sql: `
    SELECT
      participant.performance_id,
      entity.id AS entity_id,
      entity.slug,
      entity.display_name,
      entity.entity_kind,
      participant.credit_name_snapshot,
      participant.participant_role,
      participant.credit_order,
      member.uid AS member_uid,
      member.code AS member_code,
      member.name AS member_name,
      member.oshi_mark AS member_oshi_mark,
      member.unit_name AS member_unit_name,
      member.is_deprecated AS member_is_deprecated
    FROM music_performance_participants AS participant
    JOIN music_entities AS entity ON entity.id = participant.entity_id
    LEFT JOIN members AS member ON member.uid = entity.member_uid
    WHERE participant.performance_id IN (${placeholders(performanceIds.length)})
    ORDER BY participant.performance_id, participant.credit_order, entity.id`,
  binds: [...performanceIds],
});

const sourceQueryForPerformanceIds = (
  performanceIds: readonly string[],
): BatchQuery => ({
  sql: `
    SELECT
      performance_source.performance_id,
      source.id AS source_id,
      source.provider,
      source.external_id,
      source.title,
      source.thumbnail_url,
      source.duration_seconds,
      source.provider_published_at,
      source.availability_status,
      performance_source.source_role,
      performance_source.priority,
      performance_source.is_primary,
      performance_source.start_seconds,
      performance_source.end_seconds,
      channel.id AS channel_id,
      channel.display_name AS channel_display_name,
      channel.channel_role
    FROM music_performance_sources AS performance_source
    JOIN music_media_sources AS source
      ON source.id = performance_source.source_id
    JOIN music_channels AS channel ON channel.id = source.channel_id
    WHERE performance_source.performance_id IN (${placeholders(performanceIds.length)})
      AND ${PUBLIC_SOURCE_PREDICATE}
    ORDER BY performance_source.performance_id,
             performance_source.priority,
             source.id`,
  binds: [...performanceIds],
});

const catalogHydrationQuery = (
  rows: readonly CandidateRow[],
): BatchQuery => ({
  sql: `
    WITH requested(song_id, performance_id) AS (
      SELECT json_extract(value, '$.songId'),
             json_extract(value, '$.performanceId')
      FROM json_each(?)
    )
    SELECT
      requested.song_id,
      requested.performance_id,
      COALESCE((
        SELECT json_group_array(json_object(
          'song_id', artist_row.song_id,
          'entity_id', artist_row.entity_id,
          'slug', artist_row.slug,
          'display_name', artist_row.display_name,
          'entity_kind', artist_row.entity_kind,
          'is_primary', artist_row.is_primary,
          'credit_order', artist_row.credit_order
        ))
        FROM (
          SELECT original_artist.song_id,
                 entity.id AS entity_id,
                 entity.slug,
                 entity.display_name,
                 entity.entity_kind,
                 original_artist.is_primary,
                 original_artist.credit_order
          FROM music_song_original_artists AS original_artist
          JOIN music_entities AS entity ON entity.id = original_artist.entity_id
          WHERE original_artist.song_id = requested.song_id
          ORDER BY original_artist.credit_order, entity.id
        ) AS artist_row
      ), '[]') AS artists_json,
      COALESCE((
        SELECT json_group_array(json_object(
          'song_id', requested.song_id,
          'display_name', tag_row.display_name
        ))
        FROM (
          SELECT display_name
          FROM music_song_tags
          WHERE song_id = requested.song_id
          ORDER BY tag_key
        ) AS tag_row
      ), '[]') AS tags_json,
      COALESCE((
        SELECT json_group_array(json_object(
          'performance_id', participant_row.performance_id,
          'entity_id', participant_row.entity_id,
          'slug', participant_row.slug,
          'display_name', participant_row.display_name,
          'entity_kind', participant_row.entity_kind,
          'credit_name_snapshot', participant_row.credit_name_snapshot,
          'participant_role', participant_row.participant_role,
          'credit_order', participant_row.credit_order,
          'member_uid', participant_row.member_uid,
          'member_code', participant_row.member_code,
          'member_name', participant_row.member_name,
          'member_oshi_mark', participant_row.member_oshi_mark,
          'member_unit_name', participant_row.member_unit_name,
          'member_is_deprecated', participant_row.member_is_deprecated
        ))
        FROM (
          SELECT participant.performance_id,
                 entity.id AS entity_id,
                 entity.slug,
                 entity.display_name,
                 entity.entity_kind,
                 participant.credit_name_snapshot,
                 participant.participant_role,
                 participant.credit_order,
                 member.uid AS member_uid,
                 member.code AS member_code,
                 member.name AS member_name,
                 member.oshi_mark AS member_oshi_mark,
                 member.unit_name AS member_unit_name,
                 member.is_deprecated AS member_is_deprecated
          FROM music_performance_participants AS participant
          JOIN music_entities AS entity ON entity.id = participant.entity_id
          LEFT JOIN members AS member ON member.uid = entity.member_uid
          WHERE participant.performance_id = requested.performance_id
          ORDER BY participant.credit_order, entity.id
        ) AS participant_row
      ), '[]') AS participants_json,
      COALESCE((
        SELECT json_group_array(json_object(
          'performance_id', source_row.performance_id,
          'source_id', source_row.source_id,
          'provider', source_row.provider,
          'external_id', source_row.external_id,
          'title', source_row.title,
          'thumbnail_url', source_row.thumbnail_url,
          'duration_seconds', source_row.duration_seconds,
          'provider_published_at', source_row.provider_published_at,
          'availability_status', source_row.availability_status,
          'source_role', source_row.source_role,
          'priority', source_row.priority,
          'is_primary', source_row.is_primary,
          'start_seconds', source_row.start_seconds,
          'end_seconds', source_row.end_seconds,
          'channel_id', source_row.channel_id,
          'channel_display_name', source_row.channel_display_name,
          'channel_role', source_row.channel_role
        ))
        FROM (
          SELECT performance_source.performance_id,
                 source.id AS source_id,
                 source.provider,
                 source.external_id,
                 source.title,
                 source.thumbnail_url,
                 source.duration_seconds,
                 source.provider_published_at,
                 source.availability_status,
                 performance_source.source_role,
                 performance_source.priority,
                 performance_source.is_primary,
                 performance_source.start_seconds,
                 performance_source.end_seconds,
                 channel.id AS channel_id,
                 channel.display_name AS channel_display_name,
                 channel.channel_role
          FROM music_performance_sources AS performance_source
          JOIN music_media_sources AS source
            ON source.id = performance_source.source_id
          JOIN music_channels AS channel ON channel.id = source.channel_id
          WHERE performance_source.performance_id = requested.performance_id
            AND ${PUBLIC_SOURCE_PREDICATE}
          ORDER BY performance_source.priority, source.id
        ) AS source_row
      ), '[]') AS sources_json
    FROM requested`,
  binds: [
    JSON.stringify(
      rows.map((row) => ({
        songId: row.song_id,
        performanceId: row.performance_id,
      })),
    ),
  ],
});

const parseHydrationRows = <Row>(value: string, label: string): Row[] => {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid OTW Play ${label} hydration payload`);
  }
  return parsed as Row[];
};

const mapArtist = (row: ArtistRow): PublicCatalogOriginalArtist => ({
  id: row.entity_id,
  slug: row.slug,
  displayName: row.display_name,
  entityKind: row.entity_kind,
  isPrimary: Boolean(row.is_primary),
  creditOrder: Number(row.credit_order),
});

const mapParticipant = (row: ParticipantRow): PublicCatalogParticipant => {
  const currentMember =
    row.entity_kind === "person" &&
    row.member_uid !== null &&
    row.member_code !== null &&
    row.member_name !== null &&
    row.member_is_deprecated !== 1;
  return {
    id: row.entity_id,
    slug: row.slug,
    displayName: row.display_name,
    entityKind: row.entity_kind,
    creditName: row.credit_name_snapshot,
    participantRole: row.participant_role,
    creditOrder: Number(row.credit_order),
    kind:
      row.entity_kind === "group"
        ? "group"
        : currentMember
          ? "current_member"
          : "external",
    member: currentMember
      ? {
          uid: Number(row.member_uid),
          code: row.member_code as string,
          name: row.member_name as string,
          oshiMark: row.member_oshi_mark,
          unitName: row.member_unit_name,
        }
      : null,
  };
};

type HydratedSource = PublicCatalogSource & PublicSourceCandidate;

const mapSource = (row: SourceRow): HydratedSource => ({
  id: row.source_id,
  provider: row.provider,
  externalId: row.external_id,
  title: row.title,
  thumbnailUrl: row.thumbnail_url,
  durationSeconds:
    row.duration_seconds === null ? null : Number(row.duration_seconds),
  providerPublishedAt:
    row.provider_published_at === null
      ? null
      : Number(row.provider_published_at),
  availabilityStatus: row.availability_status,
  sourceRole: row.source_role,
  priority: Number(row.priority),
  isPrimary: Boolean(row.is_primary),
  startSeconds: Number(row.start_seconds),
  endSeconds: row.end_seconds === null ? null : Number(row.end_seconds),
  channel: {
    id: row.channel_id,
    displayName: row.channel_display_name,
    channelRole: row.channel_role,
  },
  channelApproved: true,
  channelActive: true,
  channelRole: row.channel_role,
});

const stripSourcePolicy = (source: HydratedSource): PublicCatalogSource => {
  return {
    id: source.id,
    provider: source.provider,
    externalId: source.externalId,
    title: source.title,
    thumbnailUrl: source.thumbnailUrl,
    durationSeconds: source.durationSeconds,
    providerPublishedAt: source.providerPublishedAt,
    availabilityStatus: source.availabilityStatus,
    sourceRole: source.sourceRole,
    priority: source.priority,
    isPrimary: source.isPrimary,
    startSeconds: source.startSeconds,
    endSeconds: source.endSeconds,
    channel: source.channel,
  };
};

const mapPerformance = (
  row: PerformanceRow,
  participantRows: readonly ParticipantRow[],
  sourceRows: readonly SourceRow[],
): PublicCatalogPerformance => {
  const selection = selectPublicPlaybackSource(sourceRows.map(mapSource));
  return {
    id: row.performance_id,
    relation: row.relation_type,
    releaseType: row.release_type,
    participation: row.participation_type,
    releasedAt: row.released_at === null ? null : Number(row.released_at),
    participants: participantRows.map(mapParticipant),
    sources: selection.sources.map(stripSourcePolicy),
    primarySourceId: selection.primarySource?.id ?? null,
    playbackSourceId: selection.playbackSource?.id ?? null,
    playable: selection.playable,
    fallbackReason: selection.fallbackReason,
  };
};

const mapSongCore = (
  row: SongRow,
  artistRows: readonly ArtistRow[],
  tagRows: readonly TagRow[] = [],
): PublicCatalogSongCore => ({
  id: row.song_id,
  slug: row.slug,
  title: row.title,
  normalizedTitle: row.normalized_title,
  isOtwOriginal: Boolean(row.is_otw_original),
  originalReleaseDate: row.original_release_date,
  originalReleasePrecision: row.original_release_precision,
  originalArtists: artistRows.map(mapArtist),
  tags: tagRows.map((tag) => tag.display_name),
});

const positionFromCandidate = (
  row: CandidateRow,
  sort: PublicCatalogReaderQuery["sort"],
): PublicCatalogCursorPosition => {
  const common = {
    searchPhase: row.search_phase,
    relevanceRank:
      row.relevance_rank === null ? null : Number(row.relevance_rank),
    songId: row.song_id,
  };
  if (sort === "recent") {
    return {
      ...common,
      sort,
      releasedAt: row.released_at === null ? null : Number(row.released_at),
    };
  }
  if (sort === "title") {
    return { ...common, sort, normalizedTitle: row.normalized_title };
  }
  return {
    ...common,
    sort,
    normalizedParticipant: row.normalized_participant,
  };
};

export class D1PublicCatalogReader implements PublicCatalogReader {
  private readonly db: D1Database;
  private diagnostics: D1PublicCatalogReadDiagnostics = {
    statements: 0,
    bindParameters: 0,
    rowsRead: 0,
    statementRowsRead: [],
    usesOffset: false,
  };

  constructor(db: D1Database) {
    this.db = db;
  }

  getLastReadDiagnostics(): Readonly<D1PublicCatalogReadDiagnostics> {
    return { ...this.diagnostics };
  }

  async readMeta(): Promise<PublicCatalogMeta> {
    this.resetDiagnostics();
    const rows = await this.all<{
      revision: number;
      read_model_revision: number | null;
      public_read_enabled: number;
      navigation_visible: number;
      updated_at: number;
    }>(`
      SELECT catalog.revision,
             read_model.revision AS read_model_revision,
             catalog.public_read_enabled,
             catalog.navigation_visible,
             catalog.updated_at
      FROM music_catalog_meta AS catalog
      LEFT JOIN music_public_read_model_meta AS read_model
        ON read_model.id = catalog.id
      WHERE catalog.id = 1`);
    const row = rows[0];
    if (!row) throw new Error("OTW Play catalog metadata is unavailable");
    return {
      revision: Number(row.revision),
      readModelRevision:
        row.read_model_revision === null
          ? null
          : Number(row.read_model_revision),
      publicReadEnabled: Boolean(row.public_read_enabled),
      navigationVisible: Boolean(row.navigation_visible),
      updatedAt: Number(row.updated_at),
    };
  }

  async readCatalog(
    query: PublicCatalogReaderQuery,
  ): Promise<PublicCatalogReaderPage> {
    this.resetDiagnostics();
    const desired = query.limit + 1;
    const candidates: CandidateRow[] = [];

    if (query.normalizedQuery === null && query.sort === "participant") {
      candidates.push(...(await this.readParticipantCandidates(query, desired)));
    } else if (query.normalizedQuery === null) {
      candidates.push(
        ...(await this.readCandidates(query, null, desired)),
      );
    } else if (query.cursor?.searchPhase === "contains") {
      if (Array.from(query.normalizedQuery).length >= 2) {
        const plan = await this.readContainsPlan(query.normalizedQuery);
        if (plan) {
          candidates.push(
            ...(await this.readCandidates(query, "contains", desired, plan)),
          );
        }
      }
    } else {
      candidates.push(
        ...(await this.readCandidates(query, "indexed", desired)),
      );
      if (
        candidates.length < desired &&
        Array.from(query.normalizedQuery).length >= 2
      ) {
        const containsQuery =
          query.cursor?.searchPhase === "indexed"
            ? { ...query, cursor: null }
            : query;
        const plan = await this.readContainsPlan(query.normalizedQuery);
        if (plan) {
          candidates.push(
            ...(await this.readCandidates(
              containsQuery,
              "contains",
              desired - candidates.length,
              plan,
            )),
          );
        }
      }
    }

    const visible = candidates.slice(0, query.limit);
    const items = await this.hydrateCatalogRows(visible);
    return {
      items,
      nextPosition:
        candidates.length > query.limit && visible.length > 0
          ? positionFromCandidate(visible[visible.length - 1], query.sort)
          : null,
    };
  }

  async readFacets(): Promise<PublicCatalogFacets> {
    this.resetDiagnostics();
    const [memberRows, entityGroupRows, unitGroupRows, artistRows] =
      await this.batchAll([
        {
          sql: `
            SELECT DISTINCT
              member.uid AS member_uid,
              entity.id AS entity_id,
              member.code,
              member.name,
              member.oshi_mark,
              member.unit_name
            FROM music_performance_participants AS participant
            JOIN music_performances AS performance
              ON performance.id = participant.performance_id
            JOIN music_songs AS song ON song.id = performance.song_id
            JOIN music_entities AS entity ON entity.id = participant.entity_id
            JOIN members AS member ON member.uid = entity.member_uid
            WHERE ${PUBLIC_PERFORMANCE_PREDICATE}
              AND ${PUBLIC_SONG_PREDICATE}
              AND (member.is_deprecated IS NULL OR member.is_deprecated = 0)
            ORDER BY member.name, member.uid`,
          binds: [],
        },
        {
          sql: `
            SELECT DISTINCT entity.id, entity.slug, entity.display_name
            FROM music_performance_participants AS participant
            JOIN music_performances AS performance
              ON performance.id = participant.performance_id
            JOIN music_songs AS song ON song.id = performance.song_id
            JOIN music_entities AS entity ON entity.id = participant.entity_id
            WHERE ${PUBLIC_PERFORMANCE_PREDICATE}
              AND ${PUBLIC_SONG_PREDICATE}
              AND entity.entity_kind = 'group'
              AND entity.archived_at IS NULL
            ORDER BY entity.display_name, entity.id`,
          binds: [],
        },
        {
          sql: `
            SELECT DISTINCT member.unit_name
            FROM music_performance_participants AS participant
            JOIN music_performances AS performance
              ON performance.id = participant.performance_id
            JOIN music_songs AS song ON song.id = performance.song_id
            JOIN music_entities AS entity ON entity.id = participant.entity_id
            JOIN members AS member ON member.uid = entity.member_uid
            WHERE ${PUBLIC_PERFORMANCE_PREDICATE}
              AND ${PUBLIC_SONG_PREDICATE}
              AND member.unit_name IS NOT NULL
              AND length(trim(member.unit_name)) > 0
              AND (member.is_deprecated IS NULL OR member.is_deprecated = 0)
            ORDER BY member.unit_name`,
          binds: [],
        },
        {
          sql: `
            SELECT DISTINCT
              entity.id, entity.slug, entity.display_name, entity.entity_kind
            FROM music_song_original_artists AS original_artist
            JOIN music_entities AS entity ON entity.id = original_artist.entity_id
            JOIN music_songs AS song ON song.id = original_artist.song_id
            WHERE ${PUBLIC_SONG_PREDICATE}
              AND entity.archived_at IS NULL
              AND EXISTS (
                SELECT 1
                FROM music_performances AS performance
                WHERE performance.song_id = song.id
                  AND ${PUBLIC_PERFORMANCE_PREDICATE}
              )
            ORDER BY entity.display_name, entity.id`,
          binds: [],
        },
      ]);

    const groups = [
      ...(entityGroupRows as Array<{
        id: string;
        slug: string;
        display_name: string;
      }>).map((row) => ({
        key: encodePublicCatalogGroupKey({ entityId: row.id, unitName: null }),
        kind: "entity" as const,
        displayName: row.display_name,
      })),
      ...(unitGroupRows as Array<{ unit_name: string }>).map((row) => ({
        key: encodePublicCatalogGroupKey({
          entityId: null,
          unitName: row.unit_name,
        }),
        kind: "unit" as const,
        displayName: row.unit_name,
      })),
    ].sort(
      (left, right) =>
        left.displayName.localeCompare(right.displayName) ||
        left.key.localeCompare(right.key),
    );

    return {
      members: (memberRows as Array<{
        member_uid: number;
        entity_id: string;
        code: string;
        name: string;
        oshi_mark: string | null;
        unit_name: string | null;
      }>).map((row) => ({
        memberUid: Number(row.member_uid),
        entityId: row.entity_id,
        code: row.code,
        name: row.name,
        oshiMark: row.oshi_mark,
        unitName: row.unit_name,
      })),
      groups,
      originalArtists: (artistRows as Array<{
        id: string;
        slug: string;
        display_name: string;
        entity_kind: PublicCatalogEntity["entityKind"];
      }>).map((row) => ({
        id: row.id,
        slug: row.slug,
        displayName: row.display_name,
        entityKind: row.entity_kind,
      })),
    };
  }

  async readSongBySlug(slug: string): Promise<PublicCatalogSongDetail | null> {
    this.resetDiagnostics();
    const songRows = await this.all<SongRow>(
      `
        SELECT
          song.id AS song_id,
          song.slug,
          song.title,
          song.normalized_title,
          song.is_otw_original,
          song.original_release_date,
          song.original_release_precision
        FROM music_songs AS song
        WHERE song.slug = ?
          AND ${PUBLIC_SONG_PREDICATE}
          AND EXISTS (
            SELECT 1
            FROM music_performances AS performance
            WHERE performance.song_id = song.id
              AND ${PUBLIC_PERFORMANCE_PREDICATE}
          )`,
      [slug],
    );
    const song = songRows[0];
    if (!song) return null;

    const [artistRows, tagRows, performanceRows, participantRows, sourceRows] =
      await this.batchAll([
        artistQueryForSongIds([song.song_id]),
        tagQueryForSongIds([song.song_id]),
        {
          sql: `
            SELECT
              performance.id AS performance_id,
              performance.relation_type,
              performance.release_type,
              performance.participation_type,
              performance.released_at
            FROM music_performances AS performance
            WHERE performance.song_id = ?
              AND ${PUBLIC_PERFORMANCE_PREDICATE}
            ORDER BY ${PUBLIC_PERFORMANCE_ORDER}`,
          binds: [song.song_id],
        },
        {
          sql: `
            ${participantQueryForPerformanceIds([song.song_id]).sql.replace(
              /WHERE participant\.performance_id IN \(\?\)/,
              `JOIN music_performances AS public_performance
                 ON public_performance.id = participant.performance_id
               WHERE public_performance.song_id = ?
                 AND public_performance.publication_status = 'published'
                 AND public_performance.release_type IN ('official_mv', 'official_video')`,
            )}`,
          binds: [song.song_id],
        },
        {
          sql: `
            ${sourceQueryForPerformanceIds([song.song_id]).sql.replace(
              /WHERE performance_source\.performance_id IN \(\?\)/,
              `JOIN music_performances AS public_performance
                 ON public_performance.id = performance_source.performance_id
               WHERE public_performance.song_id = ?
                 AND public_performance.publication_status = 'published'
                 AND public_performance.release_type IN ('official_mv', 'official_video')`,
            )}`,
          binds: [song.song_id],
        },
      ]);
    const participantsByPerformance = groupBy(
      participantRows as ParticipantRow[],
      (row) => row.performance_id,
    );
    const sourcesByPerformance = groupBy(
      sourceRows as SourceRow[],
      (row) => row.performance_id,
    );
    return {
      ...mapSongCore(song, artistRows as ArtistRow[], tagRows as TagRow[]),
      performances: (performanceRows as PerformanceRow[]).map((performance) =>
        mapPerformance(
          performance,
          participantsByPerformance.get(performance.performance_id) ?? [],
          sourcesByPerformance.get(performance.performance_id) ?? [],
        ),
      ),
    };
  }

  async readPerformanceById(
    performanceId: string,
  ): Promise<PublicCatalogPerformanceDetail | null> {
    this.resetDiagnostics();
    const rows = await this.all<SongRow & PerformanceRow>(
      `
        SELECT
          song.id AS song_id,
          song.slug,
          song.title,
          song.normalized_title,
          song.is_otw_original,
          song.original_release_date,
          song.original_release_precision,
          performance.id AS performance_id,
          performance.relation_type,
          performance.release_type,
          performance.participation_type,
          performance.released_at
        FROM music_performances AS performance
        JOIN music_songs AS song ON song.id = performance.song_id
        WHERE performance.id = ?
          AND ${PUBLIC_PERFORMANCE_PREDICATE}
          AND ${PUBLIC_SONG_PREDICATE}`,
      [performanceId],
    );
    const row = rows[0];
    if (!row) return null;

    const [artistRows, tagRows, participantRows, sourceRows] = await this.batchAll([
      artistQueryForSongIds([row.song_id]),
      tagQueryForSongIds([row.song_id]),
      participantQueryForPerformanceIds([performanceId]),
      sourceQueryForPerformanceIds([performanceId]),
    ]);
    return {
      song: mapSongCore(row, artistRows as ArtistRow[], tagRows as TagRow[]),
      performance: mapPerformance(
        row,
        participantRows as ParticipantRow[],
        sourceRows as SourceRow[],
      ),
    };
  }

  private async readCandidates(
    query: PublicCatalogReaderQuery,
    phase: PublicCatalogSearchPhase,
    limit: number,
    containsPlan: ContainsSearchPlan | null = null,
  ) {
    if (
      phase === "contains" &&
      query.sort === "participant" &&
      containsPlan !== null &&
      containsPlan.songCount > CONTAINS_DENSE_SONG_THRESHOLD
    ) {
      return this.readDenseContainsParticipantCandidates(
        query,
        containsPlan,
        limit,
      );
    }
    const candidateQuery = buildD1PublicCatalogCandidateQuery(
      query,
      phase,
      limit,
      containsPlan,
    );
    const rows = await this.all<Omit<CandidateRow, "search_phase">>(
      candidateQuery.sql,
      candidateQuery.binds,
    );
    return rows.map((row) => ({ ...row, search_phase: phase }));
  }

  private async readDenseContainsParticipantCandidates(
    query: PublicCatalogReaderQuery,
    plan: ContainsSearchPlan,
    limit: number,
  ) {
    const rows: CandidateRow[] = [];
    const cursor =
      query.cursor?.sort === "participant" &&
      query.cursor.searchPhase === "contains"
        ? query.cursor
        : null;

    if (cursor?.normalizedParticipant !== null) {
      const namedQuery = buildD1DenseContainsParticipantCandidateQuery(
        query,
        plan,
        "named",
        limit,
      );
      const namedRows = await this.all<Omit<CandidateRow, "search_phase">>(
        namedQuery.sql,
        namedQuery.binds,
      );
      rows.push(
        ...namedRows.map((row) => ({ ...row, search_phase: "contains" as const })),
      );
    }

    if (rows.length < limit) {
      const missingQuery = buildD1DenseContainsParticipantCandidateQuery(
        query,
        plan,
        "missing",
        limit - rows.length,
      );
      const missingRows = await this.all<Omit<CandidateRow, "search_phase">>(
        missingQuery.sql,
        missingQuery.binds,
      );
      rows.push(
        ...missingRows.map((row) => ({
          ...row,
          search_phase: "contains" as const,
        })),
      );
    }

    return rows;
  }

  private async readContainsPlan(
    normalizedQuery: string,
  ): Promise<ContainsSearchPlan | null> {
    const query = containsPlanQuery(normalizedQuery);
    const rows = await this.all<{
      gram_size: number;
      normalized_gram: string;
      song_count: number;
    }>(query.sql, query.binds);
    const row = rows[0];
    if (!row) return null;
    const gramSize = Number(row.gram_size);
    const songCount = Number(row.song_count);
    if (
      (gramSize !== 2 && gramSize !== 3) ||
      typeof row.normalized_gram !== "string" ||
      Array.from(row.normalized_gram).length !== gramSize ||
      !Number.isSafeInteger(songCount) ||
      songCount <= 0
    ) {
      throw new Error("Invalid OTW Play contains search plan");
    }
    return {
      gramSize,
      normalizedGram: row.normalized_gram,
      songCount,
    };
  }

  private async readParticipantCandidates(
    query: PublicCatalogReaderQuery,
    limit: number,
  ) {
    const rows: CandidateRow[] = [];
    const cursor =
      query.cursor?.sort === "participant" &&
      query.cursor.searchPhase === null
        ? query.cursor
        : null;

    if (cursor?.normalizedParticipant !== null) {
      const namedQuery = buildD1ParticipantBrowseCandidateQuery(
        query,
        "named",
        limit,
      );
      const namedRows = await this.all<Omit<CandidateRow, "search_phase">>(
        namedQuery.sql,
        namedQuery.binds,
      );
      rows.push(...namedRows.map((row) => ({ ...row, search_phase: null })));
    }

    if (rows.length < limit) {
      const missingQuery = buildD1ParticipantBrowseCandidateQuery(
        query,
        "missing",
        limit - rows.length,
      );
      const missingRows = await this.all<Omit<CandidateRow, "search_phase">>(
        missingQuery.sql,
        missingQuery.binds,
      );
      rows.push(
        ...missingRows.map((row) => ({ ...row, search_phase: null })),
      );
    }

    return rows;
  }

  private async hydrateCatalogRows(
    rows: readonly CandidateRow[],
  ): Promise<PublicCatalogSongSummary[]> {
    if (rows.length === 0) return [];
    const hydrationQuery = catalogHydrationQuery(rows);
    const hydrationRows = await this.all<CatalogHydrationRow>(
      hydrationQuery.sql,
      hydrationQuery.binds,
    );
    const hydrationByPerformance = new Map(
      hydrationRows.map((row) => [row.performance_id, row] as const),
    );
    return rows.map((row) => ({
      ...mapSongCore(
        row,
        parseHydrationRows<ArtistRow>(
          hydrationByPerformance.get(row.performance_id)?.artists_json ??
            "[]",
          "artist",
        ),
        parseHydrationRows<TagRow>(
          hydrationByPerformance.get(row.performance_id)?.tags_json ?? "[]",
          "tag",
        ),
      ),
      publishedPerformanceCount: Number(row.published_performance_count),
      representativePerformance: mapPerformance(
        row,
        parseHydrationRows<ParticipantRow>(
          hydrationByPerformance.get(row.performance_id)?.participants_json ??
            "[]",
          "participant",
        ),
        parseHydrationRows<SourceRow>(
          hydrationByPerformance.get(row.performance_id)?.sources_json ?? "[]",
          "source",
        ),
      ),
    }));
  }

  private resetDiagnostics() {
    this.diagnostics = {
      statements: 0,
      bindParameters: 0,
      rowsRead: 0,
      statementRowsRead: [],
      usesOffset: false,
    };
  }

  private prepared(sql: string, binds: readonly SqlBind[]) {
    this.diagnostics.statements += 1;
    this.diagnostics.bindParameters = Math.max(
      this.diagnostics.bindParameters,
      binds.length,
    );
    this.diagnostics.usesOffset ||= /\boffset\b/i.test(sql);
    this.diagnostics.statementRowsRead = [
      ...this.diagnostics.statementRowsRead,
      0,
    ];
    const statement = this.db.prepare(sql);
    return binds.length > 0 ? statement.bind(...binds) : statement;
  }

  private recordResult(result: D1Result<unknown>, statementIndex: number) {
    const meta = result.meta as { rows_read?: number } | undefined;
    const rowsRead = Number(meta?.rows_read ?? 0);
    this.diagnostics.rowsRead += rowsRead;
    const statementRowsRead = [...this.diagnostics.statementRowsRead];
    statementRowsRead[statementIndex] = rowsRead;
    this.diagnostics.statementRowsRead = statementRowsRead;
  }

  private async all<Row extends Record<string, unknown>>(
    sql: string,
    binds: readonly SqlBind[] = [],
  ): Promise<Row[]> {
    const result = await this.prepared(sql, binds).all<Row>();
    this.recordResult(result, this.diagnostics.statements - 1);
    return result.results;
  }

  private async batchAll(queries: readonly BatchQuery[]) {
    const statementStart = this.diagnostics.statements;
    const results = await this.db.batch(
      queries.map(({ sql, binds }) => this.prepared(sql, binds)),
    );
    for (const [index, result] of results.entries()) {
      this.recordResult(result, statementStart + index);
    }
    return results.map((result) => result.results ?? []);
  }
}
