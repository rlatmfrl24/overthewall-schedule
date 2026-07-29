import type { PendingRejectionReasonCode } from "@/features/schedules";

export const REJECTION_REASON_OPTIONS: Array<{
  value: PendingRejectionReasonCode;
  label: string;
}> = [
  { value: "not_needed", label: "일정 반영 불필요" },
  { value: "already_reflected", label: "이미 반영됨" },
  { value: "wrong_match", label: "잘못 매칭됨" },
  { value: "duplicate", label: "중복 후보" },
  { value: "other", label: "기타" },
];
