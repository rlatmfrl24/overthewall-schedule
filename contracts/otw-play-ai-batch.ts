import type { AiReviewKind, AiReviewResult } from "./otw-play-ai-review";

export type AiBatchSelection =
  | { candidates: { id: string; version: number }[] }
  | { filters: { source: "playlist" | "automatic"; jobId?: string; candidateKind?: AiReviewKind } };
export type AiBatchItemStatus = "queued" | "analyzing" | "saving" | "saved" | "needs_selection" | "failed" | "changed";
export const isAiBatchPending = (status: AiBatchItemStatus) => ["queued", "analyzing", "saving"].includes(status);
export const aiBatchStatusLabels: Record<AiBatchItemStatus, string> = {
  queued: "대기", analyzing: "분석 중", saving: "초안 저장 중", saved: "초안 저장", needs_selection: "선택 필요", failed: "실패", changed: "후보 변경됨",
};
export interface AiBatchSummary {
  id: string;
  createdAt: number;
  updatedAt: number;
  total: number;
  counts: Record<AiBatchItemStatus, number>;
}
export interface AiBatchItem {
  id: string;
  batchId: string;
  candidateId: string;
  candidateVersion: number;
  candidateKind: AiReviewKind;
  title: string | null;
  status: AiBatchItemStatus;
  errorMessage: string | null;
  jobId: string | null;
  candidateStatus: string | null;
}
export interface AiBatchDraft {
  itemId: string;
  candidateVersion: number;
  candidateKind: AiReviewKind;
  status: AiBatchItemStatus;
  result: AiReviewResult;
  autoApply: boolean;
}
export interface AiBatchPage {
  batch: AiBatchSummary;
  items: AiBatchItem[];
  nextCursor: string | null;
}
