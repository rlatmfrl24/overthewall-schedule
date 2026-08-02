import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../../../platform/db";
import type { CachedChzzkVideos } from "../../../platform/types";
import type { ChzzkVideoCatalog } from "../../chzzk";
import { autoUpdateSchedules } from "./auto-update";
import { D1PendingScheduleRepository } from "./d1-pending-schedule-repository";

const CHANNEL_ID = "a".repeat(32);

const TEST_SCHEMA = [
  "DROP TABLE IF EXISTS schedule_broadcast_observations",
  "DROP TABLE IF EXISTS schedule_candidate_rejections",
  "DROP TABLE IF EXISTS update_logs",
  "DROP TABLE IF EXISTS pending_schedules",
  "DROP TABLE IF EXISTS schedules",
  "DROP TABLE IF EXISTS members",
  `CREATE TABLE members (
     uid INTEGER PRIMARY KEY,
     name TEXT NOT NULL,
     url_chzzk TEXT,
     is_deprecated INTEGER
   )`,
  `CREATE TABLE schedules (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     member_uid INTEGER NOT NULL,
     date TEXT NOT NULL,
     start_time TEXT,
     title TEXT,
     status TEXT NOT NULL,
     created_at NUMERIC DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE TABLE pending_schedules (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     member_uid INTEGER NOT NULL,
     member_name TEXT NOT NULL,
     date TEXT NOT NULL,
     start_time TEXT,
     title TEXT,
     status TEXT NOT NULL DEFAULT '방송',
     action_type TEXT NOT NULL,
     existing_schedule_id INTEGER,
     previous_status TEXT,
     previous_title TEXT,
     previous_start_time TEXT,
     candidate_kind TEXT,
     match_reason TEXT,
     match_confidence TEXT,
     ranked_schedule_ids TEXT,
     source_vod_ids TEXT,
     session_started_at TEXT,
     session_ended_at TEXT,
     vod_segment_count INTEGER NOT NULL DEFAULT 1,
     vod_id TEXT,
     vod_started_at TEXT,
     vod_duration_seconds INTEGER,
     vod_thumbnail_url TEXT,
     processed_reset_at TEXT,
     created_at NUMERIC DEFAULT CURRENT_TIMESTAMP
   )`,
  "CREATE UNIQUE INDEX uidx_pending_vod ON pending_schedules(vod_id) WHERE vod_id IS NOT NULL",
  "CREATE UNIQUE INDEX uidx_pending_time ON pending_schedules(member_uid, date, start_time)",
  `CREATE TABLE schedule_candidate_rejections (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     vod_id TEXT NOT NULL UNIQUE,
     member_uid INTEGER NOT NULL,
     member_name TEXT NOT NULL,
     date TEXT NOT NULL,
     start_time TEXT,
     title TEXT,
     status TEXT NOT NULL,
     action_type TEXT NOT NULL,
     existing_schedule_id INTEGER,
     previous_status TEXT,
     previous_title TEXT,
     previous_start_time TEXT,
     candidate_kind TEXT,
     match_reason TEXT,
     match_confidence TEXT,
     ranked_schedule_ids TEXT,
     source_vod_ids TEXT,
     session_started_at TEXT,
     session_ended_at TEXT,
     vod_segment_count INTEGER NOT NULL DEFAULT 1,
     vod_started_at TEXT,
     vod_duration_seconds INTEGER,
     vod_thumbnail_url TEXT,
     reason_code TEXT,
     reason_note TEXT,
     actor_id TEXT,
     actor_name TEXT,
     actor_ip TEXT,
     rejected_at NUMERIC DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE TABLE update_logs (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     schedule_id INTEGER,
     member_uid INTEGER,
     member_name TEXT,
     actor_id TEXT,
     actor_name TEXT,
     actor_ip TEXT,
     schedule_date TEXT NOT NULL,
     action TEXT NOT NULL,
     title TEXT,
     previous_status TEXT,
     vod_id TEXT,
     reason_code TEXT,
     reason_note TEXT,
     created_at NUMERIC DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE TABLE schedule_broadcast_observations (
     vod_id TEXT PRIMARY KEY NOT NULL,
     member_uid INTEGER NOT NULL,
     channel_id TEXT NOT NULL,
     title TEXT NOT NULL,
     started_at INTEGER NOT NULL,
     ended_at INTEGER NOT NULL,
     duration_seconds INTEGER NOT NULL,
     thumbnail_url TEXT,
     first_seen_at INTEGER NOT NULL,
     last_seen_at INTEGER NOT NULL
   )`,
];

type Video = NonNullable<
  NonNullable<CachedChzzkVideos["content"]>["data"]
>[number];

