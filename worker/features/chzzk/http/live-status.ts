import type {
  ChzzkLiveStatusResponseDto,
  LiveScheduleAutoFillRequestDto,
  LiveScheduleAutoFillResponseDto,
} from "@contracts/chzzk";
import { requireAdminUser } from "../../../platform/auth";
import {
  badRequest,
  getActorInfo,
  json,
  methodNotAllowed,
} from "../../../platform/http-helpers";
import type { Env } from "../../../platform/types";
import {
  parseChzzkChannelTargetArray,
  parseChzzkChannelTargets,
} from "../domain/channel-targets";
import {
  ChzzkAllowlistUnavailableError,
  ChzzkTargetsNotAllowedError,
  type ChzzkApplication,
} from "../application/chzzk-service";
import { parseJsonRequest } from "../../../platform/http/json";

export type BuildChzzkApplication = (env: Env) => ChzzkApplication;

const unavailable = (message: string) =>
  new Response(message, {
    status: 503,
    headers: { "Cache-Control": "no-store" },
  });

const targetErrorResponse = (error: unknown) => {
  if (error instanceof ChzzkAllowlistUnavailableError) {
    return unavailable(error.message);
  }
  if (error instanceof ChzzkTargetsNotAllowedError) {
    return badRequest("Unapproved channelIds");
  }
  throw error;
};

const LIVE_STATUS_CACHE_CONTROL =
  "public, max-age=0, s-maxage=45, stale-while-revalidate=120";

const getLiveStatusCache = () =>
  typeof caches === "undefined" ? null : caches.default;

const makeLiveStatusCacheKey = (request: Request, channelIds: string[]) => {
  const url = new URL(request.url);
  url.pathname = "/api/live-status";
  url.search = "";
  url.searchParams.set("channelIds", [...channelIds].sort().join(","));
  return new Request(url.toString(), { method: "GET" });
};

const hashSnapshot = (items: ChzzkLiveStatusResponseDto["items"]) => {
  const input = JSON.stringify(items ?? []);
  let hash = 2_166_136_261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

export const createLiveStatusHandler =
  (buildApplication: BuildChzzkApplication) =>
  async (request: Request, env: Env) => {
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return methodNotAllowed();
  }

  const debug = url.searchParams.get("debug") === "1";
  if (debug) {
    const admin = await requireAdminUser(request, env);
    if (!admin.ok) return admin.response;
  }

  const parsed = parseChzzkChannelTargets(url.searchParams.get("channelIds"));
  if (!parsed.ok) return badRequest(parsed.message);
  const cache = debug ? null : getLiveStatusCache();
  const cacheKey = makeLiveStatusCacheKey(request, parsed.channelIds);
  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      return cached;
    }
  }
  let items;
  try {
    items = await buildApplication(env).fetchLiveStatuses(
      parsed.channelIds,
      debug,
    );
  } catch (error) {
    return targetErrorResponse(error);
  }

  const snapshotVersion = hashSnapshot(items);
  const etag = `"${snapshotVersion}"`;
  const response = Response.json(
    {
      updatedAt: new Date().toISOString(),
      snapshotVersion,
      items,
      scheduleAutoFill: { updated: 0 },
    },
    {
      status: 200,
      headers: {
        "Cache-Control": debug ? "no-store" : LIVE_STATUS_CACHE_CONTROL,
        ETag: etag,
      },
    },
  );
  if (cache) await cache.put(cacheKey, response.clone());
  return response;
  };

export const createLiveScheduleAutoFillHandler =
  (buildApplication: BuildChzzkApplication) =>
  async (
    request: Request,
    env: Env,
  ) => {
  if (request.method !== "POST") return methodNotAllowed();

  const admin = await requireAdminUser(request, env);
  if (!admin.ok) return admin.response;

  const parsedBody = await parseJsonRequest(request);
  if (!parsedBody.ok) return parsedBody.response;
  const body =
    parsedBody.value as Partial<LiveScheduleAutoFillRequestDto> | null;
  const parsed = parseChzzkChannelTargetArray(
    body && typeof body === "object"
      ? (body as { channelIds?: unknown }).channelIds
      : undefined,
  );
  if (!parsed.ok) return badRequest(parsed.message);
  const snapshotVersion = body && typeof body === "object" &&
      typeof (body as { snapshotVersion?: unknown }).snapshotVersion === "string"
    ? (body as { snapshotVersion: string }).snapshotVersion.trim()
    : "";
  if (!snapshotVersion) return badRequest("snapshotVersion required");

  const cache = getLiveStatusCache();
  if (!cache) return unavailable("Live status snapshot cache unavailable");
  const cacheKey = makeLiveStatusCacheKey(request, parsed.channelIds);
  const snapshotResponse = await cache.match(cacheKey);
  if (!snapshotResponse) {
    return new Response("Live status snapshot expired", {
      status: 409,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const snapshot = await snapshotResponse.json<ChzzkLiveStatusResponseDto>();
  if (snapshot.snapshotVersion !== snapshotVersion || !snapshot.items) {
    return new Response("Live status snapshot changed", {
      status: 409,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const actor = getActorInfo(request, admin.user);
  let result;
  try {
    result = await buildApplication(env).autoFillLiveSchedulesFromSnapshot(
      parsed.channelIds,
      snapshot.items,
      actor,
    );
  } catch (error) {
    return targetErrorResponse(error);
  }

  const response: LiveScheduleAutoFillResponseDto = {
    updatedAt: new Date().toISOString(),
    checkedChannelCount: parsed.channelIds.length,
    scheduleAutoFill: { updated: result.updated },
  };
  return json(
    response,
    200,
    {
      headers: {
        "Cache-Control": "no-store",
        Vary: "Authorization",
      },
    },
  );
  };
