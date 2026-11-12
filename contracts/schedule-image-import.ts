import type { ScheduleDto } from "./schedules";

export const SCHEDULE_IMAGE_LIMITS = {
  bytes: 10_000_000, rows: 100, inputTokens: 50_000, outputTokens: 12_000,
  timeoutMs: 20_000, dailyReads: 10, monthlyNanoUsd: 500_000_000,
  // Includes the maximum cache-write input premium; ordinary input may cost less.
  reservedNanoUsd: 12_250_000, receiptMs: 86_400_000,
} as const;
export type ScheduleImageReviewField = "member" | "date" | "time" | "status" | "title";
export type ScheduleImageDraftRow = {
  clientId: string; sourceMemberName: string | null; memberUid: number | null;
  date: string | null; sourceDate: string | null; weekday: number | null;
  startTime: string | null; sourceTime: string | null; dateShiftDays: number;
  needsWeekConfirmation: boolean; timeState: "specified" | "undecided" | "unreadable";
  status: "방송" | "휴방" | "게릴라" | null; title: string | null;
  needsReview: ScheduleImageReviewField[];
};
export type ScheduleImageDraft = {
  rows: ScheduleImageDraftRow[]; warnings: string[]; model: "gpt-6-luna";
  usage: { inputTokens: number | null; outputTokens: number | null };
};
export type ScheduleImageContext = { schedules: ScheduleDto[]; expected: string };
export type ScheduleImageChange = {
  clientId: string; id: number | null; startTime: string | null;
  title: string | null; status: "방송" | "휴방" | "게릴라";
};
export type ApplyScheduleImageGroup = {
  operationId: string; memberUid: number; date: string; expected: string;
  changes: ScheduleImageChange[]; confirmedDeletedIds: number[];
};
export type ScheduleImageReceipt = {
  operationId: string; state: "applied"; scheduleIds: number[]; expiresAt: number;
};
