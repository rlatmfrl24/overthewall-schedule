import type { PlayWorkBatch, PlayWorkCommand, PlayWorkDisposition, PlayWorkItem, PlayWorkQueue, PlayWorkQueueAction } from "@contracts/otw-play-work-queue";
import type { OtwPlayYouTubePlaylistSummary } from "./youtube-metadata";

export class WorkQueueError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 409) { super(message); this.code=code; this.status=status; }
}
export interface WorkQueueMessage { kind: "otw_play_work_queue"; schemaVersion: 1; target: "queue" | "batch"; id: string }
export interface WorkQueueSource extends PlayWorkQueue {
  pageToken: string | null;
  ownerChannelId: string | null;
  ownerChannelTitle: string | null;
  metadataCheckedAt: number | null;
  actor: string;
}
export interface WorkQueueBatchRecord {
  id: string; queueId: string; jobId: string; aiBatchId: string | null;
  actor: string; status: PlayWorkBatch["status"]; pageToken: string | null;
  scanGeneration: number;
  pageRecorded: boolean; nextPageToken: string | null; version: number;
  completionKey: string | null; startNext: boolean; nextBatchId: string | null; errorMessage: string | null;
}
export interface WorkQueueRepository {
  add(id: string, playlistId: string, url: string, actor: string, now: number): Promise<PlayWorkQueue>;
  sources(): Promise<PlayWorkQueue[]>;
  source(id: string): Promise<WorkQueueSource>;
  commandSource(id: string, action: Exclude<PlayWorkQueueAction,"start">, command: PlayWorkCommand, actor: string, now: number): Promise<void>;
  saveSummary(id: string, token: string, summary: OtwPlayYouTubePlaylistSummary, now: number): Promise<void>;
  reserve(id: string, queueId: string, actor: string, command: PlayWorkCommand, now: number): Promise<WorkQueueBatchRecord>;
  active(): Promise<WorkQueueBatchRecord | null>;
  record(id: string): Promise<WorkQueueBatchRecord>;
  byJob(jobId: string): Promise<WorkQueueBatchRecord | null>;
  items(id: string): Promise<PlayWorkItem[]>;
  deferred(cursor?: string, queueId?: string): Promise<{ items: PlayWorkItem[]; cursor: string | null }>;
  observeSummary(id: string, summary: OtwPlayYouTubePlaylistSummary, now: number): Promise<void>;
  snapshot(id: string, now: number): Promise<void>;
  reviewed(id: string, token: string, aiBatchId: string | null, now: number): Promise<void>;
  disposition(id: string, version: number, disposition: PlayWorkDisposition, reason: string | null, actor: string, now: number): Promise<void>;
  beginCompletion(id: string, actor: string, command: PlayWorkCommand & { startNext: boolean }, now: number): Promise<void>;
  itemError(id: string, message: string | null, now: number): Promise<void>;
  close(id: string, token: string, now: number): Promise<void>;
  linkNext(id: string, nextId: string, now: number): Promise<void>;
  nextSource(): Promise<WorkQueueSource | null>;
  claim(message: WorkQueueMessage, token: string, now: number): Promise<boolean>;
  release(message: WorkQueueMessage, token: string, now: number): Promise<void>;
  failed(message: WorkQueueMessage, token: string, messageText: string, now: number): Promise<void>;
  retryBatch(id: string, command: PlayWorkCommand, actor: string, now: number): Promise<void>;
  pending(now: number): Promise<WorkQueueMessage[]>;
  dispatched(message: WorkQueueMessage, now: number): Promise<void>;
  clearExpired(now: number): Promise<void>;
}
