import { between, eq } from "drizzle-orm";
import { getDb } from "../db";
import { schedules } from "../../src/db/schema";
import {
  badRequest,
  getActorInfo,
  insertUpdateLog,
  parseNumericId,
} from "../utils/helpers";
import type { SchedulePayload, UpdateSchedulePayload, Env } from "../types";

export const handleSchedules = async (request: Request, env: Env) => {
  const url = new URL(request.url);
  const db = getDb(env);
  const actor = getActorInfo(request);

  if (request.method === "GET") {
    const date = url.searchParams.get("date");
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    if (startDate && endDate) {
      const data = await db
        .select()
        .from(schedules)
        .where(between(schedules.date, startDate, endDate));
      return Response.json(data);
    }

    if (!date) {
      return badRequest("Date parameter is required");
    }

    const data = await db
      .select()
      .from(schedules)
      .where(eq(schedules.date, date));
    return Response.json(data);
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
