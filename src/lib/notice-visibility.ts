import type { Notice } from "@/db/schema";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export const getTodayKstDateString = (date = new Date()) =>
  new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);

export const isNoticeVisibleOnDate = (
  notice: Pick<Notice, "is_active" | "started_at" | "ended_at">,
  today = getTodayKstDateString(),
) => {
  if (notice.is_active === false) return false;
  if (notice.started_at && notice.started_at > today) return false;
  if (notice.ended_at && notice.ended_at < today) return false;
  return true;
};
