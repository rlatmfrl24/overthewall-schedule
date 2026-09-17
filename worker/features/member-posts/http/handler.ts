import { authenticateRequest, requireAdminUser } from "../../../platform/auth";
import { badRequest, json, methodNotAllowed } from "../../../platform/http-helpers";
import type { Env } from "../../../platform/types";
import type { GetMemberPosts } from "../application/get-member-posts";
import type { MemberPostsPageRequest } from "@contracts/member-posts";

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
  return {
    includeX: requested.has("x"),
    includeNaverCafe:
      requested.has("naver-cafe") || requested.has("cafe"),
  };
};

export type MemberPostsHandlerDependencies = {
  getMemberPosts(env: Env): GetMemberPosts;
};

export const createMemberPostsHandler =
  ({ getMemberPosts }: MemberPostsHandlerDependencies) =>
  async (request: Request, env: Env) => {
    if (request.method !== "GET") return methodNotAllowed();

    const url = new URL(request.url);
    const { includeX, includeNaverCafe } = parseSources(
      url.searchParams.get("sources"),
    );
    if (!includeX && !includeNaverCafe) {
      return badRequest("sources must include x or naver-cafe");
    }
    const maxResults = parseBoundedInt(
      url.searchParams.get("maxResults"),
      10,
      5,
      20,
    );
    const size = parseBoundedInt(url.searchParams.get("size"), 10, 5, 20);
    if (maxResults === null) {
      return badRequest("maxResults must be an integer between 5 and 20");
    }
    if (size === null) {
      return badRequest("size must be an integer between 5 and 20");
    }

    let page: MemberPostsPageRequest | undefined;
    if (url.searchParams.get("page") === "1") {
      page = {};
      const member = url.searchParams.get("memberUid");
      if (member !== null) {
        const uid = parseBoundedInt(member, 0, 1, Number.MAX_SAFE_INTEGER);
        if (!uid) return badRequest("memberUid must be a positive integer");
        page.memberUid = uid;
      }
      const cursor = url.searchParams.get("cursor");
      if (cursor !== null) {
        try {
          if (cursor.length > 512) throw new Error("Invalid cursor");
          const value = JSON.parse(cursor);
          if (!value || typeof value.createdAt !== "string" ||
            !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value.createdAt) ||
            !Number.isFinite(Date.parse(value.createdAt)) || typeof value.id !== "string" ||
            !/^(x|cafe):[\w:-]{1,200}$/.test(value.id)) throw new Error("Invalid cursor");
          page.cursor = { createdAt: value.createdAt, id: value.id };
        } catch { return badRequest("Invalid member posts cursor"); }
      }
    } else if (url.searchParams.has("cursor") || url.searchParams.has("memberUid")) {
      return badRequest("cursor and memberUid require page=1");
    }

    const adminView = url.searchParams.get("admin") === "1";
    const compact =
      url.searchParams.get("compact") === "1" ||
      url.searchParams.get("compact") === "true";
    const useCase = getMemberPosts(env);
    const configs = await useCase.readConfigs();

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

    const result = await useCase.execute({
      includeX,
      includeNaverCafe,
      adminView,
      compact,
      maxResults,
      size,
      configs,
      ...(page ? { page } : {}),
    });
    return json(result.body, 200, {
      headers: { "Cache-Control": result.cacheControl },
    });
  };
