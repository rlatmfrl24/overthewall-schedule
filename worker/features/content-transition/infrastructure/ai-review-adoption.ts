import type { ProjectedRecord } from '../domain/projected-content';
import type { AiReviewUnknownClosure } from '@contracts/content-transition-ai';

// Exact installed columns. These private snapshots retain the original claim;
// they are not copied into a target execution row or exported as actor authority.
const reviewColumns=['id','candidate_id','video_id','candidate_kind','range_json','target_key','input_hash','input_json','model','prompt_version','status','result_json','usage_json','attempts','lease_token','lease_until','next_retry_at','error_code','error_message','created_at','updated_at','expires_at'];
const attemptColumns=['token','review_id','started_at','finished_at','outcome','usage_json'];
const jsonObject=(columns:string[],alias:string)=>`json_object(${columns.map(c=>`'${c}',${alias}.${c}`).join(',')})`;
export const aiReviewSnapshotSql=`SELECT ${jsonObject(reviewColumns,'r')} value FROM music_ai_reviews r WHERE r.id=?`;
export const aiAttemptSnapshotSql=`SELECT coalesce(json_group_array(json(value)),'[]') value FROM (SELECT ${jsonObject(attemptColumns,'a')} value FROM music_ai_review_attempts a WHERE a.review_id=? ORDER BY a.started_at,a.token)`;
export const releasedSourceAiRetrySql=(o:string,t:string)=>`${t}.local_site=${t}.source_site AND ${t}.aborted_at IS NOT NULL AND ${t}.maintenance_state='open' AND json_extract(${t}.installation_json,'$.kind')='target_aborted' AND json_extract(${o}.envelope_json,'$.sourceReceipt.aiReview.retryReleased.responseHash')=json_extract(${o}.envelope_json,'$.sourceReceipt.aiReview.response.hash') AND json_type(${o}.envelope_json,'$.sourceReceipt.aiReview.retryReleased')='object'`;
export const preparedAiScopeSql=(transition:string,review:string)=>`EXISTS(SELECT 1 FROM content_transition_prepared_validation_membership m WHERE m.transition_id=${transition} AND m.row_table='music_ai_reviews' AND m.row_key=json_array(${review}))`;
export const adoptedAiHeldSql=(review:string)=>`EXISTS(SELECT 1 FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id
  WHERE t.local_site=t.source_site AND o.source_seq IS NULL AND o.generation=t.generation-1
    AND json_extract(o.envelope_json,'$.codec.id') IN ('otw-play.ai.unknown','otw-play.ai.resume')
    AND json_extract(o.envelope_json,'$.sourceCommand.payload.reviewId')=${review}
    AND json_extract(o.envelope_json,'$.sourceReceipt.aiReview.review') IS (${aiReviewSnapshotSql.replace('r.id=?',`r.id=${review}`)})
    AND json_extract(o.envelope_json,'$.sourceReceipt.aiReview.attempts') IS (${aiAttemptSnapshotSql.replace('a.review_id=?',`a.review_id=${review}`)}))`;
/** A source delivery may stop only after the target's actual activation receipt.
 * This says responsibility was transferred, never that the model succeeded. */
export const installedSourceAiHandoffSql=(o:string,t:string)=>{
  const proof=(codec:string,path:string)=>`json_extract(${o}.envelope_json,'$.codec.id')='${codec}'
    AND json_extract(${o}.envelope_json,'${path}.operationId')=${o}.operation_id
    AND json_extract(${o}.envelope_json,'${path}.payloadHash')=${o}.payload_hash
    AND json_extract(${o}.envelope_json,'${path}.sourceSequence')=${o}.seq
    AND json_extract(${o}.envelope_json,'${path}.generation')=${t}.generation
    AND json_extract(${o}.envelope_json,'${path}.maintenanceDigest')=json_extract(${t}.fence_json,'$.maintenanceDigest')`;
  return `${t}.local_site=${t}.source_site AND ${t}.phase='source_fenced' AND ${t}.maintenance_state='open' AND ${t}.aborted_at IS NULL
    AND json_extract(${t}.installation_json,'$.kind')='target_activated'
    AND json_extract(${t}.installation_json,'$.fence.maintenanceDigest')=json_extract(${t}.fence_json,'$.maintenanceDigest')
    AND ${o}.source_seq IS NULL AND ((${proof('otw-play.ai.unknown','$.sourceReceipt.aiReview.handoff.handoff')}) OR (${proof('otw-play.ai.resume','$.sourceReceipt.aiReview.resumeHandoff.handoff')}))`;
};
export interface AiUnknownSnapshot {
  review: string;
  attempts: string;
  projected: ProjectedRecord;
  leaseUntil: number;
  response: null | { hash: string; recordedAt: number };
  responseBody?: string;
  result?: { projectedJson: string; responseHash: string; resultHash: string };
  lateResponse?: { hash: string; recordedAt: number; body: string };
  handoff?: import('../domain/ai-review-continuation').AiUnknownTransfer;
  decision: null | { closure: AiReviewUnknownClosure; actorId: string | null; requestKey: string | null };
}
export type { AiUnknownTransfer } from '../domain/ai-review-continuation';
/** The existing application composition root supplies the owning scanner. This
 * boundary only adopts existing rows; it never invokes a provider or waits for it. */
export interface AiReviewAdoption {
  adoptPending(transitionId: string, adoptUnknown: (reviewId: string) => Promise<void>): Promise<void>;
}
