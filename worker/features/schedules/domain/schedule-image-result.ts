import type { ScheduleImageDraft, ScheduleImageDraftRow, ScheduleImageReviewField } from "../../../../contracts/schedule-image-import";
import { SCHEDULE_IMAGE_LIMITS } from "../../../../contracts/schedule-image-import";
import { isIsoDate } from "./schedule-input";

export type ImageScheduleMember = { uid: number; name: string };
const text = (v: unknown, max = 500): v is string | null => v === null || (typeof v === "string" && v.length <= max);
export function parseScheduleImageResult(value: unknown, members: ImageScheduleMember[] = []): ScheduleImageDraft | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.overflow !== false || !Array.isArray(v.rows) || v.rows.length > SCHEDULE_IMAGE_LIMITS.rows ||
    !Array.isArray(v.warnings) || v.warnings.length > 20 || !v.warnings.every(w => typeof w === "string" && w.length <= 500)) return null;
  const rows: ScheduleImageDraftRow[] = [];
  for (const [index, raw] of v.rows.entries()) {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    if (!text(r.sourceMemberName, 100) || !text(r.sourceDate, 100) || !text(r.title) || !text(r.time, 100) ||
      (r.date !== null && !isIsoDate(r.date)) ||
      (r.weekday !== null && (!Number.isInteger(r.weekday) || Number(r.weekday) < 1 || Number(r.weekday) > 7)) ||
      !["specified", "undecided", "unreadable"].includes(String(r.timeState)) ||
      ![null, "방송", "휴방", "게릴라"].includes(r.status as string | null)) return null;
    const matches = members.filter(m => m.name === r.sourceMemberName);
    const memberUid = matches.length === 1 ? matches[0].uid : null;
    const needsReview: ScheduleImageReviewField[] = [];
    if (memberUid === null) needsReview.push("member");
    let date = r.date as string | null;
    if (date === null) needsReview.push("date");
    let startTime: string | null = null;
    let dateShiftDays = 0;
    if (r.timeState === "specified") {
      if (typeof r.time !== "string" || !/^(?:[0-3]\d):[0-5]\d$/.test(r.time)) return null;
      const hour = Number(r.time.slice(0, 2));
      dateShiftDays = Math.floor(hour / 24);
      startTime = `${String(hour % 24).padStart(2, "0")}${r.time.slice(2)}`;
      if (date && dateShiftDays) {
        const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + dateShiftDays);
        date = d.toISOString().slice(0, 10);
      }
    } else if (r.timeState === "unreadable" && r.status !== "휴방" && r.status !== "게릴라") needsReview.push("time");
    if (r.status === null) needsReview.push("status");
    rows.push({ clientId: `image-${index}`, sourceMemberName: r.sourceMemberName as string | null, memberUid, date,
      sourceDate: r.sourceDate as string | null, weekday: r.weekday as number | null,
      startTime, sourceTime: r.time as string | null, dateShiftDays, needsWeekConfirmation: r.date === null,
      timeState: r.timeState as ScheduleImageDraftRow["timeState"], status: r.status as ScheduleImageDraftRow["status"],
      title: r.title as string | null, needsReview });
  }
  return { rows, warnings: v.warnings as string[], model: "gpt-6-luna", usage: { inputTokens: null, outputTokens: null } };
}
