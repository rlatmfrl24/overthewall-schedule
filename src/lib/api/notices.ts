import { apiFetch } from "./client";
import type { Notice } from "@/db/schema";

export type NoticePublisherType = "otw" | "member";

type NoticePayload = {
  id?: number;
  content: string;
  url?: string | null;
  thumbnail_url?: string | null;
  type: Notice["type"];
  publisher_type?: NoticePublisherType;
  publisher_member_uid?: number | null;
  started_at?: string | null;
  ended_at?: string | null;
  is_active: boolean | string | number;
};

type NoticeThumbnailUploadResponse = {
  thumbnail_url: string;
};

type NoticeThumbnailDeleteResponse = {
  deleted: boolean;
  reason?: "referenced";
};

const normalizeActive = (value: NoticePayload["is_active"]) =>
  value === "0" || value === 0 ? "0" : "1";

export async function fetchNotices(options?: { includeInactive?: boolean }) {
  const qs = options?.includeInactive ? "?includeInactive=1" : "";
  return apiFetch<Notice[]>(`/api/notices${qs}`);
}

export async function createNotice(payload: NoticePayload) {
  return apiFetch("/api/notices", {
    method: "POST",
    json: {
      ...payload,
      is_active: normalizeActive(payload.is_active),
    },
  });
}

export async function updateNotice(payload: NoticePayload & { id: number }) {
  return apiFetch("/api/notices", {
    method: "PUT",
    json: {
      ...payload,
      is_active: normalizeActive(payload.is_active),
    },
  });
}

export async function deleteNotice(id: number) {
  return apiFetch(`/api/notices?id=${id}`, { method: "DELETE" });
}

export async function uploadNoticeThumbnail(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch<NoticeThumbnailUploadResponse>("/api/notices/thumbnail", {
    method: "POST",
    body: formData,
  });
}

export async function deleteNoticeThumbnail(thumbnailUrl: string) {
  return apiFetch<NoticeThumbnailDeleteResponse>("/api/notices/thumbnail", {
    method: "DELETE",
    json: { thumbnail_url: thumbnailUrl },
  });
}
