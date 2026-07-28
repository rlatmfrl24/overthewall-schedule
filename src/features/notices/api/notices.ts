import { apiRoutes, withRouteSearch } from "@contracts/api-routes";
import { apiFetch } from "@/shared/api/client";
import type {
  Notice,
  NoticePayload,
  NoticeThumbnailCleanupResponse,
  NoticeThumbnailDeleteResponse,
  NoticeThumbnailStatusResponse,
  NoticeThumbnailUploadResponse,
} from "../model/types";

const normalizeActive = (value: boolean | string | number | undefined) =>
  value === "0" || value === 0 || value === false || value === "false"
    ? "0"
    : "1";

export async function fetchNotices(options?: { includeInactive?: boolean }) {
  const path = options?.includeInactive
    ? withRouteSearch(
        apiRoutes.notices.collection.build(),
        "includeInactive=1",
      )
    : apiRoutes.notices.collection.build();
  return apiFetch<Notice[]>(path, { cache: "no-store" });
}

export async function createNotice(payload: NoticePayload) {
  return apiFetch(apiRoutes.notices.collection.build(), {
    method: "POST",
    json: {
      ...payload,
      is_active: normalizeActive(payload.is_active),
    },
  });
}

export async function updateNotice(payload: NoticePayload & { id: number }) {
  return apiFetch(apiRoutes.notices.collection.build(), {
    method: "PUT",
    json: {
      ...payload,
      is_active: normalizeActive(payload.is_active),
    },
  });
}

export async function deleteNotice(id: number) {
  return apiFetch(
    withRouteSearch(apiRoutes.notices.collection.build(), `id=${id}`),
    { method: "DELETE" },
  );
}

export async function setFeaturedNotice(id: number) {
  return apiFetch(apiRoutes.notices.featured.build(), {
    method: "PUT",
    json: { id },
  });
}

export async function uploadNoticeThumbnail(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch<NoticeThumbnailUploadResponse>(
    apiRoutes.notices.thumbnail.build(),
    {
    method: "POST",
    body: formData,
    },
  );
}

export async function deleteNoticeThumbnail(thumbnailUrl: string) {
  return apiFetch<NoticeThumbnailDeleteResponse>(
    apiRoutes.notices.thumbnail.build(),
    {
      method: "DELETE",
      json: { thumbnail_url: thumbnailUrl },
    },
  );
}

export async function fetchNoticeThumbnailStatus() {
  return apiFetch<NoticeThumbnailStatusResponse>(
    apiRoutes.notices.thumbnailStatus.build(),
    { cache: "no-store" },
  );
}

export async function cleanupUnusedNoticeThumbnails() {
  return apiFetch<NoticeThumbnailCleanupResponse>(
    apiRoutes.notices.thumbnailCleanup.build(),
    { method: "POST" },
  );
}
