import type {
  OtwPlayCreatePlaylistImportRequest,
  OtwPlayIngestionConversionOutcome,
  OtwPlayIngestionCandidatePageDto,
  OtwPlayIngestionCandidateStatus,
  OtwPlayIngestionJobDto,
  OtwPlayIngestionReviewCandidateDto,
  OtwPlayIngestionItemFilters,
  OtwPlayIngestionReviewInput,
  OtwPlayPlaylistPreflightDto,
} from "@contracts/otw-play";
import type { IngestionItemCursor } from "../../domain/ingestion-cursor";
import type {
  OtwPlayYouTubePlaylistPage,
  OtwPlayYouTubeVideoObservation,
} from "./youtube-metadata";

export type IngestionRepositoryErrorCode =
  | "not_found"
  | "idempotency_conflict"
  | "stale_message"
  | "validation_failed"
  | "unavailable";

export class IngestionRepositoryError extends Error {
  readonly code: IngestionRepositoryErrorCode;

  constructor(code: IngestionRepositoryErrorCode, message: string) {
    super(message);
    this.name = "IngestionRepositoryError";
    this.code = code;
  }
}

export interface OtwPlayIngestionQueueMessage {
  schemaVersion: 1;
  jobId: string;
  idempotencyKey: string;
}

export interface IngestionMessageRecord {
  jobId: string;
  idempotencyKey: string;
  kind: "playlist_page" | "video_batch";
  pageToken: string | null;
  videoIds: string[];
  status: "pending" | "completed" | "failed";
  attempts: number;
}

export interface CreateIngestionJobCommand {
  jobId: string;
  eventId?: string;
  actorUserId: string;
  input: OtwPlayCreatePlaylistImportRequest;
  preflight: OtwPlayPlaylistPreflightDto;
  now: number;
}

export type IngestionReviewCandidate = OtwPlayIngestionReviewCandidateDto;

export interface IngestionRepository {
  findPreviousImport(
    playlistId: string,
  ): Promise<OtwPlayPlaylistPreflightDto["previousImport"]>;
  createJob(
    command: CreateIngestionJobCommand,
  ): Promise<{ job: OtwPlayIngestionJobDto; message: OtwPlayIngestionQueueMessage }>;
  getJob(jobId: string): Promise<OtwPlayIngestionJobDto>;
  listItems(
    jobId: string,
    limit: number,
    cursor: IngestionItemCursor | null,
    filters: OtwPlayIngestionItemFilters,
  ): Promise<{ page: OtwPlayIngestionCandidatePageDto; hasMore: boolean }>;
  readMessage(idempotencyKey: string): Promise<IngestionMessageRecord>;
  recordPlaylistPage(
    message: IngestionMessageRecord,
    page: OtwPlayYouTubePlaylistPage,
    now: number,
  ): Promise<OtwPlayIngestionQueueMessage[]>;
  recordVideoBatch(
    message: IngestionMessageRecord,
    observations: OtwPlayYouTubeVideoObservation[],
    now: number,
  ): Promise<void>;
  recordMessageFailure(
    idempotencyKey: string,
    errorCode: string,
    nextRetryAt: number | null,
    now: number,
  ): Promise<void>;
  markMessageDeadLetter(
    idempotencyKey: string,
    errorCode: string,
    now: number,
  ): Promise<void>;
  listPendingMessages(now: number, limit: number): Promise<OtwPlayIngestionQueueMessage[]>;
  clearExpiredApiData(now: number, limit: number): Promise<number>;
  readReviewCandidate(jobId: string | null, candidateId: string): Promise<IngestionReviewCandidate>;
  saveCandidateReview(command: {
    candidateId: string;
    expectedVersion: number;
    expectedReviewInput?: OtwPlayIngestionReviewInput | null;
    expectedReviewStatus?: OtwPlayIngestionCandidateStatus;
    input: OtwPlayIngestionReviewInput;
    actorUserId: string;
    eventId: string;
    now: number;
  }): Promise<IngestionReviewCandidate>;
  ignoreCandidate(command: {
    candidateId: string;
    expectedVersion: number;
    actorUserId: string;
    eventId: string;
    now: number;
  }): Promise<IngestionReviewCandidate>;
  refreshCandidateMetadata(command: {
    candidateId: string;
    expectedVersion: number;
    observation: OtwPlayYouTubeVideoObservation;
    actorUserId: string;
    eventId: string;
    now: number;
  }): Promise<IngestionReviewCandidate>;
  recordConversionOutcome(command: {
    jobId: string;
    candidateId: string;
    expectedVersion: number;
    outcome: Exclude<OtwPlayIngestionConversionOutcome, "created">;
    performanceId: string | null;
    errorCode: string | null;
    actorUserId: string;
    eventId: string;
    now: number;
  }): Promise<Exclude<OtwPlayIngestionConversionOutcome, "created">>;
  retryJob(command: {
    jobId: string;
    actorUserId: string;
    eventId: string;
    now: number;
  }): Promise<OtwPlayIngestionQueueMessage[]>;
}
