import { apiFetch } from "./client";
import type {
  Member,
  XPost,
  XPostsResponse,
  XPostsVisibility,
} from "@/lib/types";

interface XPostsApiResponse {
  updatedAt: string;
  posts: XPost[];
  byHandle: XPostsResponse["byHandle"];
}

interface FetchXPostsOptions {
  maxResults?: number;
  force?: boolean;
}

interface XPostsConfigResponse {
  visibility: XPostsVisibility;
}

type MemberXHandle = {
  member: Member;
  handle: string;
};

const X_HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/;
const X_POSTS_CACHE_TTL_MS = 30 * 60_000;
const X_POSTS_STALE_TTL_MS = 2 * 60 * 60_000;
const X_POSTS_CLIENT_CACHE_VERSION = "v3";

const xPostsCache = new Map<
  string,
  { fetchedAt: number; content: XPostsResponse | null }
>();
let xPostsConfigCache:
  | { fetchedAt: number; content: XPostsConfigResponse }
  | null = null;

const isCacheFresh = (fetchedAt: number) =>
  Date.now() - fetchedAt < X_POSTS_CACHE_TTL_MS;

const isCacheStale = (fetchedAt: number) =>
  Date.now() - fetchedAt > X_POSTS_STALE_TTL_MS;

const normalizeHandle = (handle: string) => handle.trim().toLowerCase();

const normalizeMaxResults = (value: number | undefined) => {
  if (!Number.isFinite(value)) return 10;
  return Math.min(20, Math.max(5, Math.trunc(value ?? 10)));
};

const makeCacheKey = (handles: string[], maxResults: number) =>
  `${X_POSTS_CLIENT_CACHE_VERSION}:${[...handles]
    .map(normalizeHandle)
    .sort()
    .join(",")}:${maxResults}`;

const normalizeUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("@")) {
    return trimmed.slice(1);
  }
  if (/^[A-Za-z0-9_]{1,15}$/.test(trimmed)) {
    return trimmed;
  }
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const RESERVED_X_PATHS = new Set([
  "home",
  "i",
  "intent",
  "messages",
  "notifications",
  "search",
  "share",
]);

export const extractXHandleFromUrl = (value?: string | null): string | null => {
  if (!value) return null;

  const normalized = normalizeUrl(value);
  if (!normalized) return null;

  if (X_HANDLE_PATTERN.test(normalized)) {
    return normalized;
  }

  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const isXHost =
      host === "x.com" ||
      host === "twitter.com" ||
      host.endsWith(".twitter.com");

    if (!isXHost) return null;

    const handle = decodeURIComponent(
      url.pathname.split("/").filter(Boolean)[0] ?? "",
    );
    if (
      !handle ||
      RESERVED_X_PATHS.has(handle.toLowerCase()) ||
      !X_HANDLE_PATTERN.test(handle)
    ) {
      return null;
    }
    return handle;
  } catch {
    return null;
  }
};

export const getMembersWithXHandles = (members: Member[]): MemberXHandle[] => {
  const usedHandles = new Set<string>();
  const result: MemberXHandle[] = [];

  for (const member of members) {
    const handle = extractXHandleFromUrl(member.url_twitter);
    if (!handle) continue;

    const normalizedHandle = normalizeHandle(handle);
    if (usedHandles.has(normalizedHandle)) continue;

    usedHandles.add(normalizedHandle);
    result.push({ member, handle });
  }

  return result;
};

async function fetchXPosts(
  handles: string[],
  options: FetchXPostsOptions = {},
): Promise<XPostsResponse | null> {
  const validHandles = Array.from(
    new Set(
      handles
        .map((handle) => handle.trim())
        .filter((handle) => X_HANDLE_PATTERN.test(handle)),
    ),
  );

  if (validHandles.length === 0) return null;

  const maxResults = normalizeMaxResults(options.maxResults);
  const force = options.force === true;
  const cacheKey = makeCacheKey(validHandles, maxResults);
  const cached = xPostsCache.get(cacheKey);

  if (!force && cached && isCacheFresh(cached.fetchedAt)) {
    return cached.content;
  }

  const shouldRevalidate = !cached || !isCacheFresh(cached.fetchedAt);
  if (!force && cached && !isCacheStale(cached.fetchedAt) && shouldRevalidate) {
    void fetchAndCacheXPosts(validHandles, maxResults, cacheKey).catch(() => {
      // Keep stale data when background revalidation fails.
    });
    return cached.content;
  }

  return fetchAndCacheXPosts(validHandles, maxResults, cacheKey, force);
}

async function fetchAndCacheXPosts(
  handles: string[],
  maxResults: number,
  cacheKey: string,
  force = false,
): Promise<XPostsResponse | null> {
  const params = new URLSearchParams({
    handles: handles.join(","),
    maxResults: String(maxResults),
    clientVersion: X_POSTS_CLIENT_CACHE_VERSION,
  });
  if (force) {
    params.set("_", String(Date.now()));
  }

  try {
    const response = await apiFetch<XPostsApiResponse>(`/api/x/posts?${params}`, {
      cache: force ? "no-store" : "default",
    });
    const content: XPostsResponse = {
      posts: response.posts,
      updatedAt: response.updatedAt,
      byHandle: response.byHandle,
    };

    xPostsCache.set(cacheKey, { fetchedAt: Date.now(), content });
    return content;
  } catch (error) {
    console.error("Failed to fetch X posts:", error);

    const cached = xPostsCache.get(cacheKey);
    if (cached) {
      console.warn("Using stale X posts cache due to fetch error");
      return cached.content
        ? {
            ...cached.content,
            clientStale: true,
          }
        : cached.content;
    }

    throw error;
  }
}

export async function fetchMembersXPosts(
  members: Member[],
  options: FetchXPostsOptions = {},
): Promise<XPostsResponse | null> {
  const membersWithHandles = getMembersWithXHandles(members);
  if (membersWithHandles.length === 0) return null;

  const handleToMemberUid = new Map(
    membersWithHandles.map(({ member, handle }) => [
      normalizeHandle(handle),
      member.uid,
    ]),
  );
  const handles = membersWithHandles.map(({ handle }) => handle);
  const response = await fetchXPosts(handles, options);
  if (!response) return null;

  const mapPost = (post: XPost) => ({
    ...post,
    memberUid: handleToMemberUid.get(normalizeHandle(post.username)),
  });

  return {
    ...response,
    posts: response.posts.map(mapPost),
    byHandle: response.byHandle.map((item) => ({
      ...item,
      posts: item.posts.map(mapPost),
    })),
  };
}

export async function fetchXPostsConfig(options: { force?: boolean } = {}) {
  if (
    !options.force &&
    xPostsConfigCache &&
    Date.now() - xPostsConfigCache.fetchedAt < 60_000
  ) {
    return xPostsConfigCache.content;
  }

  const content = await apiFetch<XPostsConfigResponse>("/api/x/config", {
    cache: options.force ? "no-store" : "default",
  });
  xPostsConfigCache = { fetchedAt: Date.now(), content };
  return content;
}

export const clearXPostsCacheForTests = () => {
  xPostsCache.clear();
  xPostsConfigCache = null;
};
