import type { XPostDto, XPostsByHandleDto } from "@contracts/x-posts";

export type Visibility = "public" | "members" | "private";

export type MemberRow = {
  uid: number;
  url_twitter: string | null;
};

export type NaverCafeSourceRecord = {
  id: number;
  name: string;
  cafe_id: string;
  menu_id: string;
  cafe_url: string;
  member_uid: number | null;
  enabled: boolean | null;
  sort_order: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type NaverCafePostsContent = {
  posts: Array<{
    id: string;
    createdAt: string;
    memberUid: number | null;
    [key: string]: unknown;
  }>;
  sources: unknown[];
};

export type MemberPostsConfigs = {
  x: {
    visibility: Visibility;
    richLinkPreviewEnabled: boolean;
  };
  naverCafe: {
    enabled: boolean;
    visibility: Visibility;
  };
};

export type XPostsContent = {
  posts: XPostDto[];
  byHandle: XPostsByHandleDto[];
};

export interface MemberPostsPort {
  readConfigs(): Promise<MemberPostsConfigs>;
  listActiveMembers(): Promise<MemberRow[]>;
  listNaverCafeSources(): Promise<NaverCafeSourceRecord[]>;
  extractXHandle(url: string | null | undefined): string | null;
  fetchXPosts(
    handles: string[],
    options: {
      maxResults: number;
      richXLinkPreviewEnabled: boolean;
      adminView: boolean;
    },
  ): Promise<XPostsContent>;
  isXApiError(error: unknown): boolean;
  readNaverCafePosts(
    sources: NaverCafeSourceRecord[],
    size: number,
  ): Promise<NaverCafePostsContent>;
}
