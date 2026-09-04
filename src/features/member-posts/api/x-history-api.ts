import { apiRoutes } from "@contracts/api-routes";
import type {
  XHistoryPostStatus,
  XHistoryPostsResponseDto,
  XHistoryHealthResponseDto,
} from "@contracts/x-posts";
import { apiFetch } from "@/shared/api/client";
export const fetchXHistoryHealth = () => apiFetch<XHistoryHealthResponseDto>(
  apiRoutes.xPosts.historyHealth.build(), { auth: "required", cache: "no-store" });

export interface XHistoryQuery {
  memberUid?: number;
  from?: string;
  to?: string;
  status?: XHistoryPostStatus;
  cursor?: string;
  limit?: number;
}

export const fetchXHistoryPosts = async (query: XHistoryQuery = {}) => {
  const params = new URLSearchParams();
  if (query.memberUid) params.set("memberUid", String(query.memberUid));
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.status) params.set("status", query.status);
  if (query.cursor) params.set("cursor", query.cursor);
  params.set("limit", String(query.limit ?? 50));
  return apiFetch<XHistoryPostsResponseDto>(
    `${apiRoutes.xPosts.historyPosts.build()}?${params.toString()}`,
    { auth: "required" },
  );
};

export const redactXHistoryPost = async (postId: string) =>
  apiFetch<string>(apiRoutes.xPosts.redact.build(postId), {
    method: "DELETE",
    auth: "required",
  });
