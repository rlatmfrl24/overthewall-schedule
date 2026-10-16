import type {SiteId} from '@contracts/site-definition';
import type {TransitionPlan,OperationOutcome} from '@contracts/content-transition';
import type {AiReviewResumeRequest,AiReviewDto,AiReviewResult,AiReviewCloseUnknownRequest} from '@contracts/otw-play-ai-review';
import {parseResumeAiReviewCommand,parseUnknownAiReviewCommand} from '../../otw-play/commands';
import {decodeProjectedRecord,historicalRecordId} from '../domain/projected-content';
import type {AiResumeTransfer} from '../domain/ai-review-continuation';
import {digestText} from './d1-baseline-store';
import {installedSourceAiHandoffSql,type AiUnknownSnapshot} from './ai-review-adoption';
import {D1AiUnknownControl} from './d1-ai-unknown-control';

type Row={source_site:SiteId;target_site:SiteId;generation:number;phase:string;fence_json:string|null;plan_json:string;maintenance_state:string;maintenance_proof_json:string|null;seq:number;source_seq:number|null;operation_generation:number;envelope_json:string;outcome_json:string|null;payload_hash:string};
type OwningBatch=(action:'resume',reviewId:string,statements:D1PreparedStatement[])=>Promise<D1Result[]>;
type ResponseBody={result:AiReviewResult|null;usage:AiReviewDto['usage'];error:{code:string;message:string;retryable:boolean}|null};
type LocalAttempt={identity:string;tokenHash:string;startedAt:number;availableAt:number;response:null|{hash:string;body:ResponseBody;recordedAt:number};settled:boolean;lateResponse?:{hash:string;body:ResponseBody;recordedAt:number}};
const resumeCodecSql="json_extract(o.envelope_json,'$.codec.id') IN ('otw-play.ai.resume','otw-play.ai.unknown')";
// A durable, positively classified old response authorizes only confirmation of
// its next unissued POST. The original command and old attempt remain unchanged.
const resumeReadbackSql=`(json_extract(o.envelope_json,'$.codec.id')='otw-play.ai.resume' OR json_extract(o.envelope_json,'$.codec.id')='otw-play.ai.unknown' AND json_extract(json_extract(o.envelope_json,'$.nativeReceipt.aiUnknown.response.projectedJson'),'$.value.status')='retry_wait')`;

/** A possibly issued adopted continuation is never recovered by the ordinary
 * lease retry. Its exact saved response or explicit decision owns recovery. */
export const aiResumeExecutionHeldSql=(review:string)=>`EXISTS(SELECT 1 FROM content_transition_operations o WHERE ${resumeCodecSql} AND json_extract(o.envelope_json,'$.nativeReceipt.aiResume.confirmation.reviewId')=${review} AND (o.outcome_json IS NOT NULL OR json_type(o.envelope_json,'$.nativeReceipt.aiResume.attempts[#-1]')='object' AND coalesce(json_extract(o.envelope_json,'$.nativeReceipt.aiResume.attempts[#-1].settled'),0)=0))`;
export const aiResumeExecutionPendingSql=(review:string)=>`EXISTS(SELECT 1 FROM content_transition_operations o WHERE ${resumeCodecSql} AND json_extract(o.envelope_json,'$.nativeReceipt.aiResume.confirmation.reviewId')=${review} AND (o.outcome_json IS NULL OR json_extract(o.outcome_json,'$.outcome')='administratively_closed'))`;

/** Only an original accepted, positively classified unissued AI continuation.
 * Installation is one-way from a stopped source; confirmation stays site-private. */
