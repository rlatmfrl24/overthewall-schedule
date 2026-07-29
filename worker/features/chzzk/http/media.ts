import { badRequest, json, methodNotAllowed } from "../../../platform/http-helpers";
import type { Env } from "../../../platform/types";
import {
  parseChzzkChannelTargets,
  parseSingleChzzkChannelTarget,
} from "../domain/channel-targets";
import {
  ChzzkAllowlistUnavailableError,
  ChzzkTargetsNotAllowedError,
  type ChzzkApplication,
} from "../application/chzzk-service";

export type BuildChzzkMediaApplication = (env: Env) => ChzzkApplication;

const MEDIA_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=600";
const CHZZK_MAX_PAGE = 100;
const CHZZK_MAX_SIZE = 50;

const parseBoundedInteger = (
  value: string | null,
  fallback: number,
  min: number,
  max: number,
) => {
  const normalized = value ?? String(fallback);
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : null;
};

const parseChannelIds = (
  value: string | null,
  single: boolean,
): string[] | Response => {
  const parsed = single
    ? parseSingleChzzkChannelTarget(value)
    : parseChzzkChannelTargets(value);
  if (!parsed.ok) return badRequest(parsed.message);
  return parsed.channelIds;
};

const targetErrorResponse = (error: unknown, single: boolean) => {
  if (error instanceof ChzzkAllowlistUnavailableError) {
    return new Response(error.message, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (error instanceof ChzzkTargetsNotAllowedError) {
    return badRequest(single ? "Unapproved channelId" : "Unapproved channelIds");
  }
  throw error;
};

export const createChzzkMediaHandler =
  (buildApplication: BuildChzzkMediaApplication) =>
  async (request: Request, env: Env) => {
  const url = new URL(request.url);
  const application = buildApplication(env);

  if (url.pathname === "/api/vods/chzzk") {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }

    const page = parseBoundedInteger(
      url.searchParams.get("page"),
      0,
      0,
      CHZZK_MAX_PAGE,
    );
    const size = parseBoundedInteger(
      url.searchParams.get("size"),
      24,
      1,
      CHZZK_MAX_SIZE,
    );
    if (page === null) return badRequest("Invalid page");
    if (size === null) return badRequest("Invalid size");

    const channelIdsParam = url.searchParams.get("channelIds");
    if (channelIdsParam !== null) {
      const channelIds = parseChannelIds(channelIdsParam, false);
      if (channelIds instanceof Response) return channelIds;

      let items;
      try {
        items = await application.fetchVideos(channelIds, page, size);
      } catch (error) {
        return targetErrorResponse(error, false);
      }

      return json(
        { updatedAt: new Date().toISOString(), items },
        200,
        { headers: { "Cache-Control": MEDIA_CACHE_CONTROL } },
      );
    }

    const channelIds = parseChannelIds(
      url.searchParams.get("channelId"),
      true,
    );
    if (channelIds instanceof Response) return channelIds;
    let item;
    try {
      [item] = await application.fetchVideos(channelIds, page, size);
    } catch (error) {
      return targetErrorResponse(error, true);
    }
    return json(
      { updatedAt: new Date().toISOString(), content: item?.content ?? null },
      200,
      { headers: { "Cache-Control": MEDIA_CACHE_CONTROL } },
    );
  }

  if (url.pathname === "/api/clips/chzzk") {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }

    const size = parseBoundedInteger(
      url.searchParams.get("size"),
      30,
      1,
      CHZZK_MAX_SIZE,
    );
    if (size === null) return badRequest("Invalid size");

    const channelIdsParam = url.searchParams.get("channelIds");
    if (channelIdsParam !== null) {
      const channelIds = parseChannelIds(channelIdsParam, false);
      if (channelIds instanceof Response) return channelIds;

      let items;
      try {
        items = await application.fetchClips(channelIds, size);
      } catch (error) {
        return targetErrorResponse(error, false);
      }

      return json(
        { updatedAt: new Date().toISOString(), items },
        200,
        { headers: { "Cache-Control": MEDIA_CACHE_CONTROL } },
      );
    }

    const channelIds = parseChannelIds(
      url.searchParams.get("channelId"),
      true,
    );
    if (channelIds instanceof Response) return channelIds;
    let item;
    try {
      [item] = await application.fetchClips(channelIds, size);
    } catch (error) {
      return targetErrorResponse(error, true);
    }
    return json(
      { updatedAt: new Date().toISOString(), content: item?.content ?? null },
      200,
      { headers: { "Cache-Control": MEDIA_CACHE_CONTROL } },
    );
  }

  return new Response(null, { status: 404 });
  };
