import { between, eq } from "drizzle-orm";
import { authenticateOptionalRequest } from "../auth";
import { getDb } from "../db";
import { schedules } from "../../src/db/schema";
import {
  badRequest,
  getActorInfo,
  insertUpdateLog,
  parseNumericId,
} from "../utils/helpers";
import { saveScheduleWithConflicts } from "../use-cases/save-schedule";
import type { SchedulePayload, UpdateSchedulePayload, Env } from "../types";

const SCHEDULE_STATUSES = ["방송", "휴방", "게릴라", "미정"] as const;
type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];
const SCHEDULE_READ_CACHE_CONTROL = "no-store";

const isScheduleStatus = (value: unknown): value is ScheduleStatus =>
  typeof value === "string" &&
  SCHEDULE_STATUSES.includes(value as ScheduleStatus);

export const handleSchedules = async (request: Request, env: Env) => {
  const url = new URL(request.url);
  const db = getDb(env);
  const shouldCaptureActor =
    request.method === "POST" ||
    request.method === "PUT" ||
    request.method === "DELETE";
  const authenticatedUser = shouldCaptureActor
    ? await authenticateOptionalRequest(request, env)
    : null;
  const actor = getActorInfo(request, authenticatedUser);

  if (url.pathname === "/api/schedules/save") {
    if (request.method !== "POST") {
      return new Response(null, { status: 405 });
    }

    const body = (await request.json()) as Partial<
      UpdateSchedulePayload & { id?: number | string | null }
    >;
    const { id, member_uid, date, start_time, title, status } = body;

    if (!member_uid || !date || !isScheduleStatus(status)) {
      return badRequest("Missing or invalid required fields");
    }

    const numericId = id === undefined || id === null ? null : parseNumericId(id);
    if (id !== undefined && id !== null && numericId === null) {
      return badRequest("Invalid id");
    }

    const result = await saveScheduleWithConflicts(
      db,
      {
        id: numericId,
        member_uid,
        date,
        start_time: start_time ?? null,
        title: title ?? null,
        status,
      },
      actor,
    );
    return Response.json(result);
  }

  if (request.method === "GET") {
    const date = url.searchParams.get("date");
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    if (startDate && endDate) {
      const data = await db
        .select()
        .from(schedules)
        .where(between(schedules.date, startDate, endDate));
      return Response.json(data, {
        headers: { "Cache-Control": SCHEDULE_READ_CACHE_CONTROL },
      });
    }

    if (!date) {
      return badRequest("Date parameter is required");
    }

    const data = await db
      .select()
      .from(schedules)
      .where(eq(schedules.date, date));
    return Response.json(data, {
      headers: { "Cache-Control": SCHEDULE_READ_CACHE_CONTROL },
    });
  }

  if (request.method === "POST") {
    const body = (await request.json()) as Partial<SchedulePayload>;
    const { member_uid, date, start_time, title, status } = body;

    if (!member_uid || !date || !status) {
      return badRequest("Missing required fields");
    }

    const result = await db.insert(schedules).values({
      member_uid,
      date,
      start_time,
      title,
      status,
    });

    if (result.success) {
      await insertUpdateLog(db, {
        scheduleId: null,
        memberUid: member_uid,
        scheduleDate: date,
        action: "create",
        title: title ?? null,
        previousStatus: null,
        actorId: actor.actorId,
        actorName: actor.actorName,
        actorIp: actor.actorIp,
      });
      return new Response("Created", { status: 201 });
    } else {
      return new Response("Failed to create", { status: 500 });
    }
  }

  if (request.method === "PUT") {
    const body = (await request.json()) as Partial<UpdateSchedulePayload>;
    const { id, member_uid, date, start_time, title, status } = body;

    if (!id || !member_uid || !date || !status) {
      return badRequest("Missing required fields");
    }

    const numericId = parseNumericId(id);
    if (numericId === null) return badRequest("Invalid id");

    const existing = await db
      .select()
      .from(schedules)
      .where(eq(schedules.id, numericId))
      .limit(1);

    const result = await db
      .update(schedules)
      .set({
        member_uid,
        date,
        start_time,
        title,
        status,
      })
      .where(eq(schedules.id, numericId));

    if (result.success) {
      if (existing.length > 0) {
        await insertUpdateLog(db, {
          scheduleId: numericId,
          memberUid: member_uid,
          scheduleDate: date,
          action: "update",
          title: title ?? null,
          previousStatus: existing[0].status,
          actorId: actor.actorId,
          actorName: actor.actorName,
          actorIp: actor.actorIp,
        });
      }
      return new Response("Updated", { status: 200 });
    } else {
      return new Response("Failed to update", { status: 500 });
    }
  }

  if (request.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) {
      return badRequest("ID parameter is required");
    }
    const numericId = parseNumericId(id);
    if (numericId === null) return badRequest("Invalid id");

    const existing = await db
      .select()
      .from(schedules)
      .where(eq(schedules.id, numericId))
      .limit(1);

    const result = await db
      .delete(schedules)
      .where(eq(schedules.id, numericId));

    if (result.success) {
      if (existing.length > 0) {
        const target = existing[0];
        await insertUpdateLog(db, {
          scheduleId: numericId,
          memberUid: target.member_uid,
          scheduleDate: target.date,
          action: "delete",
          title: target.title ?? null,
          previousStatus: target.status,
          actorId: actor.actorId,
          actorName: actor.actorName,
          actorIp: actor.actorIp,
        });
      }
      return new Response("Deleted", { status: 200 });
    } else {
      return new Response("Failed to delete", { status: 500 });
    }
  }

  return new Response(null, { status: 405 });
};
