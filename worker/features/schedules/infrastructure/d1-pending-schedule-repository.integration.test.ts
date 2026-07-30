import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { PendingApprovalOptions } from "../../../../contracts/pending-schedules";
import { pMap } from "../../../platform/http-helpers";
import { approvePendingSchedule } from "../application/process-pending-schedule";
import { D1PendingScheduleRepository } from "./d1-pending-schedule-repository";
import {
  queryPendingScheduleReview,
  queryScheduleCandidateRejections,
} from "./d1-pending-schedule-query";
import { D1ScheduleWriteRepository } from "./d1-schedule-write-repository";

const TEST_SCHEMA = [
  "DROP TABLE IF EXISTS schedule_candidate_rejections",
  "DROP TABLE IF EXISTS update_logs",
  "DROP TABLE IF EXISTS pending_schedules",
  "DROP TABLE IF EXISTS schedules",
  "DROP TABLE IF EXISTS members",
  `CREATE TABLE members (
     uid INTEGER PRIMARY KEY,
     name TEXT NOT NULL
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
];

const actor = {
  actorId: "admin-1",
  actorName: "관리자",
  actorIp: "203.0.113.1",
};

const options: PendingApprovalOptions = {
  applyMode: "all",
  targetMode: "create",
  timeMode: "exact",
  targetScheduleId: null,
};

const updateOptions = (targetScheduleId: number): PendingApprovalOptions => ({
  applyMode: "all",
  targetMode: "update",
  timeMode: "exact",
  targetScheduleId,
});

const installFailingLogTrigger = async (
  action: "approve" | "reject" | "reset_processed",
) => {
  await env.otw_db
    .prepare(
      `CREATE TRIGGER fail_update_log_insert
       BEFORE INSERT ON update_logs
       WHEN NEW.action = '${action}'
       BEGIN
         SELECT RAISE(ABORT, 'forced ${action} log failure');
       END`,
    )
    .run();
};

const installFailingPendingDeleteTrigger = async () => {
  await env.otw_db
    .prepare(
      `CREATE TRIGGER fail_pending_delete
       BEFORE DELETE ON pending_schedules
       WHEN OLD.id = 1
       BEGIN
         SELECT RAISE(ABORT, 'forced pending delete failure');
       END`,
    )
    .run();
};

const readTransactionState = async () => {
  const [schedules, pendingSchedules, updateLogs] = await Promise.all([
    env.otw_db
      .prepare(
        `SELECT id, member_uid, date, start_time, title, status
         FROM schedules
         ORDER BY id`,
      )
      .all<{
        id: number;
        member_uid: number;
        date: string;
        start_time: string | null;
        title: string | null;
        status: string;
      }>(),
    env.otw_db
      .prepare(
        `SELECT id, action_type, processed_reset_at
         FROM pending_schedules
         ORDER BY id`,
      )
      .all<{
        id: number;
        action_type: string;
        processed_reset_at: string | null;
      }>(),
    env.otw_db
      .prepare(
        `SELECT id, schedule_id, member_uid, action
         FROM update_logs
         ORDER BY id`,
      )
      .all<{
        id: number;
        schedule_id: number | null;
        member_uid: number | null;
        action: string;
      }>(),
  ]);

  return {
    schedules: schedules.results,
    pendingSchedules: pendingSchedules.results,
    updateLogs: updateLogs.results,
  };
};

describe("D1 pending schedule transaction", () => {
  beforeEach(async () => {
    await env.otw_db.batch(
      TEST_SCHEMA.map((statement) => env.otw_db.prepare(statement)),
    );
    await env.otw_db
      .prepare("INSERT INTO members (uid, name) VALUES (10, '테스트 멤버')")
      .run();
    await env.otw_db
      .prepare(
        `INSERT INTO pending_schedules (
           id,
           member_uid,
           member_name,
           date,
           start_time,
           title,
           status,
           action_type,
           vod_id
         )
         VALUES (1, 10, '테스트 멤버', '2026-07-28', '20:00', '정규 방송', '방송', 'create', 'chzzk:vod-1')`,
      )
      .run();
  });

  it("동일 pending을 동시에 승인해도 정확히 한 transaction만 성공한다", async () => {
    const firstRepository = new D1PendingScheduleRepository(env.otw_db);
    const secondRepository = new D1PendingScheduleRepository(env.otw_db);
    const firstSnapshot = await firstRepository.findById(1);
    const secondSnapshot = await secondRepository.findById(1);

    expect(firstSnapshot).not.toBeNull();
    expect(secondSnapshot).not.toBeNull();

    const results = await Promise.all([
      firstRepository.approve(firstSnapshot!, options, actor),
      secondRepository.approve(secondSnapshot!, options, actor),
    ]);

    expect(results.filter((result) => result.success)).toHaveLength(1);

    const schedules = await env.otw_db
      .prepare("SELECT id FROM schedules")
      .all<{ id: number }>();
    const logs = await env.otw_db
      .prepare("SELECT schedule_id FROM update_logs WHERE action = 'approve'")
      .all<{ schedule_id: number }>();
    const pending = await env.otw_db
      .prepare("SELECT id FROM pending_schedules")
      .all<{ id: number }>();

    expect(schedules.results).toHaveLength(1);
    expect(logs.results).toEqual([
      { schedule_id: schedules.results[0].id },
    ]);
    expect(pending.results).toHaveLength(0);
  });

  it("conflict 제거, schedule 생성, 두 로그를 하나의 batch로 반영한다", async () => {
    await env.otw_db
      .prepare(
        `INSERT INTO schedules (
           id, member_uid, date, start_time, title, status
         )
         VALUES (7, 10, '2026-07-29', NULL, '휴방', '휴방')`,
      )
      .run();

    const repository = new D1ScheduleWriteRepository(env.otw_db);
    const result = await repository.saveWithConflictResolution(
      {
        id: null,
        memberUid: 10,
        date: "2026-07-29",
        startTime: "21:00",
        title: "정규 방송",
        status: "방송",
      },
      actor,
    );

    const schedules = await env.otw_db
      .prepare(
        "SELECT id, status FROM schedules WHERE member_uid = 10 AND date = '2026-07-29'",
      )
      .all<{ id: number; status: string }>();
    const logs = await env.otw_db
      .prepare(
        `SELECT schedule_id, member_uid, member_name, action
         FROM update_logs
         WHERE schedule_date = '2026-07-29'
         ORDER BY id`,
      )
      .all<{
        schedule_id: number;
        member_uid: number;
        member_name: string;
        action: string;
      }>();

    expect(result).toEqual({
      success: true,
      action: "create",
      scheduleId: schedules.results[0].id,
      deletedIds: [7],
    });
    expect(schedules.results).toEqual([
      { id: result.scheduleId, status: "방송" },
    ]);
    expect(logs.results).toEqual([
      {
        schedule_id: 7,
        member_uid: 10,
        member_name: "테스트 멤버",
        action: "delete",
      },
      {
        schedule_id: result.scheduleId,
        member_uid: 10,
        member_name: "테스트 멤버",
        action: "create",
      },
    ]);
  });

  it("직접 생성, 수정, 삭제 로그에 member_uid와 member_name을 보존한다", async () => {
    const repository = new D1ScheduleWriteRepository(env.otw_db);
    await repository.create(
      {
        id: null,
        memberUid: 10,
        date: "2026-08-01",
        startTime: "20:00",
        title: "생성 방송",
        status: "방송",
      },
      actor,
    );

    const created = await env.otw_db
      .prepare(
        `SELECT id
         FROM schedules
         WHERE member_uid = 10 AND date = '2026-08-01'`,
      )
      .first<{ id: number }>();
    expect(created).not.toBeNull();

    await repository.update(
      {
        id: created!.id,
        memberUid: 10,
        date: "2026-08-01",
        startTime: "21:00",
        title: "수정 방송",
        status: "방송",
      },
      actor,
    );
    await repository.delete(created!.id, actor);

    const logs = await env.otw_db
      .prepare(
        `SELECT member_uid, member_name, action
         FROM update_logs
         WHERE schedule_date = '2026-08-01'
         ORDER BY id`,
      )
      .all<{
        member_uid: number;
        member_name: string;
        action: string;
      }>();

    expect(logs.results).toEqual([
      {
        member_uid: 10,
        member_name: "테스트 멤버",
        action: "create",
      },
      {
        member_uid: 10,
        member_name: "테스트 멤버",
        action: "update",
      },
      {
        member_uid: 10,
        member_name: "테스트 멤버",
        action: "delete",
      },
    ]);
  });

  it("pending review read model에 기존 빈 schedule과 적용 가능 상태를 결합한다", async () => {
    await env.otw_db
      .prepare(
        `INSERT INTO schedules (
           id, member_uid, date, start_time, title, status
         )
         VALUES (8, 10, '2026-07-28', NULL, NULL, '방송')`,
      )
      .run();
    await env.otw_db
      .prepare(
        "UPDATE pending_schedules SET existing_schedule_id = 8, action_type = 'update' WHERE id = 1",
      )
      .run();

    const result = await queryPendingScheduleReview(env.otw_db);

    expect(result).toEqual([
      expect.objectContaining({
        id: 1,
        has_same_day_schedule: true,
        same_day_schedule_count: 1,
        can_apply_to_empty_target: true,
        existing_schedule: {
          id: 8,
          start_time: null,
          title: null,
          status: "방송",
        },
        empty_target_schedule: {
          id: 8,
          start_time: null,
          title: null,
          status: "방송",
        },
        is_processed: false,
      }),
    ]);
  });

  it("거부 시 VOD 제외 스냅샷과 사유 로그를 저장하고 pending을 삭제한다", async () => {
    const repository = new D1PendingScheduleRepository(env.otw_db);
    const item = await repository.findById(1);

    expect(item).not.toBeNull();
    await expect(
      repository.reject(item!, actor, {
        reasonCode: "wrong_match",
        reasonNote: "멤버가 다른 VOD",
      }),
    ).resolves.toEqual({ success: true, action: "reject" });

    const [pending, rejection, log] = await Promise.all([
      env.otw_db
        .prepare("SELECT id FROM pending_schedules WHERE id = 1")
        .first(),
      env.otw_db
        .prepare(
          `SELECT vod_id, title, reason_code, reason_note, actor_name
           FROM schedule_candidate_rejections`,
        )
        .first<{
          vod_id: string;
          title: string;
          reason_code: string;
          reason_note: string;
          actor_name: string;
        }>(),
      env.otw_db
        .prepare(
          `SELECT action, vod_id, reason_code, reason_note
           FROM update_logs
           WHERE action = 'reject'`,
        )
        .first<{
          action: string;
          vod_id: string;
          reason_code: string;
          reason_note: string;
        }>(),
    ]);

    expect(pending).toBeNull();
    expect(rejection).toEqual({
      vod_id: "chzzk:vod-1",
      title: "정규 방송",
      reason_code: "wrong_match",
      reason_note: "멤버가 다른 VOD",
      actor_name: "관리자",
    });
    expect(log).toEqual({
      action: "reject",
      vod_id: "chzzk:vod-1",
      reason_code: "wrong_match",
      reason_note: "멤버가 다른 VOD",
    });
  });

  it("재검토 허용 시 제외 기록을 제거하고 감사 로그를 남긴다", async () => {
    const repository = new D1PendingScheduleRepository(env.otw_db);
    const item = await repository.findById(1);
    await repository.reject(item!, actor, {
      reasonCode: "not_needed",
      reasonNote: null,
    });
    const rejection = await env.otw_db
      .prepare("SELECT id FROM schedule_candidate_rejections")
      .first<{ id: number }>();

    expect(rejection).not.toBeNull();
    await expect(
      repository.reopenRejection(rejection!.id, actor),
    ).resolves.toEqual({ success: true, action: "reopen_rejection" });

    expect(
      await env.otw_db
        .prepare("SELECT id FROM schedule_candidate_rejections")
        .first(),
    ).toBeNull();
    expect(
      await env.otw_db
        .prepare(
          `SELECT action, vod_id, reason_code
           FROM update_logs
           WHERE action = 'reopen_rejection'`,
        )
        .first(),
    ).toEqual({
      action: "reopen_rejection",
      vod_id: "chzzk:vod-1",
      reason_code: "not_needed",
    });
  });

  it("거부 제외 목록을 검색·사유 필터·페이지네이션한다", async () => {
    const repository = new D1PendingScheduleRepository(env.otw_db);
    const item = await repository.findById(1);
    await repository.reject(item!, actor, {
      reasonCode: "wrong_match",
      reasonNote: null,
    });
    await env.otw_db
      .prepare(
        `UPDATE schedule_candidate_rejections
         SET rejected_at = '2026-07-29 01:00:00'
         WHERE vod_id = 'chzzk:vod-1'`,
      )
      .run();
    await env.otw_db
      .prepare(
        `INSERT INTO schedule_candidate_rejections (
           vod_id, member_uid, member_name, date, start_time, title,
           status, action_type, reason_code, rejected_at
         )
         VALUES ('chzzk:vod-2', 10, '다른 멤버', '2026-07-29', '22:00',
                 '다른 방송', '방송', 'create', 'duplicate',
                 '2026-07-29 01:00:00')`,
      )
      .run();

    const result = await queryScheduleCandidateRejections(env.otw_db, {
      search: "테스트 멤버",
      reasonCode: "wrong_match",
      rejectedFrom: "2026-07-01",
      rejectedTo: "2026-07-29",
      page: 1,
      pageSize: 1,
    });

    expect(result).toMatchObject({
      page: 1,
      pageSize: 1,
      total: 1,
      totalPages: 1,
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        vod_id: "chzzk:vod-1",
        member_name: "테스트 멤버",
        reason_code: "wrong_match",
      }),
    ]);
  });

  it("거부일 필터는 KST 자정 경계를 UTC 저장 시각으로 변환한다", async () => {
    await env.otw_db
      .prepare(
        `INSERT INTO schedule_candidate_rejections (
           vod_id, member_uid, member_name, date, start_time, title,
           status, action_type, reason_code, rejected_at
         )
         VALUES
           ('chzzk:kst-before', 10, '테스트 멤버', '2026-07-29', '20:00',
            '경계 이전', '방송', 'create', 'other', '2026-07-28 14:59:59'),
           ('chzzk:kst-first', 10, '테스트 멤버', '2026-07-29', '20:00',
            '경계 시작', '방송', 'create', 'other', '2026-07-28 15:00:00'),
           ('chzzk:kst-last', 10, '테스트 멤버', '2026-07-29', '20:00',
            '경계 종료 전', '방송', 'create', 'other', '2026-07-29 14:59:59'),
           ('chzzk:kst-next', 10, '테스트 멤버', '2026-07-30', '20:00',
            '다음 날', '방송', 'create', 'other', '2026-07-29 15:00:00')`,
      )
      .run();

    const result = await queryScheduleCandidateRejections(env.otw_db, {
      reasonCode: "other",
      rejectedFrom: "2026-07-29",
      rejectedTo: "2026-07-29",
      page: 1,
      pageSize: 20,
    });

    expect(result.items.map((item) => item.vod_id)).toEqual([
      "chzzk:kst-last",
      "chzzk:kst-first",
    ]);
  });

  it("V2 승인에서는 현재 비어 있는 필드만 채우고 기존 시간과 상태를 보존한다", async () => {
    await env.otw_db
      .prepare(
        `INSERT INTO schedules (
           id, member_uid, date, start_time, title, status
         )
         VALUES (30, 10, '2026-07-28', '18:00', NULL, '미정')`,
      )
      .run();
    await env.otw_db
      .prepare(
        `UPDATE pending_schedules
         SET action_type = 'update',
             existing_schedule_id = 30,
             candidate_kind = 'fill_missing_fields',
             match_reason = 'time_window',
             match_confidence = 'high',
             start_time = '20:00',
             title = '수집된 제목',
             status = '방송'
         WHERE id = 1`,
      )
      .run();

    const repository = new D1PendingScheduleRepository(env.otw_db);
    const item = await repository.findById(1);
    const result = await repository.approve(
      item!,
      updateOptions(30),
      actor,
    );
    const schedule = await env.otw_db
      .prepare(
        `SELECT start_time, title, status
         FROM schedules
         WHERE id = 30`,
      )
      .first<{
        start_time: string | null;
        title: string | null;
        status: string;
      }>();

    expect(result).toEqual({
      success: true,
      action: "update",
      scheduleId: 30,
    });
    expect(schedule).toEqual({
      start_time: "18:00",
      title: "수집된 제목",
      status: "미정",
    });
  });

  it("매칭 불확실 후보는 대상 일정 선택 전 승인할 수 없다", async () => {
    await env.otw_db
      .prepare(
        `UPDATE pending_schedules
         SET action_type = 'update',
             candidate_kind = 'ambiguous',
             match_reason = 'ambiguous',
             match_confidence = 'low',
             ranked_schedule_ids = '[31,32]'
         WHERE id = 1`,
      )
      .run();
    const repository = new D1PendingScheduleRepository(env.otw_db);
    const item = await repository.findById(1);

    await expect(
      repository.approve(
        item!,
        {
          applyMode: "all",
          targetMode: "update",
          timeMode: "exact",
          targetScheduleId: null,
        },
        actor,
      ),
    ).resolves.toMatchObject({
      success: false,
      error: "validation",
    });
    expect(
      await env.otw_db
        .prepare("SELECT id FROM pending_schedules WHERE id = 1")
        .first(),
    ).not.toBeNull();
  });

  it("V2 승인 전에 대상 일정이 완성되면 후보를 만료 처리하고 감사 로그를 남긴다", async () => {
    await env.otw_db
      .prepare(
        `INSERT INTO schedules (
           id, member_uid, date, start_time, title, status
         )
         VALUES (33, 10, '2026-07-28', '19:00', '이미 완성된 일정', '게릴라')`,
      )
      .run();
    await env.otw_db
      .prepare(
        `UPDATE pending_schedules
         SET action_type = 'update',
             existing_schedule_id = 33,
             candidate_kind = 'fill_missing_fields',
             match_reason = 'time_window',
             match_confidence = 'high'
         WHERE id = 1`,
      )
      .run();
    const repository = new D1PendingScheduleRepository(env.otw_db);
    const item = await repository.findById(1);

    await expect(
      repository.approve(item!, updateOptions(33), actor),
    ).resolves.toEqual({
      success: true,
      action: "candidate_obsolete",
      scheduleId: 33,
    });
    expect(
      await env.otw_db
        .prepare("SELECT id FROM pending_schedules WHERE id = 1")
        .first(),
    ).toBeNull();
    expect(
      await env.otw_db
        .prepare(
          `SELECT action, schedule_id
           FROM update_logs
           WHERE action = 'candidate_obsolete'`,
        )
        .first(),
    ).toEqual({
      action: "candidate_obsolete",
      schedule_id: 33,
    });
  });

  it("새 일정 V2 승인 전에 대응하는 빈 일정이 생기면 후보를 만료 처리한다", async () => {
    await env.otw_db
      .prepare(
        `INSERT INTO schedules (
           id, member_uid, date, start_time, title, status
         )
         VALUES (34, 10, '2026-07-28', '20:00', NULL, '미정')`,
      )
      .run();
    await env.otw_db
      .prepare(
        `UPDATE pending_schedules
         SET candidate_kind = 'missing_schedule',
             match_reason = 'missing_schedule',
             match_confidence = 'high'
         WHERE id = 1`,
      )
      .run();
    const repository = new D1PendingScheduleRepository(env.otw_db);
    const item = await repository.findById(1);

    await expect(
      repository.approve(item!, options, actor),
    ).resolves.toEqual({
      success: true,
      action: "candidate_obsolete",
      scheduleId: 34,
    });
    expect(
      await env.otw_db
        .prepare("SELECT id FROM pending_schedules WHERE id = 1")
        .first(),
    ).toBeNull();
  });

  describe("batch rollback", () => {
    it("create 승인 중간 log 실패 시 schedule 생성까지 rollback한다", async () => {
      await installFailingLogTrigger("approve");
      const repository = new D1PendingScheduleRepository(env.otw_db);
      const item = await repository.findById(1);

      expect(item).not.toBeNull();
      await expect(
        repository.approve(item!, options, actor),
      ).rejects.toThrow();

      expect(await readTransactionState()).toEqual({
        schedules: [],
        pendingSchedules: [
          {
            id: 1,
            action_type: "create",
            processed_reset_at: null,
          },
        ],
        updateLogs: [],
      });
      expect(
        await env.otw_db
          .prepare("SELECT id FROM schedule_candidate_rejections")
          .first(),
      ).toBeNull();
    });

    it("reject 감사 로그 실패 시 제외 기록과 pending 삭제를 rollback한다", async () => {
      await installFailingLogTrigger("reject");
      const repository = new D1PendingScheduleRepository(env.otw_db);
      const item = await repository.findById(1);

      await expect(
        repository.reject(item!, actor, {
          reasonCode: "duplicate",
          reasonNote: null,
        }),
      ).rejects.toThrow();

      expect(
        await env.otw_db
          .prepare("SELECT id FROM schedule_candidate_rejections")
          .first(),
      ).toBeNull();
      expect(
        await env.otw_db
          .prepare("SELECT id FROM pending_schedules WHERE id = 1")
          .first(),
      ).not.toBeNull();
      expect(
        await env.otw_db
          .prepare("SELECT id FROM update_logs WHERE action = 'reject'")
          .first(),
      ).toBeNull();
    });

    it("update 승인 중간 log 실패 시 schedule 수정을 rollback한다", async () => {
      await env.otw_db
        .prepare(
          `INSERT INTO schedules (
             id, member_uid, date, start_time, title, status
           )
           VALUES (10, 10, '2026-07-28', '18:00', '기존 방송', '휴방')`,
        )
        .run();
      await env.otw_db
        .prepare(
          `UPDATE pending_schedules
           SET action_type = 'update',
               existing_schedule_id = 10,
               previous_status = '휴방',
               previous_title = '기존 방송'
           WHERE id = 1`,
        )
        .run();
      await installFailingLogTrigger("approve");

      const repository = new D1PendingScheduleRepository(env.otw_db);
      const item = await repository.findById(1);

      expect(item).not.toBeNull();
      await expect(
        repository.approve(item!, updateOptions(10), actor),
      ).rejects.toThrow();

      expect(await readTransactionState()).toEqual({
        schedules: [
          {
            id: 10,
            member_uid: 10,
            date: "2026-07-28",
            start_time: "18:00",
            title: "기존 방송",
            status: "휴방",
          },
        ],
        pendingSchedules: [
          {
            id: 1,
            action_type: "update",
            processed_reset_at: null,
          },
        ],
        updateLogs: [],
      });
    });

    it("apply-empty 승인 중간 log 실패 시 빈 schedule 적용을 rollback한다", async () => {
      await env.otw_db
        .prepare(
          `INSERT INTO schedules (
             id, member_uid, date, start_time, title, status
           )
           VALUES (11, 10, '2026-07-28', NULL, NULL, '방송')`,
        )
        .run();
      await env.otw_db
        .prepare(
          `UPDATE pending_schedules
           SET action_type = 'update', existing_schedule_id = 11
           WHERE id = 1`,
        )
        .run();
      await installFailingLogTrigger("approve");

      const repository = new D1PendingScheduleRepository(env.otw_db);
      const item = await repository.findById(1);

      expect(item).not.toBeNull();
      const target = await repository.findEmptyTarget(item!);
      expect(target).toEqual({ id: 11, status: "방송" });
      await expect(
        repository.applyToEmptyTarget(item!, target!, actor),
      ).rejects.toThrow();

      expect(await readTransactionState()).toEqual({
        schedules: [
          {
            id: 11,
            member_uid: 10,
            date: "2026-07-28",
            start_time: null,
            title: null,
            status: "방송",
          },
        ],
        pendingSchedules: [
          {
            id: 1,
            action_type: "update",
            processed_reset_at: null,
          },
        ],
        updateLogs: [],
      });
    });

    it("reject의 pending 삭제 실패 시 앞선 reject log를 rollback한다", async () => {
      await installFailingPendingDeleteTrigger();
      const repository = new D1PendingScheduleRepository(env.otw_db);
      const item = await repository.findById(1);

      expect(item).not.toBeNull();
      await expect(repository.reject(item!, actor, null)).rejects.toThrow();

      expect(await readTransactionState()).toEqual({
        schedules: [],
        pendingSchedules: [
          {
            id: 1,
            action_type: "create",
            processed_reset_at: null,
          },
        ],
        updateLogs: [],
      });
    });

    it("reset log 실패 시 processed_reset_at 수정을 rollback한다", async () => {
      await installFailingLogTrigger("reset_processed");
      const repository = new D1PendingScheduleRepository(env.otw_db);
      const item = await repository.findById(1);

      expect(item).not.toBeNull();
      await expect(
        repository.resetProcessed(item!, actor),
      ).rejects.toThrow();

      expect(await readTransactionState()).toEqual({
        schedules: [],
        pendingSchedules: [
          {
            id: 1,
            action_type: "create",
            processed_reset_at: null,
          },
        ],
        updateLogs: [],
      });
    });
  });

  it("혼합 승인 결과는 입력 순서를 유지하고 성공 항목만 독립 commit한다", async () => {
    await env.otw_db
      .prepare(
        `INSERT INTO pending_schedules (
           id,
           member_uid,
           member_name,
           date,
           start_time,
           title,
           status,
           action_type
         )
         VALUES
           (2, 20, '충돌 멤버', '2026-07-30', '21:00', '충돌 방송', '방송', 'create'),
           (3, 30, '성공 멤버', '2026-07-31', '22:00', '추가 방송', '방송', 'create')`,
      )
      .run();
    await env.otw_db
      .prepare(
        `INSERT INTO schedules (
           id, member_uid, date, start_time, title, status
         )
         VALUES (20, 20, '2026-07-30', '21:20', '기존 방송', '방송')`,
      )
      .run();

    const repository = new D1PendingScheduleRepository(env.otw_db);
    const inputIds = [3, 2, 1];
    const results = await pMap(
      inputIds,
      async (id) => {
        const item = await repository.findById(id);
        if (!item) {
          throw new Error(`Missing pending schedule ${id}`);
        }
        const outcome = await approvePendingSchedule(
          repository,
          item,
          options,
          actor,
        );
        return { id, ...outcome };
      },
      4,
    );

    expect(
      results.map(({ id, success }) => ({ id, success })),
    ).toEqual([
      { id: 3, success: true },
      { id: 2, success: false },
      { id: 1, success: true },
    ]);
    expect(results[1]).toMatchObject({
      id: 2,
      success: false,
      error: "conflict",
      conflictingScheduleId: 20,
    });

    const state = await readTransactionState();
    expect(state.pendingSchedules).toEqual([
      {
        id: 2,
        action_type: "create",
        processed_reset_at: null,
      },
    ]);
    expect(state.schedules).toHaveLength(3);
    expect(state.schedules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 20,
          member_uid: 20,
          date: "2026-07-30",
          start_time: "21:20",
          title: "기존 방송",
        }),
        expect.objectContaining({
          member_uid: 30,
          date: "2026-07-31",
          start_time: "22:00",
          title: "추가 방송",
        }),
        expect.objectContaining({
          member_uid: 10,
          date: "2026-07-28",
          start_time: "20:00",
          title: "정규 방송",
        }),
      ]),
    );
    expect(state.updateLogs).toHaveLength(2);
    expect(state.updateLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ member_uid: 30, action: "approve" }),
        expect.objectContaining({ member_uid: 10, action: "approve" }),
      ]),
    );
  });
});
