import type {
  OtwPlayAdminSourceDto,
  OtwPlayAdminSourceHealthDto,
  OtwPlayAdminSourceHealthItemDto,
  OtwPlaySourceAvailabilityStatus,
  OtwPlaySourceHealthEventType,
  OtwPlaySourceHealthRetryCode,
} from "@contracts/otw-play";
import type {
  SourceHealthMutationResult,
  SourceHealthObservationCommand,
  SourceHealthRepository,
  SourceHealthRetryCommand,
  SourceHealthTarget,
} from "../application/ports/source-health-repository";
import { SourceHealthRepositoryError } from "../application/ports/source-health-repository";
import {
  OTW_PLAY_SOURCE_HEALTH_LIMIT,
  OTW_PLAY_SOURCE_HEALTH_LINK_LIMIT,
} from "../domain/source-health-policy";

type RevisionRow = { revision: number; read_model_revision: number };
type TargetRow = {
  id: string;
  provider: "youtube";
  external_id: string;
  channel_id: string;
  external_channel_id: string;
  title: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  provider_published_at: number | null;
  availability_status: OtwPlaySourceAvailabilityStatus;
  last_checked_at: number | null;
  next_check_at: number | null;
  version: number;
};

type DashboardSourceRow = TargetRow & {
  channel_display_name: string;
};

type LinkRow = {
  source_id: string;
  song_id: string;
  song_title: string;
  performance_id: string;
  publication_status: "draft" | "published" | "withdrawn";
  linked_count: number;
};

type EventRow = {
  aggregate_id: string;
  event_type: OtwPlaySourceHealthEventType;
  detail_json: string | null;
  created_at: number;
};

const HEALTH_EVENT_TYPES: OtwPlaySourceHealthEventType[] = [
  "source.unavailable",
  "source.recovered",
  "source.availability_changed",
  "source.checked",
  "source.retry_scheduled",
];

const resultsOf = <T>(result: D1Result<T>) => result.results ?? [];
const eventJson = (value: Record<string, unknown>) => JSON.stringify(value);
const placeholders = (length: number) => Array.from({ length }, () => "?").join(",");

const versionGuard = (database: D1Database) =>
  database.prepare(`UPDATE music_catalog_meta
    SET id = CASE WHEN changes() = 1 THEN 1 ELSE 2 END WHERE id = 1`);

const appendRevisionStatements = (
  database: D1Database,
  expectedRevision: number,
  now: number,
) => [
  database
    .prepare(`UPDATE music_catalog_meta SET revision = revision + 1, updated_at = ?
      WHERE id = 1 AND revision = ?`)
    .bind(now, expectedRevision),
  versionGuard(database),
  database
    .prepare(`UPDATE music_public_read_model_meta SET revision = ?, updated_at = ?
      WHERE id = 1 AND revision = ?`)
    .bind(expectedRevision + 1, now, expectedRevision),
  versionGuard(database),
];

const targetOf = (row: TargetRow): SourceHealthTarget => ({
  id: row.id,
  provider: row.provider,
  externalId: row.external_id,
  channelId: row.channel_id,
  externalChannelId: row.external_channel_id,
  title: row.title,
  thumbnailUrl: row.thumbnail_url,
  durationSeconds: row.duration_seconds,
  providerPublishedAt: row.provider_published_at,
  availabilityStatus: row.availability_status,
  lastCheckedAt: row.last_checked_at,
  nextCheckAt: row.next_check_at,
  version: Number(row.version),
});

const sourceDtoOf = (row: TargetRow): OtwPlayAdminSourceDto => ({
  id: row.id,
  provider: row.provider,
  externalId: row.external_id,
  channelId: row.channel_id,
  title: row.title,
  thumbnailUrl: row.thumbnail_url,
  durationSeconds: row.duration_seconds,
  providerPublishedAt: row.provider_published_at,
  availabilityStatus: row.availability_status,
  lastCheckedAt: row.last_checked_at,
  nextCheckAt: row.next_check_at,
  version: Number(row.version),
});

const actorBindings = () => ["system", null] as const;

