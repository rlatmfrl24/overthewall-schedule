import type { NaverCafeSource } from "@/db/schema";
import { extractNaverCafeBoardIds } from "@/lib/naver-cafe";
import type {
  NaverCafePostsResponse,
  NaverCafePostsVisibility,
} from "@/lib/types";
import { apiFetch } from "./client";

export interface NaverCafePostsConfigResponse {
  enabled: boolean;
  visibility: NaverCafePostsVisibility;
}

export interface NaverCafeSourcePayload {
  id?: number;
  name: string;
  cafe_id: string;
  menu_id: string;
  cafe_url: string;
  member_uid: number | null;
  enabled: boolean;
  sort_order: number;
}

export async function fetchNaverCafePostsConfig(options: { force?: boolean } = {}) {
  return apiFetch<NaverCafePostsConfigResponse>("/api/naver-cafe/config", {
    cache: options.force ? "no-store" : "default",
  });
}

export async function fetchNaverCafeSources(): Promise<NaverCafeSource[]> {
  return apiFetch<NaverCafeSource[]>("/api/naver-cafe/sources");
}

export async function createNaverCafeSource(
  payload: NaverCafeSourcePayload,
): Promise<void> {
  await apiFetch("/api/naver-cafe/sources", {
    method: "POST",
    json: payload,
  });
}

export async function updateNaverCafeSource(
  payload: NaverCafeSourcePayload & { id: number },
): Promise<void> {
  await apiFetch("/api/naver-cafe/sources", {
    method: "PUT",
    json: payload,
  });
}

export async function deleteNaverCafeSource(id: number): Promise<void> {
  await apiFetch(`/api/naver-cafe/sources?id=${id}`, {
    method: "DELETE",
  });
}

export async function fetchNaverCafePosts(
  options: { size?: number; force?: boolean; admin?: boolean } = {},
): Promise<NaverCafePostsResponse> {
  const size = Math.min(20, Math.max(5, Math.trunc(options.size ?? 10)));
  const params = new URLSearchParams({ size: String(size) });
  if (options.force) {
    params.set("_", String(Date.now()));
  }
  if (options.admin) {
    params.set("admin", "1");
  }

  return apiFetch<NaverCafePostsResponse>(`/api/naver-cafe/posts?${params}`, {
    cache: options.force ? "no-store" : "default",
  });
}

export { extractNaverCafeBoardIds };
