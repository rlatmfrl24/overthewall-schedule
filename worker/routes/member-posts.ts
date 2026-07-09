import { asc, sql } from "drizzle-orm";
import { members, naverCafeSources } from "../../src/db/schema";
import { authenticateRequest, requireAdminUser } from "../auth";
import { getDb } from "../db";
import {
  readStoredNaverCafePostsForSources,
} from "../services/naver-cafe";
import {
  extractXHandleFromUrl,
  fetchXPostsForHandles,
  XApiError,
} from "../services/x";
import { badRequest, getSetting, json, methodNotAllowed } from "../utils/helpers";
import type { Env, XPostItem } from "../types";

const MEMBER_POSTS_CACHE_CONTROL =
  "public, max-age=300, s-maxage=900, stale-while-revalidate=1800";
const PRIVATE_MEMBER_POSTS_CACHE_CONTROL = "no-store";

type Visibility = "public" | "members" | "private";
type MemberPostSourcePolicyStatus =
  | "visible"
  | "members_only"
  | "private"
  | "disabled"
  | "not_requested";
type MemberPostSourcePolicy = {
  source: "x" | "naver-cafe";
  requested: boolean;
  admin: boolean;
  enabled: boolean;
  visibility: Visibility;
  accessible: boolean;
  status: MemberPostSourcePolicyStatus;
  reason: string | null;
  publicPath: string;
  monitorPath: string;
  apiPath: string;
};

const MEMBER_POSTS_PUBLIC_PATH = "/feed";
const MEMBER_POSTS_MONITOR_PATH = "/admin/member-posts";

const normalizeVisibility = (value: string | null | undefined): Visibility =>
  value === "public" || value === "private" ? value : "members";

const parseBoundedInt = (
  value: string | null,
  fallback: number,
  min: number,
  max: number,
) => {
  if (value === null || value.trim() === "") return fallback;
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : null;
};

