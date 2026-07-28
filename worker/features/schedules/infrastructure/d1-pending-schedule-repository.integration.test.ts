import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { PendingApprovalOptions } from "../../../../contracts/pending-schedules";
import { pMap } from "../../../platform/http-helpers";
import { approvePendingSchedule } from "../application/process-pending-schedule";
import { D1PendingScheduleRepository } from "./d1-pending-schedule-repository";
import { queryPendingScheduleReview } from "./d1-pending-schedule-query";
import { D1ScheduleWriteRepository } from "./d1-schedule-write-repository";

const TEST_SCHEMA = [
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
     created_at NUMERIC DEFAULT CURRENT_TIMESTAMP
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
  action: "approve" | "reset_processed",
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
           action_type
         )
         VALUES (1, 10, '테스트 멤버', '2026-07-28', '20:00', '정규 방송', '방송', 'create')`,
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
      await expect(repository.reject(item!, actor)).rejects.toThrow();

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
