import type {
  NaverCafePostDto,
  NaverCafePostsVisibility,
  NaverCafeSourceStatusDto,
} from "./naver-cafe";
import type {
  XPostDto,
  XPostsByHandleDto,
  XPostsVisibility,
} from "./x-posts";

export type UnifiedMemberPostDto =
  | {
      kind: "x";
      id: string;
      createdAt: string;
      memberUid: number | null;
      post: XPostDto;
    }
  | {
      kind: "cafe";
      id: string;
      createdAt: string;
      memberUid: number | null;
      post: NaverCafePostDto;
    };

export type MemberPostSourcePolicyStatus =
  | "visible"
  | "members_only"
  | "private"
  | "disabled"
  | "not_requested";

export interface MemberPostSourcePolicyDto {
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
}

export interface MemberPostsAggregateResponseDto {
  updatedAt: string;
  posts: UnifiedMemberPostDto[];
  x: {
    posts: XPostDto[];
    byHandle: XPostsByHandleDto[];
    updatedAt: string;
    error: string | null;
    policy: MemberPostSourcePolicyDto;
  };
  naverCafe: {
    posts: NaverCafePostDto[];
    sources: NaverCafeSourceStatusDto[];
    updatedAt: string;
    error: string | null;
    policy: MemberPostSourcePolicyDto;
  };
}
