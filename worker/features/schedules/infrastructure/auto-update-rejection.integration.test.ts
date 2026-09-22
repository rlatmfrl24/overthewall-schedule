import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../../../platform/db";
import type { CachedChzzkVideos } from "../../../platform/types";
import type { ChzzkVideoCatalog } from "../../chzzk";
import {
  autoUpdateSchedules,
  readAutoUpdateMatchTargets,
  scanAndPersistRecentChzzkObservations,
} from "./auto-update";
import { D1PendingScheduleRepository } from "./d1-pending-schedule-repository";
import { queryPendingScheduleReview } from "./d1-pending-schedule-query";
import { holidayTargetDate } from "./holiday-suggestions";
import { PendingScheduleService } from "../application/pending-schedule-service";

const CHANNEL_ID = "a".repeat(32);

const TEST_SCHEMA = [
  "DROP TABLE IF EXISTS schedule_day_assessments",
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
  fetchLiveStatus: vi.fn().mockResolvedValue({ content: { status: "CLOSE" }, debug: { error: null, staleCacheUsed: false } }),
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
    await env.otw_db.batch(
      (env as unknown as { SCHEDULE_DAY_MIGRATION_SQL: string }).SCHEDULE_DAY_MIGRATION_SQL
        .split("--> statement-breakpoint").map(sql => env.otw_db.prepare(sql)),
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

  const holidayCatalog = () => ({
    ...makeVideoCatalog(() => []),
    fetchLiveStatus: vi.fn().mockResolvedValue({ content: { status: "CLOSE" }, debug: { error: null, staleCacheUsed: false } }),
  });
  const holidayActor = { actorId: "admin", actorName: "관리자", actorIp: null };
  const collectHoliday = async (catalog: ChzzkVideoCatalog = holidayCatalog()) => {
    const db = getDb({ YOUTUBE_API_KEY: "", otw_db: env.otw_db });
    await scanAndPersistRecentChzzkObservations(db, 1, [CHANNEL_ID], undefined, catalog);
    const targets = await readAutoUpdateMatchTargets(db, 1);
    for (const matchTarget of targets) await autoUpdateSchedules(db, 1, { skipScan: true, matchTarget });
    return queryPendingScheduleReview(env.otw_db);
  };

  it("09시 이전에는 휴방을 추정하지 않고 이후 VOD 없는 멤버도 전날 승인 대기로 한 번만 생성한다", async () => {
    vi.setSystemTime(new Date("2026-07-29T08:59:59+09:00"));
    expect(holidayTargetDate()).toBeNull();
    expect(await collectHoliday()).toHaveLength(0);
    vi.setSystemTime(new Date("2026-07-29T09:00:00+09:00"));
    const [pending] = await collectHoliday();
    expect(pending).toMatchObject({ date: "2026-07-28", candidate_kind: "holiday_suggestion", vod_id: null, start_time: null, status: "휴방",
      can_apply_to_empty_target: false, holiday_evidence: { scan_status: "complete", broadcast_seen: false } });
    await Promise.all([collectHoliday(), collectHoliday()]);
    expect(await countRows("pending_schedules")).toBe(1);
    expect(await countRows("schedules")).toBe(0);
    expect(await countRows("schedule_day_assessments")).toBe(1);
    expect(await countRows("update_logs")).toBe(1);
  });

  it("휴방 승인 시 휴방 일정 하나를 저장하고 재승인하지 않는다", async () => {
    const [pending] = await collectHoliday();
    const repo = new D1PendingScheduleRepository(env.otw_db);
    const item = (await repo.findById(pending.id))!;
    expect(await repo.approve(item, null, holidayActor)).toMatchObject({ success: true, action: "create" });
    expect(await repo.approve(item, null, holidayActor)).toMatchObject({ success: false, error: "stale" });
    expect(await env.otw_db.prepare("SELECT date, status, start_time, title FROM schedules").first())
      .toEqual({ date: "2026-07-28", status: "휴방", start_time: null, title: null });
    expect(await env.otw_db.prepare("SELECT decision FROM schedule_day_assessments").first()).toEqual({ decision: "approved" });
    expect(await collectHoliday()).toHaveLength(0);
  });

  it("거절한 멤버·날짜는 재수집해도 재추천하지 않는다", async () => {
    const [pending] = await collectHoliday();
    const repo = new D1PendingScheduleRepository(env.otw_db);
    expect(await repo.reject((await repo.findById(pending.id))!, holidayActor, { reasonCode: "not_needed", reasonNote: null })).toMatchObject({ success: true });
    expect(await collectHoliday()).toHaveLength(0);
    expect(await env.otw_db.prepare("SELECT decision FROM schedule_day_assessments").first()).toEqual({ decision: "rejected" });
  });

  it.each(["schedule", "broadcast"] as const)("승인 직전 새 %s 근거가 생기면 stale로 거절하고 다음 판정에서 철회한다", async source => {
    const [pending] = await collectHoliday();
    const repo = new D1PendingScheduleRepository(env.otw_db);
    if (source === "schedule") await env.otw_db.prepare("INSERT INTO schedules(member_uid,date,status) VALUES(1,'2026-07-28','미정')").run();
    else await env.otw_db.prepare(`INSERT INTO schedule_broadcast_observations
      (vod_id,member_uid,channel_id,title,started_at,ended_at,duration_seconds,first_seen_at,last_seen_at)
      VALUES('late',1,?,'뒤늦은 방송',?,?,3600,0,0)`)
      .bind(CHANNEL_ID, Date.parse("2026-07-28T22:00:00+09:00"), Date.parse("2026-07-29T02:00:00+09:00")).run();
    expect(await repo.approve((await repo.findById(pending.id))!, null, holidayActor)).toMatchObject({ success: false, error: "stale" });
    expect((await collectHoliday()).filter(item => item.candidate_kind === "holiday_suggestion")).toHaveLength(0);
    expect(await env.otw_db.prepare("SELECT COUNT(*) AS total FROM update_logs WHERE action='candidate_obsolete'").first()).toEqual({ total: 1 });
  });

  it("휴방 승인 감사 로그 실패는 일정과 판정 상태 변경을 함께 롤백한다", async () => {
    const [pending] = await collectHoliday();
    await env.otw_db.prepare("CREATE TRIGGER fail_holiday_log BEFORE INSERT ON update_logs WHEN NEW.action='approve' BEGIN SELECT RAISE(ABORT,'log failure'); END").run();
    const repo = new D1PendingScheduleRepository(env.otw_db);
    await expect(repo.approve((await repo.findById(pending.id))!, null, holidayActor)).rejects.toThrow();
    expect(await countRows("schedules")).toBe(0);
    expect(await countRows("pending_schedules")).toBe(1);
    expect(await env.otw_db.prepare("SELECT decision FROM schedule_day_assessments").first()).toEqual({ decision: "pending" });
  });

  it("일괄 승인에서 실패한 휴방만 롤백하고 개별 실패 결과를 반환한다", async () => {
    await env.otw_db.prepare("INSERT INTO members(uid,name,url_chzzk,is_deprecated) VALUES(2,'두번째',?,0)")
      .bind(`https://chzzk.naver.com/${CHANNEL_ID}`).run();
    const pending = await collectHoliday();
    expect(pending).toHaveLength(2);
    await env.otw_db.prepare("CREATE TRIGGER fail_one_holiday BEFORE INSERT ON update_logs WHEN NEW.action='approve' AND NEW.member_uid=2 BEGIN SELECT RAISE(ABORT,'failed second'); END").run();
    const service = new PendingScheduleService(new D1PendingScheduleRepository(env.otw_db), { insert: vi.fn() });
    const result = await service.runBatch({ ids: pending.map(item => item.id), action: "approve", options: null, actor: holidayActor });
    expect(result).toMatchObject({ success: false, successCount: 1, failedCount: 1 });
    expect(await env.otw_db.prepare("SELECT member_uid,status FROM schedules").all()).toMatchObject({ results: [{ member_uid: 1, status: "휴방" }] });
    expect(await env.otw_db.prepare("SELECT member_uid FROM pending_schedules").all()).toMatchObject({ results: [{ member_uid: 2 }] });
  });

  it.each(["failed", "incomplete", "live", "inactive"] as const)("조회 상태 %s에서는 휴방을 추천하지 않는다", async state => {
    const catalog = holidayCatalog();
    if (state === "failed") catalog.fetchVideosBatch = vi.fn().mockResolvedValue([{ channelId: CHANNEL_ID, content: null }]);
    if (state === "incomplete") catalog.fetchVideosBatch = vi.fn().mockResolvedValue([{ channelId: CHANNEL_ID, content: { data: Array.from({ length: 5 }, (_, i) => makeVideo(`many-${i}`, "방송")) } }]);
    if (state === "live") catalog.fetchLiveStatus.mockResolvedValue({ content: { status: "OPEN", openDate: "2026-07-28 23:00:00" }, debug: { error: null, staleCacheUsed: false } });
    if (state === "inactive") await env.otw_db.prepare("UPDATE members SET is_deprecated=1").run();
    expect((await collectHoliday(catalog)).filter(item => item.candidate_kind === "holiday_suggestion")).toHaveLength(0);
  });

  it("진행 중 방송 조회 실패 후 다음 정상 수집에서 다시 판단한다", async () => {
    const catalog = holidayCatalog();
    catalog.fetchLiveStatus.mockRejectedValue(new Error("offline"));
    expect(await collectHoliday(catalog)).toHaveLength(0);
    expect(await collectHoliday()).toHaveLength(1);
  });

  it.each(["vod", "live", "incomplete", "empty"] as const)("수집 결과에 %s 조회 상태를 전달하고 판정 기록에도 보존한다", async source => {
    const catalog = holidayCatalog();
    if (source === "vod") catalog.fetchVideosBatch = vi.fn().mockRejectedValue(new Error("offline"));
    if (source === "live") catalog.fetchLiveStatus.mockRejectedValue(new Error("offline"));
    if (source === "incomplete") catalog.fetchVideosBatch = vi.fn().mockResolvedValue([{
      channelId: CHANNEL_ID, content: { data: Array.from({ length: 5 }, (_, i) => makeVideo(`many-${i}`, "방송")) },
    }]);
    const db = getDb({ YOUTUBE_API_KEY: "", otw_db: env.otw_db });
    const result = await scanAndPersistRecentChzzkObservations(db, 1, [CHANNEL_ID], undefined, catalog);
    const status = source === "empty" ? "complete" : source === "incomplete" ? "incomplete" : "failed";
    expect(result.channelResults).toEqual([{ channelId: CHANNEL_ID, status }]);
    expect(await env.otw_db.prepare("SELECT scan_status FROM schedule_day_assessments").first()).toEqual({ scan_status: status });
  });

  it("직접 수집 경로도 조회 실패를 정상 실행 이력으로 넘기지 않는다", async () => {
    const catalog = holidayCatalog();
    catalog.fetchVideosBatch = vi.fn().mockRejectedValue(new Error("offline"));
    const db = getDb({ YOUTUBE_API_KEY: "", otw_db: env.otw_db });
    await expect(autoUpdateSchedules(db, 1, { videoCatalog: catalog })).rejects.toThrow("수집 조회가 실패");
    expect(await countRows("pending_schedules")).toBe(0);
  });

  it("09시 전에 시작한 하루 범위 조회가 09시 후 끝나도 전날 정상 조회로 간주하지 않는다", async () => {
    vi.setSystemTime(new Date("2026-07-29T08:59:59+09:00"));
    const catalog = holidayCatalog();
    catalog.fetchVideosBatch = vi.fn().mockImplementation(async () => {
      vi.setSystemTime(new Date("2026-07-29T09:00:01+09:00"));
      return [{ channelId: CHANNEL_ID, content: { data: [] } }];
    });
    expect(await collectHoliday(catalog)).toHaveLength(0);
    expect(await countRows("schedule_day_assessments")).toBe(0);
    expect(await collectHoliday()).toHaveLength(1);
  });

  it("하루 수집 범위도 전날 자정을 넘어온 VOD 구간을 확인한다", async () => {
    const catalog = holidayCatalog();
    const video = { ...makeVideo("overnight", "자정 방송", Date.parse("2026-07-28T02:00:00+09:00")), duration: 3 * 3600 };
    catalog.fetchVideosBatch = makeVideoCatalog(() => [video]).fetchVideosBatch;
    expect(await collectHoliday(catalog)).toHaveLength(0);
    expect(await env.otw_db.prepare("SELECT broadcast_seen FROM schedule_day_assessments").first()).toEqual({ broadcast_seen: 1 });
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
      updated: 1,
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
    expect(await countRows("pending_schedules")).toBe(2);
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
    expect(await countRows("pending_schedules")).toBe(2);
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

    // 정상 조회에서는 오늘 방송 후보와 별도로 전날 휴방 추정이 생성된다.
    expect(first).toMatchObject({
      updated: 2,
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
    expect(await countRows("pending_schedules")).toBe(2);
    expect(await countRows("update_logs")).toBe(2);
  });

  it("대기 후보 생성 후 239분 거리의 일정이 생기면 승인하지 않고 재판정에서 감사 기록과 함께 철회한다", async () => {
    const videoCatalog = makeVideoCatalog(() => [{ ...makeVideo("threshold-late", "새로운 방송", Date.parse("2026-07-29T22:00:00+09:00")), duration: 3600 }]);
    const db = getDb({ YOUTUBE_API_KEY: "", otw_db: env.otw_db });
    await autoUpdateSchedules(db, 1, { videoCatalog });
    const repo = new D1PendingScheduleRepository(env.otw_db);
    const pending = (await repo.findById(1))!;
    await env.otw_db.prepare("INSERT INTO schedules(member_uid,date,start_time,title,status) VALUES(1,'2026-07-29','17:01','기존 약속','방송')").run();
    expect(await repo.approve(pending, null, holidayActor)).toMatchObject({ success: false, error: "stale" });
    const result = await autoUpdateSchedules(db, 1, { videoCatalog });
    expect(result.obsoletePending).toBe(1);
    expect((await queryPendingScheduleReview(env.otw_db)).map(item => item.candidate_kind)).toEqual(["holiday_suggestion"]);
    expect(await env.otw_db.prepare("SELECT COUNT(*) AS total FROM update_logs WHERE action='candidate_obsolete'").first()).toEqual({ total: 1 });
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

  it("scan 이후 member/date match item은 자신의 날짜 후보만 반영한다", async () => {
    const videos = [
      makeVideo(
        "vod-day-1",
        "첫째 날",
        Date.parse("2026-07-28T12:00:00.000Z"),
      ),
      makeVideo(
        "vod-day-2",
        "둘째 날",
        Date.parse("2026-07-29T12:00:00.000Z"),
      ),
    ];
    const videoCatalog = makeVideoCatalog(() => videos);
    const db = getDb({ YOUTUBE_API_KEY: "", otw_db: env.otw_db });

    await scanAndPersistRecentChzzkObservations(
      db,
      2,
      [CHANNEL_ID],
      undefined,
      videoCatalog,
    );
    await expect(readAutoUpdateMatchTargets(db, 2)).resolves.toEqual([
      { memberUid: 1, date: "2026-07-28" },
      { memberUid: 1, date: "2026-07-29" },
    ]);

    const result = await autoUpdateSchedules(db, 2, {
      skipScan: true,
      matchTarget: { memberUid: 1, date: "2026-07-29" },
    });
    const pending = await env.otw_db.prepare(
      "SELECT date FROM pending_schedules ORDER BY date",
    ).all<{ date: string }>();

    expect(result.checked).toBe(1);
    expect(pending.results).toEqual([{ date: "2026-07-29" }]);
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

    expect((await queryPendingScheduleReview(env.otw_db)).map(item => item.candidate_kind)).toEqual(["holiday_suggestion"]);
    expect(await countRows("schedule_candidate_rejections")).toBe(1);
  });
});
