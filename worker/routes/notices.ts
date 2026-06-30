import { and, eq, sql, SQL } from "drizzle-orm";
import { getDb } from "../db";
import { members, notices } from "../../src/db/schema";
import { requireAdminUser } from "../auth";
import {
  badRequest,
  json,
  normalizeIsActive,
  normalizeNoticeType,
  parseNumericId,
} from "../utils/helpers";
import type { NoticePayload, Env } from "../types";
import {
  buildNoticeThumbnailAssetUrl,
  getNoticeThumbnailExtension,
  getOwnedNoticeThumbnailKey,
  NOTICE_THUMBNAIL_MAX_BYTES,
} from "../../src/lib/notice-thumbnails";

const NOTICES_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=600";
const NOTICE_THUMBNAIL_CACHE_CONTROL = "public, max-age=31536000, immutable";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const NOTICE_PUBLISHER_TYPES = ["otw", "member"] as const;

type NoticePublisherType = (typeof NOTICE_PUBLISHER_TYPES)[number];

const getTodayKstDateString = () =>
  new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);

const deactivateExpiredNotices = async (
  db: ReturnType<typeof getDb>,
  today: string,
) => {
  await db
    .update(notices)
    .set({ is_active: false })
    .where(
      and(
        eq(notices.is_active, true),
        sql`${notices.ended_at} IS NOT NULL`,
        sql`${notices.ended_at} < ${today}`,
      ),
    );
};

const normalizeNoticePublisherType = (
  value?: string | null,
): NoticePublisherType => {
  if (value && NOTICE_PUBLISHER_TYPES.includes(value as NoticePublisherType)) {
    return value as NoticePublisherType;
  }
  return "otw";
};

const parsePublisherMemberUid = (value?: number | string | null) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const isValidNoticeImageUrl = (value: string) => {
  if (value.startsWith("/")) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const normalizeNoticeImageUrl = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return { ok: true as const, value: null };
  }
  if (!isValidNoticeImageUrl(trimmed)) {
    return {
      ok: false as const,
      response: badRequest("Invalid thumbnail url"),
    };
  }
  return { ok: true as const, value: trimmed };
};

const hasNoticeThumbnailReference = async (
  db: ReturnType<typeof getDb>,
  key: string,
) => {
  const rows = await db
    .select({ thumbnail_url: notices.thumbnail_url })
    .from(notices)
    .where(sql`${notices.thumbnail_url} IS NOT NULL`);

  return rows.some(
    (row) => getOwnedNoticeThumbnailKey(row.thumbnail_url) === key,
  );
};

const deleteNoticeThumbnailIfUnused = async (
  env: Env,
  db: ReturnType<typeof getDb>,
  thumbnailUrl?: string | null,
  replacementUrl?: string | null,
) => {
  const key = getOwnedNoticeThumbnailKey(thumbnailUrl);
  if (!key || key === getOwnedNoticeThumbnailKey(replacementUrl)) return;

  if (await hasNoticeThumbnailReference(db, key)) return;

  if (!env.ASSET_BUCKET) {
    console.warn("[notices] R2 asset bucket is not configured for thumbnail cleanup");
    return;
  }

  try {
    await env.ASSET_BUCKET.delete(key);
  } catch (error) {
    console.warn("[notices] Failed to delete notice thumbnail", { key, error });
  }
};

const deleteUploadedNoticeThumbnail = async (
  request: Request,
  env: Env,
  db: ReturnType<typeof getDb>,
) => {
  let body: { thumbnail_url?: unknown };
  try {
    body = (await request.json()) as { thumbnail_url?: unknown };
  } catch {
    return badRequest("Invalid thumbnail cleanup payload");
  }

  if (typeof body.thumbnail_url !== "string") {
    return badRequest("Thumbnail url is required");
  }

  const key = getOwnedNoticeThumbnailKey(body.thumbnail_url);
  if (!key) {
    return badRequest("Invalid thumbnail url");
  }

  if (await hasNoticeThumbnailReference(db, key)) {
    return json(
      { deleted: false, reason: "referenced" },
      200,
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!env.ASSET_BUCKET) {
    return new Response("R2 asset bucket is not configured", { status: 503 });
  }

  try {
    await env.ASSET_BUCKET.delete(key);
  } catch (error) {
    console.warn("[notices] Failed to delete unused notice thumbnail", {
      key,
      error,
    });
    return new Response("Failed to delete thumbnail", { status: 500 });
  }

  return json(
    { deleted: true },
    200,
    { headers: { "Cache-Control": "no-store" } },
  );
};

const getNoticeThumbnailUploadFile = async (request: Request) => {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return {
      ok: false as const,
      response: badRequest("Thumbnail upload requires multipart/form-data"),
    };
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return {
      ok: false as const,
      response: badRequest("Thumbnail file is required"),
    };
  }

  if (file.size <= 0) {
    return {
      ok: false as const,
      response: badRequest("Thumbnail file is empty"),
    };
  }

  if (file.size > NOTICE_THUMBNAIL_MAX_BYTES) {
    return {
      ok: false as const,
      response: badRequest("Thumbnail file is too large"),
    };
  }

  const extension = getNoticeThumbnailExtension(file.type);
  if (!extension) {
    return {
      ok: false as const,
      response: badRequest("Unsupported thumbnail image type"),
    };
  }

  return {
    ok: true as const,
    file,
    extension,
    contentType: file.type,
  };
};

