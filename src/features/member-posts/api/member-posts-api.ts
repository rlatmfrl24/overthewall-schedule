import { apiRoutes, withRouteSearch } from "@contracts/api-routes";
import { apiFetch } from "@/shared/api/client";
import type {
  MemberPostSourcePolicyDto,
  MemberPostsAggregateResponseDto,
  UnifiedMemberPostDto,
} from "@contracts/member-posts";

export type UnifiedMemberPost = UnifiedMemberPostDto;
export type MemberPostSourcePolicy = MemberPostSourcePolicyDto;
export type MemberPostsAggregateResponse = MemberPostsAggregateResponseDto;

export async function fetchMemberPostsAggregate(
  options: {
    includeX?: boolean;
    includeNaverCafe?: boolean;
    maxResults?: number;
    size?: number;
    force?: boolean;
    admin?: boolean;
    compact?: boolean;
  } = {},
) {
  const sources = [
    options.includeX !== false ? "x" : null,
    options.includeNaverCafe !== false ? "naver-cafe" : null,
  ].filter((value): value is string => Boolean(value));

  const params = new URLSearchParams({
    sources: sources.join(","),
    maxResults: String(options.maxResults ?? 10),
    size: String(options.size ?? 10),
  });
  if (options.compact !== false) {
    params.set("compact", "1");
  }
  if (options.force) {
    params.set("_", String(Date.now()));
  }
  if (options.admin) {
    params.set("admin", "1");
  }

  return apiFetch<MemberPostsAggregateResponse>(
    withRouteSearch(apiRoutes.memberPosts.read.build(), params),
    {
      cache: options.force ? "no-store" : "default",
    },
  );
}
