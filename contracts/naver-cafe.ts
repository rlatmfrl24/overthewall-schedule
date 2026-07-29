export type NaverCafePostsVisibility = "public" | "members" | "private";

export interface NaverCafePostDto {
  id: string;
  articleId: number;
  cafeId: string;
  menuId: string;
  sourceName: string;
  memberUid: number | null;
  title: string;
  summary: string;
  createdAt: string;
  url: string;
  thumbnailUrl: string | null;
  metrics: {
    commentCount: number;
    readCount: number;
    likeCount: number;
  };
  isNew: boolean;
}

export interface NaverCafeSourceStatusDto {
  id: number;
  name: string;
  cafeId: string;
  menuId: string;
  cafeUrl: string;
  memberUid: number | null;
  enabled: boolean;
  sortOrder: number;
  status:
    | "ok"
    | "stale"
    | "error"
    | "private"
    | "invalid_response"
    | "disabled";
  error: string | null;
  postCount: number;
  stale: boolean;
}

export interface NaverCafePostsResponseDto {
  posts: NaverCafePostDto[];
  sources: NaverCafeSourceStatusDto[];
  updatedAt: string;
  clientStale?: boolean;
}

export interface NaverCafePostsConfigResponseDto {
  enabled: boolean;
  visibility: NaverCafePostsVisibility;
}

export interface NaverCafeSourceDto {
  id: number;
  name: string;
  cafe_id: string;
  menu_id: string;
  cafe_url: string;
  member_uid: number | null;
  enabled: boolean | null;
  sort_order: number;
  created_at: string | number | null;
  updated_at: string | number | null;
}

export interface NaverCafeSourcePayloadDto {
  id?: number;
  name: string;
  cafe_id: string;
  menu_id: string;
  cafe_url: string;
  member_uid: number | null;
  enabled: boolean;
  sort_order: number;
}
