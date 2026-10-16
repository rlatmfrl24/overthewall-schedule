import type { SourceFence, TransitionPlan } from "../../../../../contracts/content-transition";

/** Copy-time context has no fence and cannot produce final availability proof. */
export interface BaselineFileInventoryContext {
  plan: TransitionPlan;
  manifestRevision: number;
}
export interface FileAvailabilityContext extends BaselineFileInventoryContext {
  fence: SourceFence;
}
/** Final owning verifier reads the actual selected storage bindings. */
export interface CommittedFileAvailability {
  assertAvailable(context: FileAvailabilityContext): Promise<void>;
}