const makeVideo = (
  videoId: string,
  title: string,
  publishDateAt = Date.parse("2026-07-29T12:00:00.000Z"),
): Video => ({
  videoNo: Number(videoId.replace(/\D/g, "")) || 1,
  videoId,
  videoTitle: title,
  videoType: "REPLAY",
  publishDate: new Date(publishDateAt).toISOString(),
  thumbnailImageUrl: "https://example.com/thumbnail.jpg",
  trailerUrl: "",
  duration: 0,
  readCount: 0,
  publishDateAt,
  categoryType: null,
  videoCategory: null,
  videoCategoryValue: "",
  channel: {
    channelId: CHANNEL_ID,
    channelName: "테스트 멤버",
    channelImageUrl: "",
  },
  channelId: CHANNEL_ID,
  channelName: "테스트 멤버",
  channelImageUrl: "",
});

const makeVideoCatalog = (getVideos: () => Video[]): ChzzkVideoCatalog => ({
  fetchVideos: vi.fn(),
  fetchVideosBatch: vi.fn(async (
    requests: Parameters<ChzzkVideoCatalog["fetchVideosBatch"]>[0],
  ) =>
    requests.map((request) => {
      const videos = getVideos();
      const start = request.page * request.size;
      return {
        channelId: request.channelId,
        content: {
          page: request.page,
          size: request.size,
          totalCount: videos.length,
          totalPages: Math.ceil(videos.length / request.size),
          data: videos.slice(start, start + request.size),
        },
      };
    }),
  ) as ChzzkVideoCatalog["fetchVideosBatch"],
});

const countRows = async (table: string) => {
  const row = await env.otw_db
    .prepare(`SELECT COUNT(*) AS total FROM ${table}`)
    .first<{ total: number }>();
  return Number(row?.total ?? 0);
};