const uploadNoticeThumbnail = async (request: Request, env: Env) => {
  if (!env.ASSET_BUCKET) {
    return new Response("R2 asset bucket is not configured", { status: 503 });
  }

  const upload = await getNoticeThumbnailUploadFile(request);
  if (!upload.ok) return upload.response;

  const key = `notices/thumbnails/${Date.now()}-${crypto.randomUUID()}.${
    upload.extension
  }`;
  await env.ASSET_BUCKET.put(key, upload.file, {
    httpMetadata: {
      contentType: upload.contentType,
      cacheControl: NOTICE_THUMBNAIL_CACHE_CONTROL,
    },
  });

  return json(
    {
      thumbnail_url: buildNoticeThumbnailAssetUrl(key),
    },
    201,
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
};

const normalizeNoticePublisher = async (
  db: ReturnType<typeof getDb>,
  body: NoticePayload,
) => {
  const publisherType = normalizeNoticePublisherType(body.publisher_type);
  if (publisherType === "otw") {
    return {
      ok: true as const,
      value: { publisher_type: "otw" as const, publisher_member_uid: null },
    };
  }

  const memberUid = parsePublisherMemberUid(body.publisher_member_uid);
  if (memberUid === null) {
    return {
      ok: false as const,
      response: badRequest("Publisher member is required"),
    };
  }

  const memberRows = await db
    .select({ uid: members.uid })
    .from(members)
    .where(
      and(
        eq(members.uid, memberUid),
        sql`(${members.is_deprecated} IS NULL OR ${members.is_deprecated} = 0)`,
      ),
    )
    .limit(1);

  if (!memberRows[0]) {
    return {
      ok: false as const,
      response: badRequest("Publisher member not found"),
    };
  }

  return {
    ok: true as const,
    value: {
      publisher_type: "member" as const,
      publisher_member_uid: memberUid,
    },
  };
};

export const handleNotices = async (request: Request, env: Env) => {
  const url = new URL(request.url);
  const includeInactive = url.searchParams.get("includeInactive") === "1";
  const requiresAdmin =
    request.method === "POST" ||
    request.method === "PUT" ||
    request.method === "DELETE" ||
    (request.method === "GET" && includeInactive);

  if (requiresAdmin) {
    const admin = await requireAdminUser(request, env);
    if (!admin.ok) return admin.response;
  }

  if (url.pathname === "/api/notices/thumbnail") {
    if (request.method === "POST") {
      return uploadNoticeThumbnail(request, env);
    }
    if (request.method === "DELETE") {
      return deleteUploadedNoticeThumbnail(request, env, getDb(env));
    }
    return new Response(null, {
      status: 405,
      headers: { Allow: "POST, DELETE" },
    });
  }

  const db = getDb(env);

  const NOTICE_TYPES = ["notice", "event"] as const;
  type NoticeType = (typeof NOTICE_TYPES)[number];

  if (request.method === "GET") {
    const today = getTodayKstDateString();
    await deactivateExpiredNotices(db, today);

    const typeFilter = url.searchParams.get("type");
    const filters: SQL[] = [];
    if (!includeInactive) {
      filters.push(eq(notices.is_active, true));
      filters.push(
        sql`(${notices.started_at} IS NULL OR ${notices.started_at} <= ${today})`,
      );
      filters.push(
        sql`(${notices.ended_at} IS NULL OR ${notices.ended_at} >= ${today})`,
      );
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
    return json(data, 200, {
      headers: {
        "Cache-Control": includeInactive ? "no-store" : NOTICES_CACHE_CONTROL,
      },
    });
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
    const publisher = await normalizeNoticePublisher(db, body);
    if (!publisher.ok) return publisher.response;
    const thumbnailUrl = normalizeNoticeImageUrl(body.thumbnail_url);
    if (!thumbnailUrl.ok) return thumbnailUrl.response;

    const result = await db.insert(notices).values({
      content: content.trim(),
      url: noticeUrl?.trim() || null,
      thumbnail_url: thumbnailUrl.value,
      type: normalizeNoticeType(type),
      publisher_type: publisher.value.publisher_type,
      publisher_member_uid: publisher.value.publisher_member_uid,
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
    const publisher = await normalizeNoticePublisher(db, body);
    if (!publisher.ok) return publisher.response;
    const thumbnailUrl = normalizeNoticeImageUrl(body.thumbnail_url);
    if (!thumbnailUrl.ok) return thumbnailUrl.response;
    const previousRows = await db
      .select({ thumbnail_url: notices.thumbnail_url })
      .from(notices)
      .where(eq(notices.id, numericId))
      .limit(1);

    const result = await db
      .update(notices)
      .set({
        content: body.content.trim(),
        url: body.url?.trim() || null,
        thumbnail_url: thumbnailUrl.value,
        type: normalizeNoticeType(body.type),
        publisher_type: publisher.value.publisher_type,
        publisher_member_uid: publisher.value.publisher_member_uid,
        is_active: normalizeIsActive(body.is_active),
        started_at: body.started_at?.trim() || null,
        ended_at: body.ended_at?.trim() || null,
      })
      .where(eq(notices.id, numericId));

    if (result.success) {
      await deleteNoticeThumbnailIfUnused(
        env,
        db,
        previousRows[0]?.thumbnail_url,
        thumbnailUrl.value,
      );
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
    const previousRows = await db
      .select({ thumbnail_url: notices.thumbnail_url })
      .from(notices)
      .where(eq(notices.id, numericId))
      .limit(1);

    const result = await db.delete(notices).where(eq(notices.id, numericId));

    if (result.success) {
      await deleteNoticeThumbnailIfUnused(
        env,
        db,
        previousRows[0]?.thumbnail_url,
      );
      return new Response("Deleted", { status: 200 });
    }
    return new Response("Failed to delete", { status: 500 });
  }

  return new Response(null, { status: 405 });
};
