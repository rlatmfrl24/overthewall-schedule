import {
  fetchChzzkClipsBatch,
  fetchChzzkVideosBatch,
  isChzzkClipD1CacheProfile,
  isChzzkVideoD1CacheProfile,
} from "../services/chzzk";
import { badRequest, extractChzzkChannelId, json, methodNotAllowed } from "../utils/helpers";
import type { Env } from "../types";

const MEDIA_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=600";
const CHZZK_CHANNEL_ID_PATTERN = /^[a-f0-9]{32}$/i;
const CHZZK_MAX_CHANNEL_IDS = 20;
const CHZZK_MAX_PAGE = 100;
const CHZZK_MAX_SIZE = 50;
const ACTIVE_CHZZK_CHANNELS_TTL_MS = 5 * 60_000;

let activeChzzkChannelsCache:
  | { fetchedAt: number; channelIds: Set<string> }
  | undefined;

const getD1Results = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    const results = (value as { results?: unknown }).results;
    return Array.isArray(results) ? (results as T[]) : [];
  }
  return [];
};

const readActiveChzzkChannelIds = async (env: Env) => {
  const timestamp = Date.now();
  if (
    activeChzzkChannelsCache &&
    timestamp - activeChzzkChannelsCache.fetchedAt < ACTIVE_CHZZK_CHANNELS_TTL_MS
  ) {
    return activeChzzkChannelsCache.channelIds;
  }

  try {
    const result = await env.otw_db
      .prepare(
        `SELECT url_chzzk
         FROM members
         WHERE url_chzzk IS NOT NULL
           AND TRIM(url_chzzk) <> ''
           AND (is_deprecated IS NULL OR is_deprecated != 1)`,
      )
      .all<{ url_chzzk: string | null }>();
    const channelIds = new Set<string>();
    for (const row of getD1Results<{ url_chzzk: string | null }>(result)) {
      const channelId = extractChzzkChannelId(row.url_chzzk)?.toLowerCase();
      if (channelId && CHZZK_CHANNEL_ID_PATTERN.test(channelId)) {
        channelIds.add(channelId);
      }
    }
    activeChzzkChannelsCache = { fetchedAt: timestamp, channelIds };
    return channelIds;
  } catch (error) {
    console.warn("Failed to read active CHZZK member channels", error);
    return new Set<string>();
  }
};

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

const normalizeChannelIds = (value: string) => {
  const channelIds: string[] = [];
  const seen = new Set<string>();
  for (const part of value.split(",")) {
    const channelId = part.trim().toLowerCase();
    if (!channelId) continue;
    if (!CHZZK_CHANNEL_ID_PATTERN.test(channelId)) return null;
    if (!seen.has(channelId)) {
      seen.add(channelId);
      channelIds.push(channelId);
    }
  }
  return channelIds.length > 0 && channelIds.length <= CHZZK_MAX_CHANNEL_IDS
    ? channelIds
    : null;
};

const normalizeChannelId = (value: string | null) => {
  const channelId = value?.trim().toLowerCase() ?? "";
  return CHZZK_CHANNEL_ID_PATTERN.test(channelId) ? channelId : null;
};

const getCacheableChannelIds = async (
  env: Env,
  cacheableProfile: boolean,
) => (cacheableProfile ? readActiveChzzkChannelIds(env) : new Set<string>());

export const handleVods = async (request: Request, env: Env) => {
  const url = new URL(request.url);

  if (url.pathname.startsWith("/api/vods/chzzk")) {
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
      const channelIds = normalizeChannelIds(channelIdsParam);
      if (!channelIds) return badRequest("Invalid channelIds");

      const cacheableProfile = isChzzkVideoD1CacheProfile(page, size);
      const cacheableChannelIds = await getCacheableChannelIds(
        env,
        cacheableProfile,
      );
      const items = await fetchChzzkVideosBatch(
        channelIds.map((channelId) => ({
          channelId,
          page,
          size,
          cacheable: cacheableProfile && cacheableChannelIds.has(channelId),
        })),
        env.otw_db,
      );

      return json(
        { updatedAt: new Date().toISOString(), items },
        200,
        { headers: { "Cache-Control": MEDIA_CACHE_CONTROL } },
      );
    }

    const channelId = normalizeChannelId(url.searchParams.get("channelId"));
    if (!channelId) return badRequest("Invalid channelId");

    const cacheableProfile = isChzzkVideoD1CacheProfile(page, size);
    const cacheableChannelIds = await getCacheableChannelIds(env, cacheableProfile);
    const [item] = await fetchChzzkVideosBatch(
      [
        {
          channelId,
          page,
          size,
          cacheable: cacheableProfile && cacheableChannelIds.has(channelId),
        },
      ],
      env.otw_db,
    );
    return json(
      { updatedAt: new Date().toISOString(), content: item?.content ?? null },
      200,
      { headers: { "Cache-Control": MEDIA_CACHE_CONTROL } },
    );
  }

  if (url.pathname.startsWith("/api/clips/chzzk")) {
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
      const channelIds = normalizeChannelIds(channelIdsParam);
      if (!channelIds) return badRequest("Invalid channelIds");

      const cacheableProfile = isChzzkClipD1CacheProfile(size);
      const cacheableChannelIds = await getCacheableChannelIds(
        env,
        cacheableProfile,
      );
      const items = await fetchChzzkClipsBatch(
        channelIds.map((channelId) => ({
          channelId,
          size,
          cacheable: cacheableProfile && cacheableChannelIds.has(channelId),
        })),
        env.otw_db,
      );

      return json(
        { updatedAt: new Date().toISOString(), items },
        200,
        { headers: { "Cache-Control": MEDIA_CACHE_CONTROL } },
      );
    }

    const channelId = normalizeChannelId(url.searchParams.get("channelId"));
    if (!channelId) return badRequest("Invalid channelId");

    const cacheableProfile = isChzzkClipD1CacheProfile(size);
    const cacheableChannelIds = await getCacheableChannelIds(env, cacheableProfile);
    const [item] = await fetchChzzkClipsBatch(
      [
        {
          channelId,
          size,
          cacheable: cacheableProfile && cacheableChannelIds.has(channelId),
        },
      ],
      env.otw_db,
    );
    return json(
      { updatedAt: new Date().toISOString(), content: item?.content ?? null },
      200,
      { headers: { "Cache-Control": MEDIA_CACHE_CONTROL } },
    );
  }

  return new Response(null, { status: 404 });
};

export const clearChzzkRouteCachesForTests = () => {
  activeChzzkChannelsCache = undefined;
};
