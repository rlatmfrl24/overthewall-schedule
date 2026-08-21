import type {
  OtwPlayCreatePlaylistImportRequest,
  OtwPlayIngestionCandidatePageDto,
  OtwPlayIngestionJobDto,
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
  actorUserId: string;
  input: OtwPlayCreatePlaylistImportRequest;
  preflight: OtwPlayPlaylistPreflightDto;
  now: number;
}

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
}
