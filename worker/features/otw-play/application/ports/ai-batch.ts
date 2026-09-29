import type { AiBatchDraft, AiBatchItem, AiBatchPage, AiBatchSelection, AiBatchSummary } from "@contracts/otw-play-ai-batch";
import type { AiReviewResult } from "@contracts/otw-play-ai-review";

export interface AiBatchWork extends AiBatchItem {
  actor: string;
  reviewId: string | null;
  generation: number;
  result: AiReviewResult | null;
}
export interface AiBatchRepository {
  preview(selection: AiBatchSelection): Promise<number>;
  create(id: string, actor: string, key: string, selection: AiBatchSelection, now: number): Promise<AiBatchSummary>;
  list(): Promise<AiBatchSummary[]>;
  get(id: string, cursor?: string): Promise<AiBatchPage>;
  draft(candidateId: string): Promise<AiBatchDraft | null>;
  claim(id: string, token: string, now: number): Promise<AiBatchWork | null>;
  current(item: AiBatchWork): Promise<boolean>;
  attach(id: string, token: string, reviewId: string, now: number, waiting?: { message: string | null; retryAt: number | null }): Promise<void>;
  capture(id: string, token: string, result: AiReviewResult, now: number): Promise<void>;
  finish(id: string, token: string, status: AiBatchItem["status"], message: string | null, now: number): Promise<void>;
  release(id: string, token: string, now: number): Promise<void>;
  pending(now: number, batchId?: string): Promise<string[]>;
  retry(id: string, now: number): Promise<void>;
  dead(id: string, now: number): Promise<void>;
}