const healthEventType = (
  before: OtwPlaySourceAvailabilityStatus,
  after: OtwPlaySourceAvailabilityStatus,
): OtwPlaySourceHealthEventType =>
  before === "playable" && after !== "playable"
    ? "source.unavailable"
    : before !== "playable" && after === "playable"
      ? "source.recovered"
      : before !== after
        ? "source.availability_changed"
        : "source.checked";

const safeRetryCode = (detailJson: string | null) => {
  if (!detailJson) return null;
  try {
    const value = (JSON.parse(detailJson) as { retryCode?: unknown }).retryCode;
    return typeof value === "string" ? (value as OtwPlaySourceHealthRetryCode) : null;
  } catch {
    return null;
  }
};

export class D1SourceHealthRepository implements SourceHealthRepository {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  private async readRevision() {
    const row = await this.database
      .prepare(`SELECT catalog.revision, read_model.revision AS read_model_revision
        FROM music_catalog_meta AS catalog
        JOIN music_public_read_model_meta AS read_model ON read_model.id = catalog.id
        WHERE catalog.id = 1`)
      .first<RevisionRow>();
    if (!row) {
      throw new SourceHealthRepositoryError("unavailable", "Catalog meta missing");
    }
    return {
      revision: Number(row.revision),
      readModelRevision: Number(row.read_model_revision),
    };
  }

  private targetQuery(where: string) {
    return `SELECT source.id, source.provider, source.external_id, source.channel_id,
      channel.external_channel_id, source.title, source.thumbnail_url,
      source.duration_seconds, source.provider_published_at,
      source.availability_status, source.last_checked_at, source.next_check_at,
      source.version
      FROM music_media_sources AS source
      JOIN music_channels AS channel ON channel.id = source.channel_id
      WHERE ${where}`;
  }

  async readTarget(sourceId: string) {
    const row = await this.database
      .prepare(this.targetQuery("source.id = ?"))
      .bind(sourceId)
      .first<TargetRow>();
    return row ? targetOf(row) : null;
  }

  private async hasPublicImpact(sourceId: string) {
    const row = await this.database
      .prepare(`SELECT EXISTS (
        SELECT 1
        FROM music_performance_sources AS link
        JOIN music_performances AS performance ON performance.id = link.performance_id
        JOIN music_songs AS song ON song.id = performance.song_id
        WHERE link.source_id = ?
          AND performance.publication_status = 'published'
          AND song.archived_at IS NULL
      ) AS public_impact`)
      .bind(sourceId)
      .first<{ public_impact: number }>();
    return Boolean(row?.public_impact);
  }

  async claimDueSources(now: number, leaseUntil: number, limit: number) {
    const boundedLimit = Math.min(
      OTW_PLAY_SOURCE_HEALTH_LIMIT,
      Math.max(0, Math.trunc(limit)),
    );
    if (boundedLimit === 0) return [];
    const claimed = await this.database
      .prepare(`UPDATE music_media_sources
        SET next_check_at = ?, updated_at = ?
        WHERE id IN (
          SELECT id FROM music_media_sources
          WHERE next_check_at <= ?
          ORDER BY next_check_at, id
          LIMIT ?
        )
        RETURNING id`)
      .bind(leaseUntil, now, now, boundedLimit)
      .all<{ id: string }>();
    const ids = resultsOf(claimed).map((row) => row.id).sort();
    if (ids.length === 0) return [];
    const rows = await this.database
      .prepare(
        `${this.targetQuery(`source.id IN (${placeholders(ids.length)})`)}
         ORDER BY source.id`,
      )
      .bind(...ids)
      .all<TargetRow>();
    return resultsOf(rows).map(targetOf);
  }

