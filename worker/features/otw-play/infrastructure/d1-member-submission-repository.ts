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
  type UpdateMemberSubmissionCommand,
  type WithdrawMemberSubmissionCommand,
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
  version: number;
  created_at: number;
  updated_at: number;
  approved_song_id: string | null;
  approved_song_slug: string | null;
  approved_song_title: string | null;
  approved_song_archived_at: number | null;
  approved_song_merged_into_song_id: string | null;
  approved_performance_publication_status: string | null;
  approved_performance_release_type: string | null;
  approved_performance_has_public_source: number;
  public_read_enabled: number | null;
};

type ChildRow = {
  proposal_id: string;
  credit_order: number;
  submitted_name_snapshot: string;
  submitted_member_uid: number | null;
  participant_role?: OtwPlayParticipantRole;
};

type ResolvedSubject = {
  resolvedEntityId: string | null;
  submittedMemberUid: number | null;
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
  proposal.version, proposal.created_at, proposal.updated_at,
  song.id AS approved_song_id, song.slug AS approved_song_slug,
  song.title AS approved_song_title,
  song.archived_at AS approved_song_archived_at,
  song.merged_into_song_id AS approved_song_merged_into_song_id,
  approved_performance.publication_status AS approved_performance_publication_status,
  approved_performance.release_type AS approved_performance_release_type,
  EXISTS (
    SELECT 1 FROM music_performance_sources AS link
    JOIN music_media_sources AS source ON source.id = link.source_id
    JOIN music_channels AS channel ON channel.id = source.channel_id
    WHERE link.performance_id = approved_performance.id
      AND link.source_role IN ('official', 'alternate')
      AND channel.verification_status = 'approved' AND channel.active = 1
  ) AS approved_performance_has_public_source,
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
          COALESCE((
            SELECT json_group_array(artist.display_name)
            FROM music_song_original_artists AS artist_credit
            JOIN music_entities AS artist ON artist.id = artist_credit.entity_id
            WHERE artist_credit.song_id = song.id
            ORDER BY artist_credit.credit_order
          ), '[]') AS original_artists_json
        FROM music_songs AS song
        WHERE song.archived_at IS NULL AND song.merged_into_song_id IS NULL
          AND EXISTS (
            SELECT 1 FROM music_performances AS performance
            WHERE performance.song_id = song.id
              AND performance.publication_status = 'published'
              AND performance.release_type IN ('official_mv', 'official_video')
          )
          AND (
            song.normalized_title = ? OR song.normalized_title GLOB ?
            OR EXISTS (
              SELECT 1 FROM music_song_aliases AS alias
              WHERE alias.song_id = song.id
                AND (alias.normalized_alias = ? OR alias.normalized_alias GLOB ?)
            )
          )
        ORDER BY CASE WHEN song.normalized_title = ? THEN 0 ELSE 1 END,
          song.normalized_title ASC, song.id ASC
        LIMIT 8`,
      )
      .bind(normalized, `${normalized}*`, normalized, `${normalized}*`, normalized)
      .all<{
        id: string;
        title: string;
        original_artists_json: string;
      }>();
    return {
      duplicate: duplicate?.duplicate_kind ?? null,
      songCandidates: resultsOf(candidateResult).map((row) => ({
        id: row.id,
        title: row.title,
        originalArtists: (() => {
          try {
            const value: unknown = JSON.parse(row.original_artists_json);
            return Array.isArray(value)
              ? value.filter((item): item is string => typeof item === "string")
              : [];
          } catch {
            return [];
          }
        })(),
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
          submittedMemberUid: null,
          displayName: normalizeSnapshot(subject.displayName),
        };
      }
      const member = memberMap.get(subject.memberUid)!;
      return {
        resolvedEntityId: member.entity_id,
        submittedMemberUid: subject.memberUid,
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
          `SELECT proposal_id, credit_order, submitted_name_snapshot, submitted_member_uid,
             participant_role
           FROM music_cover_proposal_participants
           WHERE proposal_id IN (${placeholders(ids.length)})
           ORDER BY proposal_id, credit_order`,
        )
        .bind(...ids),
      this.database
        .prepare(
          `SELECT proposal_id, credit_order, submitted_name_snapshot, submitted_member_uid
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
      version: Number(row.version),
      editable: row.status === "pending_review",
      withdrawable: row.status === "pending_review",
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      participants: (participants.get(row.id) ?? []).map((item) => ({
        creditOrder: Number(item.credit_order),
        memberUid:
          item.submitted_member_uid === null
            ? null
            : Number(item.submitted_member_uid),
        displayName: item.submitted_name_snapshot,
        participantRole: item.participant_role ?? "vocal",
      })),
      originalArtists: (artists.get(row.id) ?? []).map((item) => ({
        creditOrder: Number(item.credit_order),
        memberUid:
          item.submitted_member_uid === null
            ? null
            : Number(item.submitted_member_uid),
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
                row.approved_performance_has_public_source === 1 &&
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
           AND proposal.status IN ('pending_review', 'approved', 'rejected', 'withdrawn')`,
      )
      .bind(userId, key)
      .first<ProposalRow>();
    return row ? (await this.hydrate([row]))[0] ?? null : null;
  }

  private async samePayload(
    existing: OtwPlayMemberSubmissionDto,
    input: OtwPlayCreateSubmissionRequest,
    canonicalUrl: string,
    participants: ResolvedParticipant[],
    artists: ResolvedSubject[],
  ) {
    const [participantResult, artistResult] = await this.database.batch([
      this.database.prepare(
        `SELECT submitted_member_uid, submitted_name_snapshot, participant_role
         FROM music_cover_proposal_participants
         WHERE proposal_id = ? ORDER BY credit_order`,
      ).bind(existing.id),
      this.database.prepare(
        `SELECT submitted_member_uid, submitted_name_snapshot
         FROM music_cover_proposal_original_artists
         WHERE proposal_id = ? ORDER BY credit_order`,
      ).bind(existing.id),
    ]);
    const storedParticipants = resultsOf(participantResult as D1Result<{
      submitted_member_uid: number | null;
      submitted_name_snapshot: string;
      participant_role: OtwPlayParticipantRole;
    }>);
    const storedArtists = resultsOf(artistResult as D1Result<{
      submitted_member_uid: number | null;
      submitted_name_snapshot: string;
    }>);
    const subjectKey = (subject: ResolvedSubject) =>
      subject.submittedMemberUid === null
        ? `external:${normalizeSnapshot(subject.displayName)}`
        : `member:${subject.submittedMemberUid}`;
    return (
      existing.youtubeUrl === canonicalUrl &&
      normalizeSnapshot(existing.title) === normalizeSnapshot(input.title) &&
      existing.suggestedSongId === (input.suggestedSongId ?? null) &&
      (existing.note ?? null) === (input.note?.trim() || null) &&
      JSON.stringify(storedParticipants.map((item) => [
        item.submitted_member_uid === null
          ? `external:${normalizeSnapshot(item.submitted_name_snapshot)}`
          : `member:${Number(item.submitted_member_uid)}`,
        item.participant_role,
      ])) ===
        JSON.stringify(
          participants.map((item) => [subjectKey(item), item.participantRole]),
        ) &&
      JSON.stringify(storedArtists.map((item) =>
        item.submitted_member_uid === null
          ? `external:${normalizeSnapshot(item.submitted_name_snapshot)}`
          : `member:${Number(item.submitted_member_uid)}`,
      )) === JSON.stringify(artists.map(subjectKey))
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
      if (await this.samePayload(existing, input, canonicalUrl, participants, artists)) {
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
    const childGuard = `SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (
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
                submitted_member_uid, submitted_name_snapshot, participant_role)
               ${childGuard}`,
            )
            .bind(
              command.proposalId,
              index,
              participant.resolvedEntityId,
              participant.submittedMemberUid,
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
               (proposal_id, credit_order, resolved_entity_id,
                submitted_member_uid, submitted_name_snapshot)
               SELECT ?, ?, ?, ?, ? WHERE EXISTS (
                 SELECT 1 FROM music_cover_proposals WHERE id = ? AND submitted_by_user_id = ?
               )`,
            )
            .bind(
              command.proposalId,
              index,
              artist.resolvedEntityId,
              artist.submittedMemberUid,
              artist.displayName,
              command.proposalId,
              userId,
            ),
        ),
      ]);
    } catch (error) {
      const raced = await this.readByIdempotency(userId, input.clientRequestId);
      if (raced) {
        if (await this.samePayload(raced, input, canonicalUrl, participants, artists)) {
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

  async findReplay(
    userId: string,
    input: OtwPlayCreateSubmissionRequest,
    canonicalUrl: string,
  ) {
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
    if (!existing) return null;
    if (await this.samePayload(existing, input, canonicalUrl, participants, artists)) {
      return { data: existing, idempotentReplay: true as const };
    }
    throw new MemberSubmissionRepositoryError(
      "idempotency_conflict",
      "clientRequestId was already used for a different submission",
    );
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
         AND proposal.status IN ('pending_review', 'approved', 'rejected', 'withdrawn')
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
           AND proposal.status IN ('pending_review', 'approved', 'rejected', 'withdrawn')`,
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

  async update(command: UpdateMemberSubmissionCommand) {
    const { userId, proposalId, input, canonicalUrl, videoId, now } = command;
    const current = await this.readMine(userId, proposalId);
    if (
      current.status !== "pending_review" ||
      current.version !== input.expectedVersion
    ) {
      throw new MemberSubmissionRepositoryError(
        "stale_write",
        "Submission changed before the update could be applied",
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
    const participantSnapshot = participants.map((participant) => ({
      memberUid: participant.submittedMemberUid,
      displayName: participant.displayName,
      participantRole: participant.participantRole,
    }));
    const artistSnapshot = artists.map((artist) => ({
      memberUid: artist.submittedMemberUid,
      displayName: artist.displayName,
    }));
    const changedFields = [
      current.youtubeUrl !== canonicalUrl ? "youtubeUrl" : null,
      normalizeSnapshot(current.title) !== normalizeSnapshot(input.title)
        ? "title"
        : null,
      current.suggestedSongId !== (input.suggestedSongId ?? null)
        ? "suggestedSongId"
        : null,
      JSON.stringify(
        current.originalArtists.map((artist) => ({
          memberUid: artist.memberUid,
          displayName: artist.displayName,
        })),
      ) !== JSON.stringify(artistSnapshot)
        ? "originalArtists"
        : null,
      JSON.stringify(
        current.participants.map((participant) => ({
          memberUid: participant.memberUid,
          displayName: participant.displayName,
          participantRole: participant.participantRole,
        })),
      ) !== JSON.stringify(participantSnapshot)
        ? "participants"
        : null,
      (current.note ?? null) !== (input.note?.trim() || null) ? "note" : null,
    ].filter((field): field is string => field !== null);
    const nextVersion = input.expectedVersion + 1;
    const updatedParent = this.database
      .prepare(
        `UPDATE music_cover_proposals
         SET submitted_url = ?, youtube_video_id = ?, submitted_title = ?,
             suggested_song_id = ?, submitted_note = ?, version = version + 1,
             updated_at = ?
         WHERE id = ? AND submitted_by_user_id = ?
           AND status = 'pending_review' AND version = ?
           AND NOT EXISTS (
             SELECT 1 FROM music_media_sources
             WHERE provider = 'youtube' AND external_id = ?
           )
           AND NOT EXISTS (
             SELECT 1 FROM music_cover_proposals AS other
             WHERE other.id <> ? AND other.youtube_video_id = ?
               AND other.segment_start_seconds = 0
               AND other.status = 'pending_review'
           )`,
      )
      .bind(
        canonicalUrl,
        videoId,
        normalizeSnapshot(input.title),
        input.suggestedSongId ?? null,
        input.note?.trim() || null,
        now,
        proposalId,
        userId,
        input.expectedVersion,
        videoId,
        proposalId,
        videoId,
      );
    const updateGuard = `EXISTS (
      SELECT 1 FROM music_catalog_events
      WHERE id = ? AND aggregate_type = 'proposal'
        AND aggregate_id = ?
        AND event_type = 'proposal.updated'
    )`;
    try {
      await this.database.batch([
        updatedParent,
        this.database
          .prepare(
            `INSERT INTO music_catalog_events
             (id, aggregate_type, aggregate_id, event_type, actor_kind,
              actor_user_id, detail_json, created_at)
             SELECT ?, 'proposal', ?, 'proposal.updated', 'member', ?, ?, ?
             WHERE changes() = 1`,
          )
          .bind(
            command.eventId,
            proposalId,
            userId,
            JSON.stringify({ changedFields }),
            now,
          ),
        this.database
          .prepare(
            `DELETE FROM music_cover_proposal_participants
             WHERE proposal_id = ? AND ${updateGuard}`,
          )
          .bind(proposalId, command.eventId, proposalId),
        this.database
          .prepare(
            `DELETE FROM music_cover_proposal_original_artists
             WHERE proposal_id = ? AND ${updateGuard}`,
          )
          .bind(proposalId, command.eventId, proposalId),
        ...participants.map((participant, index) =>
          this.database
            .prepare(
              `INSERT INTO music_cover_proposal_participants
               (proposal_id, credit_order, resolved_entity_id,
                submitted_member_uid, submitted_name_snapshot, participant_role)
               SELECT ?, ?, ?, ?, ?, ? WHERE ${updateGuard}`,
            )
            .bind(
              proposalId,
              index,
              participant.resolvedEntityId,
              participant.submittedMemberUid,
              participant.displayName,
              participant.participantRole,
              command.eventId,
              proposalId,
            ),
        ),
        ...artists.map((artist, index) =>
          this.database
            .prepare(
              `INSERT INTO music_cover_proposal_original_artists
               (proposal_id, credit_order, resolved_entity_id,
                submitted_member_uid, submitted_name_snapshot)
               SELECT ?, ?, ?, ?, ? WHERE ${updateGuard}`,
            )
            .bind(
              proposalId,
              index,
              artist.resolvedEntityId,
              artist.submittedMemberUid,
              artist.displayName,
              command.eventId,
              proposalId,
            ),
        ),
      ]);
    } catch (error) {
      if (/UNIQUE constraint|constraint failed/i.test(String(error))) {
        throw new MemberSubmissionRepositoryError(
          "duplicate",
          "This video is already in the catalog or awaiting review",
        );
      }
      throw new MemberSubmissionRepositoryError(
        "unavailable",
        "Submission update could not be stored",
      );
    }

    const updated = await this.readMine(userId, proposalId);
    if (
      updated.status === "pending_review" &&
      updated.version === nextVersion &&
      updated.updatedAt === now
    ) {
      return updated;
    }
    const duplicate = await this.database
      .prepare(
        `SELECT 1 AS found WHERE EXISTS (
           SELECT 1 FROM music_media_sources
           WHERE provider = 'youtube' AND external_id = ?
         ) OR EXISTS (
           SELECT 1 FROM music_cover_proposals
           WHERE id <> ? AND youtube_video_id = ? AND segment_start_seconds = 0
             AND status = 'pending_review'
         )`,
      )
      .bind(videoId, proposalId, videoId)
      .first<{ found: number }>();
    throw new MemberSubmissionRepositoryError(
      duplicate ? "duplicate" : "stale_write",
      duplicate
        ? "This video is already in the catalog or awaiting review"
        : "Submission changed before the update could be applied",
    );
  }

  async withdraw(command: WithdrawMemberSubmissionCommand) {
    const nextVersion = command.expectedVersion + 1;
    await this.database.batch([
      this.database
        .prepare(
          `UPDATE music_cover_proposals
           SET status = 'withdrawn', version = version + 1, updated_at = ?
           WHERE id = ? AND submitted_by_user_id = ?
             AND status = 'pending_review' AND version = ?`,
        )
        .bind(
          command.now,
          command.proposalId,
          command.userId,
          command.expectedVersion,
        ),
      this.database
        .prepare(
          `INSERT INTO music_catalog_events
           (id, aggregate_type, aggregate_id, event_type, actor_kind,
            actor_user_id, created_at)
           SELECT ?, 'proposal', ?, 'proposal.withdrawn', 'member', ?, ?
           WHERE changes() = 1`,
        )
        .bind(
          command.eventId,
          command.proposalId,
          command.userId,
          command.now,
        ),
    ]);
    const updated = await this.readMine(command.userId, command.proposalId);
    if (
      updated.status === "withdrawn" &&
      updated.version === nextVersion &&
      updated.updatedAt === command.now
    ) {
      return updated;
    }
    throw new MemberSubmissionRepositoryError(
      "stale_write",
      "Submission changed before it could be withdrawn",
    );
  }
}
