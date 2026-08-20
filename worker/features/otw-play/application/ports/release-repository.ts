import type {
  OtwPlayAdminReleaseAuditDto,
  OtwPlayAdminReleaseCommandResponse,
  OtwPlayAdminReleaseFlagsDto,
  OtwPlayAdminReleaseStateDto,
  OtwPlayAdminReleaseTransition,
} from "@contracts/otw-play";

export interface ReleaseActor {
  userId: string;
  displayName: string | null;
  ipAddress: string | null;
}

export interface ReleaseExpectedState extends OtwPlayAdminReleaseFlagsDto {
  updatedAt: number;
}

export interface ReleaseUpdateCommand {
  expected: ReleaseExpectedState;
  target: OtwPlayAdminReleaseFlagsDto;
  transition: OtwPlayAdminReleaseTransition;
  actor: ReleaseActor;
  auditId: string;
  changedAt: number;
}

export interface ReleaseDiagnostics {
  rowsRead: number | null;
  rowsWritten: number | null;
}

export type ReleaseUpdateResult =
  | {
      kind: "updated";
      response: OtwPlayAdminReleaseCommandResponse;
      diagnostics: ReleaseDiagnostics;
    }
  | {
      kind: "stale";
      state: OtwPlayAdminReleaseStateDto;
      diagnostics: ReleaseDiagnostics;
    }
  | {
      kind: "policy_unresolved";
      state: OtwPlayAdminReleaseStateDto;
      diagnostics: ReleaseDiagnostics;
    };

export interface ReleaseRepository {
  readState(): Promise<OtwPlayAdminReleaseStateDto>;
  readRecentChanges(limit: number): Promise<OtwPlayAdminReleaseAuditDto[]>;
  update(command: ReleaseUpdateCommand): Promise<ReleaseUpdateResult>;
}

export class ReleaseRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReleaseRepositoryError";
  }
}
