import type { AiReviewUnknownEvidence } from './otw-play-ai-review';

/** A responsibility disposition, never a successful or failed model result. */
export interface AiReviewUnknownClosure extends AiReviewUnknownEvidence {
  disposition: 'admin_closed_unknown';
  decisionId: string;
  decidedAt: number;
  /** Only an actually confirmed later unissued continuation of this request. */
  continuation?: { executionId:string; confirmationHash:string };
}
export interface AiReviewUnknownDecisionProof {
  closure: AiReviewUnknownClosure;
  decisionHash: string;
}
/** A real original response and completed owning postprocessing, not uncertainty closure. */
export interface AiReviewRecordedCompletion extends AiReviewUnknownEvidence {
  disposition: 'response_consumed';
  responseHash: string;
  resultHash: string;
  status: 'succeeded' | 'partial' | 'failed';
}
export interface AiReviewResumeCompletion {
  disposition:'confirmed_result';
  operationId:string;
  requestHash:string;
  evidenceHash:string;
  executionId:string;
  confirmationHash:string;
  resultHash:string;
  status:'succeeded'|'partial'|'failed';
}
