import { between, eq } from "drizzle-orm";
import { getDb } from "./db";
import { members, schedules, type NewSchedule } from "../src/db/schema";

type SchedulePayload = Pick<
  NewSchedule,
  "member_uid" | "date" | "start_time" | "title" | "status"
>;
type UpdateSchedulePayload = SchedulePayload & { id: number | string };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const db = getDb(env);

    if (url.pathname.startsWith("/api/members")) {
      const data = await db.select().from(members);
      return Response.json(data);
    }

    if (url.pathname.startsWith("/api/schedules")) {
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
          return new Response("Date parameter is required", { status: 400 });
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
          return new Response("Missing required fields", { status: 400 });
        }

        const result = await db.insert(schedules).values({
          member_uid,
          date,
          start_time,
          title,
          status,
        });

        if (result.success) {
          return new Response("Created", { status: 201 });
        } else {
          return new Response("Failed to create", { status: 500 });
        }
      }

      if (request.method === "PUT") {
        const body = (await request.json()) as Partial<UpdateSchedulePayload>;
        const { id, member_uid, date, start_time, title, status } = body;

        if (!id || !member_uid || !date || !status) {
          return new Response("Missing required fields", { status: 400 });
        }

        const numericId = Number(id);
        if (!Number.isFinite(numericId)) {
          return new Response("Invalid id", { status: 400 });
        }

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
          return new Response("Updated", { status: 200 });
        } else {
          return new Response("Failed to update", { status: 500 });
        }
      }

      if (request.method === "DELETE") {
        const id = url.searchParams.get("id");
        if (!id) {
          return new Response("ID parameter is required", { status: 400 });
        }
        const numericId = Number(id);
        if (!Number.isFinite(numericId)) {
          return new Response("Invalid id", { status: 400 });
        }

        const result = await db
          .delete(schedules)
          .where(eq(schedules.id, numericId));

        if (result.success) {
          return new Response("Deleted", { status: 200 });
        } else {
          return new Response("Failed to delete", { status: 500 });
        }
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return Response.json({
        name: "Cloudflare",
      });
    }
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
