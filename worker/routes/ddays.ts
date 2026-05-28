import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { ddays } from "../../src/db/schema";
import { requireAdminUser } from "../auth";
import {
  badRequest,
  json,
  normalizeDDayType,
  parseNumericId,
} from "../utils/helpers";
import type { DbInstance } from "../db";
import type { DDayPayload, Env } from "../types";

const DDAYS_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

const getErrorText = (error: unknown): string => {
  if (error instanceof Error) {
    const cause =
      "cause" in error && error.cause instanceof Error
        ? ` ${error.cause.message}`
        : "";
    return `${error.message}${cause}`;
  }
  return String(error);
};

const isMissingDDayTypeColumnError = (error: unknown) => {
  const message = getErrorText(error);
  return (
    message.includes("type") &&
    (message.includes("no such column") ||
      message.includes("no column named"))
  );
};

const warnDDayTypeFallback = () => {
  console.warn(
    "[ddays] ddays.type column is missing; using legacy D-Day query. Run D1 migrations to persist D-Day types.",
  );
};

const legacyDDayFields = {
  id: ddays.id,
  title: ddays.title,
  date: ddays.date,
  description: ddays.description,
  color: ddays.color,
  type: sql<string>`'event'`.as("type"),
  created_at: ddays.created_at,
};

const selectDDays = async (db: DbInstance) => {
  try {
    return await db.select().from(ddays).orderBy(ddays.date);
  } catch (error) {
    if (!isMissingDDayTypeColumnError(error)) {
      throw error;
    }
    warnDDayTypeFallback();
    return db.select(legacyDDayFields).from(ddays).orderBy(ddays.date);
  }
};

const insertDDay = async (
  db: DbInstance,
  values: typeof ddays.$inferInsert,
) => {
  try {
    return await db.insert(ddays).values(values);
  } catch (error) {
    if (!isMissingDDayTypeColumnError(error)) {
      throw error;
    }
    warnDDayTypeFallback();
    const legacyValues = { ...values };
    delete legacyValues.type;
    return db.insert(ddays).values(legacyValues);
  }
};

const updateDDay = async (
  db: DbInstance,
  id: number,
  values: Partial<typeof ddays.$inferInsert>,
) => {
  try {
    return await db.update(ddays).set(values).where(eq(ddays.id, id));
  } catch (error) {
    if (!isMissingDDayTypeColumnError(error)) {
      throw error;
    }
    warnDDayTypeFallback();
    const legacyValues = { ...values };
    delete legacyValues.type;
    return db.update(ddays).set(legacyValues).where(eq(ddays.id, id));
  }
};

export const handleDDays = async (request: Request, env: Env) => {
  const url = new URL(request.url);
  if (
    request.method === "POST" ||
    request.method === "PUT" ||
    request.method === "DELETE"
  ) {
    const admin = await requireAdminUser(request, env);
    if (!admin.ok) return admin.response;
  }

  const db = getDb(env);

  if (request.method === "GET") {
    const noCache = url.searchParams.get("noCache") === "1";
    const data = await selectDDays(db);
    return json(data, 200, {
      headers: {
        "Cache-Control": noCache ? "no-store" : DDAYS_CACHE_CONTROL,
      },
    });
  }

  if (request.method === "POST") {
    const body = (await request.json()) as DDayPayload;
    if (!body.title?.trim() || !body.date?.trim()) {
      return badRequest("title and date are required");
    }
    const type = normalizeDDayType(body.type);

    const result = await insertDDay(db, {
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

    const result = await updateDDay(db, numericId, {
      title: body.title.trim(),
      date: body.date.trim(),
      description: body.description?.trim() || null,
      color: body.color?.trim() || null,
      type,
    });

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
