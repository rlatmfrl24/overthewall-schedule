import { apiRoutes, withRouteSearch } from "@contracts/api-routes";
import { apiFetch } from "@/shared/api/client";
import { X_POSTS_CLIENT_CACHE_POLICY } from "../model/cache-policy";
import type {
  XPostDto,
  XPostsConfigResponseDto,
  XPostsResponseDto,
} from "@contracts/x-posts";
import type { MemberDto } from "@contracts/members";
import {
  getMembersWithXHandles,
  normalizeXHandle,
  X_HANDLE_PATTERN,
} from "../model/x-handles";
import type {
  XPostViewModel,
  XPostsViewModelResponse,
} from "../model/types";

interface FetchXPostsOptions {
  maxResults?: number;
  force?: boolean;
  admin?: boolean;
}


const normalizeMaxResults = (value: number | undefined) => {
  if (!Number.isFinite(value)) return 5;
  return Math.min(20, Math.max(5, Math.trunc(value ?? 5)));
};

async function fetchXPosts(
  handles: string[],
  options: FetchXPostsOptions = {},
): Promise<XPostsResponseDto | null> {
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
  const params = new URLSearchParams({
    handles: validHandles.join(","),
    maxResults: String(maxResults),
    clientVersion: X_POSTS_CLIENT_CACHE_POLICY.version,
  });
  if (force) {
    params.set("_", String(Date.now()));
  }
  if (options.admin) {
    params.set("admin", "1");
  }

  return apiFetch<XPostsResponseDto>(
    withRouteSearch(apiRoutes.xPosts.read.build(), params),
    {
    cache: force ? "no-store" : "default",
    },
  );
}

export async function fetchMembersXPosts<TMember extends MemberDto>(
  members: TMember[],
  options: FetchXPostsOptions = {},
): Promise<XPostsViewModelResponse | null> {
  const membersWithHandles = getMembersWithXHandles(members);
  if (membersWithHandles.length === 0) return null;

  const handleToMemberUid = new Map(
    membersWithHandles.map(({ member, handle }) => [
      normalizeXHandle(handle),
      member.uid,
    ]),
  );
  const handles = membersWithHandles.map(({ handle }) => handle);
  const response = await fetchXPosts(handles, options);
  if (!response) return null;

  const mapPost = (post: XPostDto): XPostViewModel => ({
    ...post,
    memberUid: handleToMemberUid.get(normalizeXHandle(post.username)),
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
  return apiFetch<XPostsConfigResponseDto>(apiRoutes.xPosts.config.build(), {
    cache: options.force ? "no-store" : "default",
  });
}
