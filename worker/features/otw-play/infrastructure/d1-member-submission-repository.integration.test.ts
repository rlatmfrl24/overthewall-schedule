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
  originalArtists: [{ kind: "external", displayName: `원곡 가수 ${suffix}` }],
  participants: [{ kind: "member", memberUid: 991 }],
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
    db.prepare("DELETE FROM music_cover_proposal_participants"),
    db.prepare("DELETE FROM music_cover_proposal_original_artists"),
    db.prepare("DELETE FROM music_cover_proposals"),
    db.prepare("DELETE FROM music_media_sources"),
    db.prepare("DELETE FROM music_channel_entities"),
    db.prepare("DELETE FROM music_channels"),
    db.prepare("DELETE FROM music_entities WHERE member_uid = 991"),
    db.prepare("DELETE FROM member_links WHERE member_uid = 991"),
    db.prepare("DELETE FROM members WHERE uid = 991"),
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
      participants: [{ displayName: "제안 멤버" }],
      originalArtists: [{ displayName: "원곡 가수 1" }],
    });

    const replay = await create(repository, "member-a", "1", {
      clientRequestId: input("1").clientRequestId,
    });
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.data.id).toBe(first.data.id);

    await expect(
      create(repository, "member-a", "1", {
        clientRequestId: input("1").clientRequestId,
        title: "다른 payload",
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
