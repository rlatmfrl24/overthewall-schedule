import type { Notice } from "@/db/schema";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export const getTodayKstDateString = (date = new Date()) =>
  new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);

type NoticeVisibilityInput = Pick<Notice, "started_at" | "ended_at"> & {
  is_active?: Notice["is_active"] | number | string | null;
};

const normalizePeriodDate = (value?: string | null) => value?.trim() || null;

export const isNoticeVisibleOnDate = (
  notice: NoticeVisibilityInput,
  today = getTodayKstDateString(),
) => {
  const startedAt = normalizePeriodDate(notice.started_at);
  const endedAt = normalizePeriodDate(notice.ended_at);

  if (
    notice.is_active === false ||
    notice.is_active === 0 ||
    notice.is_active === "0"
  ) {
    return false;
  }
  if (startedAt && startedAt > today) return false;
  if (endedAt && endedAt < today) return false;
  return true;
};
