import type { AiReviewCloseUnknownRequest, AiReviewResult,AiReviewResumeRequest } from '@contracts/otw-play-ai-review';
import type { AiReviewRecord } from './ai-review';

/** An exact admitted continuation readback. Historical rows alone never grant
 * execution or administrative authority. The adapter verifies the current owner. */
export interface AiReviewTransitionReadback {
  state(id: string): Promise<'pending' | 'terminal' | 'transferred' | null>;
  get(id: string): Promise<AiReviewRecord | null>;
  latest(targetKey: string): Promise<AiReviewRecord | null>;
  closeUnknown(id: string, input: AiReviewCloseUnknownRequest, actor: string): Promise<AiReviewRecord>;
  confirmResume?(id:string,input:AiReviewResumeRequest,actor:string):Promise<string>;
  recordedResponse(id: string): Promise<AiReviewRecord | null>;
  finishResponse(id: string, result: AiReviewResult | null): Promise<void>;
}
