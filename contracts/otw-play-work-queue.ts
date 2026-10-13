import type { AiBatchItemStatus, AiBatchSummary } from "./otw-play-ai-batch";

export type PlayWorkQueueStatus = "checking" | "waiting" | "exhausted" | "failed" | "archived";
export type PlayWorkBatchStatus = "preparing" | "review" | "completing" | "completed";
export type PlayWorkDisposition = "pending" | "deferred" | "excluded" | "duplicate";
export type PlayWorkOutcome = "pending" | "ready" | "registered" | "excluded" | "deferred";
export interface PlayWorkProgress {
  scanGeneration: number;
  total: number | null;
  checkedAt: number | null;
  inspected: number;
  registered: number;
  excluded: number;
  deferred: number;
  ready: number;
  completed: number;
  remaining: number | null;
  uncertain: boolean;
}
export interface PlayWorkQueue {
  id: string;
  playlistId: string;
  url: string;
  title: string | null;
  itemCount: number | null;
  status: PlayWorkQueueStatus;
  errorMessage: string | null;
  version: number;
  createdAt: number;
  counts: { registered: number; excluded: number; deferred: number; inspected: number };
  progress: PlayWorkProgress;
  deferredCount: number;
}
export interface PlayWorkItem {
  id: string;
  batchId: string;
  queueId: string;
  jobId: string;
  playlistTitle: string | null;
  candidateId: string | null;
  candidateVersion: number;
  candidateKind: "official_video" | "singing_clip";
  candidateStatus: string;
  classification: string;
  videoId: string | null;
  playlistItemId: string;
  playlistPosition: number | null;
  outcome: PlayWorkOutcome;
  title: string | null;
  disposition: PlayWorkDisposition;
  reason: string | null;
  errorMessage: string | null;
  version: number;
  aiStatus: AiBatchItemStatus | null;
  pendingProposalId: string | null;
  metadataExpiresAt: number | null;
}
export interface PlayWorkBatch {
  id: string;
  queueId: string;
  jobId: string;
  status: PlayWorkBatchStatus;
  errorMessage: string | null;
  version: number;
  hasMore: boolean;
  continuation?: { requested: boolean; nextBatchId: string | null };
  canComplete: boolean;
  ai: AiBatchSummary | null;
  items: PlayWorkItem[];
  progress: { total: number; handled: number; ready: number; registered: number; excluded: number; deferred: number };
}
export interface PlayWorkQueueOverview {
  queues: PlayWorkQueue[];
  activeBatch: PlayWorkBatch | null;
  deferred: PlayWorkItem[];
  deferredCursor: string | null;
}
export interface PlayWorkCommand { expectedVersion: number; idempotencyKey: string }
export type PlayWorkQueueAction = "start" | "rescan" | "retry" | "archive";
