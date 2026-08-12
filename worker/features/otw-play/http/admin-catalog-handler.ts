import type { OtwPlayAdminErrorCode } from "@contracts/otw-play";
import { requireAdminUser } from "../../../platform/auth";
import { getActorInfo } from "../../../platform/http-helpers";
import type { Env } from "../../../platform/types";
import {
  AdminCatalogService,
  AdminCatalogServiceError,
} from "../application/admin-catalog-service";
import { AdminCatalogRepositoryError } from "../application/ports/admin-catalog-repository";
import { OtwPlayYouTubeMetadataError } from "../application/ports/youtube-metadata";
import {
  parseCatalogEntryPreflight,
  parseCreateCatalogEntry,
  parseCreateChannel,
  parseApproveProposal,
  parseCreateEntity,
  parseCreatePerformance,
  parseCreateSong,
  parseRecheckSource,
  parseRejectProposal,
  parseUpdateChannel,
  parseUpdateEntity,
  parseUpdatePerformance,
  parseUpdateSong,
  parseVersionRequest,
  type AdminInputResult,
} from "./admin-catalog-input";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export type ResolveAdminCatalogService = (env: Env) => AdminCatalogService;

const responseJson = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: NO_STORE_HEADERS });

const requestIdFor = (request: Request) =>
  request.headers.get("CF-Ray")?.trim() || crypto.randomUUID();

const errorResponse = (
  requestId: string,
  status: number,
  code: OtwPlayAdminErrorCode,
  message: string,
  fields?: Record<string, string>,
) =>
  responseJson(
    { error: { code, message, ...(fields ? { fields } : {}), requestId } },
    status,
  );

const readBody = async <T>(
  request: Request,
  parser: (value: unknown) => AdminInputResult<T>,
) => {
  try {
    return parser(await request.json());
  } catch {
    return { ok: false as const, fields: { body: "malformed_json" } };
  }
};

const pathId = (pathname: string, pattern: RegExp) => {
  const matched = pathname.match(pattern)?.[1];
  if (!matched) return null;
  try {
    const decoded = decodeURIComponent(matched);
    return decoded.trim() && !decoded.includes("/") ? decoded : null;
  } catch {
    return null;
  }
};

const adminActor = (
  request: Request,
  user: { id: string; displayName: string | null },
) => {
  const actor = getActorInfo(
    request,
    user as Parameters<typeof getActorInfo>[1],
  );
  return {
    userId: user.id,
    displayName: user.displayName,
    ipAddress: actor.actorIp,
  };
};