const parseSources = (value: string | null) => {
  const requested = new Set(
    (value || "x,naver-cafe")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
  const includeX = requested.has("x");
  const includeNaverCafe =
    requested.has("naver-cafe") || requested.has("cafe");
  return { includeX, includeNaverCafe };
};

const parseCompact = (value: string | null) =>
  value === "1" || value === "true";

const readPostConfigs = async (db: ReturnType<typeof getDb>) => {
  const [
    xVisibility,
    richXLinkPreview,
    naverCafeEnabled,
    naverCafeVisibility,
  ] = await Promise.all([
    getSetting(db, "x_posts_visibility"),
    getSetting(db, "x_rich_link_preview_enabled"),
    getSetting(db, "naver_cafe_posts_enabled"),
    getSetting(db, "naver_cafe_posts_visibility"),
  ]);

  return {
    x: {
      visibility: normalizeVisibility(xVisibility),
      richLinkPreviewEnabled: richXLinkPreview === "true",
    },
    naverCafe: {
      enabled: naverCafeEnabled !== "false",
      visibility: normalizeVisibility(naverCafeVisibility),
    },
  };
};

const getMemberPostsCacheControl = ({
  force,
  adminView,
  includeX,
  includeNaverCafe,
  configs,
}: {
  force: boolean;
  adminView: boolean;
  includeX: boolean;
  includeNaverCafe: boolean;
  configs: Awaited<ReturnType<typeof readPostConfigs>>;
}) => {
  if (force || adminView) return PRIVATE_MEMBER_POSTS_CACHE_CONTROL;
  if (includeX && configs.x.visibility !== "public") {
    return PRIVATE_MEMBER_POSTS_CACHE_CONTROL;
  }
  if (
    includeNaverCafe &&
    (!configs.naverCafe.enabled || configs.naverCafe.visibility !== "public")
  ) {
    return PRIVATE_MEMBER_POSTS_CACHE_CONTROL;
  }
  return MEMBER_POSTS_CACHE_CONTROL;
};

const getActiveMemberRows = (db: ReturnType<typeof getDb>) =>
  db
    .select()
    .from(members)
    .where(sql`${members.is_deprecated} IS NULL OR ${members.is_deprecated} = 0`)
    .orderBy(asc(members.uid));

const mapXPostMemberUid = (
  post: XPostItem,
  handleToMemberUid: Map<string, number>,
) => ({
  ...post,
  memberUid: handleToMemberUid.get(post.username.toLowerCase()),
});

const createXPolicy = ({
  requested,
  adminView,
  visibility,
}: {
  requested: boolean;
  adminView: boolean;
  visibility: Visibility;
}): MemberPostSourcePolicy => {
  const accessible = requested && (adminView || visibility !== "private");
  const status: MemberPostSourcePolicyStatus = !requested
    ? "not_requested"
    : visibility === "private"
      ? "private"
      : visibility === "members"
        ? "members_only"
        : "visible";

  return {
    source: "x",
    requested,
    admin: adminView,
    enabled: true,
    visibility,
    accessible,
    status,
    reason: !requested
      ? "X posts were not requested."
      : visibility === "private"
        ? adminView
          ? "X posts are hidden from the public feed but visible in admin monitoring."
          : "X posts are private."
        : visibility === "members"
          ? "X posts require member authentication."
          : null,
    publicPath: MEMBER_POSTS_PUBLIC_PATH,
    monitorPath: MEMBER_POSTS_MONITOR_PATH,
    apiPath: "/api/member-posts?sources=x&admin=1",
  };
};

const createNaverCafePolicy = ({
  requested,
  adminView,
  enabled,
  visibility,
}: {
  requested: boolean;
  adminView: boolean;
  enabled: boolean;
  visibility: Visibility;
}): MemberPostSourcePolicy => {
  const accessible =
    requested && (adminView || (enabled && visibility !== "private"));
  const status: MemberPostSourcePolicyStatus = !requested
    ? "not_requested"
    : !enabled
      ? "disabled"
      : visibility === "private"
        ? "private"
        : visibility === "members"
          ? "members_only"
          : "visible";

  return {
    source: "naver-cafe",
    requested,
    admin: adminView,
    enabled,
    visibility,
    accessible,
    status,
    reason: !requested
      ? "Naver Cafe posts were not requested."
      : !enabled
        ? adminView
          ? "Naver Cafe feed display is disabled, but admin monitoring can inspect it."
          : "Naver Cafe posts are disabled."
        : visibility === "private"
          ? adminView
            ? "Naver Cafe posts are hidden from the public feed but visible in admin monitoring."
            : "Naver Cafe posts are private."
          : visibility === "members"
            ? "Naver Cafe posts require member authentication."
            : null,
    publicPath: MEMBER_POSTS_PUBLIC_PATH,
    monitorPath: MEMBER_POSTS_MONITOR_PATH,
    apiPath: "/api/member-posts?sources=naver-cafe&admin=1",
  };
};

const emptyX = (
  policy: MemberPostSourcePolicy,
  error: string | null = null,
) => ({
  updatedAt: new Date().toISOString(),
  posts: [],
  byHandle: [],
  error,
  policy,
});

const emptyNaverCafe = (
  policy: MemberPostSourcePolicy,
  error: string | null = null,
) => ({
  updatedAt: new Date().toISOString(),
  posts: [],
  sources: [],
  error,
  policy,
});

export const handleMemberPosts = async (request: Request, env: Env) => {
  if (request.method !== "GET") {
    return methodNotAllowed();
  }

  const url = new URL(request.url);
  const { includeX, includeNaverCafe } = parseSources(
    url.searchParams.get("sources"),
  );
  if (!includeX && !includeNaverCafe) {
    return badRequest("sources must include x or naver-cafe");
  }

  const maxResults = parseBoundedInt(url.searchParams.get("maxResults"), 10, 5, 20);
  const size = parseBoundedInt(url.searchParams.get("size"), 10, 5, 20);
  if (maxResults === null) {
    return badRequest("maxResults must be an integer between 5 and 20");
  }
  if (size === null) {
    return badRequest("size must be an integer between 5 and 20");
  }

  const db = getDb(env);
  const adminView = url.searchParams.get("admin") === "1";
  const compact = parseCompact(url.searchParams.get("compact"));
  const requestedForce = url.searchParams.has("_") || request.cache === "no-store";
  const force = adminView && requestedForce;
  const configs = await readPostConfigs(db);
  const xPolicy = createXPolicy({
    requested: includeX,
    adminView,
    visibility: configs.x.visibility,
  });
  const naverCafePolicy = createNaverCafePolicy({
    requested: includeNaverCafe,
    adminView,
    enabled: configs.naverCafe.enabled,
    visibility: configs.naverCafe.visibility,
  });

  if (adminView) {
    const admin = await requireAdminUser(request, env);
    if (!admin.ok) return admin.response;
  } else {
    const needsMemberAuth =
      (includeX && configs.x.visibility === "members") ||
      (includeNaverCafe &&
        configs.naverCafe.enabled &&
        configs.naverCafe.visibility === "members");

    if (needsMemberAuth) {
      const auth = await authenticateRequest(request, env);
      if (!auth.ok) return auth.response;
    }
  }

  const shouldLoadXRows = includeX && xPolicy.accessible;
  const shouldLoadCafeSources = includeNaverCafe && naverCafePolicy.accessible;

  const [memberRows, cafeSources] = await Promise.all([
    shouldLoadXRows ? getActiveMemberRows(db) : Promise.resolve([]),
    shouldLoadCafeSources
      ? db
          .select()
          .from(naverCafeSources)
          .orderBy(asc(naverCafeSources.sort_order), asc(naverCafeSources.name))
      : Promise.resolve([]),
  ]);

  const handlePairs = memberRows
    .map((member) => {
      const handle = extractXHandleFromUrl(member.url_twitter);
      return handle ? { handle, memberUid: member.uid } : null;
    })
    .filter((item): item is { handle: string; memberUid: number } =>
      Boolean(item),
    );
  const handleToMemberUid = new Map(
    handlePairs.map((item) => [item.handle.toLowerCase(), item.memberUid]),
  );
  const handles = Array.from(new Set(handlePairs.map((item) => item.handle)));

  const [x, naverCafe] = await Promise.all([
    (async () => {
      if (!includeX) return emptyX(xPolicy);
      if (configs.x.visibility === "private" && !adminView) {
        return emptyX(xPolicy, "X posts are private");
      }
      if (handles.length === 0) return emptyX(xPolicy);

      try {
        const content = await fetchXPostsForHandles(handles, {
          bearerToken: env.X_BEARER_TOKEN,
          cacheDb: env.otw_db,
          maxResults,
          richXLinkPreviewEnabled: configs.x.richLinkPreviewEnabled,
          refresh: force,
          forceRefresh: force,
          usageSource: adminView ? "member-posts:admin" : "member-posts",
          forceRefreshPath: force ? "member-posts:admin" : null,
        });
        return {
          updatedAt: new Date().toISOString(),
          posts: content.posts.map((post) =>
            mapXPostMemberUid(post, handleToMemberUid),
          ),
          byHandle: content.byHandle.map((item) => ({
            ...item,
            posts: item.posts.map((post) =>
              mapXPostMemberUid(post, handleToMemberUid),
            ),
          })),
          error: null,
          policy: xPolicy,
        };
      } catch (error) {
        if (error instanceof XApiError) {
          return emptyX(xPolicy, error.message);
        }
        console.error("Failed to aggregate X posts", error);
        return emptyX(xPolicy, "Failed to fetch X posts");
      }
    })(),
    (async () => {
      if (!includeNaverCafe) return emptyNaverCafe(naverCafePolicy);
      if (!configs.naverCafe.enabled && !adminView) {
        return emptyNaverCafe(
          naverCafePolicy,
          "Naver Cafe posts are disabled",
        );
      }
      if (configs.naverCafe.visibility === "private" && !adminView) {
        return emptyNaverCafe(naverCafePolicy, "Naver Cafe posts are private");
      }
      if (cafeSources.length === 0) return emptyNaverCafe(naverCafePolicy);

      try {
        const content = await readStoredNaverCafePostsForSources(cafeSources, {
          cacheDb: env.otw_db,
          size,
        });
        return {
          updatedAt: new Date().toISOString(),
          ...content,
          error: null,
          policy: naverCafePolicy,
        };
      } catch (error) {
        console.error("Failed to aggregate Naver Cafe posts", error);
        return emptyNaverCafe(naverCafePolicy, "Failed to fetch Naver Cafe posts");
      }
    })(),
  ]);

  const posts = [
    ...x.posts.map((post) => ({
      kind: "x" as const,
      id: `x:${post.id}`,
      createdAt: post.createdAt,
      memberUid: post.memberUid ?? null,
      post,
    })),
    ...naverCafe.posts.map((post) => ({
      kind: "cafe" as const,
      id: `cafe:${post.id}`,
      createdAt: post.createdAt,
      memberUid: post.memberUid,
      post,
    })),
  ].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return json(
    {
      updatedAt: new Date().toISOString(),
      posts,
      x: compact
        ? {
            ...x,
            posts: [],
            byHandle: x.byHandle.map((item) => ({ ...item, posts: [] })),
          }
        : x,
      naverCafe: compact ? { ...naverCafe, posts: [] } : naverCafe,
    },
    200,
    {
      headers: {
        "Cache-Control": getMemberPostsCacheControl({
          force,
          adminView,
          includeX,
          includeNaverCafe,
          configs,
        }),
      },
    },
  );
};
