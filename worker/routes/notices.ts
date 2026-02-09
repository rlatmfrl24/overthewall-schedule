import { and, eq, SQL } from "drizzle-orm";
import { getDb } from "../db";
import { notices } from "../../src/db/schema";
import {
  badRequest,
  normalizeIsActive,
  normalizeNoticeType,
  parseNumericId,
} from "../utils/helpers";
import type { NoticePayload, Env } from "../types";

export const handleNotices = async (request: Request, env: Env) => {
  const url = new URL(request.url);
  const db = getDb(env);

  const NOTICE_TYPES = ["notice", "event"] as const;
  type NoticeType = (typeof NOTICE_TYPES)[number];

  if (request.method === "GET") {
    const typeFilter = url.searchParams.get("type");
    const includeInactive = url.searchParams.get("includeInactive") === "1";
    const filters: SQL[] = [];
    if (!includeInactive) {
      filters.push(eq(notices.is_active, true));
    }
    if (typeFilter) {
      if (!NOTICE_TYPES.includes(typeFilter as NoticeType)) {
        return badRequest("Invalid type filter");
      }
      filters.push(eq(notices.type, typeFilter));
    }

    const baseStatement = db.select().from(notices);
    const filteredStatement =
      filters.length > 0 ? baseStatement.where(and(...filters)) : baseStatement;

    const data = await filteredStatement.orderBy(notices.id);
    return Response.json(data);
  }

  if (request.method === "POST") {
    const body = (await request.json()) as NoticePayload;
    const {
      content,
      url: noticeUrl,
      type,
      is_active,
      started_at,
      ended_at,
    } = body;
    if (!content?.trim()) {
      return badRequest("Content is required");
    }

    const result = await db.insert(notices).values({
      content: content.trim(),
      url: noticeUrl?.trim() || null,
      type: normalizeNoticeType(type),
      is_active: normalizeIsActive(is_active),
      started_at: started_at?.trim() || null,
      ended_at: ended_at?.trim() || null,
    });

    if (result.success) {
      return new Response("Created", { status: 201 });
    }
    return new Response("Failed to create", { status: 500 });
  }

  if (request.method === "PUT") {
    const body = (await request.json()) as NoticePayload;
    const id = body.id;
    if (!id) {
      return badRequest("ID is required for update");
    }
    const numericId = parseNumericId(id);
    if (numericId === null) return badRequest("Invalid id");

    if (!body.content?.trim()) {
      return badRequest("Content is required");
    }

    const result = await db
      .update(notices)
      .set({
        content: body.content.trim(),
        url: body.url?.trim() || null,
        type: normalizeNoticeType(body.type),
        is_active: normalizeIsActive(body.is_active),
        started_at: body.started_at?.trim() || null,
        ended_at: body.ended_at?.trim() || null,
      })
      .where(eq(notices.id, numericId));

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

    const result = await db.delete(notices).where(eq(notices.id, numericId));

    if (result.success) {
      return new Response("Deleted", { status: 200 });
    }
    return new Response("Failed to delete", { status: 500 });
  }

  return new Response(null, { status: 405 });
};
