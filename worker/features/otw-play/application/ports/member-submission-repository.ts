import type {
  OtwPlayCreateSubmissionRequest,
  OtwPlayMemberSubmissionDto,
  OtwPlaySubmissionPreflightDto,
  OtwPlayUpdateSubmissionRequest,
} from "@contracts/otw-play";
import type { MemberSubmissionCursor } from "../../domain/member-submission-cursor";

export type MemberSubmissionRepositoryErrorCode =
  | "not_found"
  | "duplicate"
  | "stale_write"
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

export interface UpdateMemberSubmissionCommand {
  userId: string;
  proposalId: string;
  eventId: string;
  input: OtwPlayUpdateSubmissionRequest;
  videoId: string;
  canonicalUrl: string;
  now: number;
}

export interface WithdrawMemberSubmissionCommand {
  userId: string;
  proposalId: string;
  eventId: string;
  expectedVersion: number;
  now: number;
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
  findReplay(
    userId: string,
    input: OtwPlayCreateSubmissionRequest,
    canonicalUrl: string,
  ): Promise<{ data: OtwPlayMemberSubmissionDto; idempotentReplay: true } | null>;
  listMine(
    userId: string,
    limit: number,
    cursor: MemberSubmissionCursor | null,
  ): Promise<{ items: OtwPlayMemberSubmissionDto[]; hasMore: boolean }>;
  readMine(userId: string, proposalId: string): Promise<OtwPlayMemberSubmissionDto>;
  update(command: UpdateMemberSubmissionCommand): Promise<OtwPlayMemberSubmissionDto>;
  withdraw(command: WithdrawMemberSubmissionCommand): Promise<OtwPlayMemberSubmissionDto>;
}
