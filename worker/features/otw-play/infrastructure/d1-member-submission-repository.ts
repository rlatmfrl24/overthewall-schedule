import type {
  OtwPlayCreateSubmissionRequest,
  OtwPlayMemberSubmissionDto,
  OtwPlayMemberSubmissionStatus,
  OtwPlayParticipantRole,
  OtwPlaySubmissionSubjectInput,
} from "@contracts/otw-play";
import { normalizeOtwPlaySearchText } from "../domain/search-normalization";
import type { MemberSubmissionCursor } from "../domain/member-submission-cursor";
import {
  MemberSubmissionRepositoryError,
  type CreateMemberSubmissionCommand,
  type MemberSubmissionRepository,
} from "../application/ports/member-submission-repository";

type ProposalRow = {
  id: string;
  idempotency_key: string;
  submitted_url: string;
  youtube_video_id: string;
  submitted_title: string;
  suggested_song_id: string | null;
  submitted_note: string | null;
  status: OtwPlayMemberSubmissionStatus;
  created_at: number;
  updated_at: number;
  approved_song_id: string | null;
  approved_song_slug: string | null;
  approved_song_title: string | null;
  approved_song_archived_at: number | null;
  approved_song_merged_into_song_id: string | null;
  approved_performance_publication_status: string | null;
  approved_performance_release_type: string | null;
  public_read_enabled: number | null;
};

type ChildRow = {
  proposal_id: string;
  credit_order: number;
  submitted_name_snapshot: string;
  participant_role?: OtwPlayParticipantRole;
};

type ResolvedSubject = {
  resolvedEntityId: string | null;
  displayName: string;
};

type ResolvedParticipant = ResolvedSubject & {
  participantRole: OtwPlayParticipantRole;
};

const resultsOf = <T>(result: D1Result<T>): T[] =>
  Array.isArray(result.results) ? result.results : [];

const normalizeSnapshot = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/gu, " ");

const placeholders = (count: number) => Array(count).fill("?").join(", ");

const groupChildren = (rows: ChildRow[]) => {
  const map = new Map<string, ChildRow[]>();
  for (const row of rows) {
    map.set(row.proposal_id, [...(map.get(row.proposal_id) ?? []), row]);
  }
  return map;
};

const proposalSelect = `SELECT proposal.id, proposal.idempotency_key,
  proposal.submitted_url, proposal.youtube_video_id, proposal.submitted_title,
  proposal.suggested_song_id, proposal.submitted_note, proposal.status,
  proposal.created_at, proposal.updated_at,
  song.id AS approved_song_id, song.slug AS approved_song_slug,
  song.title AS approved_song_title,
  song.archived_at AS approved_song_archived_at,
  song.merged_into_song_id AS approved_song_merged_into_song_id,
  approved_performance.publication_status AS approved_performance_publication_status,
  approved_performance.release_type AS approved_performance_release_type,
  meta.public_read_enabled
FROM music_cover_proposals AS proposal
LEFT JOIN music_performances AS approved_performance
  ON approved_performance.id = proposal.approved_performance_id
LEFT JOIN music_songs AS song ON song.id = approved_performance.song_id
LEFT JOIN music_catalog_meta AS meta ON meta.id = 1`;

