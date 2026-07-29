export type NaverCafeVisibility = "public" | "members" | "private";

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

export type NaverCafeSourcePayload = {
  name: string;
  cafe_id: string;
  menu_id: string;
  cafe_url: string;
  member_uid: number | null;
  enabled: boolean;
  sort_order: number;
  updated_at: string;
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

export interface NaverCafeApplication {
  getConfig(): Promise<{
    enabled: boolean;
    visibility: NaverCafeVisibility;
  }>;
  listSources(): Promise<NaverCafeSourceRecord[]>;
  createSource(payload: NaverCafeSourcePayload): Promise<boolean>;
  updateSource(id: number, payload: NaverCafeSourcePayload): Promise<boolean>;
  deleteSource(id: number): Promise<boolean>;
  readStoredPosts(
    sources: NaverCafeSourceRecord[],
    size: number,
  ): Promise<NaverCafePostsContent>;
}
