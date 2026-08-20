import type {
  OtwPlayAdminReleaseCommandResponse,
  OtwPlayAdminReleaseConfirmation,
  OtwPlayAdminReleaseReadResponse,
  OtwPlayAdminReleaseRequest,
  OtwPlayAdminReleaseTransition,
} from "@contracts/otw-play";
import type {
  ReleaseActor,
  ReleaseDiagnostics,
  ReleaseRepository,
} from "./ports/release-repository";

export type ReleaseServiceErrorCode =
  | "invalid_request"
  | "stale_write"
  | "policy_unresolved";

export class ReleaseServiceError extends Error {
  readonly code: ReleaseServiceErrorCode;
  readonly fields?: Record<string, string>;

  constructor(
    code: ReleaseServiceErrorCode,
    message: string,
    fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "ReleaseServiceError";
    this.code = code;
    this.fields = fields;
  }
}

type TransitionPolicy = {
  transition: OtwPlayAdminReleaseTransition;
  confirmation: OtwPlayAdminReleaseConfirmation;
};

const transitionFor = (
  input: OtwPlayAdminReleaseRequest,
): TransitionPolicy | null => {
  const current = input.expected;
  const target = input.target;
  if (!current.publicReadEnabled && !current.navigationVisible) {
    if (target.publicReadEnabled && !target.navigationVisible) {
      return {
        transition: "enable_public_read",
        confirmation: "direct_routes_verified",
      };
    }
    return null;
  }
  if (current.publicReadEnabled && !current.navigationVisible) {
    if (target.publicReadEnabled && target.navigationVisible) {
      return {
        transition: "enable_navigation",
        confirmation: "public_canary_verified",
      };
    }
    if (!target.publicReadEnabled && !target.navigationVisible) {
      return { transition: "rollback_all", confirmation: "rollback_reviewed" };
    }
    return null;
  }
  if (current.publicReadEnabled && current.navigationVisible) {
    if (target.publicReadEnabled && !target.navigationVisible) {
      return {
        transition: "disable_navigation",
        confirmation: "rollback_reviewed",
      };
    }
    if (!target.publicReadEnabled && !target.navigationVisible) {
      return { transition: "rollback_all", confirmation: "rollback_reviewed" };
    }
  }
  return null;
};

export class ReleaseService {
  private readonly repository: ReleaseRepository;
  private readonly createId: () => string;
  private readonly clock: () => number;

  constructor(
    repository: ReleaseRepository,
    createId: () => string = () => crypto.randomUUID(),
    clock: () => number = Date.now,
  ) {
    this.repository = repository;
    this.createId = createId;
    this.clock = clock;
  }

  async read(): Promise<OtwPlayAdminReleaseReadResponse> {
    const [data, recentChanges] = await Promise.all([
      this.repository.readState(),
      this.repository.readRecentChanges(20),
    ]);
    return { data, recentChanges };
  }

  async update(
    input: OtwPlayAdminReleaseRequest,
    actor: ReleaseActor,
  ): Promise<{
    response: OtwPlayAdminReleaseCommandResponse;
    diagnostics: ReleaseDiagnostics;
  }> {
    if (input.expected.navigationVisible && !input.expected.publicReadEnabled) {
      throw new ReleaseServiceError(
        "invalid_request",
        "Expected release flags are invalid",
        { expected: "navigation_requires_public_read" },
      );
    }
    if (input.target.navigationVisible && !input.target.publicReadEnabled) {
      throw new ReleaseServiceError(
        "invalid_request",
        "Target release flags are invalid",
        { target: "navigation_requires_public_read" },
      );
    }
    const policy = transitionFor(input);
    if (!policy) {
      throw new ReleaseServiceError(
        "invalid_request",
        "Release transition is not allowed",
        { target: "transition_not_allowed" },
      );
    }
    if (input.confirmation !== policy.confirmation) {
      throw new ReleaseServiceError(
        "invalid_request",
        "Release confirmation does not match the transition",
        { confirmation: "mismatch" },
      );
    }
    const now = this.clock();
    const changedAt = Math.max(now, input.expected.updatedAt + 1);
    const result = await this.repository.update({
      expected: input.expected,
      target: input.target,
      transition: policy.transition,
      actor,
      auditId: this.createId(),
      changedAt,
    });
    if (result.kind === "stale") {
      throw new ReleaseServiceError(
        "stale_write",
        "Release state changed before this command completed",
      );
    }
    if (result.kind === "policy_unresolved") {
      throw new ReleaseServiceError(
        "policy_unresolved",
        "Catalog and public read-model revisions must match before enabling public access",
      );
    }
    return { response: result.response, diagnostics: result.diagnostics };
  }
}
