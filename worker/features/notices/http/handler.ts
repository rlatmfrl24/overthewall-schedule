import { requireAdminUser } from "../../../platform/auth";
import {
  badRequest,
  json,
  normalizeIsActive,
  normalizeNoticeType,
  parseNumericId,
} from "../../../platform/http-helpers";
import { isJsonObject, parseJsonRequest } from "../../../platform/http/json";
import type { NoticePayload, Env } from "../../../platform/types";
import {
  MAX_NOTICE_IMAGES,
  MAX_NOTICE_LINKS,
  type NoticeLinkDto,
} from "../../../../contracts/notices";
import {
  getNoticeThumbnailExtension,
  getOwnedNoticeThumbnailKey,
  NOTICE_THUMBNAIL_MAX_BYTES,
} from "../../assets";
import { NoticeUseCases } from "../application/manage-notices";
import type { NoticeWriteInput } from "../application/ports/notice-gateway";

const NOTICES_CACHE_CONTROL = "no-store";
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const NOTICE_TYPES = ["notice", "event"] as const;

type NoticeType = (typeof NOTICE_TYPES)[number];

const getTodayKstDateString = () =>
  new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);

const parsePublisherMemberUid = (value?: number | string | null) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeHttpUrl = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? trimmed
      : null;
  } catch {
    return null;
  }
};

const normalizeNoticeImageUrl = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) return { ok: true as const, value: null };
  if (trimmed.startsWith("/")) {
    return { ok: true as const, value: trimmed };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return { ok: true as const, value: trimmed };
    }
  } catch {
    // The common bad-request response below owns invalid URL handling.
  }
  return {
    ok: false as const,
    response: badRequest("Invalid thumbnail url"),
  };
};

const parseNoticeLinks = (
  value: unknown,
  legacyUrl: unknown,
): { ok: true; value: NoticeLinkDto[] } | { ok: false; response: Response } => {
  const rawLinks =
    value === undefined
      ? typeof legacyUrl === "string" && legacyUrl.trim()
        ? [{ label: "자세히 보기", url: legacyUrl }]
        : []
      : value;
  if (!Array.isArray(rawLinks)) {
    return { ok: false, response: badRequest("Links must be an array") };
  }
  if (rawLinks.length > MAX_NOTICE_LINKS) {
    return { ok: false, response: badRequest("Too many notice links") };
  }

  const links: NoticeLinkDto[] = [];
  const urls = new Set<string>();
  for (const rawLink of rawLinks) {
    if (!isJsonObject(rawLink)) {
      return { ok: false, response: badRequest("Invalid notice link") };
    }
    const label =
      typeof rawLink.label === "string" ? rawLink.label.trim() : "";
    const url = normalizeHttpUrl(rawLink.url);
    if (!label || !url) {
      return { ok: false, response: badRequest("Invalid notice link") };
    }
    if (urls.has(url)) {
      return { ok: false, response: badRequest("Duplicate notice link") };
    }
    urls.add(url);
    links.push({ label, url });
  }
  return { ok: true, value: links };
};

const parseNoticeImageUrls = (
  value: unknown,
  legacyUrl: unknown,
): { ok: true; value: string[] } | { ok: false; response: Response } => {
  const rawUrls =
    value === undefined
      ? typeof legacyUrl === "string" && legacyUrl.trim()
        ? [legacyUrl]
        : []
      : value;
  if (!Array.isArray(rawUrls)) {
    return { ok: false, response: badRequest("Image urls must be an array") };
  }
  if (rawUrls.length > MAX_NOTICE_IMAGES) {
    return { ok: false, response: badRequest("Too many notice images") };
  }

  const imageUrls: string[] = [];
  const uniqueUrls = new Set<string>();
  for (const rawUrl of rawUrls) {
    if (typeof rawUrl !== "string") {
      return { ok: false, response: badRequest("Invalid thumbnail url") };
    }
    const normalized = normalizeNoticeImageUrl(rawUrl);
    if (!normalized.ok || !normalized.value) {
      return normalized.ok
        ? { ok: false, response: badRequest("Invalid thumbnail url") }
        : normalized;
    }
    if (uniqueUrls.has(normalized.value)) {
      return { ok: false, response: badRequest("Duplicate notice image") };
    }
    uniqueUrls.add(normalized.value);
    imageUrls.push(normalized.value);
  }
  return { ok: true, value: imageUrls };
};

