import type { AiReviewUnknownClosure } from '@contracts/content-transition-ai';

export interface AiUnknownTransfer {
  /** Encoded approved projection; the receiver runs its positive decoder. */
  projectedJson: string;
  availableAt: number;
  response: null | { hash: string; recordedAt: number; projectedJson: string };
  closure: AiReviewUnknownClosure | null;
  /** One-way responsibility installation after the verified source stop. */
  handoff?: { fenceHash:string; maintenanceDigest:string; operationId:string; payloadHash:string; sourceSequence:number; generation:number; stageHash:string };
}

/** A separately classified accepted request whose next POST is unissued. */
export interface AiResumeTransfer {
  projectedJson:string;
  availableAt:number;
  handoff:NonNullable<AiUnknownTransfer['handoff']>;
}
