import { apiRoutes } from "@contracts/api-routes";
import type { XHistoryHealthResponseDto } from "@contracts/x-posts";
import { apiFetch } from "@/shared/api/client";
export const fetchXHistoryHealth = () => apiFetch<XHistoryHealthResponseDto>(
  apiRoutes.xPosts.historyHealth.build(), { auth: "required", cache: "no-store" });
