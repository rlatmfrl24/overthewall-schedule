import type {
  OtwPlayAdminCatalogDto,
  OtwPlayAdminCatalogEntryPreflightDto,
  OtwPlayAdminCatalogSubjectInput,
  OtwPlayAdminChannelDto,
  OtwPlayAdminCommandResponse,
  OtwPlayAdminCreateChannelRequest,
  OtwPlayAdminCreateEntityRequest,
  OtwPlayAdminCreateSongRequest,
  OtwPlayAdminPerformanceDto,
  OtwPlayAdminProposalDto,
  OtwPlayAdminRejectProposalRequest,
  OtwPlayAdminSongDto,
  OtwPlayAdminUpdateChannelRequest,
  OtwPlayAdminUpdateEntityRequest,
} from "@contracts/otw-play";
import {
  createPerformanceDedupeKeyMaterial,
  createSongDedupeKeyMaterial,
  createVideoBackedSongDedupeKeyMaterial,
} from "../domain/duplicate-policy";
import { normalizeOtwPlaySearchText } from "../domain/search-normalization";
import {
  AdminCatalogRepositoryError,
  type AdminCatalogActor,
  type AdminCatalogRepository,
  type AdminApproveProposalCommand,
  type AdminCreateCatalogEntryCommand,
  type AdminCreatePerformanceCommand,
  type AdminUpdateSongCommand,
  type AdminUpdatePerformanceCommand,
} from "../application/ports/admin-catalog-repository";

type SqlValue = string | number | null;

type CatalogMetaRow = { revision: number; read_model_revision: number };
type EntityRow = {
  id: string;
  member_uid: number | null;
  entity_kind: "person" | "group" | "organization";
  display_name: string;
  normalized_name: string;
  slug: string;
  archived_at: number | null;
  version: number;
};
type SongRow = {
  id: string;
  slug: string;
  title: string;
  normalized_title: string;
  is_otw_original: number;
  original_release_date: string | null;
  original_release_precision: "year" | "month" | "day" | "unknown";
  archived_at: number | null;
  version: number;
};
type AliasRow = {
  song_id: string;
  alias: string;
  normalized_alias: string;
  locale: string | null;
  alias_kind: string | null;
};
type TagRow = { song_id: string; tag_key: string; display_name: string };
type ArtistRow = {
  song_id: string;
  entity_id: string;
  display_name: string;
  credit_order: number;
  is_primary: number;
};
type ChannelRow = {
  id: string;
  provider: "youtube";
  external_channel_id: string;
  display_name: string;
  channel_role: OtwPlayAdminChannelDto["channelRole"];
  verification_status: OtwPlayAdminChannelDto["verificationStatus"];
  active: number;
  version: number;
};
type ChannelEntityRow = { channel_id: string; entity_id: string };
type PerformanceRow = {
  id: string;
  song_id: string;
  relation_type: OtwPlayAdminPerformanceDto["relationType"];
  release_type: OtwPlayAdminPerformanceDto["releaseType"];
  participation_type: OtwPlayAdminPerformanceDto["participationType"];
  publication_status: OtwPlayAdminPerformanceDto["publicationStatus"];
  quality_status: OtwPlayAdminPerformanceDto["qualityStatus"];
  released_at: number | null;
  internal_note: string | null;
  version: number;
};
type ParticipantRow = {
  performance_id: string;
  entity_id: string;
  display_name: string;
  participant_role: OtwPlayAdminPerformanceDto["participants"][number]["participantRole"];
  credit_order: number;
  credit_name_snapshot: string;
};
type SourceRow = {
  performance_id: string;
  source_id: string;
  provider: "youtube";
  external_id: string;
  channel_id: string;
  title: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  provider_published_at: number | null;
  availability_status: OtwPlayAdminPerformanceDto["sources"][number]["source"]["availabilityStatus"];
  last_checked_at: number | null;
  version: number;
  start_seconds: number;
  end_seconds: number | null;
  source_role: OtwPlayAdminPerformanceDto["sources"][number]["sourceRole"];
  priority: number;
  is_primary: number;
};

const resultsOf = <T>(result: D1Result<T>): T[] =>
  Array.isArray(result.results) ? result.results : [];

const group = <T>(rows: readonly T[], key: (row: T) => string) => {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    map.set(id, [...(map.get(id) ?? []), row]);
  }
  return map;
};

const eventJson = (value: Record<string, unknown> | null) =>
  value === null ? null : JSON.stringify(value);

const subjectKey = (subject: OtwPlayAdminCatalogSubjectInput) =>
  subject.kind === "member"
    ? `member:${subject.memberUid}`
    : subject.kind === "new_external"
      ? `external:${subject.clientKey}`
      : null;

