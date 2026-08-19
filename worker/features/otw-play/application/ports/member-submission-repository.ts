import type {
  OtwPlayCreateSubmissionRequest,
  OtwPlayMemberSubmissionDto,
  OtwPlaySubmissionPreflightDto,
} from "@contracts/otw-play";
import type { MemberSubmissionCursor } from "../../domain/member-submission-cursor";

export type MemberSubmissionRepositoryErrorCode =
  | "not_found"
  | "duplicate"
  | "idempotency_conflict"
  | "rate_limited"
  | "unavailable"
  | "invalid_request";

export class MemberSubmissionRepositoryError extends Error {
  readonly code: MemberSubmissionRepositoryErrorCode;

  constructor(code: MemberSubmissionRepositoryErrorCode, message: string) {
    super(message);
    this.name = "MemberSubmissionRepositoryError";
    this.code = code;
  }
}

export interface CreateMemberSubmissionCommand {
  userId: string;
  proposalId: string;
  input: OtwPlayCreateSubmissionRequest;
  videoId: string;
  canonicalUrl: string;
  now: number;
  dayStart: number;
  dayEnd: number;
}

export interface MemberSubmissionRepository {
  preflight(
    userId: string,
    videoId: string,
    title: string | null,
  ): Promise<Omit<OtwPlaySubmissionPreflightDto, "videoId" | "canonicalUrl" | "thumbnailUrl">>;
  create(
    command: CreateMemberSubmissionCommand,
  ): Promise<{ data: OtwPlayMemberSubmissionDto; idempotentReplay: boolean }>;
  listMine(
    userId: string,
    limit: number,
    cursor: MemberSubmissionCursor | null,
  ): Promise<{ items: OtwPlayMemberSubmissionDto[]; hasMore: boolean }>;
  readMine(userId: string, proposalId: string): Promise<OtwPlayMemberSubmissionDto>;
}
