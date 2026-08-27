import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { OtwPlayCreateSubmissionRequest } from "@contracts/otw-play";
import { MemberSubmissionRepositoryError } from "../application/ports/member-submission-repository";
import { D1MemberSubmissionRepository } from "./d1-member-submission-repository";

type TestEnv = Env & {
  OTW_PLAY_PUBLIC_CATALOG_MIGRATIONS: D1Migration[];
};

const testEnv = env as TestEnv;
const db = testEnv.otw_db;
const NOW = Date.UTC(2026, 7, 19, 3);
const DAY_START = Date.UTC(2026, 7, 18, 15);
const DAY_END = Date.UTC(2026, 7, 19, 15);

const input = (suffix: string): OtwPlayCreateSubmissionRequest => ({
  clientRequestId: `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`,
  youtubeUrl: `https://www.youtube.com/watch?v=VID${suffix.padStart(8, "0")}`,
  title: `회원 커버 ${suffix}`,
  suggestedSongId: null,
  tags: ["J-POP"],
  originalArtists: [{ kind: "external", displayName: `원곡 가수 ${suffix}` }],
  participants: [{ kind: "member", memberUid: 991, participantRole: "chorus" }],
  note: null,
});

const create = (
  repository: D1MemberSubmissionRepository,
  userId: string,
  suffix: string,
  overrides: Partial<OtwPlayCreateSubmissionRequest> = {},
) => {
  const request = { ...input(suffix), ...overrides };
  const videoId = `VID${suffix.padStart(8, "0")}`;
  return repository.create({
    userId,
    proposalId: `proposal-${userId}-${suffix}`,
    input: request,
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    now: NOW + Number(suffix),
    dayStart: DAY_START,
    dayEnd: DAY_END,
  });
};