export const createAdminCatalogHandler =
  (resolveService: ResolveAdminCatalogService) =>
  async (request: Request, env: Env): Promise<Response> => {
    const requestId = requestIdFor(request);
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/play/admin/")) {
      return new Response(null, { status: 404 });
    }

    const admin = await requireAdminUser(request, env);
    if (!admin.ok) return admin.response;
    const service = resolveService(env);
    const actor = adminActor(request, admin.user);

    try {
      if (
        url.pathname === "/api/play/admin/catalog-entries/preflight" &&
        request.method === "POST"
      ) {
        const parsed = await readBody(request, parseCatalogEntryPreflight);
        if (!parsed.ok)
          return errorResponse(
            requestId,
            400,
            "PLAY_ADMIN_INVALID_REQUEST",
            "Invalid catalog entry preflight",
            parsed.fields,
          );
        return responseJson({ data: await service.preflightCatalogEntry(parsed.value) });
      }

      if (
        url.pathname === "/api/play/admin/catalog-entries" &&
        request.method === "POST"
      ) {
        const parsed = await readBody(request, parseCreateCatalogEntry);
        if (!parsed.ok)
          return errorResponse(
            requestId,
            400,
            "PLAY_ADMIN_INVALID_REQUEST",
            "Invalid catalog entry",
            parsed.fields,
          );
        return responseJson(
          await service.createCatalogEntry(parsed.value, actor),
          201,
        );
      }

      if (
        url.pathname === "/api/play/admin/catalog" &&
        request.method === "GET"
      ) {
        return responseJson({ data: await service.readCatalog() });
      }

      if (
        url.pathname === "/api/play/admin/submissions" &&
        request.method === "GET"
      ) {
        const status = url.searchParams.get("status") ?? undefined;
        if ([...url.searchParams.keys()].some((key) => key !== "status")) {
          return errorResponse(
            requestId,
            400,
            "PLAY_ADMIN_INVALID_REQUEST",
            "Unknown query parameter",
          );
        }
        return responseJson({ data: await service.readProposals(status) });
      }

      if (url.pathname === "/api/play/admin/entities") {
        const parsed =
          request.method === "POST"
            ? await readBody(request, parseCreateEntity)
            : request.method === "PUT"
              ? await readBody(request, parseUpdateEntity)
              : null;
        if (!parsed)
          return new Response("Method Not Allowed", {
            status: 405,
            headers: { Allow: "POST, PUT" },
          });
        if (!parsed.ok)
          return errorResponse(
            requestId,
            400,
            "PLAY_ADMIN_INVALID_REQUEST",
            "Invalid entity",
            parsed.fields,
          );
        const result =
          request.method === "POST"
            ? await service.createEntity(parsed.value, actor)
            : await service.updateEntity(
                parsed.value as Parameters<typeof service.updateEntity>[0],
                actor,
              );
        return responseJson(result, request.method === "POST" ? 201 : 200);
      }

      if (url.pathname === "/api/play/admin/songs") {
        const parsed =
          request.method === "POST"
            ? await readBody(request, parseCreateSong)
            : request.method === "PUT"
              ? await readBody(request, parseUpdateSong)
              : null;
        if (!parsed)
          return new Response("Method Not Allowed", {
            status: 405,
            headers: { Allow: "POST, PUT" },
          });
        if (!parsed.ok)
          return errorResponse(
            requestId,
            400,
            "PLAY_ADMIN_INVALID_REQUEST",
            "Invalid song",
            parsed.fields,
          );
        const result =
          request.method === "POST"
            ? await service.createSong(parsed.value, actor)
            : await service.updateSong(
                parsed.value as Parameters<typeof service.updateSong>[0],
                actor,
              );
        return responseJson(result, request.method === "POST" ? 201 : 200);
      }

      if (url.pathname === "/api/play/admin/performances") {
        const parsed =
          request.method === "POST"
            ? await readBody(request, parseCreatePerformance)
            : request.method === "PUT"
              ? await readBody(request, parseUpdatePerformance)
              : null;
        if (!parsed)
          return new Response("Method Not Allowed", {
            status: 405,
            headers: { Allow: "POST, PUT" },
          });
        if (!parsed.ok)
          return errorResponse(
            requestId,
            400,
            "PLAY_ADMIN_INVALID_REQUEST",
            "Invalid performance",
            parsed.fields,
          );
        const result =
          request.method === "POST"
            ? await service.createPerformance(parsed.value, actor)
            : await service.updatePerformance(
                parsed.value as Parameters<typeof service.updatePerformance>[0],
                actor,
              );
        return responseJson(result, request.method === "POST" ? 201 : 200);
      }

      const publishId = pathId(
        url.pathname,
        /^\/api\/play\/admin\/performances\/([^/]+)\/publish$/u,
      );
      const withdrawId = pathId(
        url.pathname,
        /^\/api\/play\/admin\/performances\/([^/]+)\/withdraw$/u,
      );
      if ((publishId || withdrawId) && request.method === "POST") {
        const parsed = await readBody(request, parseVersionRequest);
        if (!parsed.ok)
          return errorResponse(
            requestId,
            400,
            "PLAY_ADMIN_INVALID_REQUEST",
            "Invalid expected version",
            parsed.fields,
          );
        return responseJson(
          await service.transitionPerformance(
            publishId ?? withdrawId!,
            parsed.value,
            publishId ? "published" : "withdrawn",
            actor,
          ),
        );
      }

      if (url.pathname === "/api/play/admin/channels") {
        if (request.method === "POST") {
          const parsed = await readBody(request, parseCreateChannel);
          if (!parsed.ok)
            return errorResponse(
              requestId,
              400,
              "PLAY_ADMIN_INVALID_REQUEST",
              "Invalid channel command",
              parsed.fields,
            );
          return responseJson(
            await service.createChannel(parsed.value, actor),
            201,
          );
        }
        if (request.method === "PUT") {
          const parsed = await readBody(request, parseUpdateChannel);
          if (!parsed.ok)
            return errorResponse(
              requestId,
              400,
              "PLAY_ADMIN_INVALID_REQUEST",
              "Invalid channel command",
              parsed.fields,
            );
          return responseJson(await service.updateChannel(parsed.value, actor));
        }
        if (request.method === "DELETE") {
          const parsed = await readBody(request, parseVersionRequest);
          if (!parsed.ok)
            return errorResponse(
              requestId,
              400,
              "PLAY_ADMIN_INVALID_REQUEST",
              "Invalid channel command",
              parsed.fields,
            );
          const id = url.searchParams.get("id")?.trim();
          if (!id)
            return errorResponse(
              requestId,
              400,
              "PLAY_ADMIN_INVALID_REQUEST",
              "Channel id is required",
              { id: "required" },
            );
          return responseJson(
            await service.deleteChannel(id, parsed.value, actor),
          );
        }
        return new Response("Method Not Allowed", {
          status: 405,
          headers: { Allow: "POST, PUT, DELETE" },
        });
      }

      const recheckId = pathId(
        url.pathname,
        /^\/api\/play\/admin\/sources\/([^/]+)\/recheck$/u,
      );
      if (recheckId && request.method === "POST") {
        const parsed = await readBody(request, parseRecheckSource);
        if (!parsed.ok)
          return errorResponse(
            requestId,
            400,
            "PLAY_ADMIN_INVALID_REQUEST",
            "Invalid source recheck",
            parsed.fields,
          );
        return responseJson(
          await service.recheckSource(recheckId, parsed.value, actor),
        );
      }

      const rejectId = pathId(
        url.pathname,
        /^\/api\/play\/admin\/submissions\/([^/]+)\/reject$/u,
      );
      if (rejectId && request.method === "POST") {
        const parsed = await readBody(request, parseRejectProposal);
        if (!parsed.ok)
          return errorResponse(
            requestId,
            400,
            "PLAY_ADMIN_INVALID_REQUEST",
            "Invalid rejection",
            parsed.fields,
          );
        return responseJson(
          await service.rejectProposal(rejectId, parsed.value, actor),
        );
      }

      const approveId = pathId(
        url.pathname,
        /^\/api\/play\/admin\/submissions\/([^/]+)\/approve$/u,
      );
      if (approveId && request.method === "POST") {
        const parsed = await readBody(request, parseApproveProposal);
        if (!parsed.ok)
          return errorResponse(
            requestId,
            400,
            "PLAY_ADMIN_INVALID_REQUEST",
            "Invalid approval",
            parsed.fields,
          );
        return responseJson(
          await service.approveProposal(approveId, parsed.value, actor),
        );
      }

      return new Response(null, { status: 404 });
    } catch (error) {
      if (error instanceof AdminCatalogServiceError) {
        const mapping = {
          invalid_request: [400, "PLAY_ADMIN_INVALID_REQUEST"],
          not_found: [404, "PLAY_ADMIN_NOT_FOUND"],
          stale_write: [409, "PLAY_ADMIN_STALE_WRITE"],
          validation_failed: [422, "PLAY_ADMIN_VALIDATION_FAILED"],
          policy_unresolved: [409, "PLAY_ADMIN_POLICY_UNRESOLVED"],
          external_service_unavailable: [
            503,
            "PLAY_ADMIN_EXTERNAL_SERVICE_UNAVAILABLE",
          ],
        } as const;
        const [status, code] = mapping[error.code];
        return errorResponse(
          requestId,
          status,
          code,
          error.message,
          error.fields,
        );
      }
      if (error instanceof AdminCatalogRepositoryError) {
        const status =
          error.code === "unavailable"
            ? 503
            : error.code === "duplicate_source"
              ? 409
            : error.code === "not_found"
              ? 404
              : error.code === "stale_write"
                ? 409
                : 422;
        const code =
          error.code === "unavailable"
            ? "PLAY_ADMIN_INTERNAL_ERROR"
            : error.code === "duplicate_source"
              ? "PLAY_ADMIN_DUPLICATE_SOURCE"
            : error.code === "not_found"
              ? "PLAY_ADMIN_NOT_FOUND"
              : error.code === "stale_write"
                ? "PLAY_ADMIN_STALE_WRITE"
                : "PLAY_ADMIN_VALIDATION_FAILED";
        return errorResponse(requestId, status, code, error.message, error.fields);
      }
      if (error instanceof OtwPlayYouTubeMetadataError) {
        console.warn("OTW Play YouTube metadata request failed", {
          path: url.pathname,
          method: request.method,
          reason: error.message,
          requestId,
        });
        return errorResponse(
          requestId,
          503,
          "PLAY_ADMIN_EXTERNAL_SERVICE_UNAVAILABLE",
          "YouTube metadata is temporarily unavailable",
          { youtube: error.message },
        );
      }
      console.error("OTW Play admin request failed", {
        path: url.pathname,
        method: request.method,
        error: error instanceof Error ? error.name : "unknown",
        requestId,
      });
      return errorResponse(
        requestId,
        500,
        "PLAY_ADMIN_INTERNAL_ERROR",
        "Catalog command failed",
      );
    }
  };
