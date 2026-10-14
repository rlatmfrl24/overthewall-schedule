import {
  CONTENT_TRANSITION_PROTOCOL, MANAGED_TRANSITION_MEMBER_CODES,
  type ActivationEvidence, type IngressReadiness, type SourceFence,
  type TerminalOutcome, type TransitionIdentity, type TransitionPhase,
} from "../../../../contracts/content-transition";

const sourcePhases: readonly TransitionPhase[] = ["prepared", "protected", "copying", "replaying", "target_ingress_ready"];
const ingressPhases: readonly TransitionPhase[] = ["target_ingress_ready", "source_fenced", "target_owned", "complete"];
export function canAdmit(side: "source" | "target", phase: TransitionPhase): boolean {
  return (side === "source" ? sourcePhases : ingressPhases).includes(phase);
}
export function canCommit(side: "source" | "target", phase: TransitionPhase, generation: number, futureGeneration: number): boolean {
  return side === "source"
    ? sourcePhases.includes(phase) && generation === futureGeneration - 1
    : (phase === "target_owned" || phase === "complete") && generation === futureGeneration;
}
export function assertSameTransition(expected: TransitionIdentity, actual: TransitionIdentity): void {
  for (const key of ["id", "sourceSite", "targetSite", "sourceResource", "targetResource", "generation", "protocol", "manifestDigest"] as const) {
    if (expected[key] !== actual[key]) throw new Error(`Transition identity mismatch: ${key}`);
  }
  if (actual.protocol !== CONTENT_TRANSITION_PROTOCOL) throw new Error("Incompatible transition protocol");
}
export function assertReadiness(identity: TransitionIdentity, readiness: IngressReadiness | null, now: number): void {
  if (!readiness || !readiness.receiptId || readiness.expiresAt <= now) throw new Error("Missing or expired durable ingress readiness");
  assertSameTransition(identity, readiness);
}
export function assertActivation(identity: TransitionIdentity, evidence: ActivationEvidence): void {
  assertSameTransition(identity, evidence.fence);
  if (evidence.boundary !== evidence.fence.boundary || evidence.checkpointDigest !== evidence.fence.checkpointDigest || !evidence.committedFilesAvailable) {
    throw new Error("Committed state or required files are not installed");
  }
  if (evidence.fence.operationCount!==evidence.transferredOperations || evidence.fence.fileIntentCount!==evidence.transferredFileIntents) {
    throw new Error("Pending envelopes have not been durably transferred");
  }
}
export function canComplete(
  fence: Pick<SourceFence, "operationCount" | "fileIntentCount">,
  operations: readonly { outcome: TerminalOutcome; sideEffectReconciled: boolean; acknowledged:boolean }[],
  files: readonly { outcome: TerminalOutcome; sideEffectReconciled: boolean; acknowledged:boolean }[],
  sourceArchived: boolean,
): boolean {
  const terminal=(row:{outcome:TerminalOutcome;sideEffectReconciled:boolean;acknowledged:boolean})=>["committed","conflicted","failed"].includes(row.outcome) && row.sideEffectReconciled && row.acknowledged;
  return sourceArchived && fence.operationCount===operations.length && fence.fileIntentCount===files.length && operations.every(terminal) && files.every(terminal);
}
export function resolveManagedMembers(members: readonly { code: string; uid: number }[]): { code: string; uid: number }[] {
  const selected = MANAGED_TRANSITION_MEMBER_CODES.map(code => {
    const matches = members.filter(member => member.code === code);
    if (matches.length !== 1 || !Number.isSafeInteger(matches[0].uid)) throw new Error(`Missing or ambiguous managed member: ${code}`);
    return { code, uid: matches[0].uid };
  });
  if (new Set(selected.map(member => member.uid)).size !== selected.length) throw new Error("Duplicate managed member UID");
  return selected;
}
