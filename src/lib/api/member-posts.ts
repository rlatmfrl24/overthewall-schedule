import { apiFetch } from "./client";
import type {
  NaverCafePost,
  NaverCafePostsResponse,
  NaverCafePostsVisibility,
  XPost,
  XPostsResponse,
  XPostsVisibility,
} from "@/lib/types";

export type UnifiedMemberPost =
  | {
      kind: "x";
      id: string;
      createdAt: string;
      memberUid: number | null;
      post: XPost;
    }
  | {
      kind: "cafe";
      id: string;
      createdAt: string;
      memberUid: number | null;
      post: NaverCafePost;
    };

export type MemberPostSourcePolicyStatus =
  | "visible"
  | "members_only"
  | "private"
  | "disabled"
  | "not_requested";

export type MemberPostSourcePolicy = {
  source: "x" | "naver-cafe";
  requested: boolean;
  admin: boolean;
  enabled: boolean;
  visibility: XPostsVisibility | NaverCafePostsVisibility;
  accessible: boolean;
  status: MemberPostSourcePolicyStatus;
  reason: string | null;
  publicPath: string;
  monitorPath: string;
  apiPath: string;
};

export interface MemberPostsAggregateResponse {
  updatedAt: string;
  posts: UnifiedMemberPost[];
  x: {
    posts: XPost[];
    byHandle: XPostsResponse["byHandle"];
    updatedAt: string;
    error: string | null;
    policy: MemberPostSourcePolicy;
  };
  naverCafe: {
    posts: NaverCafePost[];
    sources: NaverCafePostsResponse["sources"];
    updatedAt: string;
    error: string | null;
    policy: MemberPostSourcePolicy;
  };
}

export async function fetchMemberPostsAggregate(
  options: {
    includeX?: boolean;
    includeNaverCafe?: boolean;
    maxResults?: number;
    size?: number;
    force?: boolean;
    admin?: boolean;
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
  if (options.force) {
    params.set("_", String(Date.now()));
  }
  if (options.admin) {
    params.set("admin", "1");
  }

  return apiFetch<MemberPostsAggregateResponse>(`/api/member-posts?${params}`, {
    cache: options.force ? "no-store" : "default",
  });
}
