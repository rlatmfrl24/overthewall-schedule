import { apiRoutes, withRouteSearch } from "@contracts/api-routes";
import { extractNaverCafeBoardIds } from "../model/naver-cafe-urls";
import type {
  NaverCafePostsConfigResponseDto,
  NaverCafePostsResponseDto,
  NaverCafeSourceDto,
  NaverCafeSourcePayloadDto,
} from "@contracts/naver-cafe";
import { apiFetch } from "@/shared/api/client";

export async function fetchNaverCafePostsConfig(options: { force?: boolean } = {}) {
  return apiFetch<NaverCafePostsConfigResponseDto>(
    apiRoutes.naverCafe.config.build(),
    {
      cache: options.force ? "no-store" : "default",
    },
  );
}

export async function fetchNaverCafeSources(): Promise<NaverCafeSourceDto[]> {
  return apiFetch<NaverCafeSourceDto[]>(apiRoutes.naverCafe.sources.build());
}

export async function createNaverCafeSource(
  payload: NaverCafeSourcePayloadDto,
): Promise<void> {
  await apiFetch(apiRoutes.naverCafe.sources.build(), {
    method: "POST",
    json: payload,
  });
}

export async function updateNaverCafeSource(
  payload: NaverCafeSourcePayloadDto & { id: number },
): Promise<void> {
  await apiFetch(apiRoutes.naverCafe.sources.build(), {
    method: "PUT",
    json: payload,
  });
}

export async function deleteNaverCafeSource(id: number): Promise<void> {
  await apiFetch(
    withRouteSearch(apiRoutes.naverCafe.sources.build(), `id=${id}`),
    {
      method: "DELETE",
    },
  );
}

export async function fetchNaverCafePosts(
  options: { size?: number; force?: boolean; admin?: boolean } = {},
): Promise<NaverCafePostsResponseDto> {
  const size = Math.min(20, Math.max(5, Math.trunc(options.size ?? 10)));
  const params = new URLSearchParams({ size: String(size) });
  if (options.force) {
    params.set("_", String(Date.now()));
  }
  if (options.admin) {
    params.set("admin", "1");
  }

  return apiFetch<NaverCafePostsResponseDto>(
    withRouteSearch(apiRoutes.naverCafe.posts.build(), params),
    {
      cache: options.force ? "no-store" : "default",
    },
  );
}

export { extractNaverCafeBoardIds };