beforeEach(async () => {
  await applyD1Migrations(db, testEnv.OTW_PLAY_PUBLIC_CATALOG_MIGRATIONS);
  await db.batch([
    db.prepare("DELETE FROM music_catalog_events WHERE actor_kind = 'member'"),
    db.prepare("DELETE FROM music_cover_proposal_participants"),
    db.prepare("DELETE FROM music_cover_proposal_original_artists"),
    db.prepare("DELETE FROM music_cover_proposals"),
    db.prepare("DELETE FROM music_performances WHERE id LIKE 'submission-candidate-%'"),
    db.prepare("DELETE FROM music_song_original_artists WHERE song_id LIKE 'submission-candidate-%'"),
    db.prepare("DELETE FROM music_songs WHERE id LIKE 'submission-candidate-%'"),
    db.prepare("DELETE FROM music_entities WHERE id LIKE 'submission-candidate-%'"),
    db.prepare("DELETE FROM music_performances WHERE id = 'approved-performance'"),
    db.prepare("DELETE FROM music_songs WHERE id = 'approved-song'"),
    db.prepare("DELETE FROM music_media_sources"),
    db.prepare("DELETE FROM music_channel_entities"),
    db.prepare("DELETE FROM music_channels"),
    db.prepare("DELETE FROM music_entities WHERE member_uid IN (991, 992)"),
    db.prepare("DELETE FROM member_links WHERE member_uid IN (991, 992)"),
    db.prepare("DELETE FROM members WHERE uid IN (991, 992)"),
    db.prepare(
      `INSERT INTO members
       (uid, code, name, oshi_mark, youtube_channel_id, unit_name, is_deprecated)
       VALUES (991, 'submission-member', '제안 멤버', '🎵', NULL, NULL, 0)`,
    ),
    db.prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ('otw_play_submission_daily_limit', '5', 0)
       ON CONFLICT(key) DO UPDATE SET value = '5', updated_at = 0`,
    ),
  ]);
});

describe("D1MemberSubmissionRepository", () => {
  it("stores the proposal and children atomically and replays the same idempotency key", async () => {
    const repository = new D1MemberSubmissionRepository(db);
    const first = await create(repository, "member-a", "1");
    expect(first.idempotentReplay).toBe(false);
    expect(first.data).toMatchObject({
      status: "pending_review",
      tags: ["J-POP"],
      participants: [{ displayName: "제안 멤버", participantRole: "chorus" }],
      originalArtists: [{ displayName: "원곡 가수 1" }],
    });
    await expect(
      db.prepare(
        `SELECT submitted_member_uid FROM music_cover_proposal_participants
         WHERE proposal_id = ? AND credit_order = 0`,
      ).bind(first.data.id).first<{ submitted_member_uid: number | null }>(),
    ).resolves.toMatchObject({ submitted_member_uid: 991 });

    const replay = await create(repository, "member-a", "1", {
      clientRequestId: input("1").clientRequestId,
    });
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.data.id).toBe(first.data.id);

    await db.prepare("UPDATE members SET name = '변경된 멤버명' WHERE uid = 991").run();
    const renamedReplay = await create(repository, "member-a", "1", {
      clientRequestId: input("1").clientRequestId,
    });
    expect(renamedReplay.idempotentReplay).toBe(true);

    await expect(
      create(repository, "member-a", "1", {
        clientRequestId: input("1").clientRequestId,
        participants: [
          { kind: "member", memberUid: 991, participantRole: "vocal" },
        ],
      }),
    ).rejects.toMatchObject({ code: "idempotency_conflict" });

    await expect(
      create(repository, "member-a", "1", {
        clientRequestId: input("1").clientRequestId,
        title: "다른 payload",
      }),
    ).rejects.toMatchObject({ code: "idempotency_conflict" });
    await expect(
      create(repository, "member-a", "1", {
        clientRequestId: input("1").clientRequestId,
        tags: ["록"],
      }),
    ).rejects.toMatchObject({ code: "idempotency_conflict" });
  });

  it("keeps ownership private and paginates with a keyset tuple", async () => {
    const repository = new D1MemberSubmissionRepository(db);
    await create(repository, "member-a", "1");
    await create(repository, "member-a", "2");
    await create(repository, "member-b", "3");

    const page = await repository.listMine("member-a", 1, null);
    expect(page.items).toHaveLength(1);
    expect(page.hasMore).toBe(true);
    await expect(
      repository.readMine("member-b", page.items[0]!.id),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("returns only a generic pending duplicate during preflight", async () => {
    const repository = new D1MemberSubmissionRepository(db);
    await create(repository, "member-a", "1");
    const result = await repository.preflight(
      "member-b",
      "VID00000001",
      "회원 커버",
    );
    expect(result.duplicate).toBe("pending");
    expect(JSON.stringify(result)).not.toContain("member-a");
    expect(JSON.stringify(result)).not.toContain("proposal-member");
  });

  it("returns only published song candidates and preserves commas in artist names", async () => {
    const repository = new D1MemberSubmissionRepository(db);
    await db.batch([
      db.prepare(
        `INSERT INTO music_entities (
           id, entity_kind, display_name, normalized_name, slug,
           version, created_at, updated_at
         ) VALUES ('submission-candidate-artist', 'group', 'Earth, Wind & Fire',
           'earth wind fire', 'earth-wind-fire', 0, ?, ?)`,
      ).bind(NOW, NOW),
      db.prepare(
        `INSERT INTO music_songs (
           id, slug, title, normalized_title, dedupe_key, is_otw_original,
           original_release_precision, version, created_at, updated_at
         ) VALUES
           ('submission-candidate-published', 'candidate-published', 'Candidate Song',
            'candidate song', 'candidate-published-key', 0, 'unknown', 0, ?, ?),
           ('submission-candidate-draft', 'candidate-draft', 'Candidate Song Draft',
            'candidate song draft', 'candidate-draft-key', 0, 'unknown', 0, ?, ?)`,
      ).bind(NOW, NOW, NOW, NOW),
      db.prepare(
        `INSERT INTO music_song_original_artists (song_id, entity_id, credit_order, is_primary)
         VALUES ('submission-candidate-published', 'submission-candidate-artist', 0, 1)`,
      ),
      db.prepare(
        `INSERT INTO music_performances (
           id, song_id, dedupe_key, relation_type, release_type,
           participation_type, publication_status, quality_status,
           version, created_at, updated_at
         ) VALUES
           ('submission-candidate-performance-published', 'submission-candidate-published',
            'candidate-performance-published-key', 'cover', 'official_video', 'solo',
            'published', 'ok', 0, ?, ?),
           ('submission-candidate-performance-draft', 'submission-candidate-draft',
            'candidate-performance-draft-key', 'cover', 'official_video', 'solo',
            'draft', 'ok', 0, ?, ?)`,
      ).bind(NOW, NOW, NOW, NOW),
    ]);

    const result = await repository.preflight("member-a", "ZZZZZZZZZZZ", "Candidate Song");
    expect(result.songCandidates).toEqual([
      expect.objectContaining({
        id: "submission-candidate-published",
        originalArtists: ["Earth, Wind & Fire"],
      }),
    ]);
  });

  it("keeps withdrawn proposals in member-owned history", async () => {
    const repository = new D1MemberSubmissionRepository(db);
    const created = await create(repository, "member-a", "1");
    await db.prepare(
      `UPDATE music_cover_proposals SET status = 'withdrawn', version = version + 1,
       updated_at = ? WHERE id = ?`,
    ).bind(NOW + 1, created.data.id).run();
    await expect(repository.readMine("member-a", created.data.id)).resolves.toMatchObject({
      status: "withdrawn",
    });
    await expect(repository.listMine("member-a", 20, null)).resolves.toMatchObject({
      items: [expect.objectContaining({ status: "withdrawn" })],
    });
  });

  it("updates only an owned pending proposal with CAS and audits field names", async () => {
    const repository = new D1MemberSubmissionRepository(db);
    const created = await create(repository, "member-a", "1");
    const revisionBefore = await db.prepare(
      `SELECT catalog.revision AS catalog_revision,
        read_model.revision AS read_model_revision
       FROM music_catalog_meta AS catalog
       JOIN music_public_read_model_meta AS read_model ON read_model.id = 1
       WHERE catalog.id = 1`,
    ).first<{ catalog_revision: number; read_model_revision: number }>();

    const updated = await repository.update({
      userId: "member-a",
      proposalId: created.data.id,
      eventId: "event-member-update",
      videoId: "EDIT0000001",
      canonicalUrl: "https://www.youtube.com/watch?v=EDIT0000001",
      now: NOW + 200,
      input: {
        expectedVersion: 0,
        youtubeUrl: "https://youtu.be/EDIT0000001",
        title: "수정된 커버",
        suggestedSongId: null,
        tags: ["록", "발라드"],
        originalArtists: [{ kind: "external", displayName: "수정 가수" }],
        participants: [
          { kind: "member", memberUid: 991, participantRole: "featured_vocal" },
          { kind: "external", displayName: "외부 참여자", participantRole: "chorus" },
        ],
        note: "감사 로그에 남으면 안 되는 메모",
      },
    });

    expect(updated).toMatchObject({
      version: 1,
      editable: true,
      withdrawable: true,
      youtubeVideoId: "EDIT0000001",
      title: "수정된 커버",
      tags: ["록", "발라드"],
      participants: [
        { memberUid: 991, participantRole: "featured_vocal" },
        { memberUid: null, displayName: "외부 참여자", participantRole: "chorus" },
      ],
    });
    const event = await db.prepare(
      "SELECT event_type, actor_kind, actor_user_id, detail_json FROM music_catalog_events WHERE id = 'event-member-update'",
    ).first<{ event_type: string; actor_kind: string; actor_user_id: string; detail_json: string }>();
    expect(event).toMatchObject({
      event_type: "proposal.updated",
      actor_kind: "member",
      actor_user_id: "member-a",
    });
    expect(JSON.parse(event!.detail_json)).toEqual({
      changedFields: expect.arrayContaining([
        "youtubeUrl",
        "title",
        "tags",
        "originalArtists",
        "participants",
        "note",
      ]),
    });
    expect(event!.detail_json).not.toContain("감사 로그");
    await expect(
      repository.update({
        userId: "member-a",
        proposalId: created.data.id,
        eventId: "event-member-stale",
        videoId: "EDIT0000002",
        canonicalUrl: "https://www.youtube.com/watch?v=EDIT0000002",
        now: NOW + 201,
        input: {
          expectedVersion: 0,
          youtubeUrl: "https://youtu.be/EDIT0000002",
          title: "stale",
          originalArtists: [{ kind: "external", displayName: "가수" }],
          participants: [{ kind: "member", memberUid: 991 }],
        },
      }),
    ).rejects.toMatchObject({ code: "stale_write" });
    await expect(
      repository.update({
        userId: "member-b",
        proposalId: created.data.id,
        eventId: "event-member-owner",
        videoId: "EDIT0000002",
        canonicalUrl: "https://www.youtube.com/watch?v=EDIT0000002",
        now: NOW + 201,
        input: {
          expectedVersion: 1,
          youtubeUrl: "https://youtu.be/EDIT0000002",
          title: "owner",
          originalArtists: [{ kind: "external", displayName: "가수" }],
          participants: [{ kind: "member", memberUid: 991 }],
        },
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      db.prepare(
        `SELECT catalog.revision AS catalog_revision,
          read_model.revision AS read_model_revision
         FROM music_catalog_meta AS catalog
         JOIN music_public_read_model_meta AS read_model ON read_model.id = 1
         WHERE catalog.id = 1`,
      ).first(),
    ).resolves.toEqual(revisionBefore);
  });

  it("preserves omitted tags, clears explicit tags, and clears tags for an existing song", async () => {
    const repository = new D1MemberSubmissionRepository(db);
    const preserved = await create(repository, "member-a", "1");

    const afterOmitted = await repository.update({
      userId: "member-a",
      proposalId: preserved.data.id,
      eventId: "event-member-tags-omitted",
      videoId: preserved.data.youtubeVideoId,
      canonicalUrl: preserved.data.youtubeUrl,
      now: NOW + 210,
      input: {
        expectedVersion: 0,
        youtubeUrl: preserved.data.youtubeUrl,
        title: "분류 유지 수정",
        suggestedSongId: null,
        originalArtists: [{ kind: "external", displayName: "원곡 가수 1" }],
        participants: [{ kind: "member", memberUid: 991, participantRole: "chorus" }],
        note: null,
      },
    });
    expect(afterOmitted.tags).toEqual(["J-POP"]);
    await expect(
      db.prepare(
        "SELECT detail_json FROM music_catalog_events WHERE id = 'event-member-tags-omitted'",
      ).first<{ detail_json: string }>(),
    ).resolves.toMatchObject({
      detail_json: expect.not.stringContaining('"tags"'),
    });

    const afterExplicitClear = await repository.update({
      userId: "member-a",
      proposalId: preserved.data.id,
      eventId: "event-member-tags-cleared",
      videoId: preserved.data.youtubeVideoId,
      canonicalUrl: preserved.data.youtubeUrl,
      now: NOW + 211,
      input: {
        expectedVersion: 1,
        youtubeUrl: preserved.data.youtubeUrl,
        title: "분류 유지 수정",
        suggestedSongId: null,
        tags: [],
        originalArtists: [{ kind: "external", displayName: "원곡 가수 1" }],
        participants: [{ kind: "member", memberUid: 991, participantRole: "chorus" }],
        note: null,
      },
    });
    expect(afterExplicitClear.tags).toEqual([]);

    await db.prepare(
      `INSERT INTO music_songs (
         id, slug, title, normalized_title, dedupe_key, is_otw_original,
         original_release_precision, version, created_at, updated_at
       ) VALUES (
         'submission-candidate-existing-tags', 'existing-tags', '기존 곡',
         '기존 곡', 'existing-tags-key', 0, 'unknown', 0, ?, ?
       )`,
    ).bind(NOW, NOW).run();
    const linked = await create(repository, "member-a", "2");
    const afterExistingSong = await repository.update({
      userId: "member-a",
      proposalId: linked.data.id,
      eventId: "event-member-tags-existing-song",
      videoId: linked.data.youtubeVideoId,
      canonicalUrl: linked.data.youtubeUrl,
      now: NOW + 212,
      input: {
        expectedVersion: 0,
        youtubeUrl: linked.data.youtubeUrl,
        title: linked.data.title,
        suggestedSongId: "submission-candidate-existing-tags",
        originalArtists: [{ kind: "external", displayName: "원곡 가수 2" }],
        participants: [{ kind: "member", memberUid: 991, participantRole: "chorus" }],
        note: null,
      },
    });
    expect(afterExistingSong).toMatchObject({
      suggestedSongId: "submission-candidate-existing-tags",
      tags: [],
    });
  });

  it("lets only one concurrent member or admin-facing CAS transition win", async () => {
    const repository = new D1MemberSubmissionRepository(db);
    const created = await create(repository, "member-a", "1");
    const results = await Promise.allSettled([
      repository.update({
        userId: "member-a",
        proposalId: created.data.id,
        eventId: "event-member-race-update",
        videoId: "RACE0000001",
        canonicalUrl: "https://www.youtube.com/watch?v=RACE0000001",
        now: NOW + 300,
        input: {
          expectedVersion: 0,
          youtubeUrl: "https://youtu.be/RACE0000001",
          title: "경쟁 수정",
          originalArtists: [{ kind: "external", displayName: "가수" }],
          participants: [{ kind: "member", memberUid: 991 }],
        },
      }),
      repository.withdraw({
        userId: "member-a",
        proposalId: created.data.id,
        eventId: "event-member-race-withdraw",
        expectedVersion: 0,
        now: NOW + 301,
      }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const stored = await repository.readMine("member-a", created.data.id);
    expect(stored.version).toBe(1);
    expect(["pending_review", "withdrawn"]).toContain(stored.status);
    const events = await db.prepare(
      `SELECT event_type FROM music_catalog_events
       WHERE id IN ('event-member-race-update', 'event-member-race-withdraw')`,
    ).all<{ event_type: string }>();
    expect(events.results).toHaveLength(1);
  });

  it("withdraws irreversibly and releases the pending-video uniqueness slot", async () => {
    const repository = new D1MemberSubmissionRepository(db);
    const created = await create(repository, "member-a", "1");
    const withdrawn = await repository.withdraw({
      userId: "member-a",
      proposalId: created.data.id,
      eventId: "event-member-withdraw",
      expectedVersion: 0,
      now: NOW + 400,
    });
    expect(withdrawn).toMatchObject({
      status: "withdrawn",
      version: 1,
      editable: false,
      withdrawable: false,
    });
    await expect(
      repository.withdraw({
        userId: "member-a",
        proposalId: created.data.id,
        eventId: "event-member-withdraw-again",
        expectedVersion: 1,
        now: NOW + 401,
      }),
    ).rejects.toMatchObject({ code: "stale_write" });
    await expect(create(repository, "member-b", "1", {
      clientRequestId: "00000000-0000-4000-8000-000000000099",
    })).resolves.toMatchObject({ data: { status: "pending_review" } });
  });

  it("enforces the KST daily limit across all stored statuses", async () => {
    const repository = new D1MemberSubmissionRepository(db);
    await db
      .prepare(
        `UPDATE settings SET value = '2'
         WHERE key = 'otw_play_submission_daily_limit'`,
      )
      .run();
    await create(repository, "member-a", "1");
    const second = await create(repository, "member-a", "2");
    await db
      .prepare(
        `UPDATE music_cover_proposals SET status = 'rejected',
          reviewed_by_user_id = 'admin', reviewed_at = ?,
          review_result_code = 'not_official', version = version + 1, updated_at = ?
         WHERE id = ?`,
      )
      .bind(NOW + 100, NOW + 100, second.data.id)
      .run();

    await expect(create(repository, "member-a", "3")).rejects.toMatchObject({
      code: "rate_limited",
    });
  });

  it("rejects a deprecated member UID even when the caller bypasses the active-member UI", async () => {
    const repository = new D1MemberSubmissionRepository(db);
    await db
      .prepare(
        `INSERT INTO members
         (uid, code, name, oshi_mark, youtube_channel_id, unit_name, is_deprecated)
         VALUES (992, 'former-submission-member', '전 소속 멤버', '', NULL, NULL, 1)`,
      )
      .run();

    await expect(
      create(repository, "member-a", "1", {
        participants: [
          { kind: "member", memberUid: 992, participantRole: "vocal" },
        ],
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("only exposes an approved song link while the linked catalog item is public", async () => {
    const repository = new D1MemberSubmissionRepository(db);
    const created = await create(repository, "member-a", "1");
    await db.batch([
      db
        .prepare(
          `INSERT INTO music_songs (
             id, slug, title, normalized_title, dedupe_key, is_otw_original,
             original_release_precision, version, created_at, updated_at
           ) VALUES ('approved-song', 'approved-song', '승인된 곡', '승인된 곡',
             'approved-song-dedupe', 0, 'unknown', 0, ?, ?)`,
        )
        .bind(NOW, NOW),
      db
        .prepare(
          `INSERT INTO music_performances (
             id, song_id, dedupe_key, relation_type, release_type,
             participation_type, publication_status, quality_status,
             released_at, version, created_at, updated_at
           ) VALUES ('approved-performance', 'approved-song',
             'approved-performance-dedupe', 'cover', 'official_video', 'solo',
             'published', 'ok', ?, 0, ?, ?)`,
        )
        .bind(NOW, NOW, NOW),
      db
        .prepare(
          `INSERT INTO music_channels (
             id, provider, external_channel_id, display_name, channel_role,
             verification_status, active, version, created_at, updated_at
           ) VALUES ('approved-channel', 'youtube', 'UCaaaaaaaaaaaaaaaaaaaaaa',
             '승인 채널', 'member_music', 'approved', 1, 0, ?, ?)`)
        .bind(NOW, NOW),
      db
        .prepare(
          `INSERT INTO music_media_sources (
             id, provider, external_id, channel_id, availability_status,
             version, created_at, updated_at
           ) VALUES ('approved-source', 'youtube', 'AAAAAAAAAAA',
             'approved-channel', 'playable', 0, ?, ?)`)
        .bind(NOW, NOW),
      db.prepare(
        `INSERT INTO music_performance_sources (
           performance_id, source_id, start_seconds, source_role, priority, is_primary
         ) VALUES ('approved-performance', 'approved-source', 0, 'official', 0, 1)`,
      ),
      db
        .prepare(
          `UPDATE music_cover_proposals
           SET status = 'approved', reviewed_by_user_id = 'admin', reviewed_at = ?,
             approved_performance_id = 'approved-performance', version = version + 1,
             updated_at = ?
           WHERE id = ?`,
        )
        .bind(NOW + 100, NOW + 100, created.data.id),
      db.prepare(
        `UPDATE music_catalog_meta
         SET public_read_enabled = 1, navigation_visible = 1, updated_at = ?
         WHERE id = 1`,
      ).bind(NOW),
    ]);

    expect((await repository.readMine("member-a", created.data.id)).approvedSong)
      .toMatchObject({ publicLinkAvailable: true });

    await db.prepare("UPDATE music_channels SET active = 0 WHERE id = 'approved-channel'").run();
    expect((await repository.readMine("member-a", created.data.id)).approvedSong)
      .toMatchObject({ publicLinkAvailable: false });
    await db.prepare("UPDATE music_channels SET active = 1 WHERE id = 'approved-channel'").run();

    await db
      .prepare(
        `UPDATE music_performances SET publication_status = 'withdrawn',
          version = version + 1, updated_at = ? WHERE id = 'approved-performance'`,
      )
      .bind(NOW + 1)
      .run();
    expect((await repository.readMine("member-a", created.data.id)).approvedSong)
      .toMatchObject({ publicLinkAvailable: false });

    await db.batch([
      db
        .prepare(
          `UPDATE music_performances SET publication_status = 'published',
            version = version + 1, updated_at = ? WHERE id = 'approved-performance'`,
        )
        .bind(NOW + 2),
      db
        .prepare(
          `UPDATE music_songs SET archived_at = ?, version = version + 1,
            updated_at = ? WHERE id = 'approved-song'`,
        )
        .bind(NOW + 2, NOW + 2),
    ]);
    expect((await repository.readMine("member-a", created.data.id)).approvedSong)
      .toMatchObject({ publicLinkAvailable: false });
  });

  it("rolls back the parent when a child insert fails", async () => {
    const repository = new D1MemberSubmissionRepository(db);
    await expect(
      create(repository, "member-a", "1", {
        originalArtists: [{ kind: "external", displayName: " " }],
      }),
    ).rejects.toBeInstanceOf(MemberSubmissionRepositoryError);
    const count = await db
      .prepare("SELECT COUNT(*) AS count FROM music_cover_proposals")
      .first<{ count: number }>();
    expect(Number(count?.count)).toBe(0);
  });
});
