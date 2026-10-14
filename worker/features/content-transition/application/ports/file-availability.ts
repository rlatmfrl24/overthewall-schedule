import type { SourceFence, TransitionPlan } from "../../../../../contracts/content-transition";

export interface FileAvailabilityContext {
  plan: TransitionPlan;
  manifestRevision: number;
  fence: SourceFence;
}
/** Final owning verifier reads the actual selected storage bindings. */
export interface CommittedFileAvailability {
  assertAvailable(context: FileAvailabilityContext): Promise<void>;
}
