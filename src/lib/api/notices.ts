import { apiFetch } from "./client";
import type { Notice } from "@/db/schema";

export type NoticePayload = {
  id?: number;
  content: string;
  url?: string | null;
  type: Notice["type"];
  started_at?: string | null;
  ended_at?: string | null;
  is_active: boolean | string | number;
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

