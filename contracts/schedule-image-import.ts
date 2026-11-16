import type { ScheduleDto } from "./schedules";

export const SCHEDULE_IMAGE_MODEL = "gemini-3.5-flash-lite" as const;
export const SCHEDULE_IMAGE_PRICING = { inputNanoUsd: 300, outputNanoUsd: 2_500 } as const;
export const SCHEDULE_IMAGE_DETAIL_REGIONS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
export type ScheduleImageDetailRegion = typeof SCHEDULE_IMAGE_DETAIL_REGIONS[number];
export const SCHEDULE_IMAGE_LIMITS = {
  bytes: 10_000_000, rows: 100, inputTokens: 50_000, outputTokens: 12_000,
  detailBytes: 500_000,
  timeoutMs: 20_000, monthlyNanoUsd: 500_000_000,
  reservedNanoUsd: 50_000 * SCHEDULE_IMAGE_PRICING.inputNanoUsd + 12_000 * SCHEDULE_IMAGE_PRICING.outputNanoUsd,
  receiptMs: 86_400_000,
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
  rows: ScheduleImageDraftRow[]; warnings: string[]; model: typeof SCHEDULE_IMAGE_MODEL;
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
