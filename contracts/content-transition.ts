import type { SiteId } from "./site-definition";

export const CONTENT_TRANSITION_PROTOCOL = 1;
export const MANAGED_TRANSITION_MEMBER_CODES = ["bing_hayu", "u_lili", "yang_mei"] as const;
export type ContentAccess = "normal" | "admin_archive";
export interface HistoricalContentProvenance { sourceSite: SiteId; sourceRecordId: string }
export interface HistoricalPersonCredit extends HistoricalContentProvenance { name: string }
export type HistoricalJsonValue = string | number | boolean | null | HistoricalJsonValue[] | { [key: string]: HistoricalJsonValue };
/** Read-only imported facts. These records never identify a runnable target job or user. */
export interface HistoricalContentMaterial extends HistoricalContentProvenance {
  kind: "origin" | "event" | "review" | "attempt" | "batch" | "job" | "work" | "approval";
  sourceTable: string;
  values: Record<string,HistoricalJsonValue>;
}
export type TransitionPhase = "prepared" | "protected" | "copying" | "replaying" | "target_ingress_ready" | "source_fenced" | "target_owned" | "complete";
export interface TransitionIdentity {
  id: string;
  sourceSite: SiteId;
  targetSite: SiteId;
  sourceResource: string;
  targetResource: string;
  generation: number;
  protocol: number;
  manifestDigest: string;
}
export interface TransitionPlan extends TransitionIdentity {
  /** Reviewed storage declarations, required for committed baseline R2 proof. */
  assetBuckets?: { source: string; target: string };
  fileOrigins?: readonly FileOriginClassification[];
  members: readonly { code: string; uid: number; targetUid: number }[];
  classifications: readonly { table: string; key: string; disposition: "include" | "exclude"; reason: string }[];
}
/** Reviewed absolute file URL authority. Relative owned URLs need no origin. */
export type FileOriginClassification =
  | {kind:"site";origin:string;site:SiteId}
  | {kind:"r2";origin:string;site:SiteId;resource:string}
  | {kind:"external";origin:string;reason:string};
export interface IngressReadiness extends TransitionIdentity { receiptId: string; expiresAt: number }
export interface SourceArchiveReceipt extends TransitionIdentity { boundary:number; archivedRoots:number }
export interface SourceCheckpoint {
  sourceKey: string;
  revision: number;
  state: Readonly<Record<string, string | number | boolean | null>>;
}
export interface SourceFence extends TransitionIdentity {
  boundary: number;
  checkpointDigest: string;
  checkpoints: SourceCheckpoint[];
  operationBoundary: number;
  operationCount:number;
  fileIntentBoundary:number;
  fileIntentCount:number;
}
export interface CommittedStateInstallation { boundary: number; checkpointDigest: string; committedFilesAvailable: boolean }
export interface ActivationEvidence extends CommittedStateInstallation {
  fence: SourceFence;
  transferredOperations:number;
  transferredFileIntents:number;
}
export type TerminalOutcome = "committed" | "conflicted" | "failed";
export interface OperationOutcome { outcome: TerminalOutcome; sideEffectReconciled: boolean; detail: string }
export interface OutcomeReceipt extends TransitionIdentity {
  kind:"operation"|"file"; recordId:string; sourceSequence:number;
  fingerprint:string; outcome:OperationOutcome; outcomeDigest:string;
}
export interface AcceptedOperation {
  codec:{id:string;version:number};
  transitionId: string;
  operationId: string;
  payloadHash: string;
  idempotencyKey: string;
  kind: "content_edit" | "collection_due" | "intentional_removal" | "redaction";
  subject: { table: string; key: string };
  expectedVersion: number | null;
  /** Internally captured schedule business state; null means absent at admission. */
  expectedState: Readonly<Record<string, string | number | null>> | null;
  validation: { contract: number; validatedAt: number };
  payload: Readonly<Record<string, unknown>>;
  admittedAt: number;
}
export interface SideEffectAttempt { identity: string; status: "attempted" | "unknown" | "completed" | "failed" }
export interface SideEffectEvidence { evidenceId:string; attemptIdentity:string; result:"completed"|"failed"|"unknown"; observedAt:number }
export interface ManifestRevision {
  plan:TransitionPlan;
  parent:{revision:number;digest:string};
  revision:number;
  protection:{receiptId:string;protocol:number;manifestDigest:string};
}
export interface OperationEnvelope extends AcceptedOperation {
  generation: number;
  sourceSequence:number|null;
  attempt: SideEffectAttempt | null;
  outcome: OperationOutcome | null;
  /** Exported only from the persisted source fence; early ingress has no seal. */
  sourceFence: SourceFence | null;
}
export interface FileIntent {
  intentId: string;
  logicalKey: string;
  versionKey: string;
  previousVersion: string | null;
  hash: string | null;
  size: number | null;
  status: "intent" | "unknown" | "put_verified" | "reference_committed";
}
export interface FileIntentEnvelope extends FileIntent {
  transitionId: string;
  operationId: string;
  generation: number;
  sourceSequence:number|null;
  outcome: OperationOutcome | null;
  sourceFence: SourceFence | null;
}
/** Emitted by the owning R2/version verifier, never by transport delivery. */
export interface FileObservation {
  transitionId:string; intentId:string; generation:number;
  site:SiteId; resource:string; objectVersion:string|null;
  copiedFromEvidenceId:string|null;
  evidenceId:string; versionKey:string; result:"present"|"absent"|"unknown";
  hash:string|null; size:number|null; observedAt:number;
}
export interface FileReferenceCommit { intentId:string; evidenceId:string }
/** Static ASSETS artifact evidence is deliberately not an R2 upload version. */
export interface StaticFileObservation {
  kind: "static";
  evidenceId: string;
  transitionId: string;
  generation: number;
  manifestDigest: string;
  manifestRevision: number;
  fence: SourceFence;
  site: SiteId;
  resource: string;
  artifactHash: string;
  path: string;
  hash: string;
  size: number;
}
export interface CommittedR2Observation {
  kind: "committed_r2";
  evidenceId: string;
  transitionId: string;
  generation: number;
  manifestDigest: string;
  manifestRevision: number;
  fence: SourceFence;
  site: SiteId;
  resource: string;
  logicalKey: string;
  versionKey: string;
  objectVersion: string;
  hash: string;
  size: number;
}
export interface BaselineFileInventoryRow {kind:"reference"|"object";identity:string;value:string}
export interface BaselineFileInventoryHeader {
  inventoryId:string;plan:TransitionPlan;manifestRevision:number;sourceBoundary:number;
  coverage:readonly string[];rows:number;digest:string;
}
export interface BaselineFileInventoryPage {
  header:BaselineFileInventoryHeader;start:{ordinal:number;digest:string};
  next:{ordinal:number;digest:string};records:readonly BaselineFileInventoryRow[];
}
export interface LegacyR2Observation {
  kind:"legacy_r2";evidenceId:string;inventoryId:string;transitionId:string;
  generation:number;manifestDigest:string;manifestRevision:number;fence:SourceFence;
  site:SiteId;resource:string;logicalKey:string;objectVersion:string;hash:string;size:number;
}
