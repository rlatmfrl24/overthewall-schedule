import type {
  AcceptedOperation, FileIntentEnvelope, IngressReadiness, OperationEnvelope,
  OperationOutcome, SourceFence, TransitionIdentity,
} from "../../../../../contracts/content-transition";

/** Trusted application orchestration supplies receipts read back from the owning persistence port. */
export interface TransitionControlPort {
  readReadiness(transitionId: string): Promise<IngressReadiness | null>;
  acknowledgeIngress(receipt: IngressReadiness, now: number): Promise<void>;
  freeze(transitionId: string, now: number): Promise<SourceFence>;
  installFence(receipt: SourceFence): Promise<void>;
  admit(operation: Omit<AcceptedOperation,"payloadHash"|"expectedState">): Promise<OperationEnvelope>;
  readExecutableCommand(transitionId:string,operationId:string):Promise<Pick<AcceptedOperation,"codec"|"payload">>;
  receiveOperation(envelope: OperationEnvelope): Promise<{ operationId: string; payloadHash: string }>;
  receiveFileIntent(envelope: FileIntentEnvelope): Promise<{ intentId: string; versionKey: string }>;
  recordOutcome(transitionId: string, operationId: string, outcome: OperationOutcome): Promise<void>;
  readTransition(transitionId: string): Promise<TransitionIdentity & { phase: string }>;
}

/** Authentication and external side-effect reconciliation stay at their owning HTTP/Queue/R2 boundaries. */
export interface TransitionProtectionPort {
  protect(identity: TransitionIdentity): Promise<{ receiptId: string; protocol: number; manifestDigest: string }>;
}