  async applyObservation(
    command: SourceHealthObservationCommand,
  ): Promise<SourceHealthMutationResult> {
    const { target, observation, actor, eventId, checkedAt, nextCheckAt } = command;
    const revision = await this.readRevision();
    const remote = observation.video;
    const title = remote?.title ?? target.title;
    const thumbnailUrl = remote?.thumbnailUrl ?? target.thumbnailUrl;
    const durationSeconds = remote?.durationSeconds ?? target.durationSeconds;
    const providerPublishedAt = remote?.publishedAt ?? target.providerPublishedAt;
    const availabilityStatus = observation.availabilityStatus;
    const publicChanged =
      title !== target.title ||
      thumbnailUrl !== target.thumbnailUrl ||
      durationSeconds !== target.durationSeconds ||
      providerPublishedAt !== target.providerPublishedAt ||
      availabilityStatus !== target.availabilityStatus;
    const incrementsRevisions =
      publicChanged && (await this.hasPublicImpact(target.id));
    if (
      incrementsRevisions &&
      revision.revision !== revision.readModelRevision
    ) {
      throw new SourceHealthRepositoryError(
        "unavailable",
        "Catalog read model must be repaired before source health changes",
      );
    }
    const eventType = healthEventType(
      target.availabilityStatus,
      availabilityStatus,
    );
    const statements: D1PreparedStatement[] = [
      this.database
        .prepare(`UPDATE music_media_sources SET title = ?, thumbnail_url = ?,
          duration_seconds = ?, provider_published_at = ?, availability_status = ?,
          last_checked_at = ?, next_check_at = ?, version = version + 1, updated_at = ?
          WHERE id = ? AND version = ?`)
        .bind(
          title,
          thumbnailUrl,
          durationSeconds,
          providerPublishedAt,
          availabilityStatus,
          checkedAt,
          nextCheckAt,
          checkedAt,
          target.id,
          target.version,
        ),
      versionGuard(this.database),
      this.database
        .prepare(`INSERT INTO music_catalog_events
          (id, aggregate_type, aggregate_id, event_type, actor_kind,
           actor_user_id, before_json, after_json, detail_json, created_at)
          VALUES (?, 'source', ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          eventId,
          target.id,
          eventType,
          ...actorBindings(),
          eventJson({ availabilityStatus: target.availabilityStatus }),
          eventJson({ availabilityStatus }),
          eventJson({
            trigger: actor.kind === "system" ? "scheduled" : "manual",
            previousAvailability: target.availabilityStatus,
            currentAvailability: availabilityStatus,
            checkedAt,
            nextCheckAt,
          }),
          checkedAt,
        ),
      ...(incrementsRevisions
        ? appendRevisionStatements(this.database, revision.revision, checkedAt)
        : []),
    ];
    try {
      await this.database.batch(statements);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/music_catalog_meta_singleton_check/i.test(message)) {
        return { kind: "stale" };
      }
      throw error;
    }
    const updated = await this.database
      .prepare(this.targetQuery("source.id = ?"))
      .bind(target.id)
      .first<TargetRow>();
    if (!updated) {
      throw new SourceHealthRepositoryError("not_found", "Source not found");
    }
    return {
      kind: "applied",
      response: {
        data: sourceDtoOf(updated),
        catalogRevision: revision.revision + (incrementsRevisions ? 1 : 0),
        check: {
          status: "checked",
          previousAvailability: target.availabilityStatus,
          currentAvailability: availabilityStatus,
          changed: publicChanged,
          checkedAt,
          nextCheckAt,
        },
      },
    };
  }

  async scheduleRetry(
    command: SourceHealthRetryCommand,
  ): Promise<SourceHealthMutationResult> {
    const { target, actor, eventId, retryCode, nextCheckAt, now } = command;
    const revision = await this.readRevision();
    try {
      await this.database.batch([
        this.database
          .prepare(`UPDATE music_media_sources
            SET next_check_at = ?, version = version + 1, updated_at = ?
            WHERE id = ? AND version = ?`)
          .bind(nextCheckAt, now, target.id, target.version),
        versionGuard(this.database),
        this.database
          .prepare(`INSERT INTO music_catalog_events
            (id, aggregate_type, aggregate_id, event_type, actor_kind,
             actor_user_id, detail_json, created_at)
            VALUES (?, 'source', ?, 'source.retry_scheduled', ?, ?, ?, ?)`)
          .bind(
            eventId,
            target.id,
            ...actorBindings(),
            eventJson({
              trigger: actor.kind === "system" ? "scheduled" : "manual",
              retryCode,
              previousAvailability: target.availabilityStatus,
              currentAvailability: target.availabilityStatus,
              nextCheckAt,
            }),
            now,
          ),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/music_catalog_meta_singleton_check/i.test(message)) {
        return { kind: "stale" };
      }
      throw error;
    }
    const updated = await this.database
      .prepare(this.targetQuery("source.id = ?"))
      .bind(target.id)
      .first<TargetRow>();
    if (!updated) {
      throw new SourceHealthRepositoryError("not_found", "Source not found");
    }
    return {
      kind: "applied",
      response: {
        data: sourceDtoOf(updated),
        catalogRevision: revision.revision,
        check: {
          status: "retry_scheduled",
          currentAvailability: target.availabilityStatus,
          retryCode,
          nextCheckAt,
        },
      },
    };
  }

  async readDashboard(
    now: number,
    recentSince: number,
    listLimit: number,
    linkLimit: number,
  ): Promise<OtwPlayAdminSourceHealthDto> {
    const boundedListLimit = Math.min(
      OTW_PLAY_SOURCE_HEALTH_LIMIT,
      Math.max(0, Math.trunc(listLimit)),
    );
    const boundedLinkLimit = Math.min(
      OTW_PLAY_SOURCE_HEALTH_LINK_LIMIT,
      Math.max(0, Math.trunc(linkLimit)),
    );
    const [dueCount, unplayableCount, recoveredCount, dueIds, unplayableIds, recoveredIds] =
      await this.database.batch([
        this.database.prepare(`SELECT COUNT(*) AS count FROM music_media_sources
          WHERE next_check_at <= ?`).bind(now),
        this.database.prepare(`SELECT COUNT(*) AS count FROM music_media_sources
          WHERE availability_status <> 'playable'`),
        this.database.prepare(`SELECT COUNT(DISTINCT aggregate_id) AS count
          FROM music_catalog_events
          WHERE event_type = 'source.recovered' AND created_at >= ?`).bind(recentSince),
        this.database.prepare(`SELECT id FROM music_media_sources
          WHERE next_check_at <= ? ORDER BY next_check_at, id LIMIT ?`).bind(now, boundedListLimit),
        this.database.prepare(`SELECT id FROM music_media_sources
          WHERE availability_status <> 'playable'
          ORDER BY COALESCE(last_checked_at, 0), id LIMIT ?`).bind(boundedListLimit),
        this.database.prepare(`SELECT aggregate_id AS id, MAX(created_at) AS recovered_at
          FROM music_catalog_events
          WHERE event_type = 'source.recovered' AND created_at >= ?
          GROUP BY aggregate_id
          ORDER BY recovered_at DESC, aggregate_id LIMIT ?`).bind(recentSince, boundedListLimit),
      ]);
    const dueIdList = resultsOf(dueIds as D1Result<{ id: string }>).map((row) => row.id);
    const unplayableIdList = resultsOf(
      unplayableIds as D1Result<{ id: string }>,
    ).map((row) => row.id);
    const recoveredRows = resultsOf(
      recoveredIds as D1Result<{ id: string; recovered_at: number }>,
    );
    const recoveredAt = new Map(
      recoveredRows.map((row) => [row.id, Number(row.recovered_at)]),
    );
    const ids = [...new Set([...dueIdList, ...unplayableIdList, ...recoveredAt.keys()])];
    if (ids.length === 0) {
      return {
        generatedAt: now,
        recentRecoveryWindowDays: 7,
        listLimit: 50,
        counts: {
          due: Number(resultsOf(dueCount as D1Result<{ count: number }>)[0]?.count ?? 0),
          unplayable: Number(
            resultsOf(unplayableCount as D1Result<{ count: number }>)[0]?.count ?? 0,
          ),
          recentlyRecovered: Number(
            resultsOf(recoveredCount as D1Result<{ count: number }>)[0]?.count ?? 0,
          ),
        },
        due: [],
        unplayable: [],
        recentlyRecovered: [],
      };
    }
    const idMarks = placeholders(ids.length);
    const eventMarks = placeholders(HEALTH_EVENT_TYPES.length);
    const [sourceResult, linkResult, eventResult] = await this.database.batch([
      this.database
        .prepare(`${this.targetQuery(`source.id IN (${idMarks})`)
          .replace("source.version", "source.version, channel.display_name AS channel_display_name")}
          ORDER BY source.id`)
        .bind(...ids),
      this.database
        .prepare(`WITH ranked_links AS (
          SELECT link.source_id, song.id AS song_id, song.title AS song_title,
            performance.id AS performance_id,
            performance.publication_status,
            COUNT(*) OVER (PARTITION BY link.source_id) AS linked_count,
            ROW_NUMBER() OVER (
              PARTITION BY link.source_id
              ORDER BY CASE performance.publication_status
                WHEN 'published' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
                song.normalized_title, performance.id
            ) AS link_rank
          FROM music_performance_sources AS link
          JOIN music_performances AS performance ON performance.id = link.performance_id
          JOIN music_songs AS song ON song.id = performance.song_id
          WHERE link.source_id IN (${idMarks})
        )
        SELECT source_id, song_id, song_title, performance_id,
          publication_status, linked_count
        FROM ranked_links WHERE link_rank <= ?
        ORDER BY source_id, link_rank`)
        .bind(...ids, boundedLinkLimit),
      this.database
        .prepare(`WITH ranked_events AS (
          SELECT aggregate_id, event_type, detail_json, created_at,
            ROW_NUMBER() OVER (
              PARTITION BY aggregate_id ORDER BY created_at DESC, id DESC
            ) AS event_rank
          FROM music_catalog_events
          WHERE aggregate_type = 'source'
            AND aggregate_id IN (${idMarks})
            AND event_type IN (${eventMarks})
        )
        SELECT aggregate_id, event_type, detail_json, created_at
        FROM ranked_events WHERE event_rank = 1`)
        .bind(...ids, ...HEALTH_EVENT_TYPES),
    ]);
    const links = new Map<string, LinkRow[]>();
    for (const row of resultsOf(linkResult as D1Result<LinkRow>)) {
      const current = links.get(row.source_id) ?? [];
      current.push(row);
      links.set(row.source_id, current);
    }
    const events = new Map(
      resultsOf(eventResult as D1Result<EventRow>).map((row) => [
        row.aggregate_id,
        row,
      ]),
    );
    const items = new Map<string, OtwPlayAdminSourceHealthItemDto>();
    for (const row of resultsOf(sourceResult as D1Result<DashboardSourceRow>)) {
      const sourceLinks = links.get(row.id) ?? [];
      const event = events.get(row.id);
      items.set(row.id, {
        source: sourceDtoOf(row),
        channel: {
          id: row.channel_id,
          externalChannelId: row.external_channel_id,
          displayName: row.channel_display_name,
        },
        linkedPerformanceCount: Number(sourceLinks[0]?.linked_count ?? 0),
        links: sourceLinks.map((link) => ({
          songId: link.song_id,
          songTitle: link.song_title,
          performanceId: link.performance_id,
          publicationStatus: link.publication_status,
        })),
        lastEvent: event
          ? {
              type: event.event_type,
              at: Number(event.created_at),
              retryCode: safeRetryCode(event.detail_json),
            }
          : null,
        recoveredAt: recoveredAt.get(row.id) ?? null,
      });
    }
    const pick = (orderedIds: string[]) =>
      orderedIds.flatMap((id) => {
        const item = items.get(id);
        return item ? [item] : [];
      });
    return {
      generatedAt: now,
      recentRecoveryWindowDays: 7,
      listLimit: 50,
      counts: {
        due: Number(resultsOf(dueCount as D1Result<{ count: number }>)[0]?.count ?? 0),
        unplayable: Number(
          resultsOf(unplayableCount as D1Result<{ count: number }>)[0]?.count ?? 0,
        ),
        recentlyRecovered: Number(
          resultsOf(recoveredCount as D1Result<{ count: number }>)[0]?.count ?? 0,
        ),
      },
      due: pick(dueIdList),
      unplayable: pick(unplayableIdList),
      recentlyRecovered: pick(recoveredRows.map((row) => row.id)),
    };
  }
}