describe("auto update rejection workflow", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T12:30:00.000Z"));
    await env.otw_db.batch(
      TEST_SCHEMA.map((statement) => env.otw_db.prepare(statement)),
    );
    await env.otw_db
      .prepare(
        `INSERT INTO members (uid, name, url_chzzk, is_deprecated)
         VALUES (1, '테스트 멤버', ?, 0)`,
      )
      .bind(`https://chzzk.naver.com/${CHANNEL_ID}`)
      .run();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("동일 VOD는 제목과 시간이 바뀌어도 억제하고 다른 VOD는 독립 처리한다", async () => {
    await env.otw_db
      .prepare(
        `INSERT INTO schedule_candidate_rejections (
           vod_id, member_uid, member_name, date, start_time, title,
           status, action_type, reason_code
         )
         VALUES ('chzzk:vod-1', 1, '테스트 멤버', '2026-07-29', '21:00',
                 '처음 제목', '방송', 'create', 'not_needed')`,
      )
      .run();
    let videos = [makeVideo("vod-1", "변경된 제목")];
    const videoCatalog = makeVideoCatalog(() => videos);
    const db = getDb({
      YOUTUBE_API_KEY: "",
      otw_db: env.otw_db,
    });

    const first = await autoUpdateSchedules(db, 1, { videoCatalog });
    videos = [
      makeVideo(
        "vod-1",
        "다시 변경된 제목",
        Date.parse("2026-07-29T13:00:00.000Z"),
      ),
    ];
    const second = await autoUpdateSchedules(db, 1, { videoCatalog });
    videos = [
      makeVideo(
        "vod-2",
        "독립 후보",
        Date.parse("2026-07-29T14:30:00.000Z"),
      ),
    ];
    const third = await autoUpdateSchedules(db, 1, { videoCatalog });

    expect(first).toMatchObject({
      updated: 0,
      rejectedSuppressed: 1,
      duplicatePending: 0,
    });
    expect(second).toMatchObject({
      updated: 0,
      rejectedSuppressed: 1,
      duplicatePending: 0,
    });
    expect(third).toMatchObject({
      updated: 1,
      rejectedSuppressed: 1,
      duplicatePending: 0,
    });
    expect(await countRows("pending_schedules")).toBe(1);
  });

  it("재검토 허용 후 다음 수집에서 정확히 한 번 후보를 생성한다", async () => {
    const videoCatalog = makeVideoCatalog(() => [
      makeVideo("vod-1", "재검토 후보"),
    ]);
    const db = getDb({
      YOUTUBE_API_KEY: "",
      otw_db: env.otw_db,
    });
    await autoUpdateSchedules(db, 1, { videoCatalog });

    const repository = new D1PendingScheduleRepository(env.otw_db);
    const pending = await repository.findById(1);
    await repository.reject(
      pending!,
      {
        actorId: "admin",
        actorName: "관리자",
        actorIp: null,
      },
      { reasonCode: "other", reasonNote: "재검토 테스트" },
    );
    const suppressed = await autoUpdateSchedules(db, 1, { videoCatalog });
    const rejection = await env.otw_db
      .prepare("SELECT id FROM schedule_candidate_rejections")
      .first<{ id: number }>();
    await repository.reopenRejection(rejection!.id, {
      actorId: "admin",
      actorName: "관리자",
      actorIp: null,
    });
    const reopened = await autoUpdateSchedules(db, 1, { videoCatalog });
    const repeated = await autoUpdateSchedules(db, 1, { videoCatalog });

    expect(suppressed.rejectedSuppressed).toBe(1);
    expect(reopened).toMatchObject({
      updated: 1,
      rejectedSuppressed: 0,
      duplicatePending: 0,
    });
    expect(repeated).toMatchObject({
      updated: 0,
      rejectedSuppressed: 0,
      duplicatePending: 1,
    });
    expect(await countRows("pending_schedules")).toBe(1);
  });

  it("동일 VOD 관측 upsert와 반복 수집은 멱등성을 유지한다", async () => {
    const videoCatalog = makeVideoCatalog(() => [
      makeVideo("vod-idempotent", "멱등 수집"),
    ]);
    const db = getDb({
      YOUTUBE_API_KEY: "",
      otw_db: env.otw_db,
    });

    const first = await autoUpdateSchedules(db, 1, { videoCatalog });
    const second = await autoUpdateSchedules(db, 1, { videoCatalog });

    expect(first).toMatchObject({
      updated: 1,
      segmentCount: 1,
      sessionCount: 1,
    });
    expect(second).toMatchObject({
      updated: 0,
      duplicatePending: 1,
      segmentCount: 1,
      sessionCount: 1,
    });
    expect(await countRows("schedule_broadcast_observations")).toBe(1);
    expect(await countRows("pending_schedules")).toBe(1);
    expect(await countRows("update_logs")).toBe(1);
  });

  it("D1 bind 한도를 넘는 14개 관측도 chunk로 나눠 모두 저장한다", async () => {
    const videos = Array.from({ length: 14 }, (_, index) =>
      makeVideo(
        `vod-bulk-${index}`,
        `대량 관측 ${index}`,
        Date.parse("2026-07-29T10:00:00.000Z") + index * 60_000,
      ),
    );
    const videoCatalog = makeVideoCatalog(() => videos);
    const db = getDb({
      YOUTUBE_API_KEY: "",
      otw_db: env.otw_db,
    });

    const result = await autoUpdateSchedules(db, 1, { videoCatalog });

    expect(result.checked).toBe(14);
    expect(await countRows("schedule_broadcast_observations")).toBe(14);
  });

  it("후보 감사 로그 저장이 실패하면 pending 삽입을 함께 rollback한다", async () => {
    await env.otw_db
      .prepare(
        `CREATE TRIGGER fail_auto_collected_log
         BEFORE INSERT ON update_logs
         WHEN NEW.action = 'auto_collected'
         BEGIN
           SELECT RAISE(ABORT, 'forced auto collected log failure');
         END`,
      )
      .run();
    const videoCatalog = makeVideoCatalog(() => [
      makeVideo("vod-log-failure", "감사 로그 실패"),
    ]);
    const db = getDb({
      YOUTUBE_API_KEY: "",
      otw_db: env.otw_db,
    });

    await expect(
      autoUpdateSchedules(db, 1, { videoCatalog }),
    ).rejects.toThrow();
    expect(await countRows("schedule_broadcast_observations")).toBe(1);
    expect(await countRows("pending_schedules")).toBe(0);
    expect(await countRows("update_logs")).toBe(0);
  });

  it("거부와 수집이 겹쳐도 제외된 VOD pending을 남기지 않는다", async () => {
    const videoCatalog = makeVideoCatalog(() => [
      makeVideo("vod-1", "동시 실행 후보"),
    ]);
    const db = getDb({
      YOUTUBE_API_KEY: "",
      otw_db: env.otw_db,
    });
    await autoUpdateSchedules(db, 1, { videoCatalog });
    const repository = new D1PendingScheduleRepository(env.otw_db);
    const pending = await repository.findById(1);

    await Promise.all([
      autoUpdateSchedules(db, 1, { videoCatalog }),
      repository.reject(
        pending!,
        {
          actorId: "admin",
          actorName: "관리자",
          actorIp: null,
        },
        { reasonCode: "duplicate", reasonNote: null },
      ),
    ]);

    expect(await countRows("pending_schedules")).toBe(0);
    expect(await countRows("schedule_candidate_rejections")).toBe(1);
  });
});