const generatedSlug = (displayName: string, id: string) => {
  const base = normalizeOtwPlaySearchText(displayName)
    .replace(/\s+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  return `${base || "identity"}-${id.replace(/[^A-Za-z0-9]/gu, "").slice(0, 8).toLowerCase()}`;
};

const normalizedSongTags = (tags: readonly string[] | undefined) =>
  (tags ?? []).map((displayName) => ({
    displayName: displayName.trim(),
    tagKey: normalizeOtwPlaySearchText(displayName),
  }));

const songTagStatements = (
  database: D1Database,
  songId: string,
  tags: readonly string[] | undefined,
) =>
  normalizedSongTags(tags).map(({ displayName, tagKey }) =>
    database
      .prepare(
        "INSERT INTO music_song_tags (song_id, tag_key, display_name) VALUES (?, ?, ?)",
      )
      .bind(songId, tagKey, displayName),
  );

const projectionStatements = (
  database: D1Database,
  songId: string,
): D1PreparedStatement[] => [
  database
    .prepare("DELETE FROM music_search_terms WHERE song_id = ?")
    .bind(songId),
  database
    .prepare(
      `
    INSERT OR IGNORE INTO music_search_terms (
      song_id, term_kind, display_value, normalized_term
    )
    SELECT id, 'title', title, normalized_title
      FROM music_songs WHERE id = ?
    UNION ALL
    SELECT song_id, 'title_alias', alias, normalized_alias
      FROM music_song_aliases WHERE song_id = ?
    UNION ALL
    SELECT artist.song_id, 'original_artist', entity.display_name, entity.normalized_name
      FROM music_song_original_artists AS artist
      JOIN music_entities AS entity ON entity.id = artist.entity_id
      WHERE artist.song_id = ?
    UNION ALL
    SELECT performance.song_id, 'participant', participant.credit_name_snapshot,
           entity.normalized_name
      FROM music_performances AS performance
      JOIN music_performance_participants AS participant
        ON participant.performance_id = performance.id
      JOIN music_entities AS entity ON entity.id = participant.entity_id
      WHERE performance.song_id = ?
  `,
    )
    .bind(songId, songId, songId, songId),
  database
    .prepare("DELETE FROM music_search_grams WHERE song_id = ?")
    .bind(songId),
  database
    .prepare(
      `
    INSERT OR IGNORE INTO music_search_grams (
      song_id, gram_size, normalized_gram
    )
    WITH RECURSIVE source_terms(song_id, normalized_term) AS (
      SELECT song_id, normalized_term
      FROM music_search_terms
      WHERE song_id = ? AND length(normalized_term) >= 2
    ), positions(song_id, normalized_term, position) AS (
      SELECT song_id, normalized_term, 1 FROM source_terms
      UNION ALL
      SELECT song_id, normalized_term, position + 1
      FROM positions
      WHERE position + 1 <= length(normalized_term)
    )
    SELECT song_id, 2, substr(normalized_term, position, 2)
    FROM positions WHERE position + 1 <= length(normalized_term)
    UNION
    SELECT song_id, 3, substr(normalized_term, position, 3)
    FROM positions WHERE position + 2 <= length(normalized_term)
  `,
    )
    .bind(songId),
  database.prepare("DELETE FROM music_search_gram_stats"),
  database.prepare(`
    INSERT INTO music_search_gram_stats (gram_size, normalized_gram, song_count)
    SELECT gram_size, normalized_gram, COUNT(*)
    FROM music_search_grams
    GROUP BY gram_size, normalized_gram
  `),
  database
    .prepare("DELETE FROM music_public_performance_sort_keys WHERE song_id = ?")
    .bind(songId),
  database
    .prepare(
      `
    INSERT INTO music_public_performance_sort_keys (
      performance_id, song_id, representative_participant_entity_id,
      normalized_participant
    )
    SELECT performance.id, performance.song_id,
      (
        SELECT participant.entity_id
        FROM music_performance_participants AS participant
        WHERE participant.performance_id = performance.id
        ORDER BY participant.credit_order ASC, participant.entity_id ASC
        LIMIT 1
      ),
      (
        SELECT entity.normalized_name
        FROM music_performance_participants AS participant
        JOIN music_entities AS entity ON entity.id = participant.entity_id
        WHERE participant.performance_id = performance.id
        ORDER BY participant.credit_order ASC, participant.entity_id ASC
        LIMIT 1
      )
    FROM music_performances AS performance
    WHERE performance.song_id = ?
  `,
    )
    .bind(songId),
];

const appendRevisionStatements = (
  database: D1Database,
  expectedRevision: number,
  now: number,
) => [
  database
    .prepare(
      `
    UPDATE music_catalog_meta
    SET revision = revision + 1, updated_at = ?
    WHERE id = 1 AND revision = ?
  `,
    )
    .bind(now, expectedRevision),
  database.prepare(`
    UPDATE music_catalog_meta
    SET id = CASE WHEN changes() = 1 THEN 1 ELSE 2 END
    WHERE id = 1
  `),
  database
    .prepare(
      `
    UPDATE music_public_read_model_meta
    SET revision = ?, updated_at = ?
    WHERE id = 1 AND revision = ?
  `,
    )
    .bind(expectedRevision + 1, now, expectedRevision),
  versionGuard(database),
];

const versionGuard = (database: D1Database) =>
  database.prepare(`
    UPDATE music_catalog_meta
    SET id = CASE WHEN changes() = 1 THEN 1 ELSE 2 END
    WHERE id = 1
  `);

export class D1AdminCatalogRepository implements AdminCatalogRepository {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  private async readRevision() {
    const row = await this.database
      .prepare(
        `
      SELECT catalog.revision,
             read_model.revision AS read_model_revision
      FROM music_catalog_meta AS catalog
      JOIN music_public_read_model_meta AS read_model ON read_model.id = catalog.id
      WHERE catalog.id = 1
    `,
      )
      .first<CatalogMetaRow>();
    if (!row)
      throw new AdminCatalogRepositoryError(
        "not_found",
        "Catalog meta missing",
      );
    if (Number(row.revision) !== Number(row.read_model_revision)) {
      throw new AdminCatalogRepositoryError(
        "unavailable",
        "Catalog read model must be repaired before another catalog command",
      );
    }
    return row;
  }

  async readCatalog(): Promise<OtwPlayAdminCatalogDto> {
    const [
      metaResult,
      entitiesResult,
      songsResult,
      aliasesResult,
      tagsResult,
      artistsResult,
      channelsResult,
      channelEntitiesResult,
      performancesResult,
      participantsResult,
      sourcesResult,
    ] = await this.database.batch([
      this.database
        .prepare(`SELECT catalog.revision, read_model.revision AS read_model_revision
        FROM music_catalog_meta AS catalog JOIN music_public_read_model_meta AS read_model
          ON read_model.id = catalog.id WHERE catalog.id = 1`),
      this.database.prepare(`SELECT id, member_uid, entity_kind, display_name,
        normalized_name, slug, archived_at, version FROM music_entities
        ORDER BY normalized_name, id`),
      this.database
        .prepare(`SELECT id, slug, title, normalized_title, is_otw_original,
        original_release_date, original_release_precision, archived_at, version
        FROM music_songs ORDER BY normalized_title, id`),
      this.database
        .prepare(`SELECT song_id, alias, normalized_alias, locale, alias_kind
        FROM music_song_aliases ORDER BY song_id, normalized_alias`),
      this.database.prepare(`SELECT song_id, tag_key, display_name
        FROM music_song_tags ORDER BY song_id, tag_key`),
      this.database
        .prepare(`SELECT artist.song_id, artist.entity_id, entity.display_name,
        artist.credit_order, artist.is_primary
        FROM music_song_original_artists AS artist
        JOIN music_entities AS entity ON entity.id = artist.entity_id
        ORDER BY artist.song_id, artist.credit_order, artist.entity_id`),
      this.database
        .prepare(`SELECT id, provider, external_channel_id, display_name,
        channel_role, verification_status, active, version
        FROM music_channels ORDER BY display_name, id`),
      this.database
        .prepare(`SELECT channel_id, entity_id FROM music_channel_entities
        ORDER BY channel_id, entity_id`),
      this.database.prepare(`SELECT id, song_id, relation_type, release_type,
        participation_type, publication_status, quality_status, released_at,
        internal_note, version FROM music_performances ORDER BY created_at DESC, id`),
      this.database
        .prepare(`SELECT participant.performance_id, participant.entity_id,
        entity.display_name, participant.participant_role, participant.credit_order,
        participant.credit_name_snapshot
        FROM music_performance_participants AS participant
        JOIN music_entities AS entity ON entity.id = participant.entity_id
        ORDER BY participant.performance_id, participant.credit_order, participant.entity_id`),
      this.database.prepare(`SELECT link.performance_id, source.id AS source_id,
        source.provider, source.external_id, source.channel_id, source.title,
        source.thumbnail_url, source.duration_seconds, source.provider_published_at,
        source.availability_status, source.last_checked_at, source.version,
        link.start_seconds, link.end_seconds, link.source_role, link.priority,
        link.is_primary
        FROM music_performance_sources AS link
        JOIN music_media_sources AS source ON source.id = link.source_id
        ORDER BY link.performance_id, link.priority, source.id`),
    ]);

    const meta = resultsOf(metaResult as D1Result<CatalogMetaRow>)[0];
    if (!meta)
      throw new AdminCatalogRepositoryError(
        "not_found",
        "Catalog meta missing",
      );
    const aliases = group(
      resultsOf(aliasesResult as D1Result<AliasRow>),
      (row) => row.song_id,
    );
    const tags = group(
      resultsOf(tagsResult as D1Result<TagRow>),
      (row) => row.song_id,
    );
    const artists = group(
      resultsOf(artistsResult as D1Result<ArtistRow>),
      (row) => row.song_id,
    );
    const channelEntities = group(
      resultsOf(channelEntitiesResult as D1Result<ChannelEntityRow>),
      (row) => row.channel_id,
    );
    const participants = group(
      resultsOf(participantsResult as D1Result<ParticipantRow>),
      (row) => row.performance_id,
    );
    const sources = group(
      resultsOf(sourcesResult as D1Result<SourceRow>),
      (row) => row.performance_id,
    );

    return {
      revision: Number(meta.revision),
      readModelRevision: Number(meta.read_model_revision),
      entities: resultsOf(entitiesResult as D1Result<EntityRow>).map((row) => ({
        id: row.id,
        memberUid: row.member_uid,
        entityKind: row.entity_kind,
        displayName: row.display_name,
        normalizedName: row.normalized_name,
        slug: row.slug,
        archivedAt: row.archived_at,
        version: Number(row.version),
      })),
      songs: resultsOf(songsResult as D1Result<SongRow>).map((row) => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        normalizedTitle: row.normalized_title,
        isOtwOriginal: Boolean(row.is_otw_original),
        originalReleaseDate: row.original_release_date,
        originalReleasePrecision: row.original_release_precision,
        archivedAt: row.archived_at,
        version: Number(row.version),
        tags: (tags.get(row.id) ?? []).map((tag) => tag.display_name),
        aliases: (aliases.get(row.id) ?? []).map((alias) => ({
          alias: alias.alias,
          normalizedAlias: alias.normalized_alias,
          locale: alias.locale,
          aliasKind: alias.alias_kind,
        })),
        originalArtists: (artists.get(row.id) ?? []).map((artist) => ({
          entityId: artist.entity_id,
          displayName: artist.display_name,
          creditOrder: Number(artist.credit_order),
          isPrimary: Boolean(artist.is_primary),
        })),
      })),
      channels: resultsOf(channelsResult as D1Result<ChannelRow>).map(
        (row) => ({
          id: row.id,
          provider: row.provider,
          externalChannelId: row.external_channel_id,
          displayName: row.display_name,
          channelRole: row.channel_role,
          verificationStatus: row.verification_status,
          active: Boolean(row.active),
          entityIds: (channelEntities.get(row.id) ?? []).map(
            (item) => item.entity_id,
          ),
          version: Number(row.version),
        }),
      ),
      performances: resultsOf(
        performancesResult as D1Result<PerformanceRow>,
      ).map((row) => ({
        id: row.id,
        songId: row.song_id,
        relationType: row.relation_type,
        releaseType: row.release_type,
        participationType: row.participation_type,
        publicationStatus: row.publication_status,
        qualityStatus: row.quality_status,
        releasedAt: row.released_at,
        internalNote: row.internal_note,
        version: Number(row.version),
        participants: (participants.get(row.id) ?? []).map((participant) => ({
          entityId: participant.entity_id,
          displayName: participant.display_name,
          participantRole: participant.participant_role,
          creditOrder: Number(participant.credit_order),
          creditNameSnapshot: participant.credit_name_snapshot,
        })),
        sources: (sources.get(row.id) ?? []).map((source) => ({
          source: {
            id: source.source_id,
            provider: source.provider,
            externalId: source.external_id,
            channelId: source.channel_id,
            title: source.title,
            thumbnailUrl: source.thumbnail_url,
            durationSeconds: source.duration_seconds,
            providerPublishedAt: source.provider_published_at,
            availabilityStatus: source.availability_status,
            lastCheckedAt: source.last_checked_at,
            version: Number(source.version),
          },
          startSeconds: Number(source.start_seconds),
          endSeconds: source.end_seconds,
          sourceRole: source.source_role,
          priority: Number(source.priority),
          isPrimary: Boolean(source.is_primary),
        })),
      })),
    };
  }

  async preflightCatalogEntry(
    video: AdminCreateCatalogEntryCommand["video"],
    startSeconds: number,
  ): Promise<OtwPlayAdminCatalogEntryPreflightDto> {
    const meta = await this.readRevision();
    const [channel, member, duplicate] = await Promise.all([
      this.database
        .prepare(
          `SELECT id, channel_role, verification_status, active
          FROM music_channels
          WHERE provider = 'youtube' AND external_channel_id = ?`,
        )
        .bind(video.channelId)
        .first<{
          id: string;
          channel_role: OtwPlayAdminChannelDto["channelRole"];
          verification_status: OtwPlayAdminChannelDto["verificationStatus"];
          active: number;
        }>(),
      this.database
        .prepare(
          `SELECT uid, suggested_role FROM (
            SELECT member.uid AS uid, 'member_main' AS suggested_role, 0 AS precedence
            FROM members AS member
            WHERE member.youtube_channel_id = ?
              AND (member.is_deprecated IS NULL OR member.is_deprecated = 0)
            UNION ALL
            SELECT member.uid AS uid, 'member_music' AS suggested_role, 1 AS precedence
            FROM member_links AS link
            JOIN members AS member ON member.uid = link.member_uid
            WHERE link.youtube_channel_id = ? AND link.enabled = 1
              AND link.type IN ('youtube_vod', 'youtube_sub')
              AND (member.is_deprecated IS NULL OR member.is_deprecated = 0)
          ) ORDER BY precedence, uid LIMIT 1`,
        )
        .bind(video.channelId, video.channelId)
        .first<{
          uid: number;
          suggested_role: Extract<
            OtwPlayAdminChannelDto["channelRole"],
            "member_main" | "member_music"
          >;
        }>(),
      this.database
        .prepare(
          `SELECT performance.song_id, link.performance_id
          FROM music_media_sources AS source
          JOIN music_performance_sources AS link ON link.source_id = source.id
          JOIN music_performances AS performance ON performance.id = link.performance_id
          WHERE source.provider = 'youtube' AND source.external_id = ?
            AND link.start_seconds = ?
          LIMIT 1`,
        )
        .bind(video.videoId, startSeconds)
        .first<{ song_id: string; performance_id: string }>(),
    ]);

    const active = Boolean(channel?.active);
    const state: OtwPlayAdminCatalogEntryPreflightDto["channel"]["state"] =
      channel?.verification_status === "revoked"
        ? "revoked"
        : channel?.verification_status === "approved" && active
          ? "approved"
          : channel?.verification_status === "approved"
            ? "inactive"
            : channel
              ? "pending"
              : member
                ? "recognized_member"
                : "unknown";
    return {
      catalogRevision: Number(meta.revision),
      video: {
        videoId: video.videoId,
        title: video.title,
        thumbnailUrl: video.thumbnailUrl,
        durationSeconds: video.durationSeconds,
        publishedAt: video.publishedAt,
        availabilityStatus: video.availabilityStatus,
        channelId: video.channelId,
        channelTitle: video.channelTitle,
      },
      channel: {
        state,
        catalogChannelId: channel?.id ?? null,
        verificationStatus: channel?.verification_status ?? null,
        active,
        channelRole: channel?.channel_role ?? member?.suggested_role ?? null,
        memberUid: member?.uid ?? null,
      },
      duplicate: duplicate
        ? {
            songId: duplicate.song_id,
            performanceId: duplicate.performance_id,
          }
        : null,
    };
  }

  async readProposals(status?: string): Promise<OtwPlayAdminProposalDto[]> {
    const allowed = new Set([
      "pending_review",
      "approved",
      "rejected",
      "withdrawn",
    ]);
    if (status && !allowed.has(status)) {
      throw new AdminCatalogRepositoryError(
        "validation_failed",
        "Invalid proposal status",
      );
    }
    const where = status ? "WHERE proposal.status = ?" : "";
    const statement = this.database.prepare(`SELECT proposal.id,
      proposal.submitted_by_user_id, proposal.submitted_url, proposal.youtube_video_id,
      proposal.segment_start_seconds, proposal.submitted_title, proposal.suggested_song_id,
      proposal.submitted_note, proposal.status, proposal.version,
      proposal.reviewed_by_user_id, proposal.reviewed_at, proposal.review_result_code,
      proposal.review_note, proposal.approved_performance_id, proposal.created_at
      FROM music_cover_proposals AS proposal ${where}
      ORDER BY proposal.created_at ASC, proposal.id ASC`);
    const [proposalResult, participantResult, artistResult] =
      await this.database.batch([
        status ? statement.bind(status) : statement,
        this.database
          .prepare(`SELECT proposal_id, credit_order, resolved_entity_id,
        submitted_name_snapshot, participant_role
        FROM music_cover_proposal_participants ORDER BY proposal_id, credit_order`),
        this.database
          .prepare(`SELECT proposal_id, credit_order, resolved_entity_id,
        submitted_name_snapshot FROM music_cover_proposal_original_artists
        ORDER BY proposal_id, credit_order`),
      ]);
    type ProposalRow = Omit<
      OtwPlayAdminProposalDto,
      "participants" | "originalArtists"
    > & {
      submitted_by_user_id: string;
      submitted_url: string;
      youtube_video_id: string;
      segment_start_seconds: number;
      submitted_title: string;
      suggested_song_id: string | null;
      submitted_note: string | null;
      reviewed_by_user_id: string | null;
      reviewed_at: number | null;
      review_result_code: string | null;
      review_note: string | null;
      approved_performance_id: string | null;
      created_at: number;
    };
    type ProposalParticipantRow = {
      proposal_id: string;
      credit_order: number;
      resolved_entity_id: string | null;
      submitted_name_snapshot: string;
      participant_role: OtwPlayAdminProposalDto["participants"][number]["participantRole"];
    };
    type ProposalArtistRow = Omit<ProposalParticipantRow, "participant_role">;
    const participantMap = group(
      resultsOf(participantResult as D1Result<ProposalParticipantRow>),
      (row) => row.proposal_id,
    );
    const artistMap = group(
      resultsOf(artistResult as D1Result<ProposalArtistRow>),
      (row) => row.proposal_id,
    );
    return resultsOf(proposalResult as D1Result<ProposalRow>).map((row) => ({
      id: row.id,
      submittedByUserId: row.submitted_by_user_id,
      submittedUrl: row.submitted_url,
      youtubeVideoId: row.youtube_video_id,
      segmentStartSeconds: Number(row.segment_start_seconds),
      submittedTitle: row.submitted_title,
      suggestedSongId: row.suggested_song_id,
      submittedNote: row.submitted_note,
      status: row.status,
      version: Number(row.version),
      reviewedByUserId: row.reviewed_by_user_id,
      reviewedAt: row.reviewed_at,
      reviewResultCode: row.review_result_code,
      reviewNote: row.review_note,
      approvedPerformanceId: row.approved_performance_id,
      createdAt: Number(row.created_at),
      participants: (participantMap.get(row.id) ?? []).map((item) => ({
        creditOrder: Number(item.credit_order),
        resolvedEntityId: item.resolved_entity_id,
        submittedNameSnapshot: item.submitted_name_snapshot,
        participantRole: item.participant_role,
      })),
      originalArtists: (artistMap.get(row.id) ?? []).map((item) => ({
        creditOrder: Number(item.credit_order),
        resolvedEntityId: item.resolved_entity_id,
        submittedNameSnapshot: item.submitted_name_snapshot,
      })),
    }));
  }

  private async executeCatalogBatch(
    statements: D1PreparedStatement[],
    expectedRevision: number,
    now: number,
  ) {
    try {
      await this.database.batch([
        ...statements,
        ...appendRevisionStatements(this.database, expectedRevision, now),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/music_catalog_meta_singleton_check/i.test(message)) {
        throw new AdminCatalogRepositoryError(
          "stale_write",
          "Catalog command conflicted with a newer write",
        );
      }
      if (/UNIQUE|constraint/i.test(message)) {
        throw new AdminCatalogRepositoryError(
          "validation_failed",
          "Catalog command violates an identity or relationship constraint",
        );
      }
      throw error;
    }
  }

  private async readSong(id: string) {
    const catalog = await this.readCatalog();
    const song = catalog.songs.find((item) => item.id === id);
    if (!song)
      throw new AdminCatalogRepositoryError("not_found", "Song not found");
    return { data: song, catalogRevision: catalog.revision };
  }

  private async readEntity(id: string) {
    const catalog = await this.readCatalog();
    const entity = catalog.entities.find((item) => item.id === id);
    if (!entity)
      throw new AdminCatalogRepositoryError("not_found", "Entity not found");
    return { data: entity, catalogRevision: catalog.revision };
  }

  private async readPerformance(id: string) {
    const catalog = await this.readCatalog();
    const performance = catalog.performances.find((item) => item.id === id);
    if (!performance)
      throw new AdminCatalogRepositoryError(
        "not_found",
        "Performance not found",
      );
    return { data: performance, catalogRevision: catalog.revision };
  }

  private async readChannel(id: string) {
    const catalog = await this.readCatalog();
    const channel = catalog.channels.find((item) => item.id === id);
    if (!channel)
      throw new AdminCatalogRepositoryError("not_found", "Channel not found");
    return { data: channel, catalogRevision: catalog.revision };
  }

  async createEntity(
    input: OtwPlayAdminCreateEntityRequest,
    actor: AdminCatalogActor,
    ids: { entityId: string; eventId: string },
    now: number,
  ) {
    const meta = await this.readRevision();
    const normalizedName = normalizeOtwPlaySearchText(input.displayName);
    const statements = [
      this.database
        .prepare(
          `INSERT INTO music_entities (
        id, member_uid, entity_kind, display_name, normalized_name, slug,
        version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        )
        .bind(
          ids.entityId,
          input.memberUid ?? null,
          input.entityKind,
          input.displayName.trim(),
          normalizedName,
          input.slug.trim(),
          now,
          now,
        ),
      this.database
        .prepare(
          `INSERT INTO music_catalog_events
        (id, aggregate_type, aggregate_id, event_type, actor_kind, actor_user_id, after_json, created_at)
        VALUES (?, 'entity', ?, 'entity.created', 'admin', ?, ?, ?)`,
        )
        .bind(
          ids.eventId,
          ids.entityId,
          actor.userId,
          eventJson({
            displayName: input.displayName,
            entityKind: input.entityKind,
          }),
          now,
        ),
    ];
    await this.executeCatalogBatch(statements, Number(meta.revision), now);
    return this.readEntity(ids.entityId);
  }

  async updateEntity(
    input: OtwPlayAdminUpdateEntityRequest,
    actor: AdminCatalogActor,
    eventId: string,
    now: number,
  ) {
    const meta = await this.readRevision();
    const affectedRows = await this.database
      .prepare(
        `
      SELECT DISTINCT song_id FROM (
        SELECT song_id FROM music_song_original_artists WHERE entity_id = ?
        UNION ALL
        SELECT performance.song_id
        FROM music_performance_participants AS participant
        JOIN music_performances AS performance ON performance.id = participant.performance_id
        WHERE participant.entity_id = ?
      )
    `,
      )
      .bind(input.id, input.id)
      .all<{ song_id: string }>();
    const affectedSongIds = resultsOf(affectedRows).map((row) => row.song_id);
    const statements: D1PreparedStatement[] = [
      this.database
        .prepare(
          `UPDATE music_entities SET member_uid = ?, entity_kind = ?,
        display_name = ?, normalized_name = ?, slug = ?, archived_at = ?,
        version = version + 1, updated_at = ? WHERE id = ? AND version = ?`,
        )
        .bind(
          input.memberUid ?? null,
          input.entityKind,
          input.displayName.trim(),
          normalizeOtwPlaySearchText(input.displayName),
          input.slug.trim(),
          input.archived ? now : null,
          now,
          input.id,
          input.expectedVersion,
        ),
      versionGuard(this.database),
      ...affectedSongIds.flatMap((songId) =>
        projectionStatements(this.database, songId),
      ),
      this.database
        .prepare(
          `INSERT INTO music_catalog_events
        (id, aggregate_type, aggregate_id, event_type, actor_kind, actor_user_id, after_json, created_at)
        VALUES (?, 'entity', ?, 'entity.updated', 'admin', ?, ?, ?)`,
        )
        .bind(
          eventId,
          input.id,
          actor.userId,
          eventJson({
            displayName: input.displayName,
            archived: input.archived,
          }),
          now,
        ),
    ];
    await this.executeCatalogBatch(statements, Number(meta.revision), now);
    return this.readEntity(input.id);
  }

  async createSong(
    input: OtwPlayAdminCreateSongRequest,
    actor: AdminCatalogActor,
    ids: { songId: string; eventId: string },
    now: number,
  ): Promise<OtwPlayAdminCommandResponse<OtwPlayAdminSongDto>> {
    const meta = await this.readRevision();
    const normalizedTitle = normalizeOtwPlaySearchText(input.title);
    const dedupeKey = createSongDedupeKeyMaterial({
      title: input.title,
      originalArtistIds: input.originalArtists.map((item) => item.entityId),
    });
    const statements: D1PreparedStatement[] = [
      this.database
        .prepare(
          `INSERT INTO music_songs (
        id, slug, title, normalized_title, dedupe_key, is_otw_original,
        original_release_date, original_release_precision, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        )
        .bind(
          ids.songId,
          input.slug.trim(),
          input.title.trim(),
          normalizedTitle,
          dedupeKey,
          input.isOtwOriginal ? 1 : 0,
          input.originalReleaseDate,
          input.originalReleasePrecision,
          now,
          now,
        ),
      ...input.aliases.map((alias) =>
        this.database
          .prepare(
            `INSERT INTO music_song_aliases (
        song_id, alias, normalized_alias, locale, alias_kind
      ) VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(
            ids.songId,
            alias.alias.trim(),
            normalizeOtwPlaySearchText(alias.alias),
            alias.locale?.trim() || null,
            alias.aliasKind?.trim() || null,
          ),
      ),
      ...input.originalArtists.map((artist) =>
        this.database
          .prepare(
            `INSERT INTO music_song_original_artists (
        song_id, entity_id, credit_order, is_primary
      ) VALUES (?, ?, ?, ?)`,
          )
          .bind(
            ids.songId,
            artist.entityId,
            artist.creditOrder,
            artist.isPrimary ? 1 : 0,
          ),
      ),
      ...songTagStatements(this.database, ids.songId, input.tags),
      ...projectionStatements(this.database, ids.songId),
      this.database
        .prepare(
          `INSERT INTO music_catalog_events (
        id, aggregate_type, aggregate_id, event_type, actor_kind, actor_user_id,
        after_json, created_at
      ) VALUES (?, 'song', ?, 'song.created', 'admin', ?, ?, ?)`,
        )
        .bind(
          ids.eventId,
          ids.songId,
          actor.userId,
          eventJson({ title: input.title, slug: input.slug }),
          now,
        ),
    ];
    await this.executeCatalogBatch(statements, Number(meta.revision), now);
    return this.readSong(ids.songId);
  }

  async updateSong(command: AdminUpdateSongCommand) {
    const { input, actor, ids, now } = command;
    const meta = await this.readRevision();
    const catalog = await this.readCatalog();
    const entityStatements: D1PreparedStatement[] = [];
    const resolved = new Map<string, { id: string; displayName: string }>();
    for (const artist of input.originalArtists) {
      const subject = artist.subject;
      if (subject.kind === "entity") {
        const entity = catalog.entities.find(
          (item) => item.id === subject.entityId && item.archivedAt === null,
        );
        if (!entity) {
          throw new AdminCatalogRepositoryError(
            "not_found",
            "Selected original artist identity was not found",
          );
        }
        resolved.set(`entity:${subject.entityId}`, {
          id: entity.id,
          displayName: entity.displayName,
        });
        continue;
      }

      const key = subjectKey(subject)!;
      if (resolved.has(key)) continue;
      if (subject.kind === "member") {
        const authority = await this.database
          .prepare(
            `SELECT uid, code, name FROM members
            WHERE uid = ? AND (is_deprecated IS NULL OR is_deprecated = 0)`,
          )
          .bind(subject.memberUid)
          .first<{ uid: number; code: string; name: string }>();
        if (!authority) {
          throw new AdminCatalogRepositoryError(
            "not_found",
            "Current member was not found",
          );
        }
        const existing = catalog.entities.find(
          (item) => item.memberUid === subject.memberUid,
        );
        if (existing) {
          if (existing.archivedAt !== null) {
            throw new AdminCatalogRepositoryError(
              "validation_failed",
              "The current member identity is archived",
            );
          }
          resolved.set(key, { id: existing.id, displayName: authority.name });
          continue;
        }
        const entityId = ids.entityIds[key];
        const entityEventId = ids.entityEventIds[key];
        if (!entityId || !entityEventId) {
          throw new Error("Missing generated member identity ids");
        }
        entityStatements.push(
          this.database
            .prepare(
              `INSERT INTO music_entities (
              id, member_uid, entity_kind, display_name, normalized_name, slug,
              version, created_at, updated_at
            ) VALUES (?, ?, 'person', ?, ?, ?, 0, ?, ?)`,
            )
            .bind(
              entityId,
              authority.uid,
              authority.name,
              normalizeOtwPlaySearchText(authority.name),
              authority.code.trim().toLowerCase(),
              now,
              now,
            ),
          this.database
            .prepare(
              `INSERT INTO music_catalog_events
              (id, aggregate_type, aggregate_id, event_type, actor_kind, actor_user_id, after_json, created_at)
              VALUES (?, 'entity', ?, 'entity.created_from_member', 'admin', ?, ?, ?)`,
            )
            .bind(
              entityEventId,
              entityId,
              actor.userId,
              eventJson({ memberUid: authority.uid }),
              now,
            ),
        );
        resolved.set(key, { id: entityId, displayName: authority.name });
        continue;
      }

      const entityId = ids.entityIds[key];
      const entityEventId = ids.entityEventIds[key];
      if (!entityId || !entityEventId) {
        throw new Error("Missing generated external identity ids");
      }
      entityStatements.push(
        this.database
          .prepare(
            `INSERT INTO music_entities (
            id, member_uid, entity_kind, display_name, normalized_name, slug,
            version, created_at, updated_at
          ) VALUES (?, NULL, ?, ?, ?, ?, 0, ?, ?)`,
          )
          .bind(
            entityId,
            subject.entityKind,
            subject.displayName.trim(),
            normalizeOtwPlaySearchText(subject.displayName),
            generatedSlug(subject.displayName, entityId),
            now,
            now,
          ),
        this.database
          .prepare(
            `INSERT INTO music_catalog_events
            (id, aggregate_type, aggregate_id, event_type, actor_kind, actor_user_id, after_json, created_at)
            VALUES (?, 'entity', ?, 'entity.created_inline', 'admin', ?, ?, ?)`,
          )
          .bind(
            entityEventId,
            entityId,
            actor.userId,
            eventJson({
              displayName: subject.displayName,
              entityKind: subject.entityKind,
            }),
            now,
          ),
      );
      resolved.set(key, {
        id: entityId,
        displayName: subject.displayName.trim(),
      });
    }
    const artists = input.originalArtists.map((artist) => {
      const key =
        artist.subject.kind === "entity"
          ? `entity:${artist.subject.entityId}`
          : subjectKey(artist.subject)!;
      const entity = resolved.get(key);
      if (!entity) throw new Error("Unresolved original artist identity");
      return { ...artist, entity };
    });
    if (new Set(artists.map((artist) => artist.entity.id)).size !== artists.length) {
      throw new AdminCatalogRepositoryError(
        "validation_failed",
        "An original artist can only be credited once",
      );
    }
    const dedupeKey = createSongDedupeKeyMaterial({
      title: input.title,
      originalArtistIds: artists.map((artist) => artist.entity.id),
    });
    const statements: D1PreparedStatement[] = [
      ...entityStatements,
      this.database
        .prepare(
          `UPDATE music_songs SET slug = ?, title = ?, normalized_title = ?, dedupe_key = ?,
        is_otw_original = ?, original_release_date = ?, original_release_precision = ?,
        version = version + 1, updated_at = ? WHERE id = ? AND version = ?`,
        )
        .bind(
          input.slug.trim(),
          input.title.trim(),
          normalizeOtwPlaySearchText(input.title),
          dedupeKey,
          input.isOtwOriginal ? 1 : 0,
          input.originalReleaseDate,
          input.originalReleasePrecision,
          now,
          input.id,
          input.expectedVersion,
        ),
      versionGuard(this.database),
      this.database
        .prepare("DELETE FROM music_song_aliases WHERE song_id = ?")
        .bind(input.id),
      ...input.aliases.map((alias) =>
        this.database
          .prepare(
            `INSERT INTO music_song_aliases
        (song_id, alias, normalized_alias, locale, alias_kind) VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(
            input.id,
            alias.alias.trim(),
            normalizeOtwPlaySearchText(alias.alias),
            alias.locale?.trim() || null,
            alias.aliasKind?.trim() || null,
          ),
      ),
      this.database
        .prepare("DELETE FROM music_song_original_artists WHERE song_id = ?")
        .bind(input.id),
      ...artists.map((artist) =>
        this.database
          .prepare(
            `INSERT INTO music_song_original_artists
        (song_id, entity_id, credit_order, is_primary) VALUES (?, ?, ?, ?)`,
          )
          .bind(
            input.id,
            artist.entity.id,
            artist.creditOrder,
            artist.isPrimary ? 1 : 0,
          ),
      ),
      ...(input.tags === undefined
        ? []
        : [
            this.database
              .prepare("DELETE FROM music_song_tags WHERE song_id = ?")
              .bind(input.id),
            ...songTagStatements(this.database, input.id, input.tags),
          ]),
      ...projectionStatements(this.database, input.id),
      this.database
        .prepare(
          `INSERT INTO music_catalog_events
        (id, aggregate_type, aggregate_id, event_type, actor_kind, actor_user_id, after_json, created_at)
        VALUES (?, 'song', ?, 'song.updated', 'admin', ?, ?, ?)`,
        )
        .bind(
          ids.songEventId,
          input.id,
          actor.userId,
          eventJson({ version: input.expectedVersion + 1 }),
          now,
        ),
    ];
    await this.executeCatalogBatch(statements, Number(meta.revision), now);
    return this.readSong(input.id);
  }

  async deleteSong(
    id: string,
    expectedVersion: number,
    actor: AdminCatalogActor,
    eventId: string,
    now: number,
  ) {
    const meta = await this.readRevision();
    const current = await this.database
      .prepare(
        "SELECT title, version, archived_at FROM music_songs WHERE id = ?",
      )
      .bind(id)
      .first<{ title: string; version: number; archived_at: number | null }>();
    if (!current)
      throw new AdminCatalogRepositoryError("not_found", "Song not found");
    if (Number(current.version) !== expectedVersion) {
      throw new AdminCatalogRepositoryError(
        "stale_write",
        "Song changed since it was loaded",
      );
    }
    if (current.archived_at !== null) {
      throw new AdminCatalogRepositoryError(
        "validation_failed",
        "Archived songs must be preserved",
      );
    }

    const performances = await this.database
      .prepare(
        `SELECT id, publication_status FROM music_performances
         WHERE song_id = ?`,
      )
      .bind(id)
      .all<{ id: string; publication_status: string }>();
    if (
      performances.results.some(
        (performance) => performance.publication_status === "published",
      )
    ) {
      throw new AdminCatalogRepositoryError(
        "validation_failed",
        "Songs with published performances cannot be deleted",
      );
    }

    const protectedReference = await this.database
      .prepare(
        `SELECT
           EXISTS (
             SELECT 1 FROM music_songs WHERE merged_into_song_id = ?
           ) AS has_merge_child,
           EXISTS (
             SELECT 1
             FROM music_cover_proposals AS proposal
             JOIN music_performances AS performance
               ON performance.id = proposal.approved_performance_id
             WHERE performance.song_id = ?
           ) AS has_approved_proposal`,
      )
      .bind(id, id)
      .first<{ has_merge_child: number; has_approved_proposal: number }>();
    if (protectedReference?.has_merge_child) {
      throw new AdminCatalogRepositoryError(
        "validation_failed",
        "A song used as a merge target cannot be deleted",
      );
    }
    if (protectedReference?.has_approved_proposal) {
      throw new AdminCatalogRepositoryError(
        "validation_failed",
        "A song linked to an approved proposal cannot be deleted",
      );
    }

    const sourceRows = await this.database
      .prepare(
        `SELECT DISTINCT link.source_id
         FROM music_performance_sources AS link
         JOIN music_performances AS performance
           ON performance.id = link.performance_id
         WHERE performance.song_id = ?`,
      )
      .bind(id)
      .all<{ source_id: string }>();
    const statements: D1PreparedStatement[] = [
      this.database
        .prepare(
          `DELETE FROM music_performances
           WHERE song_id = ? AND publication_status IN ('draft', 'withdrawn')`,
        )
        .bind(id),
      this.database
        .prepare("DELETE FROM music_songs WHERE id = ? AND version = ?")
        .bind(id, expectedVersion),
      versionGuard(this.database),
      ...sourceRows.results.map((row) =>
        this.database
          .prepare(
            `DELETE FROM music_media_sources
             WHERE id = ?
               AND NOT EXISTS (
                 SELECT 1 FROM music_performance_sources WHERE source_id = ?
               )
               AND NOT EXISTS (
                 SELECT 1 FROM music_media_source_relations
                 WHERE source_id = ? OR related_source_id = ?
               )`,
          )
          .bind(row.source_id, row.source_id, row.source_id, row.source_id),
      ),
      ...projectionStatements(this.database, id),
      this.database
        .prepare(
          `INSERT INTO music_catalog_events
          (id, aggregate_type, aggregate_id, event_type, actor_kind, actor_user_id,
           before_json, created_at)
          VALUES (?, 'song', ?, 'song.deleted', 'admin', ?, ?, ?)`,
        )
        .bind(
          eventId,
          id,
          actor.userId,
          eventJson({
            title: current.title,
            version: expectedVersion,
            draftPerformanceCount: performances.results.filter(
              (performance) => performance.publication_status === "draft",
            ).length,
            withdrawnPerformanceCount: performances.results.filter(
              (performance) => performance.publication_status === "withdrawn",
            ).length,
          }),
          now,
        ),
    ];
    await this.executeCatalogBatch(statements, Number(meta.revision), now);
    return { data: { id }, catalogRevision: Number(meta.revision) + 1 };
  }

  private sourceInsert(
    sourceId: string,
    video: AdminCreatePerformanceCommand["video"],
    internalChannelId: string,
    now: number,
  ) {
    return this.database
      .prepare(
        `INSERT INTO music_media_sources (
      id, provider, external_id, channel_id, title, thumbnail_url, duration_seconds,
      provider_published_at, availability_status, last_checked_at, version, created_at, updated_at
    ) VALUES (?, 'youtube', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .bind(
        sourceId,
        video.videoId,
        internalChannelId,
        video.title,
        video.thumbnailUrl,
        video.durationSeconds,
        video.publishedAt,
        video.availabilityStatus,
        now,
        now,
        now,
      );
  }

  async createPerformance(command: AdminCreatePerformanceCommand) {
    const { input, video, actor, now, ids } = command;
    const meta = await this.readRevision();
    const existingSource = await this.database
      .prepare(
        `SELECT id FROM music_media_sources
      WHERE provider = 'youtube' AND external_id = ?`,
      )
      .bind(video.videoId)
      .first<{ id: string }>();
    const sourceId = existingSource?.id ?? ids.sourceId;
    const dedupeKey = createPerformanceDedupeKeyMaterial({
      songId: input.songId,
      sourceId,
      startSeconds: input.source.startSeconds,
    });
    const statements: D1PreparedStatement[] = [
      ...(existingSource
        ? []
        : [this.sourceInsert(sourceId, video, input.source.channelId, now)]),
      this.database
        .prepare(
          `INSERT INTO music_performances (
        id, song_id, dedupe_key, relation_type, release_type, participation_type,
        publication_status, quality_status, released_at, internal_note, version,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, 0, ?, ?)`,
        )
        .bind(
          ids.performanceId,
          input.songId,
          dedupeKey,
          input.relationType,
          input.releaseType,
          input.participationType,
          input.qualityStatus,
          input.releasedAt,
          input.internalNote?.trim() || null,
          now,
          now,
        ),
      ...input.participants.map((participant) =>
        this.database
          .prepare(
            `INSERT INTO music_performance_participants (
        performance_id, entity_id, participant_role, credit_order, credit_name_snapshot
      ) VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(
            ids.performanceId,
            participant.entityId,
            participant.participantRole ?? "vocal",
            participant.creditOrder,
            participant.creditNameSnapshot?.trim() || participant.entityId,
          ),
      ),
      this.database
        .prepare(
          `INSERT INTO music_performance_sources (
        performance_id, source_id, start_seconds, end_seconds, source_role, priority, is_primary
      ) VALUES (?, ?, ?, ?, ?, 0, 1)`,
        )
        .bind(
          ids.performanceId,
          sourceId,
          input.source.startSeconds,
          input.source.endSeconds ?? null,
          input.source.sourceRole,
        ),
      ...projectionStatements(this.database, input.songId),
      this.database
        .prepare(
          `INSERT INTO music_catalog_events
        (id, aggregate_type, aggregate_id, event_type, actor_kind, actor_user_id, after_json, created_at)
        VALUES (?, 'performance', ?, 'performance.created', 'admin', ?, ?, ?)`,
        )
        .bind(
          ids.eventId,
          ids.performanceId,
          actor.userId,
          eventJson({ songId: input.songId, publicationStatus: "draft" }),
          now,
        ),
    ];
    await this.executeCatalogBatch(statements, Number(meta.revision), now);
    return this.readPerformance(ids.performanceId);
  }

  async createCatalogEntry(command: AdminCreateCatalogEntryCommand) {
    const { input, video, actor, now, ids, proposalApproval } = command;
    const meta = await this.readRevision();
    if (Number(meta.revision) !== input.expectedCatalogRevision) {
      throw new AdminCatalogRepositoryError(
        "stale_write",
        "Catalog changed after video preflight",
      );
    }
    const catalog = await this.readCatalog();
    if (proposalApproval) {
      const proposal = await this.database
        .prepare(
          `SELECT id FROM music_cover_proposals
           WHERE id = ? AND status = 'pending_review' AND version = ?`,
        )
        .bind(proposalApproval.proposalId, proposalApproval.expectedVersion)
        .first<{ id: string }>();
      if (!proposal) {
        throw new AdminCatalogRepositoryError(
          "stale_write",
          "Proposal changed during review",
        );
      }
    }
    const duplicate = await this.database
      .prepare(
        `SELECT performance.song_id, link.performance_id
        FROM music_media_sources AS source
        JOIN music_performance_sources AS link ON link.source_id = source.id
        JOIN music_performances AS performance ON performance.id = link.performance_id
        WHERE source.provider = 'youtube' AND source.external_id = ?
          AND link.start_seconds = ? LIMIT 1`,
      )
      .bind(video.videoId, input.startSeconds)
      .first<{ song_id: string; performance_id: string }>();
    if (duplicate) {
      throw new AdminCatalogRepositoryError(
        "duplicate_source",
        "The same YouTube video segment is already registered",
        {
          songId: duplicate.song_id,
          performanceId: duplicate.performance_id,
        },
      );
    }

    const statements: D1PreparedStatement[] = proposalApproval
      ? [
          this.database
            .prepare(
              `UPDATE music_cover_proposals
               SET review_lock_token = ?, review_lock_expires_at = ?, updated_at = ?
               WHERE id = ? AND status = 'pending_review' AND version = ?
                 AND (review_lock_token IS NULL OR review_lock_expires_at < ?)`,
            )
            .bind(
              proposalApproval.lockToken,
              now + 300_000,
              now,
              proposalApproval.proposalId,
              proposalApproval.expectedVersion,
              now,
            ),
          versionGuard(this.database),
        ]
      : [];
    const createdEntityIds: string[] = [];
    const resolved = new Map<string, { id: string; displayName: string }>();
    const allSubjects = [
      ...input.participants.map((item) => item.subject),
      ...(input.song.kind === "create"
        ? input.song.originalArtists.map((item) => item.subject)
        : []),
      ...(input.channel.kind === "confirm" || input.channel.kind === "pending"
        ? input.channel.owners
        : input.channel.kind === "recognized_member"
          ? [{ kind: "member" as const, memberUid: input.channel.memberUid }]
          : []),
    ];

    for (const subject of allSubjects) {
      if (subject.kind === "entity") {
        const entity = catalog.entities.find(
          (item) => item.id === subject.entityId && item.archivedAt === null,
        );
        if (!entity) {
          throw new AdminCatalogRepositoryError(
            "not_found",
            "Selected external identity was not found",
          );
        }
        resolved.set(`entity:${subject.entityId}`, {
          id: entity.id,
          displayName: entity.displayName,
        });
        continue;
      }

      const key = subjectKey(subject)!;
      if (resolved.has(key)) continue;
      if (subject.kind === "member") {
        const authority = await this.database
          .prepare(
            `SELECT uid, code, name FROM members
            WHERE uid = ? AND (is_deprecated IS NULL OR is_deprecated = 0)`,
          )
          .bind(subject.memberUid)
          .first<{ uid: number; code: string; name: string }>();
        if (!authority) {
          throw new AdminCatalogRepositoryError(
            "not_found",
            "Current member was not found",
          );
        }
        const existing = catalog.entities.find(
          (item) => item.memberUid === subject.memberUid,
        );
        if (existing) {
          if (existing.archivedAt !== null) {
            throw new AdminCatalogRepositoryError(
              "validation_failed",
              "The current member identity is archived",
            );
          }
          resolved.set(key, { id: existing.id, displayName: authority.name });
          continue;
        }
        const entityId = ids.entityIds[key];
        if (!entityId) throw new Error("Missing generated member entity id");
        statements.push(
          this.database
            .prepare(
              `INSERT INTO music_entities (
              id, member_uid, entity_kind, display_name, normalized_name, slug,
              version, created_at, updated_at
            ) VALUES (?, ?, 'person', ?, ?, ?, 0, ?, ?)`,
            )
            .bind(
              entityId,
              authority.uid,
              authority.name,
              normalizeOtwPlaySearchText(authority.name),
              authority.code.trim().toLowerCase(),
              now,
              now,
            ),
          this.database
            .prepare(
              `INSERT INTO music_catalog_events
              (id, aggregate_type, aggregate_id, event_type, actor_kind, actor_user_id, after_json, created_at)
              VALUES (?, 'entity', ?, 'entity.created_from_member', 'admin', ?, ?, ?)`,
            )
            .bind(
              ids.entityEventIds[key],
              entityId,
              actor.userId,
              eventJson({ memberUid: authority.uid }),
              now,
            ),
        );
        createdEntityIds.push(entityId);
        resolved.set(key, { id: entityId, displayName: authority.name });
        continue;
      }

      const entityId = ids.entityIds[key];
      if (!entityId) throw new Error("Missing generated external entity id");
      statements.push(
        this.database
          .prepare(
            `INSERT INTO music_entities (
            id, member_uid, entity_kind, display_name, normalized_name, slug,
            version, created_at, updated_at
          ) VALUES (?, NULL, ?, ?, ?, ?, 0, ?, ?)`,
          )
          .bind(
            entityId,
            subject.entityKind,
            subject.displayName.trim(),
            normalizeOtwPlaySearchText(subject.displayName),
            generatedSlug(subject.displayName, entityId),
            now,
            now,
          ),
        this.database
          .prepare(
            `INSERT INTO music_catalog_events
            (id, aggregate_type, aggregate_id, event_type, actor_kind, actor_user_id, after_json, created_at)
            VALUES (?, 'entity', ?, 'entity.created_inline', 'admin', ?, ?, ?)`,
          )
          .bind(
            ids.entityEventIds[key],
            entityId,
            actor.userId,
            eventJson({
              displayName: subject.displayName,
              entityKind: subject.entityKind,
            }),
            now,
          ),
      );
      createdEntityIds.push(entityId);
      resolved.set(key, { id: entityId, displayName: subject.displayName.trim() });
    }

    const resolveSubject = (subject: OtwPlayAdminCatalogSubjectInput) => {
      const key =
        subject.kind === "entity" ? `entity:${subject.entityId}` : subjectKey(subject)!;
      const value = resolved.get(key);
      if (!value) throw new Error("Unresolved catalog subject");
      return value;
    };

    const participantEntities = input.participants.map((item) => ({
      ...item,
      resolved: resolveSubject(item.subject),
    }));
    if (new Set(participantEntities.map((item) => item.resolved.id)).size !== participantEntities.length) {
      throw new AdminCatalogRepositoryError(
        "validation_failed",
        "A participant can only be credited once",
      );
    }

    const matchedChannel = catalog.channels.find(
      (item) => item.externalChannelId === video.channelId,
    );
    if (matchedChannel?.verificationStatus === "revoked") {
      throw new AdminCatalogRepositoryError(
        "validation_failed",
        "A revoked channel cannot register catalog entries",
        { channel: "revoked" },
      );
    }

    let channelId: string;
    let channelApproved: boolean;
    let channelRole: OtwPlayAdminChannelDto["channelRole"];
    let channelChanged = false;
    let ownerEntityIds: string[] = [];
    if (input.channel.kind === "existing") {
      const selectedChannelId = input.channel.channelId;
      const selected = catalog.channels.find(
        (item) => item.id === selectedChannelId,
      );
      if (!selected || selected.externalChannelId !== video.channelId) {
        throw new AdminCatalogRepositoryError(
          "validation_failed",
          "The selected channel does not match YouTube metadata",
          { channel: "mismatch" },
        );
      }
      if (selected.verificationStatus === "revoked") {
        throw new AdminCatalogRepositoryError(
          "validation_failed",
          "A revoked channel cannot register catalog entries",
          { channel: "revoked" },
        );
      }
      channelId = selected.id;
      channelApproved = selected.verificationStatus === "approved" && selected.active;
      channelRole = selected.channelRole;
      ownerEntityIds = selected.entityIds;
    } else if (input.channel.kind === "recognized_member") {
      const authority = await this.database
        .prepare(
          `SELECT 1 AS matched FROM members AS member
          WHERE member.uid = ? AND (member.is_deprecated IS NULL OR member.is_deprecated = 0)
            AND (member.youtube_channel_id = ? OR EXISTS (
              SELECT 1 FROM member_links AS link
              WHERE link.member_uid = member.uid AND link.youtube_channel_id = ?
                AND link.enabled = 1 AND link.type IN ('youtube_vod', 'youtube_sub')
            ))`,
        )
        .bind(input.channel.memberUid, video.channelId, video.channelId)
        .first<{ matched: number }>();
      if (!authority) {
        throw new AdminCatalogRepositoryError(
          "validation_failed",
          "The detected channel is not an authoritative member channel",
          { channel: "member_mismatch" },
        );
      }
      const owner = resolveSubject({
        kind: "member",
        memberUid: input.channel.memberUid,
      });
      channelId = matchedChannel?.id ?? ids.channelId;
      channelApproved = true;
      channelRole = input.channel.channelRole;
      ownerEntityIds = [owner.id];
      channelChanged = true;
    } else {
      channelId = matchedChannel?.id ?? ids.channelId;
      channelApproved =
        input.channel.kind === "confirm" ||
        (matchedChannel?.verificationStatus === "approved" && matchedChannel.active);
      channelRole = input.channel.channelRole;
      ownerEntityIds = input.channel.owners.map((owner) => resolveSubject(owner).id);
      channelChanged = !matchedChannel || input.channel.kind === "confirm" || !channelApproved;
    }

    if (input.publicationTarget === "published" && !channelApproved) {
      throw new AdminCatalogRepositoryError(
        "validation_failed",
        "Publishing requires an approved active channel",
        { publicationTarget: "channel_not_approved" },
      );
    }

    if (channelChanged) {
      if (matchedChannel) {
        statements.push(
          this.database
            .prepare(
              `UPDATE music_channels SET display_name = ?, channel_role = ?,
              verification_status = ?, active = ?, version = version + 1, updated_at = ?
              WHERE id = ?`,
            )
            .bind(
              video.channelTitle,
              channelRole,
              channelApproved ? "approved" : "pending",
              channelApproved ? 1 : 0,
              now,
              channelId,
            ),
          this.database
            .prepare("DELETE FROM music_channel_entities WHERE channel_id = ?")
            .bind(channelId),
        );
      } else {
        statements.push(
          this.database
            .prepare(
              `INSERT INTO music_channels (
              id, provider, external_channel_id, display_name, channel_role,
              verification_status, active, version, created_at, updated_at
            ) VALUES (?, 'youtube', ?, ?, ?, ?, ?, 0, ?, ?)`,
            )
            .bind(
              channelId,
              video.channelId,
              video.channelTitle,
              channelRole,
              channelApproved ? "approved" : "pending",
              channelApproved ? 1 : 0,
              now,
              now,
            ),
        );
      }
      statements.push(
        ...ownerEntityIds.map((entityId) =>
          this.database
            .prepare(
              "INSERT INTO music_channel_entities (channel_id, entity_id) VALUES (?, ?)",
            )
            .bind(channelId, entityId),
        ),
        this.database
          .prepare(
            `INSERT INTO music_catalog_events
            (id, aggregate_type, aggregate_id, event_type, actor_kind, actor_user_id, after_json, created_at)
            VALUES (?, 'channel', ?, 'channel.confirmed_inline', 'admin', ?, ?, ?)`,
          )
          .bind(
            ids.channelEventId,
            channelId,
            actor.userId,
            eventJson({
              externalChannelId: video.channelId,
              verificationStatus: channelApproved ? "approved" : "pending",
            }),
            now,
          ),
      );
    }

    let songId: string;
    if (input.song.kind === "existing") {
      const selectedSongId = input.song.songId;
      const song = catalog.songs.find(
        (item) => item.id === selectedSongId && item.archivedAt === null,
      );
      if (!song)
        throw new AdminCatalogRepositoryError("not_found", "Song not found");
      songId = song.id;
    } else {
      if (input.song.kind === "from_video" && input.relationType !== "original") {
        throw new AdminCatalogRepositoryError(
          "validation_failed",
          "Cover entries require explicit original song metadata",
        );
      }
      songId = ids.songId;
      const songInput =
        input.song.kind === "from_video"
          ? {
              title: video.title,
              isOtwOriginal: input.relationType === "original",
              originalReleaseDate: null,
              originalReleasePrecision: "unknown" as const,
              aliases: [],
              originalArtists:
                input.relationType === "original"
                  ? [...input.participants]
                      .sort(
                        (left, right) =>
                          left.creditOrder - right.creditOrder,
                      )
                      .map((participant, index) => ({
                        subject: participant.subject,
                        creditOrder: index,
                        isPrimary: index === 0,
                      }))
                  : [],
              tags: input.song.tags ?? [],
            }
          : input.song;
      const artists = songInput.originalArtists.map((item) => ({
        ...item,
        resolved: resolveSubject(item.subject),
      }));
      if (new Set(artists.map((item) => item.resolved.id)).size !== artists.length) {
        throw new AdminCatalogRepositoryError(
          "validation_failed",
          "An original artist can only be credited once",
        );
      }
      const slug = generatedSlug(songInput.title, songId);
      statements.push(
        this.database
          .prepare(
            `INSERT INTO music_songs (
            id, slug, title, normalized_title, dedupe_key, is_otw_original,
            original_release_date, original_release_precision, version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          )
          .bind(
            songId,
            slug,
            songInput.title.trim(),
            normalizeOtwPlaySearchText(songInput.title),
            input.song.kind === "from_video"
              ? createVideoBackedSongDedupeKeyMaterial({
                  title: songInput.title,
                  youtubeVideoId: video.videoId,
                })
              : createSongDedupeKeyMaterial({
                  title: songInput.title,
                  originalArtistIds: artists.map((item) => item.resolved.id),
                }),
            songInput.isOtwOriginal ? 1 : 0,
            songInput.originalReleaseDate,
            songInput.originalReleasePrecision,
            now,
            now,
          ),
        ...songInput.aliases.map((alias) =>
          this.database
            .prepare(
              `INSERT INTO music_song_aliases
              (song_id, alias, normalized_alias, locale, alias_kind)
              VALUES (?, ?, ?, ?, ?)`,
            )
            .bind(
              songId,
              alias.alias.trim(),
              normalizeOtwPlaySearchText(alias.alias),
              alias.locale?.trim() || null,
              alias.aliasKind?.trim() || null,
            ),
        ),
        ...artists.map((artist) =>
          this.database
            .prepare(
              `INSERT INTO music_song_original_artists
              (song_id, entity_id, credit_order, is_primary) VALUES (?, ?, ?, ?)`,
            )
            .bind(
              songId,
              artist.resolved.id,
              artist.creditOrder,
              artist.isPrimary ? 1 : 0,
            ),
        ),
        ...songTagStatements(this.database, songId, songInput.tags),
        this.database
          .prepare(
            `INSERT INTO music_catalog_events
            (id, aggregate_type, aggregate_id, event_type, actor_kind, actor_user_id, after_json, created_at)
            VALUES (?, 'song', ?, 'song.created_inline', 'admin', ?, ?, ?)`,
          )
          .bind(
            ids.songEventId,
            songId,
            actor.userId,
            eventJson({
              title: songInput.title,
              slug,
              creationMode:
                input.song.kind === "from_video" ? "from_video" : "inline",
            }),
            now,
          ),
      );
    }

    const existingSource = await this.database
      .prepare(
        "SELECT id FROM music_media_sources WHERE provider = 'youtube' AND external_id = ?",
      )
      .bind(video.videoId)
      .first<{ id: string }>();
    const sourceId = existingSource?.id ?? ids.sourceId;
    if (existingSource) {
      statements.push(
        this.database
          .prepare(
            `UPDATE music_media_sources SET channel_id = ?, title = ?, thumbnail_url = ?,
            duration_seconds = ?, provider_published_at = ?, availability_status = ?,
            last_checked_at = ?, version = version + 1, updated_at = ? WHERE id = ?`,
          )
          .bind(
            channelId,
            video.title,
            video.thumbnailUrl,
            video.durationSeconds,
            video.publishedAt,
            video.availabilityStatus,
            now,
            now,
            sourceId,
          ),
      );
    } else {
      statements.push(this.sourceInsert(sourceId, video, channelId, now));
    }
    const dedupeKey = createPerformanceDedupeKeyMaterial({
      songId,
      sourceId,
      startSeconds: input.startSeconds,
    });
    statements.push(
      this.database
        .prepare(
          `INSERT INTO music_performances (
          id, song_id, dedupe_key, relation_type, release_type, participation_type,
          publication_status, quality_status, released_at, internal_note, version,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ok', ?, ?, 0, ?, ?)`,
        )
        .bind(
          ids.performanceId,
          songId,
          dedupeKey,
          input.relationType,
          input.releaseType,
          input.participationType,
          input.publicationTarget,
          video.publishedAt,
          input.internalNote?.trim() || null,
          now,
          now,
        ),
      ...participantEntities.map((participant) =>
        this.database
          .prepare(
            `INSERT INTO music_performance_participants (
            performance_id, entity_id, participant_role, credit_order, credit_name_snapshot
          ) VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(
            ids.performanceId,
            participant.resolved.id,
            participant.participantRole,
            participant.creditOrder,
            participant.creditNameSnapshot?.trim() || participant.resolved.displayName,
          ),
      ),
      this.database
        .prepare(
          `INSERT INTO music_performance_sources (
          performance_id, source_id, start_seconds, end_seconds, source_role, priority, is_primary
        ) VALUES (?, ?, ?, ?, 'official', 0, 1)`,
        )
        .bind(
          ids.performanceId,
          sourceId,
          input.startSeconds,
          input.endSeconds ?? null,
        ),
      ...projectionStatements(this.database, songId),
      this.database
        .prepare(
          `INSERT INTO music_catalog_events
          (id, aggregate_type, aggregate_id, event_type, actor_kind, actor_user_id, after_json, created_at)
          VALUES (?, 'performance', ?, 'performance.created_inline', 'admin', ?, ?, ?)`,
        )
        .bind(
          ids.performanceEventId,
          ids.performanceId,
          actor.userId,
          eventJson({
            songId,
            publicationStatus: input.publicationTarget,
            videoId: video.videoId,
          }),
          now,
        ),
    );

    if (proposalApproval) {
      statements.push(
        this.database
          .prepare(
            `UPDATE music_cover_proposals
             SET status = 'approved', reviewed_by_user_id = ?, reviewed_at = ?,
               approved_performance_id = ?, review_lock_token = NULL,
               review_lock_expires_at = NULL, version = version + 1, updated_at = ?
             WHERE id = ? AND status = 'pending_review' AND version = ?
               AND review_lock_token = ?`,
          )
          .bind(
            actor.userId,
            now,
            ids.performanceId,
            now,
            proposalApproval.proposalId,
            proposalApproval.expectedVersion,
            proposalApproval.lockToken,
          ),
        versionGuard(this.database),
        this.database
          .prepare(
            `INSERT INTO music_catalog_events
             (id, aggregate_type, aggregate_id, event_type, actor_kind,
              actor_user_id, after_json, created_at)
             VALUES (?, 'proposal', ?, 'proposal.approved', 'admin', ?, ?, ?)`,
          )
          .bind(
            proposalApproval.proposalEventId,
            proposalApproval.proposalId,
            actor.userId,
            eventJson({ performanceId: ids.performanceId }),
            now,
          ),
      );
    }

    try {
      await this.executeCatalogBatch(
        statements,
        input.expectedCatalogRevision,
        now,
      );
    } catch (error) {
      if (
        error instanceof AdminCatalogRepositoryError &&
        error.code === "validation_failed"
      ) {
        const conflicting = await this.database
          .prepare(
            `SELECT performance.song_id, link.performance_id
            FROM music_media_sources AS source
            JOIN music_performance_sources AS link ON link.source_id = source.id
            JOIN music_performances AS performance ON performance.id = link.performance_id
            WHERE source.provider = 'youtube' AND source.external_id = ?
              AND link.start_seconds = ? LIMIT 1`,
          )
          .bind(video.videoId, input.startSeconds)
          .first<{ song_id: string; performance_id: string }>();
        if (conflicting) {
          throw new AdminCatalogRepositoryError(
            "duplicate_source",
            "The same YouTube video segment is already registered",
            {
              songId: conflicting.song_id,
              performanceId: conflicting.performance_id,
            },
          );
        }
      }
      throw error;
    }
    const updated = await this.readCatalog();
    const song = updated.songs.find((item) => item.id === songId);
    const performance = updated.performances.find(
      (item) => item.id === ids.performanceId,
    );
    const channel = updated.channels.find((item) => item.id === channelId);
    if (!song || !performance || !channel) {
      throw new AdminCatalogRepositoryError(
        "unavailable",
        "Catalog entry readback failed",
      );
    }
    return {
      data: {
        song,
        performance,
        channel,
        createdEntities: updated.entities.filter((item) =>
          createdEntityIds.includes(item.id),
        ),
      },
      catalogRevision: updated.revision,
    };
  }

  async updatePerformance(command: AdminUpdatePerformanceCommand) {
    const { input, video, actor, now, ids } = command;
    const meta = await this.readRevision();
    const catalog = await this.readCatalog();
    const current = await this.database
      .prepare(
        `SELECT song_id, publication_status
      FROM music_performances WHERE id = ?`,
      )
      .bind(input.id)
      .first<{ song_id: string; publication_status: string }>();
    if (!current)
      throw new AdminCatalogRepositoryError(
        "not_found",
        "Performance not found",
      );
    const targetSong = catalog.songs.find(
      (song) => song.id === input.songId && song.archivedAt === null,
    );
    if (!targetSong) {
      throw new AdminCatalogRepositoryError("not_found", "Song not found");
    }
    const entityStatements: D1PreparedStatement[] = [];
    const resolved = new Map<string, { id: string; displayName: string }>();
    for (const participant of input.participants) {
      const subject = participant.subject;
      if (subject.kind === "entity") {
        const entity = catalog.entities.find(
          (item) => item.id === subject.entityId && item.archivedAt === null,
        );
        if (!entity) {
          throw new AdminCatalogRepositoryError(
            "not_found",
            "Selected participant identity was not found",
          );
        }
        resolved.set(`entity:${subject.entityId}`, {
          id: entity.id,
          displayName: entity.displayName,
        });
        continue;
      }

      const key = subjectKey(subject)!;
      if (resolved.has(key)) continue;
      if (subject.kind === "member") {
        const authority = await this.database
          .prepare(
            `SELECT uid, code, name FROM members
            WHERE uid = ? AND (is_deprecated IS NULL OR is_deprecated = 0)`,
          )
          .bind(subject.memberUid)
          .first<{ uid: number; code: string; name: string }>();
        if (!authority) {
          throw new AdminCatalogRepositoryError(
            "not_found",
            "Current member was not found",
          );
        }
        const existing = catalog.entities.find(
          (item) => item.memberUid === subject.memberUid,
        );
        if (existing) {
          if (existing.archivedAt !== null) {
            throw new AdminCatalogRepositoryError(
              "validation_failed",
              "The current member identity is archived",
            );
          }
          resolved.set(key, { id: existing.id, displayName: authority.name });
          continue;
        }
        const entityId = ids.entityIds[key];
        const entityEventId = ids.entityEventIds[key];
        if (!entityId || !entityEventId) {
          throw new Error("Missing generated member identity ids");
        }
        entityStatements.push(
          this.database
            .prepare(
              `INSERT INTO music_entities (
              id, member_uid, entity_kind, display_name, normalized_name, slug,
              version, created_at, updated_at
            ) VALUES (?, ?, 'person', ?, ?, ?, 0, ?, ?)`,
            )
            .bind(
              entityId,
              authority.uid,
              authority.name,
              normalizeOtwPlaySearchText(authority.name),
              authority.code.trim().toLowerCase(),
              now,
              now,
            ),
          this.database
            .prepare(
              `INSERT INTO music_catalog_events
              (id, aggregate_type, aggregate_id, event_type, actor_kind, actor_user_id, after_json, created_at)
              VALUES (?, 'entity', ?, 'entity.created_from_member', 'admin', ?, ?, ?)`,
            )
            .bind(
              entityEventId,
              entityId,
              actor.userId,
              eventJson({ memberUid: authority.uid }),
              now,
            ),
        );
        resolved.set(key, { id: entityId, displayName: authority.name });
        continue;
      }

      const entityId = ids.entityIds[key];
      const entityEventId = ids.entityEventIds[key];
      if (!entityId || !entityEventId) {
        throw new Error("Missing generated external identity ids");
      }
      entityStatements.push(
        this.database
          .prepare(
            `INSERT INTO music_entities (
            id, member_uid, entity_kind, display_name, normalized_name, slug,
            version, created_at, updated_at
          ) VALUES (?, NULL, ?, ?, ?, ?, 0, ?, ?)`,
          )
          .bind(
            entityId,
            subject.entityKind,
            subject.displayName.trim(),
            normalizeOtwPlaySearchText(subject.displayName),
            generatedSlug(subject.displayName, entityId),
            now,
            now,
          ),
        this.database
          .prepare(
            `INSERT INTO music_catalog_events
            (id, aggregate_type, aggregate_id, event_type, actor_kind, actor_user_id, after_json, created_at)
            VALUES (?, 'entity', ?, 'entity.created_inline', 'admin', ?, ?, ?)`,
          )
          .bind(
            entityEventId,
            entityId,
            actor.userId,
            eventJson({
              displayName: subject.displayName,
              entityKind: subject.entityKind,
            }),
            now,
          ),
      );
      resolved.set(key, {
        id: entityId,
        displayName: subject.displayName.trim(),
      });
    }
    const participants = input.participants.map((participant) => {
      const key =
        participant.subject.kind === "entity"
          ? `entity:${participant.subject.entityId}`
          : subjectKey(participant.subject)!;
      const entity = resolved.get(key);
      if (!entity) throw new Error("Unresolved participant identity");
      return { ...participant, entity };
    });
    if (
      new Set(participants.map((participant) => participant.entity.id)).size !==
      participants.length
    ) {
      throw new AdminCatalogRepositoryError(
        "validation_failed",
        "A participant can only be credited once",
      );
    }
    if (current.publication_status === "withdrawn") {
      throw new AdminCatalogRepositoryError(
        "validation_failed",
        "Withdrawn performances are immutable; create a replacement draft",
      );
    }
    if (current.publication_status === "published") {
      if (
        !input.participants.some(
          (item) =>
            item.participantRole === "vocal" ||
            item.participantRole === "featured_vocal" ||
            item.participantRole === "chorus",
        )
      ) {
        throw new AdminCatalogRepositoryError(
          "validation_failed",
          "A published correction requires an actual singing credit",
        );
      }
      const eligibleChannel = await this.database
        .prepare(
          `SELECT 1 AS eligible
        FROM music_channels WHERE id = ?
          AND verification_status = 'approved' AND active = 1
          AND channel_role IN (
            'otw_official', 'unit_official', 'member_music', 'member_main', 'project_official'
          )`,
        )
        .bind(input.source.channelId)
        .first<{ eligible: number }>();
      if (!eligibleChannel) {
        throw new AdminCatalogRepositoryError(
          "validation_failed",
          "A published correction requires an approved active official channel",
        );
      }
    }
    const existingSource = await this.database
      .prepare(
        `SELECT id FROM music_media_sources
      WHERE provider = 'youtube' AND external_id = ?`,
      )
      .bind(video.videoId)
      .first<{ id: string }>();
    const sourceId = existingSource?.id ?? ids.sourceId;
    const previousSourceRows = await this.database
      .prepare(
        "SELECT source_id FROM music_performance_sources WHERE performance_id = ?",
      )
      .bind(input.id)
      .all<{ source_id: string }>();
    const statements: D1PreparedStatement[] = [
      ...entityStatements,
      this.database
        .prepare(
          "DELETE FROM music_public_performance_sort_keys WHERE performance_id = ?",
        )
        .bind(input.id),
      this.database
        .prepare(
          `UPDATE music_performances SET song_id = ?, relation_type = ?,
        release_type = ?, participation_type = ?, quality_status = ?, released_at = ?,
        internal_note = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND version = ? AND publication_status IN ('draft', 'published')`,
        )
        .bind(
          input.songId,
          input.relationType,
          input.releaseType,
          input.participationType,
          input.qualityStatus,
          input.releasedAt,
          input.internalNote?.trim() || null,
          now,
          input.id,
          input.expectedVersion,
        ),
      versionGuard(this.database),
      ...(existingSource
        ? [
            this.database
              .prepare(
                `UPDATE music_media_sources SET channel_id = ?, title = ?, thumbnail_url = ?,
                duration_seconds = ?, provider_published_at = ?, availability_status = ?,
                last_checked_at = ?, version = version + 1, updated_at = ? WHERE id = ?`,
              )
              .bind(
                input.source.channelId,
                video.title,
                video.thumbnailUrl,
                video.durationSeconds,
                video.publishedAt,
                video.availabilityStatus,
                now,
                now,
                sourceId,
              ),
          ]
        : [this.sourceInsert(sourceId, video, input.source.channelId, now)]),
      this.database
        .prepare(
          "DELETE FROM music_performance_participants WHERE performance_id = ?",
        )
        .bind(input.id),
      ...participants.map((participant) =>
        this.database
          .prepare(
            `INSERT INTO music_performance_participants
        (performance_id, entity_id, participant_role, credit_order, credit_name_snapshot)
        VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(
            input.id,
            participant.entity.id,
            participant.participantRole,
            participant.creditOrder,
            participant.creditNameSnapshot?.trim() || participant.entity.displayName,
          ),
      ),
      this.database
        .prepare(
          "DELETE FROM music_performance_sources WHERE performance_id = ?",
        )
        .bind(input.id),
      this.database
        .prepare(
          `INSERT INTO music_performance_sources
        (performance_id, source_id, start_seconds, end_seconds, source_role, priority, is_primary)
        VALUES (?, ?, ?, ?, ?, 0, 1)`,
        )
        .bind(
          input.id,
          sourceId,
          input.source.startSeconds,
          input.source.endSeconds ?? null,
          input.source.sourceRole,
        ),
      ...previousSourceRows.results
        .filter((row) => row.source_id !== sourceId)
        .map((row) =>
          this.database
            .prepare(
              `DELETE FROM music_media_sources
               WHERE id = ?
                 AND NOT EXISTS (
                   SELECT 1 FROM music_performance_sources WHERE source_id = ?
                 )
                 AND NOT EXISTS (
                   SELECT 1 FROM music_media_source_relations
                   WHERE source_id = ? OR related_source_id = ?
                 )`,
            )
            .bind(row.source_id, row.source_id, row.source_id, row.source_id),
        ),
      ...projectionStatements(this.database, current.song_id),
      ...(current.song_id === input.songId
        ? []
        : projectionStatements(this.database, input.songId)),
      this.database
        .prepare(
          `INSERT INTO music_catalog_events
        (id, aggregate_type, aggregate_id, event_type, actor_kind, actor_user_id, after_json, created_at)
        VALUES (?, 'performance', ?, 'performance.updated', 'admin', ?, ?, ?)`,
        )
        .bind(
          ids.eventId,
          input.id,
          actor.userId,
          eventJson({
            songId: input.songId,
            version: input.expectedVersion + 1,
          }),
          now,
        ),
    ];
    await this.executeCatalogBatch(statements, Number(meta.revision), now);
    return this.readPerformance(input.id);
  }

  async transitionPerformance(
    id: string,
    expectedVersion: number,
    target: "published" | "withdrawn",
    actor: AdminCatalogActor,
    eventId: string,
    now: number,
  ) {
    const meta = await this.readRevision();
    const current = await this.database
      .prepare(
        `SELECT song_id, publication_status
      FROM music_performances WHERE id = ?`,
      )
      .bind(id)
      .first<{ song_id: string; publication_status: string }>();
    if (!current)
      throw new AdminCatalogRepositoryError(
        "not_found",
        "Performance not found",
      );
    const expectedStatus = target === "published" ? "draft" : "published";
    if (target === "published") {
      const eligibility = await this.database
        .prepare(
          `SELECT
        EXISTS (
          SELECT 1 FROM music_performance_participants
          WHERE performance_id = ?
            AND participant_role IN ('vocal', 'featured_vocal', 'chorus')
        ) AS has_participant,
        EXISTS (
          SELECT 1 FROM music_performance_sources AS link
          JOIN music_media_sources AS source ON source.id = link.source_id
          JOIN music_channels AS channel ON channel.id = source.channel_id
          WHERE link.performance_id = ? AND link.is_primary = 1
            AND link.source_role IN ('official', 'alternate')
            AND channel.verification_status = 'approved' AND channel.active = 1
            AND channel.channel_role IN (
              'otw_official', 'unit_official', 'member_music', 'member_main', 'project_official'
            )
        ) AS has_source
      `,
        )
        .bind(id, id)
        .first<{ has_participant: number; has_source: number }>();
      if (!eligibility?.has_participant || !eligibility.has_source) {
        throw new AdminCatalogRepositoryError(
          "validation_failed",
          "Published performance requires a singing participant and approved active official source",
        );
      }
    }
    const publishValidation =
      target === "published"
        ? `AND EXISTS (
          SELECT 1 FROM music_performance_participants
          WHERE performance_id = ?
            AND participant_role IN ('vocal', 'featured_vocal', 'chorus')
        )
        AND EXISTS (
          SELECT 1 FROM music_performance_sources AS link
          JOIN music_media_sources AS source ON source.id = link.source_id
          JOIN music_channels AS channel ON channel.id = source.channel_id
          WHERE link.performance_id = ? AND link.is_primary = 1
            AND link.source_role IN ('official', 'alternate')
            AND channel.verification_status = 'approved' AND channel.active = 1
            AND channel.channel_role IN (
              'otw_official', 'unit_official', 'member_music', 'member_main', 'project_official'
            )
        )`
        : "";
    const updateBinds: SqlValue[] = [
      target,
      now,
      id,
      expectedVersion,
      expectedStatus,
    ];
    if (target === "published") updateBinds.push(id, id);
    const statements: D1PreparedStatement[] = [
      this.database
        .prepare(
          `UPDATE music_performances SET publication_status = ?,
        version = version + 1, updated_at = ?
        WHERE id = ? AND version = ? AND publication_status = ?
        ${publishValidation}`,
        )
        .bind(...updateBinds),
      versionGuard(this.database),
      ...projectionStatements(this.database, current.song_id),
      this.database
        .prepare(
          `INSERT INTO music_catalog_events
        (id, aggregate_type, aggregate_id, event_type, actor_kind, actor_user_id,
         before_json, after_json, created_at)
        VALUES (?, 'performance', ?, ?, 'admin', ?, ?, ?, ?)`,
        )
        .bind(
          eventId,
          id,
          `performance.${target}`,
          actor.userId,
          eventJson({ publicationStatus: expectedStatus }),
          eventJson({ publicationStatus: target }),
          now,
        ),
    ];
    await this.executeCatalogBatch(statements, Number(meta.revision), now);
    return this.readPerformance(id);
  }

  async deletePerformance(
    id: string,
    expectedVersion: number,
    actor: AdminCatalogActor,
    eventId: string,
    now: number,
  ) {
    const meta = await this.readRevision();
    const current = await this.database
      .prepare(
        `SELECT song_id, version, publication_status
         FROM music_performances WHERE id = ?`,
      )
      .bind(id)
      .first<{
        song_id: string;
        version: number;
        publication_status: string;
      }>();
    if (!current)
      throw new AdminCatalogRepositoryError(
        "not_found",
        "Performance not found",
      );
    if (Number(current.version) !== expectedVersion) {
      throw new AdminCatalogRepositoryError(
        "stale_write",
        "Performance changed since it was loaded",
      );
    }
    if (
      current.publication_status !== "draft" &&
      current.publication_status !== "withdrawn"
    ) {
      throw new AdminCatalogRepositoryError(
        "validation_failed",
        "Only draft or withdrawn performances can be deleted",
      );
    }
    const approvedProposal = await this.database
      .prepare(
        `SELECT id FROM music_cover_proposals
         WHERE approved_performance_id = ? LIMIT 1`,
      )
      .bind(id)
      .first<{ id: string }>();
    if (approvedProposal) {
      throw new AdminCatalogRepositoryError(
        "validation_failed",
        "A performance linked to an approved proposal cannot be deleted",
      );
    }
    const sourceRows = await this.database
      .prepare(
        `SELECT source_id FROM music_performance_sources
         WHERE performance_id = ?`,
      )
      .bind(id)
      .all<{ source_id: string }>();
    const statements: D1PreparedStatement[] = [
      this.database
        .prepare(
          `DELETE FROM music_performances
           WHERE id = ? AND version = ?
             AND publication_status IN ('draft', 'withdrawn')`,
        )
        .bind(id, expectedVersion),
      versionGuard(this.database),
      ...sourceRows.results.map((row) =>
        this.database
          .prepare(
            `DELETE FROM music_media_sources
             WHERE id = ?
               AND NOT EXISTS (
                 SELECT 1 FROM music_performance_sources WHERE source_id = ?
               )
               AND NOT EXISTS (
                 SELECT 1 FROM music_media_source_relations
                 WHERE source_id = ? OR related_source_id = ?
               )`,
          )
          .bind(row.source_id, row.source_id, row.source_id, row.source_id),
      ),
      ...projectionStatements(this.database, current.song_id),
      this.database
        .prepare(
          `INSERT INTO music_catalog_events
          (id, aggregate_type, aggregate_id, event_type, actor_kind, actor_user_id,
           before_json, created_at)
          VALUES (?, 'performance', ?, 'performance.deleted', 'admin', ?, ?, ?)`,
        )
        .bind(
          eventId,
          id,
          actor.userId,
          eventJson({
            songId: current.song_id,
            publicationStatus: current.publication_status,
            version: expectedVersion,
          }),
          now,
        ),
    ];
    await this.executeCatalogBatch(statements, Number(meta.revision), now);
    return { data: { id }, catalogRevision: Number(meta.revision) + 1 };
  }

  async createChannel(
    input: OtwPlayAdminCreateChannelRequest,
    actor: AdminCatalogActor,
    ids: { channelId: string; eventId: string },
    now: number,
  ) {
    const meta = await this.readRevision();
    const statements: D1PreparedStatement[] = [
      this.database
        .prepare(
          `INSERT INTO music_channels (
        id, provider, external_channel_id, display_name, channel_role,
        verification_status, active, version, created_at, updated_at
      ) VALUES (?, 'youtube', ?, ?, ?, 'pending', 0, 0, ?, ?)`,
        )
        .bind(
          ids.channelId,
          input.externalChannelId,
          input.displayName.trim(),
          input.channelRole,
          now,
          now,
        ),
      ...input.entityIds.map((entityId) =>
        this.database
          .prepare(
            "INSERT INTO music_channel_entities (channel_id, entity_id) VALUES (?, ?)",
          )
          .bind(ids.channelId, entityId),
      ),
      this.database
        .prepare(
          `INSERT INTO music_catalog_events
        (id, aggregate_type, aggregate_id, event_type, actor_kind, actor_user_id, after_json, created_at)
        VALUES (?, 'channel', ?, 'channel.created', 'admin', ?, ?, ?)`,
        )
        .bind(
          ids.eventId,
          ids.channelId,
          actor.userId,
          eventJson({
            externalChannelId: input.externalChannelId,
            status: "pending",
          }),
          now,
        ),
    ];
    await this.executeCatalogBatch(statements, Number(meta.revision), now);
    return this.readChannel(ids.channelId);
  }

  async updateChannel(
    input: OtwPlayAdminUpdateChannelRequest,
    actor: AdminCatalogActor,
    eventId: string,
    now: number,
  ) {
    const meta = await this.readRevision();
    const current = await this.database
      .prepare("SELECT external_channel_id FROM music_channels WHERE id = ?")
      .bind(input.id)
      .first<{ external_channel_id: string }>();
    if (!current) {
      throw new AdminCatalogRepositoryError("not_found", "Channel not found");
    }
    if (current.external_channel_id !== input.externalChannelId) {
      const linkedSource = await this.database
        .prepare(
          "SELECT 1 AS linked FROM music_media_sources WHERE channel_id = ? LIMIT 1",
        )
        .bind(input.id)
        .first<{ linked: number }>();
      if (linkedSource) {
        throw new AdminCatalogRepositoryError(
          "validation_failed",
          "A channel with linked sources cannot change its YouTube identity",
        );
      }
    }
    const statements: D1PreparedStatement[] = [
      this.database
        .prepare(
          `UPDATE music_channels SET external_channel_id = ?,
        display_name = ?, channel_role = ?, verification_status = ?, active = ?,
        version = version + 1, updated_at = ? WHERE id = ? AND version = ?`,
        )
        .bind(
          input.externalChannelId,
          input.displayName.trim(),
          input.channelRole,
          input.verificationStatus,
          input.active ? 1 : 0,
          now,
          input.id,
          input.expectedVersion,
        ),
      versionGuard(this.database),
      this.database
        .prepare("DELETE FROM music_channel_entities WHERE channel_id = ?")
        .bind(input.id),
      ...input.entityIds.map((entityId) =>
        this.database
          .prepare(
            "INSERT INTO music_channel_entities (channel_id, entity_id) VALUES (?, ?)",
          )
          .bind(input.id, entityId),
      ),
      this.database
        .prepare(
          `INSERT INTO music_catalog_events
        (id, aggregate_type, aggregate_id, event_type, actor_kind, actor_user_id, after_json, created_at)
        VALUES (?, 'channel', ?, 'channel.updated', 'admin', ?, ?, ?)`,
        )
        .bind(
          eventId,
          input.id,
          actor.userId,
          eventJson({
            verificationStatus: input.verificationStatus,
            active: input.active,
          }),
          now,
        ),
    ];
    await this.executeCatalogBatch(statements, Number(meta.revision), now);
    return this.readChannel(input.id);
  }

  async deleteChannel(
    id: string,
    expectedVersion: number,
    actor: AdminCatalogActor,
    eventId: string,
    now: number,
  ) {
    const meta = await this.readRevision();
    const statements = [
      this.database
        .prepare("DELETE FROM music_channels WHERE id = ? AND version = ?")
        .bind(id, expectedVersion),
      versionGuard(this.database),
      this.database
        .prepare(
          `INSERT INTO music_catalog_events
        (id, aggregate_type, aggregate_id, event_type, actor_kind, actor_user_id, created_at)
        VALUES (?, 'channel', ?, 'channel.deleted', 'admin', ?, ?)`,
        )
        .bind(eventId, id, actor.userId, now),
    ];
    await this.executeCatalogBatch(statements, Number(meta.revision), now);
    return { data: { id }, catalogRevision: Number(meta.revision) + 1 };
  }

  async recheckSource(
    sourceId: string,
    expectedVersion: number,
    video: AdminCreatePerformanceCommand["video"],
    actor: AdminCatalogActor,
    eventId: string,
    now: number,
  ) {
    const meta = await this.readRevision();
    const current = await this.database
      .prepare(
        `SELECT source.external_id,
        source.channel_id, channel.external_channel_id
      FROM music_media_sources AS source
      JOIN music_channels AS channel ON channel.id = source.channel_id
      WHERE source.id = ?`,
      )
      .bind(sourceId)
      .first<{
        external_id: string;
        channel_id: string;
        external_channel_id: string;
      }>();
    if (!current)
      throw new AdminCatalogRepositoryError("not_found", "Source not found");
    if (
      current.external_id !== video.videoId ||
      current.external_channel_id !== video.channelId
    ) {
      throw new AdminCatalogRepositoryError(
        "validation_failed",
        "YouTube source identity changed during recheck",
      );
    }
    const statements = [
      this.database
        .prepare(
          `UPDATE music_media_sources SET title = ?, thumbnail_url = ?,
        duration_seconds = ?, provider_published_at = ?, availability_status = ?,
        last_checked_at = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND version = ?`,
        )
        .bind(
          video.title,
          video.thumbnailUrl,
          video.durationSeconds,
          video.publishedAt,
          video.availabilityStatus,
          now,
          now,
          sourceId,
          expectedVersion,
        ),
      versionGuard(this.database),
      this.database
        .prepare(
          `INSERT INTO music_catalog_events
        (id, aggregate_type, aggregate_id, event_type, actor_kind, actor_user_id, after_json, created_at)
        VALUES (?, 'source', ?, 'source.rechecked', 'admin', ?, ?, ?)`,
        )
        .bind(
          eventId,
          sourceId,
          actor.userId,
          eventJson({ availabilityStatus: video.availabilityStatus }),
          now,
        ),
    ];
    await this.executeCatalogBatch(statements, Number(meta.revision), now);
    const catalog = await this.readCatalog();
    const source = catalog.performances
      .flatMap((performance) => performance.sources.map((item) => item.source))
      .find((item) => item.id === sourceId);
    if (!source)
      throw new AdminCatalogRepositoryError(
        "not_found",
        "Source is not linked",
      );
    return { data: source, catalogRevision: catalog.revision };
  }

  async rejectProposal(
    proposalId: string,
    input: OtwPlayAdminRejectProposalRequest,
    actor: AdminCatalogActor,
    eventId: string,
    now: number,
  ) {
    const meta = await this.readRevision();
    const statements = [
      this.database
        .prepare(
          `UPDATE music_cover_proposals SET status = 'rejected',
        reviewed_by_user_id = ?, reviewed_at = ?, review_result_code = ?, review_note = ?,
        review_lock_token = NULL, review_lock_expires_at = NULL,
        version = version + 1, updated_at = ?
        WHERE id = ? AND status = 'pending_review' AND version = ?`,
        )
        .bind(
          actor.userId,
          now,
          input.resultCode.trim(),
          input.note?.trim() || null,
          now,
          proposalId,
          input.expectedVersion,
        ),
      versionGuard(this.database),
      this.database
        .prepare(
          `INSERT INTO music_catalog_events
        (id, aggregate_type, aggregate_id, event_type, actor_kind, actor_user_id, detail_json, created_at)
        VALUES (?, 'proposal', ?, 'proposal.rejected', 'admin', ?, ?, ?)`,
        )
        .bind(
          eventId,
          proposalId,
          actor.userId,
          eventJson({ resultCode: input.resultCode.trim() }),
          now,
        ),
    ];
    await this.executeCatalogBatch(statements, Number(meta.revision), now);
    const proposal = (await this.readProposals()).find(
      (item) => item.id === proposalId,
    );
    if (!proposal)
      throw new AdminCatalogRepositoryError("not_found", "Proposal not found");
    return { data: proposal, catalogRevision: Number(meta.revision) + 1 };
  }

  async approveProposal(command: AdminApproveProposalCommand) {
    const { proposalId, input, video, actor, now, ids } = command;
    const catalogResult = await this.createCatalogEntry({
      input: {
        expectedCatalogRevision: input.expectedCatalogRevision,
        youtubeUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
        startSeconds: 0,
        song: input.song,
        participants: input.participants,
        channel: input.channel,
        relationType: "cover",
        releaseType: input.releaseType,
        participationType: input.participationType,
        publicationTarget: "published",
        internalNote: null,
      },
      video,
      actor,
      now,
      ids: {
        entityIds: ids.entityIds,
        entityEventIds: ids.entityEventIds,
        channelId: ids.channelId,
        channelEventId: ids.channelEventId,
        songId: ids.songId,
        songEventId: ids.songEventId,
        performanceId: ids.performanceId,
        performanceEventId: ids.performanceEventId,
        sourceId: ids.sourceId,
      },
      proposalApproval: {
        proposalId,
        expectedVersion: input.expectedVersion,
        lockToken: ids.lockToken,
        proposalEventId: ids.proposalEventId,
      },
    });
    const proposal = (await this.readProposals()).find(
      (item) => item.id === proposalId,
    );
    if (!proposal) {
      throw new AdminCatalogRepositoryError("not_found", "Proposal not found");
    }
    return { data: proposal, catalogRevision: catalogResult.catalogRevision };
  }
}
