import type { Notice } from "./types";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export const getTodayKstDateString = (date = new Date()) =>
  new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);

type NoticeVisibilityInput = Pick<Notice, "started_at" | "ended_at"> & {
  is_active?: Notice["is_active"] | number | string | null;
};

export type NoticePublicationStatus =
  | "published"
  | "scheduled"
  | "expired"
  | "inactive";

const normalizePeriodDate = (value?: string | null) => value?.trim() || null;

export const getNoticePublicationStatus = (
  notice: NoticeVisibilityInput,
  today = getTodayKstDateString(),
): NoticePublicationStatus => {
  const startedAt = normalizePeriodDate(notice.started_at);
  const endedAt = normalizePeriodDate(notice.ended_at);

  if (
    notice.is_active === false ||
    notice.is_active === 0 ||
    notice.is_active === "0"
  ) {
    return "inactive";
  }
  if (startedAt && startedAt > today) return "scheduled";
  if (endedAt && endedAt < today) return "expired";
  return "published";
};

export const isNoticeVisibleOnDate = (
  notice: NoticeVisibilityInput,
  today = getTodayKstDateString(),
) => getNoticePublicationStatus(notice, today) === "published";

export const selectFeaturedNotice = (visibleNotices: Notice[]) =>
  visibleNotices.find((notice) => notice.is_featured !== false) ??
  visibleNotices[0] ??
  null;
