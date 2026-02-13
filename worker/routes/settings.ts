import {
  asc,
  and,
  between,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  sql,
  SQL,
} from "drizzle-orm";
import { getDb } from "../db";
import {
  pendingSchedules,
  schedules,
  settings,
  updateLogs,
} from "../../src/db/schema";
import {
  badRequest,
  getActorInfo,
  getSetting,
  insertUpdateLog,
  parseNumericId,
  pMap,
  updateSetting,
} from "../utils/helpers";
import { autoUpdateSchedules } from "../services/schedule";
import type { Env } from "../types";

export const handleSettings = async (request: Request, env: Env) => {
  const url = new URL(request.url);
  const db = getDb(env);
  const actor = getActorInfo(request);

  // 자동 업데이트 관련 설정 키만 허용
  const ALLOWED_SETTINGS = [
    "auto_update_enabled",
    "auto_update_interval_hours",
    "auto_update_last_run",
    "auto_update_range_days",
  ] as const;

  // GET /api/settings/logs - 로그 조회 (더 구체적인 경로를 먼저 처리)
  if (request.method === "GET" && url.pathname === "/api/settings/logs") {
    const rawLimit = parseInt(url.searchParams.get("limit") || "50", 10);
    const pageParam = url.searchParams.get("page");
    const pageSizeParam = url.searchParams.get("pageSize");
    const sort = url.searchParams.get("sort") || "created_desc";
    const isPagedMode = pageParam !== null || pageSizeParam !== null;
    const action = url.searchParams.get("action");
    const member = url.searchParams.get("member");
    const dateFrom = url.searchParams.get("dateFrom");
    const dateTo = url.searchParams.get("dateTo");
    const query = url.searchParams.get("query");

    const filters: SQL[] = [];
    if (action && action !== "all") {
      filters.push(eq(updateLogs.action, action));
    }
    if (member) {
      const memberQuery = `%${member.toLowerCase()}%`;
      filters.push(
        sql`lower(coalesce(${updateLogs.member_name}, '')) like ${memberQuery}`,
      );
    }
    if (dateFrom && dateTo) {
      filters.push(between(updateLogs.schedule_date, dateFrom, dateTo));
    } else if (dateFrom) {
      filters.push(gte(updateLogs.schedule_date, dateFrom));
    } else if (dateTo) {
      filters.push(lte(updateLogs.schedule_date, dateTo));
    }
    if (query) {
      const searchQuery = `%${query.toLowerCase()}%`;
      filters.push(
        sql`(
          lower(coalesce(${updateLogs.title}, '')) like ${searchQuery}
          or lower(coalesce(${updateLogs.member_name}, '')) like ${searchQuery}
        )`,
      );
    }

    let logQuery = db.select().from(updateLogs).$dynamic();
    if (filters.length > 0) {
      logQuery = logQuery.where(and(...filters));
    }

    if (!isPagedMode) {
      const limit = Number.isFinite(rawLimit)
        ? Math.min(Math.max(rawLimit, 1), 1000)
        : 50;
      const logsData = await logQuery
        .orderBy(desc(updateLogs.created_at), desc(updateLogs.id))
        .limit(limit);
      return Response.json(logsData);
    }

    const pageRaw = parseInt(pageParam || "1", 10);
    const pageSizeRaw = parseInt(pageSizeParam || "50", 10);
    const page = Number.isFinite(pageRaw) ? Math.max(pageRaw, 1) : 1;
    const pageSize = Number.isFinite(pageSizeRaw)
      ? Math.min(Math.max(pageSizeRaw, 1), 200)
      : 50;
    const offset = (page - 1) * pageSize;

    let countQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(updateLogs)
      .$dynamic();
    if (filters.length > 0) {
      countQuery = countQuery.where(and(...filters));
    }
    const countResult = await countQuery;
    const total = Number(countResult[0]?.count ?? 0);
    const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);

    let pagedQuery = logQuery;
    if (sort === "created_asc") {
      pagedQuery = pagedQuery.orderBy(
        asc(updateLogs.created_at),
        asc(updateLogs.id),
      );
    } else if (sort === "schedule_desc") {
      pagedQuery = pagedQuery.orderBy(
        desc(updateLogs.schedule_date),
        desc(updateLogs.created_at),
        desc(updateLogs.id),
      );
    } else if (sort === "schedule_asc") {
      pagedQuery = pagedQuery.orderBy(
        asc(updateLogs.schedule_date),
        asc(updateLogs.created_at),
        asc(updateLogs.id),
      );
    } else if (sort === "action_asc") {
      pagedQuery = pagedQuery.orderBy(
        asc(updateLogs.action),
        desc(updateLogs.created_at),
        desc(updateLogs.id),
      );
    } else {
      pagedQuery = pagedQuery.orderBy(
        desc(updateLogs.created_at),
        desc(updateLogs.id),
      );
    }

    const items = await pagedQuery.limit(pageSize).offset(offset);
    return Response.json({
      items,
      total,
      page,
      pageSize,
      totalPages,
      hasPrevPage: page > 1,
      hasNextPage: page < totalPages,
    });
  }

  // GET /api/settings - 설정 조회
  if (request.method === "GET" && url.pathname === "/api/settings") {
    const data = await db
      .select()
      .from(settings)
      .where(inArray(settings.key, [...ALLOWED_SETTINGS]));

    // 키-값 객체로 변환
    const settingsObj: Record<string, string | null> = {};
    for (const row of data) {
      settingsObj[row.key] = row.value;
    }
    return Response.json(settingsObj);
  }

  if (request.method === "PUT") {
    const body = (await request.json()) as Record<string, string>;

    // 허용된 키만 업데이트
    const updates: Promise<void>[] = [];
    for (const key of ALLOWED_SETTINGS) {
      if (key in body && key !== "auto_update_last_run") {
        // last_run은 시스템에서만 업데이트
        updates.push(updateSetting(db, key, body[key]));
      }
    }

    if (updates.length === 0) {
      return badRequest("No valid settings to update");
    }

    await Promise.all(updates);
    return new Response("Settings updated", { status: 200 });
  }

  // POST /api/settings/run-now - 수동 실행
  if (request.method === "POST" && url.pathname === "/api/settings/run-now") {
    try {
      // 날짜 범위 설정 가져오기
      const rangeDaysStr = await getSetting(db, "auto_update_range_days");
      const rangeDays = parseInt(rangeDaysStr || "3", 10);

      const result = await autoUpdateSchedules(db, rangeDays);
      await updateSetting(db, "auto_update_last_run", Date.now().toString());
      return Response.json({
        success: true,
        updated: result.updated,
        checked: result.checked,
        details: result.details,
      });
    } catch (error) {
      console.error("Manual auto update failed:", error);
      const today = new Date().toISOString().slice(0, 10);
      await insertUpdateLog(db, {
        scheduleId: null,
        memberUid: null,
        memberName: null,
        scheduleDate: today,
        action: "auto_failed",
        title: "manual auto update failed",
        previousStatus: null,
        actorId: actor.actorId,
        actorName: actor.actorName,
        actorIp: actor.actorIp,
      });
      return new Response("Auto update failed", { status: 500 });
    }
  }

  // DELETE /api/settings/logs/:id - 로그만 삭제 (스케줄 연동 제외)
  if (
    request.method === "DELETE" &&
    url.pathname.startsWith("/api/settings/logs/")
  ) {
    const logId = url.pathname.split("/").pop();
    if (!logId) {
      return badRequest("Log ID is required");
    }
    const numericId = parseNumericId(logId);
    if (numericId === null) {
      return badRequest("Invalid log ID");
    }

    // 로그 삭제 (스케줄 삭제 연동 제외)
    await db.delete(updateLogs).where(eq(updateLogs.id, numericId));

    return Response.json({ success: true });
  }

  // GET /api/settings/pending - 대기 스케줄 목록 조회
  if (request.method === "GET" && url.pathname === "/api/settings/pending") {
    const pendingList = await db
      .select()
      .from(pendingSchedules)
      .orderBy(desc(pendingSchedules.created_at));
    return Response.json(pendingList);
  }

  // POST /api/settings/pending/:id/approve - 개별 승인
  if (
    request.method === "POST" &&
    url.pathname.match(/^\/api\/settings\/pending\/\d+\/approve$/)
  ) {
    const pathParts = url.pathname.split("/");
    const pendingId = parseNumericId(pathParts[4]);
    if (pendingId === null) {
      return badRequest("Invalid pending ID");
    }

    // 대기 스케줄 조회
    const pending = await db
      .select()
      .from(pendingSchedules)
      .where(eq(pendingSchedules.id, pendingId))
      .limit(1);

    if (pending.length === 0) {
      return new Response("Pending schedule not found", { status: 404 });
    }

    const item = pending[0];

    try {
      let createdScheduleId: number | null = null;
      if (item.action_type === "create") {
        // 충돌 감지: 같은 멤버, 같은 날짜에 비슷한 시간의 스케줄이 있는지 확인
        const existingSchedules = await db
          .select()
          .from(schedules)
          .where(
            and(
              eq(schedules.member_uid, item.member_uid),
              eq(schedules.date, item.date),
            ),
          );

        // 시간 충돌 검사 (±30분 이내)
        if (item.start_time) {
          const pendingMinutes =
            parseInt(item.start_time.split(":")[0]) * 60 +
            parseInt(item.start_time.split(":")[1]);

          const conflicting = existingSchedules.find((s) => {
            if (!s.start_time) return false;
            const scheduleMinutes =
              parseInt(s.start_time.split(":")[0]) * 60 +
              parseInt(s.start_time.split(":")[1]);
            return Math.abs(pendingMinutes - scheduleMinutes) <= 30;
          });

          if (conflicting) {
            return Response.json(
              {
                success: false,
                error: "conflict",
                message: `이미 비슷한 시간(${conflicting.start_time})에 스케줄이 존재합니다.`,
                conflictingScheduleId: conflicting.id,
              },
              { status: 409 },
            );
          }
        }

        // 신규 생성: schedules 테이블에 삽입
        await db.insert(schedules).values({
          member_uid: item.member_uid,
          date: item.date,
          start_time: item.start_time,
          title: item.title,
          status: item.status,
        });
        const created = await db
          .select({ id: schedules.id })
          .from(schedules)
          .where(
            and(
              eq(schedules.member_uid, item.member_uid),
              eq(schedules.date, item.date),
              item.start_time
                ? eq(schedules.start_time, item.start_time)
                : isNull(schedules.start_time),
              item.title
                ? eq(schedules.title, item.title)
                : isNull(schedules.title),
            ),
          )
          .orderBy(desc(schedules.id))
          .limit(1);
        createdScheduleId = created[0]?.id ?? null;
      } else if (item.action_type === "update" && item.existing_schedule_id) {
        // 정합성 검사: 대상 스케줄이 아직 존재하는지 확인
        const targetSchedule = await db
          .select()
          .from(schedules)
          .where(eq(schedules.id, item.existing_schedule_id))
          .limit(1);

        if (targetSchedule.length === 0) {
          return Response.json(
            {
              success: false,
              error: "not_found",
              message: "수정 대상 스케줄이 이미 삭제되었습니다.",
            },
            { status: 404 },
          );
        }

        // 업데이트: 기존 스케줄 수정
        await db
          .update(schedules)
          .set({
            start_time: item.start_time,
            title: item.title,
            status: item.status,
          })
          .where(eq(schedules.id, item.existing_schedule_id));
      }

      await insertUpdateLog(db, {
        scheduleId: item.existing_schedule_id ?? createdScheduleId,
        memberUid: item.member_uid,
        memberName: item.member_name,
        scheduleDate: item.date,
        action: "approve",
        title: item.title,
        previousStatus: item.previous_status,
        actorId: actor.actorId,
        actorName: actor.actorName,
        actorIp: actor.actorIp,
      });

      // 대기 스케줄 삭제
      await db
        .delete(pendingSchedules)
        .where(eq(pendingSchedules.id, pendingId));

      return Response.json({ success: true, action: item.action_type });
    } catch (error) {
      console.error("Failed to approve pending schedule:", error);
      return new Response("Failed to approve", { status: 500 });
    }
  }

  // POST /api/settings/pending/:id/reject - 개별 거부
  if (
    request.method === "POST" &&
    url.pathname.match(/^\/api\/settings\/pending\/\d+\/reject$/)
  ) {
    const pathParts = url.pathname.split("/");
    const pendingId = parseNumericId(pathParts[4]);
    if (pendingId === null) {
      return badRequest("Invalid pending ID");
    }

    // 대기 스케줄 조회
    const pending = await db
      .select()
      .from(pendingSchedules)
      .where(eq(pendingSchedules.id, pendingId))
      .limit(1);

    if (pending.length === 0) {
      return new Response("Pending schedule not found", { status: 404 });
    }

    const item = pending[0];

    await insertUpdateLog(db, {
      scheduleId: item.existing_schedule_id,
      memberUid: item.member_uid,
      memberName: item.member_name,
      scheduleDate: item.date,
      action: "reject",
      title: item.title,
      previousStatus: item.previous_status,
      actorId: actor.actorId,
      actorName: actor.actorName,
      actorIp: actor.actorIp,
    });

    // 대기 스케줄 삭제
    await db.delete(pendingSchedules).where(eq(pendingSchedules.id, pendingId));

    return Response.json({ success: true });
  }

  // POST /api/settings/pending/approve-selected - 선택 승인
  if (
    request.method === "POST" &&
    url.pathname === "/api/settings/pending/approve-selected"
  ) {
    const body = (await request.json().catch(() => null)) as {
      ids?: unknown;
    } | null;
    if (!body || !Array.isArray(body.ids)) {
      return badRequest("ids array is required");
    }

    const targetIds = [...new Set(body.ids)]
      .map((value) => parseNumericId(value as string | number))
      .filter((value): value is number => value !== null);

    if (targetIds.length === 0) {
      return badRequest("No valid pending IDs");
    }

    const pendingList = await db
      .select()
      .from(pendingSchedules)
      .where(inArray(pendingSchedules.id, targetIds));
    const pendingMap = new Map(pendingList.map((item) => [item.id, item]));

    const results = await pMap(
      targetIds,
      async (pendingId) => {
        const item = pendingMap.get(pendingId);
        if (!item) {
          return {
            id: pendingId,
            success: false as const,
            error: "not_found",
            message: "대기 스케줄을 찾을 수 없습니다.",
          };
        }

        try {
          let createdScheduleId: number | null = null;

          if (item.action_type === "create") {
            const existingSchedules = await db
              .select()
              .from(schedules)
              .where(
                and(
                  eq(schedules.member_uid, item.member_uid),
                  eq(schedules.date, item.date),
                ),
              );

            if (item.start_time) {
              const pendingMinutes =
                parseInt(item.start_time.split(":")[0]) * 60 +
                parseInt(item.start_time.split(":")[1]);
              const conflicting = existingSchedules.find((s) => {
                if (!s.start_time) return false;
                const scheduleMinutes =
                  parseInt(s.start_time.split(":")[0]) * 60 +
                  parseInt(s.start_time.split(":")[1]);
                return Math.abs(pendingMinutes - scheduleMinutes) <= 30;
              });

              if (conflicting) {
                return {
                  id: item.id,
                  success: false as const,
                  error: "conflict",
                  message: `이미 비슷한 시간(${conflicting.start_time})에 스케줄이 존재합니다.`,
                };
              }
            }

            await db.insert(schedules).values({
              member_uid: item.member_uid,
              date: item.date,
              start_time: item.start_time,
              title: item.title,
              status: item.status,
            });

            const created = await db
              .select({ id: schedules.id })
              .from(schedules)
              .where(
                and(
                  eq(schedules.member_uid, item.member_uid),
                  eq(schedules.date, item.date),
                  item.start_time
                    ? eq(schedules.start_time, item.start_time)
                    : isNull(schedules.start_time),
                  item.title
                    ? eq(schedules.title, item.title)
                    : isNull(schedules.title),
                ),
              )
              .orderBy(desc(schedules.id))
              .limit(1);

            createdScheduleId = created[0]?.id ?? null;
          } else if (item.action_type === "update" && item.existing_schedule_id) {
            const targetSchedule = await db
              .select()
              .from(schedules)
              .where(eq(schedules.id, item.existing_schedule_id))
              .limit(1);

            if (targetSchedule.length === 0) {
              return {
                id: item.id,
                success: false as const,
                error: "not_found",
                message: "수정 대상 스케줄이 이미 삭제되었습니다.",
              };
            }

            await db
              .update(schedules)
              .set({
                start_time: item.start_time,
                title: item.title,
                status: item.status,
              })
              .where(eq(schedules.id, item.existing_schedule_id));
          }

          await insertUpdateLog(db, {
            scheduleId: item.existing_schedule_id ?? createdScheduleId,
            memberUid: item.member_uid,
            memberName: item.member_name,
            scheduleDate: item.date,
            action: "approve",
            title: item.title,
            previousStatus: item.previous_status,
            actorId: actor.actorId,
            actorName: actor.actorName,
            actorIp: actor.actorIp,
          });

          await db
            .delete(pendingSchedules)
            .where(eq(pendingSchedules.id, pendingId));

          return {
            id: pendingId,
            success: true as const,
            action: item.action_type,
          };
        } catch (error) {
          console.error(`Failed to approve selected pending ${pendingId}:`, error);
          return {
            id: pendingId,
            success: false as const,
            error: "error",
            message: "승인 처리 중 오류가 발생했습니다.",
          };
        }
      },
      // create 승인 시 충돌 검증이 read-then-insert 패턴이라 병렬 처리하면
      // 같은 멤버/날짜의 ±30분 중복 스케줄이 동시에 통과할 수 있어 순차 처리한다.
      1,
    );

    const successCount = results.filter((result) => result.success).length;
    return Response.json({
      success: true,
      totalRequested: targetIds.length,
      successCount,
      failedCount: targetIds.length - successCount,
      results,
    });
  }

  // POST /api/settings/pending/reject-selected - 선택 거부
  if (
    request.method === "POST" &&
    url.pathname === "/api/settings/pending/reject-selected"
  ) {
    const body = (await request.json().catch(() => null)) as {
      ids?: unknown;
    } | null;
    if (!body || !Array.isArray(body.ids)) {
      return badRequest("ids array is required");
    }

    const targetIds = [...new Set(body.ids)]
      .map((value) => parseNumericId(value as string | number))
      .filter((value): value is number => value !== null);

    if (targetIds.length === 0) {
      return badRequest("No valid pending IDs");
    }

    const pendingList = await db
      .select()
      .from(pendingSchedules)
      .where(inArray(pendingSchedules.id, targetIds));
    const pendingMap = new Map(pendingList.map((item) => [item.id, item]));

    const results = await pMap(
      targetIds,
      async (pendingId) => {
        const item = pendingMap.get(pendingId);
        if (!item) {
          return {
            id: pendingId,
            success: false as const,
            error: "not_found",
            message: "대기 스케줄을 찾을 수 없습니다.",
          };
        }

        try {
          await insertUpdateLog(db, {
            scheduleId: item.existing_schedule_id,
            memberUid: item.member_uid,
            memberName: item.member_name,
            scheduleDate: item.date,
            action: "reject",
            title: item.title,
            previousStatus: item.previous_status,
            actorId: actor.actorId,
            actorName: actor.actorName,
            actorIp: actor.actorIp,
          });

          await db
            .delete(pendingSchedules)
            .where(eq(pendingSchedules.id, pendingId));

          return {
            id: pendingId,
            success: true as const,
            action: "reject",
          };
        } catch (error) {
          console.error(`Failed to reject selected pending ${pendingId}:`, error);
          return {
            id: pendingId,
            success: false as const,
            error: "error",
            message: "거부 처리 중 오류가 발생했습니다.",
          };
        }
      },
      10,
    );

    const successCount = results.filter((result) => result.success).length;
    return Response.json({
      success: true,
      totalRequested: targetIds.length,
      successCount,
      failedCount: targetIds.length - successCount,
      results,
    });
  }

  // POST /api/settings/pending/approve-all - 전체 승인
  if (
    request.method === "POST" &&
    url.pathname === "/api/settings/pending/approve-all"
  ) {
    const allPending = await db.select().from(pendingSchedules);

    let approvedCount = 0;
    let skippedCount = 0;
    const skippedItems: { id: number; reason: string }[] = [];

    const results = await pMap(
      allPending,
      async (item) => {
        try {
          let createdScheduleId: number | null = null;
          if (item.action_type === "create") {
            // 충돌 감지
            const existingSchedules = await db
              .select()
              .from(schedules)
              .where(
                and(
                  eq(schedules.member_uid, item.member_uid),
                  eq(schedules.date, item.date),
                ),
              );

            let hasConflict = false;
            if (item.start_time) {
              const pendingMinutes =
                parseInt(item.start_time.split(":")[0]) * 60 +
                parseInt(item.start_time.split(":")[1]);

              hasConflict = existingSchedules.some((s) => {
                if (!s.start_time) return false;
                const scheduleMinutes =
                  parseInt(s.start_time.split(":")[0]) * 60 +
                  parseInt(s.start_time.split(":")[1]);
                return Math.abs(pendingMinutes - scheduleMinutes) <= 30;
              });
            }

            if (hasConflict) {
              return { success: false, id: item.id, reason: "conflict" };
            }

            await db.insert(schedules).values({
              member_uid: item.member_uid,
              date: item.date,
              start_time: item.start_time,
              title: item.title,
              status: item.status,
            });
            const created = await db
              .select({ id: schedules.id })
              .from(schedules)
              .where(
                and(
                  eq(schedules.member_uid, item.member_uid),
                  eq(schedules.date, item.date),
                  item.start_time
                    ? eq(schedules.start_time, item.start_time)
                    : isNull(schedules.start_time),
                  item.title
                    ? eq(schedules.title, item.title)
                    : isNull(schedules.title),
                ),
              )
              .orderBy(desc(schedules.id))
              .limit(1);
            createdScheduleId = created[0]?.id ?? null;
          } else if (
            item.action_type === "update" &&
            item.existing_schedule_id
          ) {
            // 정합성 검사
            const targetSchedule = await db
              .select()
              .from(schedules)
              .where(eq(schedules.id, item.existing_schedule_id))
              .limit(1);

            if (targetSchedule.length === 0) {
              return { success: false, id: item.id, reason: "not_found" };
            }

            await db
              .update(schedules)
              .set({
                start_time: item.start_time,
                title: item.title,
                status: item.status,
              })
              .where(eq(schedules.id, item.existing_schedule_id));
          }

          await insertUpdateLog(db, {
            scheduleId: item.existing_schedule_id ?? createdScheduleId,
            memberUid: item.member_uid,
            memberName: item.member_name,
            scheduleDate: item.date,
            action: "approve",
            title: item.title,
            previousStatus: item.previous_status,
            actorId: actor.actorId,
            actorName: actor.actorName,
            actorIp: actor.actorIp,
          });

          // 승인된 항목 삭제
          await db
            .delete(pendingSchedules)
            .where(eq(pendingSchedules.id, item.id));

          return { success: true, id: item.id };
        } catch (error) {
          console.error(`Failed to approve pending ${item.id}:`, error);
          return { success: false, id: item.id, reason: "error" };
        }
      },
      5,
    );

    for (const res of results) {
      if (res.success) {
        approvedCount++;
      } else {
        skippedCount++;
        skippedItems.push({ id: res.id, reason: res.reason || "unknown" });
      }
    }

    return Response.json({
      success: true,
      approvedCount,
      skippedCount,
      skippedItems: skippedItems.length > 0 ? skippedItems : undefined,
    });
  }

  // POST /api/settings/pending/reject-all - 전체 거부
  if (
    request.method === "POST" &&
    url.pathname === "/api/settings/pending/reject-all"
  ) {
    const allPending = await db.select().from(pendingSchedules);

    await pMap(
      allPending,
      async (item) => {
        await insertUpdateLog(db, {
          scheduleId: item.existing_schedule_id,
          memberUid: item.member_uid,
          memberName: item.member_name,
          scheduleDate: item.date,
          action: "reject",
          title: item.title,
          previousStatus: item.previous_status,
          actorId: actor.actorId,
          actorName: actor.actorName,
          actorIp: actor.actorIp,
        });
      },
      10,
    );

    // 모든 대기 스케줄 삭제
    await db.delete(pendingSchedules);

    return Response.json({
      success: true,
      rejectedCount: allPending.length,
    });
  }

  return new Response(null, { status: 404 });
};