export class D1MemberSubmissionRepository
  implements MemberSubmissionRepository
{
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  async preflight(
    _userId: string,
    videoId: string,
    title: string | null,
  ) {
    const duplicate = await this.database
      .prepare(
        `SELECT CASE
          WHEN EXISTS (
            SELECT 1 FROM music_media_sources
            WHERE provider = 'youtube' AND external_id = ?
          ) THEN 'catalog'
          WHEN EXISTS (
            SELECT 1 FROM music_cover_proposals
            WHERE youtube_video_id = ? AND segment_start_seconds = 0
              AND status = 'pending_review'
          ) THEN 'pending'
          ELSE NULL
        END AS duplicate_kind`,
      )
      .bind(videoId, videoId)
      .first<{ duplicate_kind: "catalog" | "pending" | null }>();

    if (!title || !normalizeOtwPlaySearchText(title)) {
      return { duplicate: duplicate?.duplicate_kind ?? null, songCandidates: [] };
    }
    const normalized = normalizeOtwPlaySearchText(title);
    const candidateResult = await this.database
      .prepare(
        `SELECT song.id, song.title,
          COALESCE(GROUP_CONCAT(DISTINCT artist.display_name), '') AS original_artists
        FROM music_songs AS song
        LEFT JOIN music_song_aliases AS alias ON alias.song_id = song.id
        LEFT JOIN music_song_original_artists AS credit ON credit.song_id = song.id
        LEFT JOIN music_entities AS artist ON artist.id = credit.entity_id
        WHERE song.archived_at IS NULL AND song.merged_into_song_id IS NULL
          AND (
            song.normalized_title = ? OR song.normalized_title GLOB ?
            OR alias.normalized_alias = ? OR alias.normalized_alias GLOB ?
          )
        GROUP BY song.id, song.title, song.normalized_title
        ORDER BY CASE WHEN song.normalized_title = ? THEN 0 ELSE 1 END,
          song.normalized_title ASC, song.id ASC
        LIMIT 8`,
      )
      .bind(normalized, `${normalized}*`, normalized, `${normalized}*`, normalized)
      .all<{
        id: string;
        title: string;
        original_artists: string;
      }>();
    return {
      duplicate: duplicate?.duplicate_kind ?? null,
      songCandidates: resultsOf(candidateResult).map((row) => ({
        id: row.id,
        title: row.title,
        originalArtists: row.original_artists
          ? row.original_artists.split(",").filter(Boolean)
          : [],
      })),
    };
  }

  private async resolveSubjects(
    subjects: OtwPlaySubmissionSubjectInput[],
  ): Promise<ResolvedSubject[]> {
    const memberUids = Array.from(
      new Set(
        subjects.flatMap((subject) =>
          subject.kind === "member" ? [subject.memberUid] : [],
        ),
      ),
    );
    const memberMap = new Map<
      number,
      { name: string; entity_id: string | null }
    >();
    if (memberUids.length > 0) {
      const result = await this.database
        .prepare(
          `SELECT member.uid, member.name, entity.id AS entity_id
          FROM members AS member
          LEFT JOIN music_entities AS entity
            ON entity.member_uid = member.uid AND entity.archived_at IS NULL
          WHERE member.uid IN (${placeholders(memberUids.length)})
            AND (member.is_deprecated IS NULL OR member.is_deprecated = 0)`,
        )
        .bind(...memberUids)
        .all<{ uid: number; name: string; entity_id: string | null }>();
      for (const row of resultsOf(result)) {
        memberMap.set(Number(row.uid), {
          name: normalizeSnapshot(row.name),
          entity_id: row.entity_id,
        });
      }
      if (memberMap.size !== memberUids.length) {
        throw new MemberSubmissionRepositoryError(
          "invalid_request",
          "A selected member is not available",
        );
      }
    }

    return subjects.map((subject) => {
      if (subject.kind === "external") {
        return {
          resolvedEntityId: null,
          displayName: normalizeSnapshot(subject.displayName),
        };
      }
      const member = memberMap.get(subject.memberUid)!;
      return {
        resolvedEntityId: member.entity_id,
        displayName: member.name,
      };
    });
  }

  private async hydrate(rows: ProposalRow[]): Promise<OtwPlayMemberSubmissionDto[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const [participantResult, artistResult] = await this.database.batch([
      this.database
        .prepare(
          `SELECT proposal_id, credit_order, submitted_name_snapshot,
             participant_role
           FROM music_cover_proposal_participants
           WHERE proposal_id IN (${placeholders(ids.length)})
           ORDER BY proposal_id, credit_order`,
        )
        .bind(...ids),
      this.database
        .prepare(
          `SELECT proposal_id, credit_order, submitted_name_snapshot
           FROM music_cover_proposal_original_artists
           WHERE proposal_id IN (${placeholders(ids.length)})
           ORDER BY proposal_id, credit_order`,
        )
        .bind(...ids),
    ]);
    const participants = groupChildren(
      resultsOf(participantResult as D1Result<ChildRow>),
    );
    const artists = groupChildren(resultsOf(artistResult as D1Result<ChildRow>));
    return rows.map((row) => ({
      id: row.id,
      clientRequestId: row.idempotency_key,
      youtubeUrl: row.submitted_url,
      youtubeVideoId: row.youtube_video_id,
      title: row.submitted_title,
      suggestedSongId: row.suggested_song_id,
      note: row.submitted_note,
      status: row.status,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      participants: (participants.get(row.id) ?? []).map((item) => ({
        creditOrder: Number(item.credit_order),
        displayName: item.submitted_name_snapshot,
        participantRole: item.participant_role ?? "vocal",
      })),
      originalArtists: (artists.get(row.id) ?? []).map((item) => ({
        creditOrder: Number(item.credit_order),
        displayName: item.submitted_name_snapshot,
      })),
      approvedSong:
        row.approved_song_id && row.approved_song_slug && row.approved_song_title
          ? {
              id: row.approved_song_id,
              slug: row.approved_song_slug,
              title: row.approved_song_title,
              publicLinkAvailable:
                row.public_read_enabled === 1 &&
                row.approved_performance_publication_status === "published" &&
                (row.approved_performance_release_type === "official_mv" ||
                  row.approved_performance_release_type === "official_video") &&
                row.approved_song_archived_at === null &&
                row.approved_song_merged_into_song_id === null,
            }
          : null,
    }));
  }

  private async readByIdempotency(userId: string, key: string) {
    const row = await this.database
      .prepare(
        `${proposalSelect}
         WHERE proposal.submitted_by_user_id = ? AND proposal.idempotency_key = ?
           AND proposal.status IN ('pending_review', 'approved', 'rejected')`,
      )
      .bind(userId, key)
      .first<ProposalRow>();
    return row ? (await this.hydrate([row]))[0] ?? null : null;
  }

  private samePayload(
    existing: OtwPlayMemberSubmissionDto,
    input: OtwPlayCreateSubmissionRequest,
    canonicalUrl: string,
    participants: ResolvedParticipant[],
    artists: ResolvedSubject[],
  ) {
    return (
      existing.youtubeUrl === canonicalUrl &&
      normalizeSnapshot(existing.title) === normalizeSnapshot(input.title) &&
      existing.suggestedSongId === (input.suggestedSongId ?? null) &&
      (existing.note ?? null) === (input.note?.trim() || null) &&
      JSON.stringify(
        existing.participants.map((item) => [
          item.displayName,
          item.participantRole,
        ]),
      ) ===
        JSON.stringify(
          participants.map((item) => [item.displayName, item.participantRole]),
        ) &&
      JSON.stringify(existing.originalArtists.map((item) => item.displayName)) ===
        JSON.stringify(artists.map((item) => item.displayName))
    );
  }

  async create(command: CreateMemberSubmissionCommand) {
    const { userId, input, canonicalUrl, videoId, now, dayStart, dayEnd } = command;
    const [resolvedParticipants, artists] = await Promise.all([
      this.resolveSubjects(input.participants),
      this.resolveSubjects(input.originalArtists),
    ]);
    const participants: ResolvedParticipant[] = resolvedParticipants.map(
      (participant, index) => ({
        ...participant,
        participantRole: input.participants[index]?.participantRole ?? "vocal",
      }),
    );
    const existing = await this.readByIdempotency(userId, input.clientRequestId);
    if (existing) {
      if (this.samePayload(existing, input, canonicalUrl, participants, artists)) {
        return { data: existing, idempotentReplay: true };
      }
      throw new MemberSubmissionRepositoryError(
        "idempotency_conflict",
        "clientRequestId was already used for a different submission",
      );
    }

    if (input.suggestedSongId) {
      const song = await this.database
        .prepare(
          `SELECT id FROM music_songs
           WHERE id = ? AND archived_at IS NULL AND merged_into_song_id IS NULL`,
        )
        .bind(input.suggestedSongId)
        .first<{ id: string }>();
      if (!song) {
        throw new MemberSubmissionRepositoryError(
          "invalid_request",
          "Suggested song is not available",
        );
      }
    }

    const setting = await this.database
      .prepare(
        `SELECT value, typeof(value) AS value_type FROM settings
         WHERE key = 'otw_play_submission_daily_limit'`,
      )
      .first<{ value: string; value_type: string }>();
    if (
      !setting ||
      setting.value_type !== "text" ||
      !/^\d+$/.test(setting.value) ||
      Number(setting.value) < 1 ||
      Number(setting.value) > 100
    ) {
      throw new MemberSubmissionRepositoryError(
        "unavailable",
        "Submission limit is unavailable",
      );
    }
    const dailyLimit = Number(setting.value);

    const duplicate = await this.database
      .prepare(
        `SELECT 1 AS found WHERE EXISTS (
           SELECT 1 FROM music_media_sources
           WHERE provider = 'youtube' AND external_id = ?
         ) OR EXISTS (
           SELECT 1 FROM music_cover_proposals
           WHERE youtube_video_id = ? AND segment_start_seconds = 0
             AND status = 'pending_review'
         )`,
      )
      .bind(videoId, videoId)
      .first<{ found: number }>();
    if (duplicate) {
      throw new MemberSubmissionRepositoryError(
        "duplicate",
        "This video is already in the catalog or awaiting review",
      );
    }

    const parent = this.database
      .prepare(
        `INSERT INTO music_cover_proposals (
          id, submitted_by_user_id, idempotency_key, submitted_url,
          youtube_video_id, segment_start_seconds, submitted_title,
          suggested_song_id, submitted_note, status, version, created_at, updated_at
        )
        SELECT ?, ?, ?, ?, ?, 0, ?, ?, ?, 'pending_review', 0, ?, ?
        WHERE (
          SELECT COUNT(*) FROM music_cover_proposals
          WHERE submitted_by_user_id = ? AND created_at >= ? AND created_at < ?
        ) < ?`,
      )
      .bind(
        command.proposalId,
        userId,
        input.clientRequestId,
        canonicalUrl,
        videoId,
        normalizeSnapshot(input.title),
        input.suggestedSongId ?? null,
        input.note?.trim() || null,
        now,
        now,
        userId,
        dayStart,
        dayEnd,
        dailyLimit,
      );
    const childGuard = `SELECT ?, ?, ?, ?, ? WHERE EXISTS (
      SELECT 1 FROM music_cover_proposals WHERE id = ? AND submitted_by_user_id = ?
    )`;
    try {
      await this.database.batch([
        parent,
        ...participants.map((participant, index) =>
          this.database
            .prepare(
              `INSERT INTO music_cover_proposal_participants
               (proposal_id, credit_order, resolved_entity_id,
                submitted_name_snapshot, participant_role)
               ${childGuard}`,
            )
            .bind(
              command.proposalId,
              index,
              participant.resolvedEntityId,
              participant.displayName,
              participant.participantRole,
              command.proposalId,
              userId,
            ),
        ),
        ...artists.map((artist, index) =>
          this.database
            .prepare(
              `INSERT INTO music_cover_proposal_original_artists
               (proposal_id, credit_order, resolved_entity_id, submitted_name_snapshot)
               SELECT ?, ?, ?, ? WHERE EXISTS (
                 SELECT 1 FROM music_cover_proposals WHERE id = ? AND submitted_by_user_id = ?
               )`,
            )
            .bind(
              command.proposalId,
              index,
              artist.resolvedEntityId,
              artist.displayName,
              command.proposalId,
              userId,
            ),
        ),
      ]);
    } catch (error) {
      const raced = await this.readByIdempotency(userId, input.clientRequestId);
      if (raced) {
        if (this.samePayload(raced, input, canonicalUrl, participants, artists)) {
          return { data: raced, idempotentReplay: true };
        }
        throw new MemberSubmissionRepositoryError(
          "idempotency_conflict",
          "clientRequestId was already used for a different submission",
        );
      }
      if (/UNIQUE constraint|constraint failed/i.test(String(error))) {
        throw new MemberSubmissionRepositoryError(
          "duplicate",
          "This video is already in the catalog or awaiting review",
        );
      }
      throw new MemberSubmissionRepositoryError(
        "unavailable",
        "Submission could not be stored",
      );
    }

    try {
      const data = await this.readMine(userId, command.proposalId);
      return { data, idempotentReplay: false };
    } catch (error) {
      if (
        error instanceof MemberSubmissionRepositoryError &&
        error.code === "not_found"
      ) {
        throw new MemberSubmissionRepositoryError(
          "rate_limited",
          "Daily submission limit reached",
        );
      }
      throw error;
    }
  }

  async listMine(
    userId: string,
    limit: number,
    cursor: MemberSubmissionCursor | null,
  ) {
    const cursorSql = cursor
      ? "AND (proposal.created_at < ? OR (proposal.created_at = ? AND proposal.id < ?))"
      : "";
    const statement = this.database.prepare(
      `${proposalSelect}
       WHERE proposal.submitted_by_user_id = ?
         AND proposal.status IN ('pending_review', 'approved', 'rejected')
         ${cursorSql}
       ORDER BY proposal.created_at DESC, proposal.id DESC
       LIMIT ?`,
    );
    const result = cursor
      ? await statement
          .bind(userId, cursor.createdAt, cursor.createdAt, cursor.id, limit + 1)
          .all<ProposalRow>()
      : await statement.bind(userId, limit + 1).all<ProposalRow>();
    const rows = resultsOf(result);
    return {
      items: await this.hydrate(rows.slice(0, limit)),
      hasMore: rows.length > limit,
    };
  }

  async readMine(userId: string, proposalId: string) {
    const row = await this.database
      .prepare(
        `${proposalSelect}
         WHERE proposal.id = ? AND proposal.submitted_by_user_id = ?
           AND proposal.status IN ('pending_review', 'approved', 'rejected')`,
      )
      .bind(proposalId, userId)
      .first<ProposalRow>();
    if (!row) {
      throw new MemberSubmissionRepositoryError(
        "not_found",
        "Submission not found",
      );
    }
    return (await this.hydrate([row]))[0]!;
  }
}
