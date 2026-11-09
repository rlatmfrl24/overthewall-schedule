import { apiRoutes } from "@contracts/api-routes";
import type { XPostsConfigResponseDto } from "@contracts/x-posts";
import { apiFetch } from "@/shared/api/client";

export async function fetchXPostsConfig(options: { force?: boolean } = {}) {
  return apiFetch<XPostsConfigResponseDto>(apiRoutes.xPosts.config.build(), {
    cache: options.force ? "no-store" : "default",
  });
}