const parseRelatedMemberUids = (
  value: unknown,
  legacyPublisherType: unknown,
  legacyPublisherMemberUid: unknown,
): { ok: true; value: number[] } | { ok: false; response: Response } => {
  const legacyUid = parsePublisherMemberUid(
    legacyPublisherMemberUid as number | string | null,
  );
  const rawUids =
    value === undefined
      ? legacyPublisherType === "member" && legacyUid
        ? [legacyUid]
        : []
      : value;
  if (!Array.isArray(rawUids)) {
    return {
      ok: false,
      response: badRequest("Related member uids must be an array"),
    };
  }
  const uids: number[] = [];
  const uniqueUids = new Set<number>();
  for (const value of rawUids) {
    if (!Number.isInteger(value) || Number(value) <= 0) {
      return { ok: false, response: badRequest("Invalid related member uid") };
    }
    const uid = Number(value);
    if (uniqueUids.has(uid)) {
      return {
        ok: false,
        response: badRequest("Duplicate related member uid"),
      };
    }
    uniqueUids.add(uid);
    uids.push(uid);
  }
  return { ok: true, value: uids };
};

const parseWriteInput = (
  body: NoticePayload,
): { ok: true; value: NoticeWriteInput } | { ok: false; response: Response } => {
  if (!body.content?.trim()) {
    return { ok: false, response: badRequest("Content is required") };
  }
  const links = parseNoticeLinks(body.links, body.url);
  if (!links.ok) return links;
  const imageUrls = parseNoticeImageUrls(
    body.image_urls,
    body.thumbnail_url,
  );
  if (!imageUrls.ok) return imageUrls;
  const relatedMemberUids = parseRelatedMemberUids(
    body.related_member_uids,
    body.publisher_type,
    body.publisher_member_uid,
  );
  if (!relatedMemberUids.ok) return relatedMemberUids;

  return {
    ok: true,
    value: {
      content: body.content.trim(),
      links: links.value,
      imageUrls: imageUrls.value,
      relatedMemberUids: relatedMemberUids.value,
      type: normalizeNoticeType(body.type),
      isActive: normalizeIsActive(body.is_active),
      startedAt: body.started_at?.trim() || null,
      endedAt: body.ended_at?.trim() || null,
    },
  };
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

export type NoticeUseCasesResolver = (env: Env) => NoticeUseCases;

export const createHandleNotices =
  (resolveUseCases: NoticeUseCasesResolver) =>
  async (request: Request, env: Env): Promise<Response> => {
    const url = new URL(request.url);
    const includeInactive = url.searchParams.get("includeInactive") === "1";
    const isThumbnailAdminPath =
      url.pathname === "/api/notices/thumbnail" ||
      url.pathname.startsWith("/api/notices/thumbnails/");
    const requiresAdmin =
      isThumbnailAdminPath ||
      request.method === "POST" ||
      request.method === "PUT" ||
      request.method === "DELETE" ||
      (request.method === "GET" && includeInactive);

    if (requiresAdmin) {
      const admin = await requireAdminUser(request, env);
      if (!admin.ok) return admin.response;
    }

    const useCases = resolveUseCases(env);
    if (url.pathname === "/api/notices/thumbnail") {
      if (request.method === "POST") {
        if (!useCases.isThumbnailStorageConfigured()) {
          return new Response("R2 asset bucket is not configured", {
            status: 503,
          });
        }
        const upload = await getNoticeThumbnailUploadFile(request);
        if (!upload.ok) return upload.response;
        const thumbnailUrl = await useCases.uploadThumbnail({
          file: upload.file,
          extension: upload.extension,
          contentType: upload.contentType,
        });
        if (!thumbnailUrl) {
          return new Response("R2 asset bucket is not configured", {
            status: 503,
          });
        }
        return json({ thumbnail_url: thumbnailUrl }, 201, {
          headers: NO_STORE_HEADERS,
        });
      }
      if (request.method === "DELETE") {
        const parsedBody = await parseJsonRequest<{
          thumbnail_url?: unknown;
        }>(request, "Invalid thumbnail cleanup payload");
        if (!parsedBody.ok) return parsedBody.response;
        if (!isJsonObject(parsedBody.value)) {
          return badRequest("Invalid thumbnail cleanup payload");
        }
        if (typeof parsedBody.value.thumbnail_url !== "string") {
          return badRequest("Thumbnail url is required");
        }
        const key = getOwnedNoticeThumbnailKey(
          parsedBody.value.thumbnail_url,
        );
        if (!key) return badRequest("Invalid thumbnail url");

        const result = await useCases.deleteThumbnail(key);
        if (result.status === "referenced") {
          return json({ deleted: false, reason: "referenced" }, 200, {
            headers: NO_STORE_HEADERS,
          });
        }
        if (result.status === "unavailable") {
          return new Response("R2 asset bucket is not configured", {
            status: 503,
          });
        }
        if (result.status === "failed") {
          return new Response("Failed to delete thumbnail", { status: 500 });
        }
        return json({ deleted: true }, 200, {
          headers: NO_STORE_HEADERS,
        });
      }
      return new Response(null, {
        status: 405,
        headers: { Allow: "POST, DELETE" },
      });
    }

    if (url.pathname === "/api/notices/thumbnails/status") {
      if (request.method !== "GET") {
        return new Response(null, {
          status: 405,
          headers: { Allow: "GET" },
        });
      }
      return json(await useCases.getThumbnailStatus(), 200, {
        headers: NO_STORE_HEADERS,
      });
    }

    if (url.pathname === "/api/notices/thumbnails/cleanup") {
      if (request.method !== "POST") {
        return new Response(null, {
          status: 405,
          headers: { Allow: "POST" },
        });
      }
      const result = await useCases.cleanupThumbnails();
      if (result.status === "unavailable") {
        return new Response("R2 asset bucket is not configured", {
          status: 503,
        });
      }
      return json(result.result, result.status === "partial" ? 207 : 200, {
        headers: NO_STORE_HEADERS,
      });
    }

    if (url.pathname === "/api/notices/featured") {
      if (request.method !== "PUT") {
        return new Response(null, {
          status: 405,
          headers: { Allow: "PUT" },
        });
      }
      const parsedBody = await parseJsonRequest<{
        id?: string | number | null;
      }>(request, "Invalid featured notice payload");
      if (!parsedBody.ok) return parsedBody.response;
      if (!isJsonObject(parsedBody.value)) {
        return badRequest("Invalid featured notice payload");
      }
      const id = parseNumericId(parsedBody.value.id);
      if (id === null) return badRequest("Invalid id");
      if (!(await useCases.feature(id))) {
        return new Response("Notice not found", { status: 404 });
      }
      return json({ success: true, id }, 200, {
        headers: NO_STORE_HEADERS,
      });
    }

    if (request.method === "GET") {
      const typeFilter = url.searchParams.get("type");
      if (
        typeFilter &&
        !NOTICE_TYPES.includes(typeFilter as NoticeType)
      ) {
        return badRequest("Invalid type filter");
      }
      const data = await useCases.list(
        includeInactive,
        (typeFilter as NoticeType | null) ?? null,
        getTodayKstDateString(),
      );
      return json(data, 200, {
        headers: { "Cache-Control": NOTICES_CACHE_CONTROL },
      });
    }

    if (request.method === "POST" || request.method === "PUT") {
      const parsedBody = await parseJsonRequest<NoticePayload>(request);
      if (!parsedBody.ok) return parsedBody.response;
      if (!isJsonObject(parsedBody.value)) {
        return badRequest("Invalid JSON body");
      }
      const body = parsedBody.value;

      let id: number | null = null;
      if (request.method === "PUT") {
        if (!body.id) return badRequest("ID is required for update");
        id = parseNumericId(body.id);
        if (id === null) return badRequest("Invalid id");
      }
      const input = parseWriteInput(body);
      if (!input.ok) return input.response;

      const result =
        request.method === "POST"
          ? await useCases.create(input.value)
          : await useCases.update(id!, input.value);
      if (result.status === "related_member_not_found") {
        return badRequest("Related member not found");
      }
      if (result.status === "failed") {
        return new Response(
          request.method === "POST"
            ? "Failed to create"
            : "Failed to update",
          { status: 500 },
        );
      }
      return new Response(request.method === "POST" ? "Created" : "Updated", {
        status: request.method === "POST" ? 201 : 200,
        headers: NO_STORE_HEADERS,
      });
    }

    if (request.method === "DELETE") {
      const id = url.searchParams.get("id");
      if (!id) return badRequest("ID parameter is required");
      const numericId = parseNumericId(id);
      if (numericId === null) return badRequest("Invalid id");
      const result = await useCases.remove(numericId);
      return result.status === "success"
        ? new Response("Deleted", { status: 200, headers: NO_STORE_HEADERS })
        : new Response("Failed to delete", { status: 500 });
    }

    return new Response(null, { status: 405 });
  };
