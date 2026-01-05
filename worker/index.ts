import { SQL, and, between, eq } from "drizzle-orm";
import { getDb } from "./db";
import {
  members,
  schedules,
  notices,
  type NewSchedule,
  ddays,
} from "../src/db/schema";

type CachedLiveStatus = {
  fetchedAt: number;
  content: {
    status: "OPEN" | "CLOSE";
    liveTitle: string;
    concurrentUserCount: number;
    liveImageUrl: string;
    defaultThumbnailImageUrl: string;
    channelId: string;
    channelName: string;
    channelImageUrl: string;
  } | null;
};

const LIVE_STATUS_CACHE = new Map<string, CachedLiveStatus>();
const LIVE_STATUS_TTL_MS = 60_000;

const fetchChzzkLiveStatus = async (channelId: string) => {
  const cached = LIVE_STATUS_CACHE.get(channelId);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < LIVE_STATUS_TTL_MS) {
    return cached.content;
  }

  const url = `https://api.chzzk.naver.com/polling/v2/channels/${channelId}/live-status`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error("Failed to fetch chzzk live status", channelId, res.status);
    return null;
  }

  const data = (await res.json()) as {
    code: number;
    content: CachedLiveStatus["content"];
  };

  const content = data?.content ?? null;
  LIVE_STATUS_CACHE.set(channelId, {
    fetchedAt: now,
    content,
  });
  return content;
};

const NOTICE_TYPES = ["notice", "event"] as const;
type NoticeType = (typeof NOTICE_TYPES)[number];

const normalizeNoticeType = (value?: string): NoticeType => {
  if (value && NOTICE_TYPES.includes(value as NoticeType)) {
    return value as NoticeType;
  }
  return "notice";
};

const normalizeIsActive = (value?: string | number | boolean): "1" | "0" => {
  if (value === "0" || value === 0 || value === false || value === "false") {
    return "0";
  }
  return "1";
};

type NoticePayload = {
  id?: number | string;
  content?: string;
  url?: string;
  type?: string;
  is_active?: string | number | boolean;
  started_at?: string;
  ended_at?: string;
};

type SchedulePayload = Pick<
  NewSchedule,
  "member_uid" | "date" | "start_time" | "title" | "status"
>;
type UpdateSchedulePayload = SchedulePayload & { id: number | string };

type DDayPayload = {
  id?: number | string;
  title?: string;
  date?: string;
  description?: string;
  color?: string;
  type?: string;
};

const DDAY_TYPES = ["debut", "birthday", "event"] as const;
type DDayType = (typeof DDAY_TYPES)[number];

const normalizeDDayType = (value?: string): DDayType => {
  if (value && DDAY_TYPES.includes(value as DDayType)) {
    return value as DDayType;
  }
  return "event";
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const db = getDb(env);

    if (url.pathname.startsWith("/api/live-status")) {
      if (request.method !== "GET") {
        return new Response("Method not allowed", { status: 405 });
      }

      const channelIdsParam = url.searchParams.get("channelIds");
      if (!channelIdsParam) {
        return new Response("channelIds query required", { status: 400 });
      }

      const channelIds = channelIdsParam
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);

      if (channelIds.length === 0) {
        return new Response("No valid channelIds", { status: 400 });
      }

      const items = await Promise.all(
        channelIds.map(async (channelId) => ({
          channelId,
          content: await fetchChzzkLiveStatus(channelId),
        }))
      );

      return Response.json({
        updatedAt: new Date().toISOString(),
        items,
      });
    }

    if (url.pathname.startsWith("/api/members")) {
      const pathParts = url.pathname.split("/");
      const code = pathParts[3]; // /api/members/:code

      if (code) {
        const data = await db
          .select()
          .from(members)
          .where(eq(members.code, code))
          .limit(1);

        if (data.length === 0) {
          return new Response("Member not found", { status: 404 });
        }

        return Response.json(data[0]);
      }

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

    if (url.pathname.startsWith("/api/notices")) {
      if (request.method === "GET") {
        const typeFilter = url.searchParams.get("type");
        const includeInactive = url.searchParams.get("includeInactive") === "1";
        const filters: SQL[] = [];
        if (!includeInactive) {
          filters.push(eq(notices.is_active, "1"));
        }
        if (typeFilter) {
          if (!NOTICE_TYPES.includes(typeFilter as NoticeType)) {
            return new Response("Invalid type filter", { status: 400 });
          }
          filters.push(eq(notices.type, typeFilter));
        }

        const baseStatement = db.select().from(notices);
        const filteredStatement =
          filters.length > 0
            ? baseStatement.where(and(...filters))
            : baseStatement;

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
          return new Response("Content is required", { status: 400 });
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
          return new Response("ID is required for update", { status: 400 });
        }
        const numericId = Number(id);
        if (!Number.isFinite(numericId)) {
          return new Response("Invalid id", { status: 400 });
        }

        if (!body.content?.trim()) {
          return new Response("Content is required", { status: 400 });
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
          return new Response("ID parameter is required", { status: 400 });
        }
        const numericId = Number(id);
        if (!Number.isFinite(numericId)) {
          return new Response("Invalid id", { status: 400 });
        }

        const result = await db
          .delete(notices)
          .where(eq(notices.id, numericId));

        if (result.success) {
          return new Response("Deleted", { status: 200 });
        }
        return new Response("Failed to delete", { status: 500 });
      }
    }

    if (url.pathname.startsWith("/api/ddays")) {
      if (request.method === "GET") {
        const data = await db.select().from(ddays).orderBy(ddays.date);
        return Response.json(data);
      }

      if (request.method === "POST") {
        const body = (await request.json()) as DDayPayload;
        if (!body.title?.trim() || !body.date?.trim()) {
          return new Response("title and date are required", { status: 400 });
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
          return new Response("ID is required", { status: 400 });
        }

        const numericId = Number(body.id);
        if (!Number.isFinite(numericId)) {
          return new Response("Invalid id", { status: 400 });
        }

        if (!body.title?.trim() || !body.date?.trim()) {
          return new Response("title and date are required", { status: 400 });
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
          return new Response("ID parameter is required", { status: 400 });
        }
        const numericId = Number(id);
        if (!Number.isFinite(numericId)) {
          return new Response("Invalid id", { status: 400 });
        }

        const result = await db.delete(ddays).where(eq(ddays.id, numericId));

        if (result.success) {
          return new Response("Deleted", { status: 200 });
        }
        return new Response("Failed to delete", { status: 500 });
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