export class D1AiResumeControl {
  private readonly db:D1Database;private readonly site:SiteId;private readonly resource:string;
  constructor(db:D1Database,site:SiteId,resource:string){this.db=db;this.site=site;this.resource=resource;}
  async find(reviewId:string) {
    const rows=(await this.db.prepare(`SELECT o.transition_id,o.operation_id,o.payload_hash,t.local_site=t.target_site target FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE t.local_site=? AND t.local_resource=? AND t.aborted_at IS NULL AND ${resumeReadbackSql} AND json_extract(o.envelope_json,'$.payload.reviewId')=?`).bind(this.site,this.resource,reviewId).all<{transition_id:string;operation_id:string;payload_hash:string;target:number}>()).results;
    if(rows.length>1)throw new Error('Ambiguous original unissued AI responsibility');
    return rows[0]??null;
  }
  async execution(reviewId:string) {
    const found=await this.db.prepare(`SELECT o.transition_id,o.operation_id,o.payload_hash FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE t.local_site=? AND t.local_resource=? AND t.local_site=t.target_site AND t.aborted_at IS NULL AND ${resumeCodecSql} AND json_extract(o.envelope_json,'$.nativeReceipt.aiResume.confirmation.reviewId')=?`).bind(this.site,this.resource,reviewId).first<{transition_id:string;operation_id:string;payload_hash:string}>();
    if(!found)return null;
    const local=await this.local(found.transition_id,found.operation_id,found.payload_hash);
    const attempts=(local.envelope.nativeReceipt.aiResume.attempts??[]) as LocalAttempt[];
    return {...local,...found,attempts,last:attempts.at(-1)??null};
  }
  async beginRequest(reviewId:string,token:string,now:number) {
    const found=await this.execution(reviewId);if(!found)return;
    const hash=await digestText(token),identity=`attempt-${hash}`;
    if(found.last?.identity===identity)throw new Error('Original confirmed POST may already have started');
    if(found.row.outcome_json||found.last&&!found.last.settled||found.attempts.length>=3-Number(found.projected.value.attempts))throw new Error('Confirmed AI responsibility cannot issue another POST');
    const attempt:LocalAttempt={identity,tokenHash:hash,startedAt:now,availableAt:now+240000,response:null,settled:false};
    const previous=found.envelope.nativeReceipt.aiResume;
    await this.db.batch([
      this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM music_ai_reviews r JOIN music_ai_review_attempts a ON a.review_id=r.id AND a.token=r.lease_token WHERE r.id=? AND r.status='running' AND r.lease_token=? AND a.outcome='running'),1,json('ai_resume_claim_changed'))").bind(reviewId,token),
      this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.nativeReceipt.aiResume.attempts',json(?)) WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL AND json_extract(envelope_json,'$.nativeReceipt.aiResume')=json(?) AND EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND local_site=? AND local_resource=? AND phase IN ('target_owned','complete') AND maintenance_state='open' AND aborted_at IS NULL)").bind(JSON.stringify([...found.attempts,attempt]),found.transition_id,found.operation_id,found.payload_hash,JSON.stringify(previous),found.transition_id,this.site,this.resource),
      this.db.prepare("SELECT iif(json_extract(envelope_json,'$.nativeReceipt.aiResume.attempts[#-1].identity')=?,1,json('ai_resume_issuance_race')) FROM content_transition_operations WHERE transition_id=? AND operation_id=?").bind(identity,found.transition_id,found.operation_id),
    ]);
  }
  async retainResponse(reviewId:string,token:string,body:ResponseBody,now:number):Promise<boolean> {
    const found=await this.execution(reviewId);if(!found)return false;
    const last=found.last;if(!last||last.tokenHash!==await digestText(token))throw new Error('Wrong confirmed AI callback');
    // Preserve absence of a response. No automatic replacement POST is allowed.
    if(body.error&&['network','timeout'].includes(body.error.code))return true;
    const response={hash:await digestText(JSON.stringify(body)),body,recordedAt:now};
    if(last.response)return !!found.row.outcome_json;
    const key=found.row.outcome_json?'lateResponse':'response';
    if(last.lateResponse){if(last.lateResponse.hash!==response.hash)throw new Error('Conflicting late AI response');return true;}
    await this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.nativeReceipt.aiResume.attempts[#-1].${key}',json(?)) WHERE transition_id=? AND operation_id=? AND payload_hash=? AND json_extract(envelope_json,'$.nativeReceipt.aiResume.attempts')=json(?) AND outcome_json IS ?`).bind(JSON.stringify(response),found.transition_id,found.operation_id,found.payload_hash,JSON.stringify(found.attempts),found.row.outcome_json).run();
    const actual=await this.execution(reviewId);
    if(actual?.last?.[key]?.hash!==response.hash){if(actual?.row.outcome_json)return this.retainResponse(reviewId,token,body,now);throw new Error('Confirmed AI response persistence race');}
    return key==='lateResponse';
  }
  async finishStatements(reviewId:string,token:string,result:AiReviewResult|null,error:ResponseBody['error'],status:string):Promise<D1PreparedStatement[]|null> {
    const found=await this.execution(reviewId);if(!found)return null;
    if(!found.last?.response||found.last.tokenHash!==await digestText(token)||found.row.outcome_json)throw new Error('Missing confirmed original response');
    const body=found.last.response.body;
    if(JSON.stringify(body.error)!==JSON.stringify(error))throw new Error('Confirmed AI error changed');
    const terminal=['succeeded','partial','failed'].includes(status);
    const completion={disposition:'confirmed_result' as const,operationId:found.operation_id,requestHash:found.command.requestHash,evidenceHash:found.command.evidenceHash,executionId:reviewId,confirmationHash:await digestText(JSON.stringify(found.envelope.nativeReceipt.aiResume.confirmation)),resultHash:await digestText(JSON.stringify({result,error})),status:status as 'succeeded'|'partial'|'failed'};
    const outcome:OperationOutcome|null=terminal?{outcome:status==='failed'?'failed':'committed',sideEffectReconciled:true,detail:'Confirmed original unissued AI and owning result completed',aiResume:completion}:null;
    return [
      this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM content_transition_operations o JOIN music_ai_reviews r ON r.id=? AND r.status='running' AND r.lease_token=? WHERE o.transition_id=? AND o.operation_id=? AND o.payload_hash=? AND o.outcome_json IS NULL AND json_extract(o.envelope_json,'$.nativeReceipt.aiResume.attempts')=json(?)),1,json('ai_resume_result_race'))").bind(reviewId,token,found.transition_id,found.operation_id,found.payload_hash,JSON.stringify(found.attempts)),
      this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.nativeReceipt.aiResume.attempts[#-1].settled',json('true')),attempt_json=?,outcome_json=?,outcome_acknowledged=? WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL AND json_extract(envelope_json,'$.nativeReceipt.aiResume.attempts')=json(?) AND EXISTS(SELECT 1 FROM music_ai_reviews WHERE id=? AND status=? AND lease_token IS NULL)").bind(JSON.stringify({identity:found.last.identity,status:error?'failed':'completed'}),outcome?JSON.stringify(outcome):null,terminal?1:0,found.transition_id,found.operation_id,found.payload_hash,JSON.stringify(found.attempts),reviewId,status),
    ];
  }
  async closeUnknown(reviewId:string,input:AiReviewCloseUnknownRequest,actor:string,now:number) {
    const found=await this.execution(reviewId);if(!found?.last)throw new Error('Missing confirmed AI attempt');
    const {command:c,last}=found;
    if(!actor||input.decision!=='close_unknown'||input.operationId!==found.operation_id||input.attemptId!==last.identity||input.requestHash!==c.requestHash||input.evidenceHash!==c.evidenceHash||input.issuance!=='issued'||last.response||now<last.availableAt)throw new Error('Confirmed AI uncertainty is not eligible');
    const old=found.envelope.nativeReceipt.aiResume.decision;
    if(old){if(old.actorId!==actor||old.requestKey!==input.idempotencyKey)throw new Error('Confirmed AI decision conflict');return;}
    const closure={operationId:found.operation_id,attemptId:last.identity,requestHash:c.requestHash,evidenceHash:c.evidenceHash,issuance:'issued' as const,disposition:'admin_closed_unknown' as const,decisionId:`decision-${await digestText(JSON.stringify([found.operation_id,last.identity,actor,input.idempotencyKey]))}`,decidedAt:now,continuation:{executionId:reviewId,confirmationHash:await digestText(JSON.stringify(found.envelope.nativeReceipt.aiResume.confirmation))}};
    const outcome:OperationOutcome={outcome:'administratively_closed',sideEffectReconciled:true,detail:'Confirmed AI outcome remains unknown; administrator closed recovery responsibility',aiReview:closure};
    await this.db.batch([
      this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.nativeReceipt.aiResume.decision',json(?)),attempt_json=?,outcome_json=?,outcome_acknowledged=1 WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL AND json_extract(envelope_json,'$.nativeReceipt.aiResume.attempts')=json(?) AND EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND local_site=? AND local_resource=? AND maintenance_state='open' AND phase IN ('target_owned','complete') AND aborted_at IS NULL)").bind(JSON.stringify({actorId:actor,requestKey:input.idempotencyKey,closure}),JSON.stringify({identity:last.identity,status:'unknown'}),JSON.stringify(outcome),found.transition_id,found.operation_id,found.payload_hash,JSON.stringify(found.attempts),found.transition_id,this.site,this.resource),
      this.db.prepare("SELECT iif(outcome_json=?,1,json('ai_resume_result_won')) FROM content_transition_operations WHERE transition_id=? AND operation_id=?").bind(JSON.stringify(outcome),found.transition_id,found.operation_id),
    ]);
  }
  async latest(candidateId:string) {
    return (await this.db.prepare(`SELECT json_extract(o.envelope_json,'$.payload.reviewId') id FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE t.local_site=? AND t.local_resource=? AND t.local_site=t.target_site AND t.aborted_at IS NULL AND ${resumeReadbackSql} AND json_extract(o.envelope_json,'$.payload.candidateId')=? ORDER BY o.admitted_at DESC,o.seq DESC`).bind(this.site,this.resource,candidateId).all<{id:string}>()).results;
  }
  async sourceHandedOff(id:string,operationId:string,payloadHash:string) {
    return !!await this.db.prepare(`SELECT 1 FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE o.transition_id=? AND o.operation_id=? AND o.payload_hash=? AND t.local_site=? AND t.local_resource=? AND ${installedSourceAiHandoffSql('o','t')}`).bind(id,operationId,payloadHash,this.site,this.resource).first();
  }
  async authority(id:string,operationId:string,payloadHash:string,role:'source'|'target') {
    const row=await this.db.prepare(`SELECT t.source_site,t.target_site,t.generation,t.phase,t.fence_json,t.plan_json,t.maintenance_state,t.maintenance_proof_json,o.seq,o.source_seq,o.generation operation_generation,o.envelope_json,o.outcome_json,o.payload_hash
      FROM content_transitions t JOIN content_transition_operations o ON o.transition_id=t.id WHERE t.id=? AND o.operation_id=? AND o.payload_hash=? AND t.local_site=? AND t.local_resource=? AND t.aborted_at IS NULL AND ${role==='source'?"json_extract(o.envelope_json,'$.codec.id')='otw-play.ai.resume'":resumeCodecSql}`).bind(id,operationId,payloadHash,this.site,this.resource).first<Row>();
    if(!row||this.site!==(role==='source'?row.source_site:row.target_site)||row.operation_generation!==row.generation-1||role==='source'&&row.source_seq!==null||role==='target'&&(!row.source_seq||!row.fence_json||row.source_seq>JSON.parse(row.fence_json).operationBoundary))throw new Error('Wrong unissued AI control authority');
    const envelope=JSON.parse(row.envelope_json),payload=role==='source'?envelope.sourceCommand?.payload:envelope.payload;
    const known=role==='target'&&envelope.codec.id==='otw-play.ai.unknown'?parseUnknownAiReviewCommand(payload):null;
    const command=known?{...known,action:'adopt_unissued' as const,issuance:'unissued' as const}:parseResumeAiReviewCommand(payload);
    if(!command)throw new Error('Invalid original unissued AI identity');
    return {row,envelope,command};
  }
  private async projected(stage:Pick<AiResumeTransfer,'projectedJson'>,row:Row,reviewId:string,candidateId:string) {
    const plan=JSON.parse(row.plan_json) as TransitionPlan;
    const value=decodeProjectedRecord(JSON.parse(stage.projectedJson),{sourceSite:row.source_site,members:plan.members.map(m=>({uid:m.targetUid,targetUid:m.targetUid,name:m.code,externalEntityId:null}))});
    if(value.destination!=='historical'||value.table!=='music_ai_reviews'||value.sourceSite!==row.source_site||value.sourceRecordId!==await historicalRecordId(row.source_site,'music_ai_reviews',JSON.stringify([reviewId]))||value.value.candidate_id!==candidateId||!['queued','retry_wait'].includes(String(value.value.status))||value.value.result_json!==null||!value.value.input_json||!Number.isSafeInteger(value.value.attempts)||Number(value.value.attempts)<0||Number(value.value.attempts)>=3)throw new Error('Invalid approved unissued AI projection');
    return value;
  }
  private async validate(stage:AiResumeTransfer,row:Row,operationId:string,payloadHash:string) {
    const {handoff,...body}=stage;
    if(Object.keys(stage).sort().join(',')!=='availableAt,handoff,projectedJson'||typeof stage.projectedJson!=='string'||!Number.isSafeInteger(stage.availableAt)||stage.availableAt<0||!handoff||Object.keys(handoff).sort().join(',')!=='fenceHash,generation,maintenanceDigest,operationId,payloadHash,sourceSequence,stageHash'||!row.fence_json||handoff.fenceHash!==await digestText(row.fence_json)||handoff.maintenanceDigest!==JSON.parse(row.fence_json).maintenanceDigest||!/^[a-f0-9]{64}$/.test(handoff.maintenanceDigest)||handoff.operationId!==operationId||handoff.payloadHash!==payloadHash||handoff.sourceSequence!==row.source_seq||handoff.generation!==row.generation||handoff.stageHash!==await digestText(JSON.stringify(body)))throw new Error('Invalid stopped unissued AI installation');
  }
  async transfer(id:string,operationId:string,payloadHash:string):Promise<AiResumeTransfer> {
    const {row,envelope,command}=await this.authority(id,operationId,payloadHash,'source');
    const snapshot=envelope.sourceReceipt?.aiReview as AiUnknownSnapshot|undefined;
    if(!snapshot||await digestText(JSON.stringify([snapshot.review,snapshot.attempts]))!==command.evidenceHash||snapshot.response||snapshot.decision)throw new Error('Original unissued AI evidence changed');
    const saved=envelope.sourceReceipt.aiReview.resumeHandoff as AiResumeTransfer|undefined;if(saved)return saved;
    if(!row.fence_json||row.phase!=='source_fenced'||row.maintenance_state!=='stopped'||!row.maintenance_proof_json)throw new Error('Unissued AI requires the final source stop');
    const fence=JSON.parse(row.fence_json);
    if(fence.maintenanceDigest!==await digestText(row.maintenance_proof_json)||row.seq>fence.operationBoundary)throw new Error('Wrong unissued AI stop evidence');
    if(await this.db.prepare('SELECT 1 FROM music_ai_review_batch_items WHERE review_id=?').bind(command.reviewId).first())throw new Error('Original AI parent must be reconciled before standalone handoff');
    const body={projectedJson:JSON.stringify(snapshot.projected),availableAt:snapshot.leaseUntil};
    await this.projected(body,row,command.reviewId,command.candidateId);
    const stage:AiResumeTransfer={...body,handoff:{fenceHash:await digestText(row.fence_json),maintenanceDigest:fence.maintenanceDigest,operationId,payloadHash,sourceSequence:row.seq,generation:row.generation,stageHash:await digestText(JSON.stringify(body))}};
    await this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.sourceReceipt.aiReview.resumeHandoff',json(?)) WHERE transition_id=? AND operation_id=? AND payload_hash=? AND json_extract(envelope_json,'$.sourceReceipt.aiReview')=json(?) AND outcome_json IS NULL AND EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND local_site=? AND local_resource=? AND generation=? AND phase='source_fenced' AND maintenance_state='stopped' AND maintenance_proof_json=? AND fence_json=?)").bind(JSON.stringify(stage),id,operationId,payloadHash,JSON.stringify(snapshot),id,this.site,this.resource,row.generation,row.maintenance_proof_json,row.fence_json).run();
    const actual=await this.db.prepare("SELECT json_extract(envelope_json,'$.sourceReceipt.aiReview.resumeHandoff') value FROM content_transition_operations WHERE transition_id=? AND operation_id=?").bind(id,operationId).first<string>('value');
    if(actual!==JSON.stringify(stage))throw new Error('Unissued AI sealing race');
    return stage;
  }
  async install(id:string,operationId:string,payloadHash:string,stage:AiResumeTransfer) {
    const {row,command,envelope}=await this.authority(id,operationId,payloadHash,'target');
    await this.validate(stage,row,operationId,payloadHash);await this.projected(stage,row,command.reviewId,command.candidateId);
    const old=envelope.nativeReceipt?.aiResume?.stage;
    if(old&&JSON.stringify(old)!==JSON.stringify(stage))throw new Error('Original unissued AI stage changed');
    await this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.nativeReceipt.aiResume.stage',json(?)) WHERE transition_id=? AND operation_id=? AND payload_hash=? AND json_type(envelope_json,'$.nativeReceipt.aiResume.stage') IS NULL AND EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND local_site=? AND local_resource=? AND phase IN ('source_fenced','target_owned','complete') AND fence_json=? AND aborted_at IS NULL)").bind(JSON.stringify(stage),id,operationId,payloadHash,id,this.site,this.resource,row.fence_json).run();
    const actual=await this.db.prepare("SELECT json_extract(envelope_json,'$.nativeReceipt.aiResume.stage') value FROM content_transition_operations WHERE transition_id=? AND operation_id=?").bind(id,operationId).first<string>('value');
    if(actual!==JSON.stringify(stage))throw new Error('Unissued AI installation readback mismatch');
  }
  async local(id:string,operationId:string,payloadHash:string) {
    const state=await this.authority(id,operationId,payloadHash,'target');
    if(!['target_owned','complete'].includes(state.row.phase)||state.row.maintenance_state!=='open')throw new Error('Unissued AI is not installed and activated');
    let stage=state.envelope.nativeReceipt?.aiResume?.stage as AiResumeTransfer|undefined,stagePath='$.nativeReceipt.aiResume.stage',stageJson:string;
    if(state.envelope.codec.id==='otw-play.ai.unknown') {
      const original=await new D1AiUnknownControl(this.db,this.site,this.resource).localStage(id,operationId,payloadHash);
      if(!original?.response||original.closure||!original.handoff)throw new Error('Original retry response is not installed');
      const v=JSON.parse(original.response.projectedJson).value;
      if(v.status!=='retry_wait'||!['provider_rate_limit','provider_unavailable'].includes(v.error_code)||!Number.isSafeInteger(v.next_retry_at))throw new Error('Original response does not authorize an unissued retry');
      const body={projectedJson:original.response.projectedJson,availableAt:v.next_retry_at as number};
      stage={...body,handoff:{...original.handoff,stageHash:await digestText(JSON.stringify([body,original.response.hash]))}};
      stagePath='$.nativeReceipt.aiUnknown';stageJson=JSON.stringify(original);
    } else {
      if(!stage)throw new Error('Original unissued AI stage is absent');
      await this.validate(stage,state.row,operationId,payloadHash);stageJson=JSON.stringify(stage);
    }
    return {...state,stage,stagePath,stageJson,projected:await this.projected(stage,state.row,state.command.reviewId,state.command.candidateId)};
  }
  async acknowledge(id:string,operationId:string,payloadHash:string) {
    const found=await this.local(id,operationId,payloadHash);
    if(!found.row.outcome_json)throw new Error('Original confirmed AI responsibility is unfinished');
    const outcome=JSON.parse(found.row.outcome_json) as OperationOutcome,receipt=found.envelope.nativeReceipt.aiResume;
    if(!outcome.sideEffectReconciled||(outcome.aiReview?JSON.stringify(outcome.aiReview)!==JSON.stringify(receipt.decision?.closure):!outcome.aiResume||outcome.aiResume.executionId!==receipt.confirmation?.reviewId||outcome.aiResume.confirmationHash!==await digestText(JSON.stringify(receipt.confirmation))))throw new Error('Missing original confirmed AI result');
    if(!await this.db.prepare('SELECT 1 FROM content_transition_operations WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json=? AND outcome_acknowledged=1').bind(id,operationId,payloadHash,found.row.outcome_json).first())throw new Error('Missing atomic confirmed AI acknowledgement');
  }
  async confirm(id:string,operationId:string,payloadHash:string,input:AiReviewResumeRequest,actor:string,now:number,batch:OwningBatch) {
    const {row,envelope,command,stage,stagePath,stageJson,projected}=await this.local(id,operationId,payloadHash),value=projected.value;
    if(!actor||input.decision!=='resume_unissued'||input.operationId!==operationId||(['attemptId','requestHash','evidenceHash','issuance'] as const).some(key=>input[key]!==command[key]))throw new Error('Unissued AI confirmation identity mismatch');
    const prior=envelope.nativeReceipt.aiResume?.confirmation;
    if(prior){if(prior.actorId!==actor||prior.requestKey!==input.idempotencyKey)throw new Error('Unissued AI confirmation conflict');return String(prior.reviewId);}
    if(row.outcome_json||Number(value.expires_at)<=now)throw new Error('Original AI continuation has expired or completed');
    const reviewId=`resume-${await digestText(JSON.stringify([operationId,stage.handoff.stageHash]))}`;
    const confirmation={actorId:actor,requestKey:input.idempotencyKey,reviewId,confirmedAt:now};
    const targetKey=JSON.stringify([command.candidateId,command.videoId,value.candidate_kind,value.range_json]);
    await batch('resume',reviewId,[
      this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id JOIN music_ingestion_candidates c ON c.id=? AND c.external_video_id=? AND c.content_access='normal' AND c.status NOT IN ('converted','ignored') WHERE o.transition_id=? AND o.operation_id=? AND o.payload_hash=? AND o.outcome_json IS NULL AND json_extract(o.envelope_json,?)=json(?) AND json_type(o.envelope_json,'$.nativeReceipt.aiResume.confirmation') IS NULL AND t.local_site=? AND t.local_resource=? AND t.generation=? AND t.phase IN ('target_owned','complete') AND t.maintenance_state='open' AND t.aborted_at IS NULL),1,json('ai_resume_confirmation_race'))").bind(command.candidateId,command.videoId,id,operationId,payloadHash,stagePath,stageJson,this.site,this.resource,row.generation),
      this.db.prepare("INSERT INTO music_ai_reviews(id,candidate_id,video_id,candidate_kind,range_json,target_key,input_hash,input_json,model,prompt_version,status,attempts,next_retry_at,created_at,updated_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,'queued',?,?,?,?,?)").bind(reviewId,command.candidateId,command.videoId,value.candidate_kind,JSON.stringify(value.range_json),targetKey,await digestText(JSON.stringify([command.requestHash,value.input_json,value.model])),JSON.stringify(value.input_json),value.model,value.prompt_version,value.attempts,stage.availableAt,now,now,value.expires_at),
      this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.nativeReceipt.aiResume.confirmation',json(?)) WHERE transition_id=? AND operation_id=? AND payload_hash=?").bind(JSON.stringify(confirmation),id,operationId,payloadHash),
    ]);
    return reviewId;
  }
}
