import type {
  OtwPlayAdminSourceDto,
  OtwPlayAdminSourceHealthDto,
  OtwPlayAdminSourceRecheckResponse,
  OtwPlaySourceAvailabilityStatus,
  OtwPlaySourceHealthRetryCode,
} from "@contracts/otw-play";
import type { OtwPlayYouTubeVideoObservation } from "./youtube-metadata";

export interface SourceHealthTarget extends OtwPlayAdminSourceDto {
  externalChannelId: string;
}

export type SourceHealthActor =
  | { kind: "system" }
  | { kind: "admin" };

export type SourceHealthMutationResult =
  | { kind: "stale" }
  | {
      kind: "applied";
      response: OtwPlayAdminSourceRecheckResponse;
    };

export interface SourceHealthObservationCommand {
  target: SourceHealthTarget;
  observation: OtwPlayYouTubeVideoObservation;
  actor: SourceHealthActor;
  eventId: string;
  checkedAt: number;
  nextCheckAt: number;
}

export interface SourceHealthRetryCommand {
  target: SourceHealthTarget;
  actor: SourceHealthActor;
  eventId: string;
  retryCode: OtwPlaySourceHealthRetryCode;
  nextCheckAt: number;
  now: number;
}

export type SourceHealthRepositoryErrorCode =
  | "not_found"
  | "unavailable";

export class SourceHealthRepositoryError extends Error {
  readonly code: SourceHealthRepositoryErrorCode;

  constructor(code: SourceHealthRepositoryErrorCode, message: string) {
    super(message);
    this.name = "SourceHealthRepositoryError";
    this.code = code;
  }
}

export interface SourceHealthRepository {
  claimDueSources(
    now: number,
    leaseUntil: number,
    limit: number,
  ): Promise<SourceHealthTarget[]>;
  readTarget(sourceId: string): Promise<SourceHealthTarget | null>;
  applyObservation(
    command: SourceHealthObservationCommand,
  ): Promise<SourceHealthMutationResult>;
  scheduleRetry(
    command: SourceHealthRetryCommand,
  ): Promise<SourceHealthMutationResult>;
  readDashboard(
    now: number,
    recentSince: number,
    listLimit: number,
    linkLimit: number,
  ): Promise<OtwPlayAdminSourceHealthDto>;
}

export const isPlayableAvailability = (
  value: OtwPlaySourceAvailabilityStatus,
) => value === "playable";
