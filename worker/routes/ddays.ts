import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { ddays } from "../../src/db/schema";
import {
  badRequest,
  normalizeDDayType,
  parseNumericId,
} from "../utils/helpers";
import type { DDayPayload, Env } from "../types";

export const handleDDays = async (request: Request, env: Env) => {
  const url = new URL(request.url);
  const db = getDb(env);

  if (request.method === "GET") {
    const data = await db.select().from(ddays).orderBy(ddays.date);
    return Response.json(data);
  }

  if (request.method === "POST") {
    const body = (await request.json()) as DDayPayload;
    if (!body.title?.trim() || !body.date?.trim()) {
      return badRequest("title and date are required");
    }
    const type = normalizeDDayType(body.type);

    const result = await db.insert(ddays).values({
      title: body.title.trim(),
      date: body.date.trim(),
      description: body.description?.trim() || null,
      color: body.color?.trim() || null,
      type,
    });

    if (result.success) {
      return new Response("Created", { status: 201 });
    }
    return new Response("Failed to create", { status: 500 });
  }

  if (request.method === "PUT") {
    const body = (await request.json()) as DDayPayload;
    if (!body.id) {
      return badRequest("ID is required");
    }

    const numericId = parseNumericId(body.id);
    if (numericId === null) return badRequest("Invalid id");

    if (!body.title?.trim() || !body.date?.trim()) {
      return badRequest("title and date are required");
    }
    const type = normalizeDDayType(body.type);

    const result = await db
      .update(ddays)
      .set({
        title: body.title.trim(),
        date: body.date.trim(),
        description: body.description?.trim() || null,
        color: body.color?.trim() || null,
        type,
      })
      .where(eq(ddays.id, numericId));

    if (result.success) {
      return new Response("Updated", { status: 200 });
    }
    return new Response("Failed to update", { status: 500 });
  }

  if (request.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) {
      return badRequest("ID parameter is required");
    }
    const numericId = parseNumericId(id);
    if (numericId === null) return badRequest("Invalid id");

    const result = await db.delete(ddays).where(eq(ddays.id, numericId));

    if (result.success) {
      return new Response("Deleted", { status: 200 });
    }
    return new Response("Failed to delete", { status: 500 });
  }

  return new Response(null, { status: 405 });
};
