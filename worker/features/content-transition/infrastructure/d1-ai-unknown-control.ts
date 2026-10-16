import type { SiteId } from '@contracts/site-definition';
import type { AiReviewCloseUnknownRequest } from '@contracts/otw-play-ai-review';
import type { AiReviewDto,AiReviewResult } from '@contracts/otw-play-ai-review';
import type { AiReviewUnknownClosure, AiReviewUnknownDecisionProof } from '@contracts/content-transition-ai';
import { parseUnknownAiReviewCommand } from '../../otw-play/commands';
import { decodeProjectedRecord, historicalRecordId, projectCapturedRecord } from '../domain/projected-content';
import type { TransitionPlan } from '@contracts/content-transition';
import { digestText } from './d1-baseline-store';
import { assertOperationEvidence } from './command-codecs';
import { aiReviewSnapshotSql, aiAttemptSnapshotSql, installedSourceAiHandoffSql, releasedSourceAiRetrySql, type AiUnknownSnapshot, type AiUnknownTransfer } from './ai-review-adoption';
import { readProjectionContext } from './d1-projection-context';
import { historicalStatements } from './historical-statements';
import type { OperationOutcome } from '@contracts/content-transition';

const sourceCompletionSql="(phase IN ('protected','copying','replaying','target_ingress_ready') AND aborted_at IS NULL AND fence_json IS NULL OR aborted_at IS NOT NULL AND maintenance_state='open' AND json_extract(installation_json,'$.kind')='target_aborted')";
type Row={aborted_at:number|null;installation_json:string|null;source_site:SiteId;target_site:SiteId;generation:number;phase:string;fence_json:string|null;plan_json:string;maintenance_state:string;maintenance_proof_json:string|null;seq:number;source_seq:number|null;operation_generation:number;envelope_json:string;outcome_json:string|null;payload_hash:string};
/** The single original source CAS for this exact non-repeatable POST uncertainty.
 * Target administrator identities never leave its private decision receipt. */
export class D1AiUnknownControl {
  private readonly db:D1Database;private readonly site:SiteId;private readonly resource:string;
  constructor(db:D1Database,site:SiteId,resource:string){this.db=db;this.site=site;this.resource=resource;}
  private projected(raw:unknown,row:Row) {
    const plan=JSON.parse(row.plan_json) as TransitionPlan;
    return decodeProjectedRecord(raw,{sourceSite:row.source_site,members:plan.members.map(m=>({uid:m.targetUid,targetUid:m.targetUid,name:m.code,externalEntityId:null}))});
  }
  async authority(id:string,operationId:string,payloadHash:string,role:'source'|'target') {
    const row=await this.db.prepare(`SELECT t.aborted_at,t.installation_json,t.source_site,t.target_site,t.generation,t.phase,t.fence_json,t.plan_json,t.maintenance_state,t.maintenance_proof_json,o.seq,o.source_seq,o.generation operation_generation,o.envelope_json,o.outcome_json,o.payload_hash
      FROM content_transitions t JOIN content_transition_operations o ON o.transition_id=t.id WHERE t.id=? AND o.operation_id=? AND o.payload_hash=? AND t.local_site=? AND t.local_resource=? AND json_extract(o.envelope_json,'$.codec.id')='otw-play.ai.unknown'`).bind(id,operationId,payloadHash,this.site,this.resource).first<Row>();
    if(!row||row.aborted_at!==null&&(role==='target'||JSON.parse(row.installation_json??'{}').kind!=='target_aborted')||this.site!==(role==='source'?row.source_site:row.target_site)||row.operation_generation!==row.generation-1||role==='source'&&row.source_seq!==null||role==='target'&&(!row.source_seq||!row.fence_json||row.source_seq>JSON.parse(row.fence_json).operationBoundary)) throw new Error('Wrong original AI control authority');
    const envelope=JSON.parse(row.envelope_json),command=parseUnknownAiReviewCommand(role==='source'?envelope.sourceCommand?.payload:envelope.payload);
    if(!command) throw new Error('Invalid original AI control command');
    return {row,envelope,command};
  }
  async transfer(id:string,operationId:string,payloadHash:string):Promise<AiUnknownTransfer> {
    const {row,envelope,command}=await this.authority(id,operationId,payloadHash,'source');
    const snapshot=envelope.sourceReceipt?.aiReview as AiUnknownSnapshot|undefined;
    if(!snapshot||await digestText(JSON.stringify([snapshot.review,snapshot.attempts]))!==command.evidenceHash) throw new Error('Missing immutable original AI evidence');
    if(snapshot.handoff) return snapshot.handoff;
    snapshot.projected=this.projected(snapshot.projected,row);
    if(snapshot.projected.table!=='music_ai_reviews'||snapshot.projected.sourceSite!==row.source_site||snapshot.projected.sourceRecordId!==await historicalRecordId(row.source_site,'music_ai_reviews',JSON.stringify([command.reviewId]))||snapshot.projected.value.candidate_id!==command.candidateId) throw new Error('AI projection is outside its admitted subject');
    let response:AiUnknownTransfer['response']=null;
    if(snapshot.response) {
      if(!snapshot.responseBody||await digestText(snapshot.responseBody)!==snapshot.response.hash) throw new Error('Original AI response hash mismatch');
      const body=JSON.parse(snapshot.responseBody),review=JSON.parse(snapshot.review);
      const status=body.error?body.error.retryable&&review.attempts<3?'retry_wait':'failed':body.result?.videoAnalyzed?'succeeded':'partial';
      const boundary=row.fence_json?JSON.parse(row.fence_json).boundary:await this.db.prepare('SELECT max(seq) n FROM content_transition_commits WHERE transition_id=? AND sealed=1').bind(id).first<number>('n');
      const projected=await projectCapturedRecord('music_ai_reviews',JSON.stringify([command.reviewId]),{...review,status,result_json:body.result?JSON.stringify(body.result):null,error_code:body.error?.code??null,error_message:body.error?.message??null,updated_at:snapshot.response.recordedAt,next_retry_at:status==='retry_wait'?snapshot.response.recordedAt+30000*2**(review.attempts-1):null},await readProjectionContext(this.db,JSON.parse(row.plan_json),boundary));
      if(!projected||projected.destination!=='historical') throw new Error('Original AI response has no approved projection');
      if(snapshot.result) {
        const final=this.projected(JSON.parse(snapshot.result.projectedJson),row);
        if(snapshot.result.responseHash!==snapshot.response.hash||await digestText(snapshot.result.projectedJson)!==snapshot.result.resultHash||final.table!==projected.table||final.sourceRecordId!==projected.sourceRecordId||final.value.status!==status||final.value.candidate_id!==command.candidateId) throw new Error('Original completed AI result mismatch');
        response={...snapshot.response,projectedJson:snapshot.result.projectedJson};
      } else response={...snapshot.response,projectedJson:JSON.stringify(projected)};
    }
    const stage:AiUnknownTransfer={projectedJson:JSON.stringify(snapshot.projected),availableAt:snapshot.leaseUntil,response,closure:snapshot.decision?.closure??null};
    if(!row.fence_json||row.aborted_at!==null)return stage;
    const fence=JSON.parse(row.fence_json);
    if(row.phase!=='source_fenced'||row.maintenance_state!=='stopped'||!row.maintenance_proof_json||fence.maintenanceDigest!==await digestText(row.maintenance_proof_json)||row.seq>fence.operationBoundary) throw new Error('AI responsibility requires the verified final source stop');
    // Batch completion is a distinct original responsibility. Do not hand off
    // this standalone adapter while a live parent still needs reconciliation.
    if(await this.db.prepare('SELECT 1 FROM music_ai_review_batch_items WHERE review_id=?').bind(command.reviewId).first()) throw new Error('Original AI batch responsibility must reconcile before standalone handoff');
    stage.handoff={fenceHash:await digestText(row.fence_json),maintenanceDigest:fence.maintenanceDigest,operationId,payloadHash,sourceSequence:row.seq,generation:row.generation,stageHash:await digestText(JSON.stringify(stage))};
    await this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.sourceReceipt.aiReview.handoff',json(?)) WHERE transition_id=? AND operation_id=? AND payload_hash=? AND json_extract(envelope_json,'$.sourceReceipt.aiReview')=json(?) AND EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND phase='source_fenced' AND maintenance_state='stopped' AND maintenance_proof_json=? AND fence_json=? AND local_site=? AND local_resource=? AND generation=?)")
      .bind(JSON.stringify(stage),id,operationId,payloadHash,JSON.stringify(snapshot),id,row.maintenance_proof_json,row.fence_json,this.site,this.resource,row.generation).run();
    const sealed=await this.db.prepare("SELECT json_extract(envelope_json,'$.sourceReceipt.aiReview.handoff') value FROM content_transition_operations WHERE transition_id=? AND operation_id=?").bind(id,operationId).first<string>('value');
    if(sealed)return JSON.parse(sealed) as AiUnknownTransfer;
    throw new Error('Original AI response changed before responsibility sealing; retry authoritative state');
  }
  private async validateHandoff(stage:AiUnknownTransfer,row:Row,operationId:string,payloadHash:string) {
    const {handoff,...body}=stage;
    if(!handoff||Object.keys(handoff).sort().join(',')!=='fenceHash,generation,maintenanceDigest,operationId,payloadHash,sourceSequence,stageHash'||!row.fence_json||handoff.fenceHash!==await digestText(row.fence_json)||handoff.maintenanceDigest!==JSON.parse(row.fence_json).maintenanceDigest||!/^[a-f0-9]{64}$/.test(handoff.maintenanceDigest)||handoff.operationId!==operationId||handoff.payloadHash!==payloadHash||handoff.sourceSequence!==row.source_seq||handoff.generation!==row.generation||handoff.stageHash!==await digestText(JSON.stringify(body))) throw new Error('Invalid stopped AI responsibility installation');
  }
  async localStage(id:string,operationId:string,payloadHash:string):Promise<AiUnknownTransfer|null> {
    const {row,envelope}=await this.authority(id,operationId,payloadHash,'target');
    const stage=envelope.nativeReceipt?.aiUnknown as AiUnknownTransfer|undefined;
    if(!stage?.handoff)return null;
    await this.validateHandoff(stage,row,operationId,payloadHash);
    if(!['target_owned','complete'].includes(row.phase)) throw new Error('AI responsibility installation is not activated');
    return stage;
  }
  async sourceHandedOff(id:string,operationId:string,payloadHash:string):Promise<boolean> {
    return !!await this.db.prepare(`SELECT 1 FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE o.transition_id=? AND o.operation_id=? AND o.payload_hash=? AND t.local_site=? AND t.local_resource=? AND ${installedSourceAiHandoffSql('o','t')}`).bind(id,operationId,payloadHash,this.site,this.resource).first();
  }
  async install(id:string,operationId:string,payloadHash:string,transfer:AiUnknownTransfer) {
    const {row,command}=await this.authority(id,operationId,payloadHash,'target');
    if(!transfer||Object.keys(transfer).sort().join(',')!==(transfer.handoff?'availableAt,closure,handoff,projectedJson,response':'availableAt,closure,projectedJson,response')||typeof transfer.projectedJson!=='string'||transfer.response&&
      (Object.keys(transfer.response).sort().join(',')!=='hash,projectedJson,recordedAt'||!/^[a-f0-9]{64}$/.test(transfer.response.hash)||!Number.isSafeInteger(transfer.response.recordedAt)||transfer.response.recordedAt<0||typeof transfer.response.projectedJson!=='string')) throw new Error('Invalid AI continuation fields');
    if(transfer.closure) {
      assertOperationEvidence({attempt:{identity:command.attemptId,status:'unknown'},outcome:{outcome:'administratively_closed',sideEffectReconciled:true,detail:'AI explicit closure',aiReview:transfer.closure}});
      if(transfer.closure.operationId!==operationId||(['attemptId','requestHash','evidenceHash','issuance'] as const).some(key=>transfer.closure![key]!==command[key])) throw new Error('Wrong original AI closure');
    }
    const projected=this.projected(JSON.parse(transfer.projectedJson),row);
    if(projected.table!=='music_ai_reviews'||projected.sourceSite!==row.source_site||projected.sourceRecordId!==await historicalRecordId(row.source_site,'music_ai_reviews',JSON.stringify([command.reviewId]))||projected.value.candidate_id!==command.candidateId||!Number.isSafeInteger(transfer.availableAt)||transfer.availableAt<0) throw new Error('Invalid approved AI continuation readback');
    if(transfer.response) {
      const result=this.projected(JSON.parse(transfer.response.projectedJson),row);
      if(transfer.closure||result.table!==projected.table||result.sourceSite!==projected.sourceSite||result.sourceRecordId!==projected.sourceRecordId||result.value.candidate_id!==command.candidateId||result.value.video_id!==command.videoId||!['succeeded','partial','retry_wait','failed'].includes(String(result.value.status))) throw new Error('Invalid original recorded AI response');
    }
    await this.validateHandoff(transfer,row,operationId,payloadHash);
    const prior=await this.db.prepare("SELECT json_extract(envelope_json,'$.nativeReceipt.aiUnknown') value FROM content_transition_operations WHERE transition_id=? AND operation_id=?").bind(id,operationId).first<string>('value');
    if(prior) {
      const saved=JSON.parse(prior) as AiUnknownTransfer;
      if(JSON.stringify(saved)!==JSON.stringify(transfer)) throw new Error('Original AI stage changed');
    }
    await this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.nativeReceipt.aiUnknown',json(?)) WHERE transition_id=? AND operation_id=? AND payload_hash=? AND json_extract(envelope_json,'$.nativeReceipt.aiUnknown') IS ? AND EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND local_site=? AND local_resource=? AND phase IN ('source_fenced','target_owned','complete'))").bind(JSON.stringify(transfer),id,operationId,payloadHash,prior,id,this.site,this.resource).run();
    const actual=await this.db.prepare("SELECT json_extract(envelope_json,'$.nativeReceipt.aiUnknown') value FROM content_transition_operations WHERE transition_id=? AND operation_id=?").bind(id,operationId).first<string>('value');
    if(actual!==JSON.stringify(transfer)) throw new Error('AI continuation readback race');
  }
  async prepareDecision(id:string,operationId:string,payloadHash:string,input:AiReviewCloseUnknownRequest,actor:string,now:number):Promise<AiReviewUnknownDecisionProof> {
    const {row,envelope,command}=await this.authority(id,operationId,payloadHash,'target');
    const stage=envelope.nativeReceipt?.aiUnknown as AiUnknownTransfer|undefined;
    if(!await this.localStage(id,operationId,payloadHash))throw new Error('Original AI responsibility has not been installed locally');
    if(!actor||!stage||stage.response||now<stage.availableAt||!['target_owned','complete'].includes(row.phase)||input.decision!=='close_unknown'||input.operationId!==operationId||(['attemptId','requestHash','evidenceHash','issuance'] as const).some(key=>input[key]!==command[key])) throw new Error('Original AI uncertainty is not eligible for this decision');
    const decisionHash=await digestText(JSON.stringify(input)),prior=envelope.nativeReceipt?.aiDecision;
    if(prior) {
      if(prior.actorId!==actor||prior.requestKey!==input.idempotencyKey||prior.proof.decisionHash!==decisionHash) throw new Error('AI decision identity conflict');
      return prior.proof;
    }
    const closure:AiReviewUnknownClosure={operationId,attemptId:command.attemptId,requestHash:command.requestHash,evidenceHash:command.evidenceHash,issuance:command.issuance,disposition:'admin_closed_unknown',decisionId:`decision-${await digestText(JSON.stringify([operationId,actor,input.idempotencyKey]))}`,decidedAt:now};
    const proof={closure,decisionHash};
    await this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.nativeReceipt.aiDecision',json(?)) WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL AND json_type(envelope_json,'$.nativeReceipt.aiDecision') IS NULL AND json_extract(envelope_json,'$.nativeReceipt.aiUnknown')=json(?) AND EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND local_site=? AND local_resource=? AND phase='target_owned')").bind(JSON.stringify({actorId:actor,requestKey:input.idempotencyKey,proof}),id,operationId,payloadHash,JSON.stringify(stage),id,this.site,this.resource).run();
    return this.decisionProof(id,operationId,payloadHash);
  }
  async finishResponse(id:string,operationId:string,payloadHash:string,result:AiReviewResult|null) {
    const {row,envelope,command}=await this.authority(id,operationId,payloadHash,'target'),stage=envelope.nativeReceipt?.aiUnknown as AiUnknownTransfer|undefined;
    if(!await this.localStage(id,operationId,payloadHash))throw new Error('Original AI responsibility has not been installed locally');
    if(!stage?.response||stage.closure||envelope.nativeReceipt?.aiDecision||row.phase!=='target_owned') throw new Error('Original response is not ready for owning completion');
    const original=this.projected(JSON.parse(stage.response.projectedJson),row),status=original.value.status;
    if(!['succeeded','partial','failed'].includes(String(status))||status==='failed'&&result!==null||status!=='failed'&&!result) throw new Error('Original retry responsibility is incomplete');
    const final=this.projected({...original,value:{...original.value,result_json:result}},row),projectedJson=JSON.stringify(final),resultHash=await digestText(projectedJson);
    const completion={operationId,attemptId:command.attemptId,requestHash:command.requestHash,evidenceHash:command.evidenceHash,issuance:command.issuance,disposition:'response_consumed' as const,responseHash:stage.response.hash,resultHash,status:status as 'succeeded'|'partial'|'failed'};
    const outcome:OperationOutcome={outcome:status==='failed'?'failed':'committed',sideEffectReconciled:true,detail:'Original AI response and owning follow-up completed',aiReviewResult:completion};
    const attempt={identity:command.attemptId,status:status==='failed'?'failed':'completed'};
    if(row.outcome_json) {
      if(row.outcome_json!==JSON.stringify(outcome)) throw new Error('Original AI result changed');
      return;
    }
    await this.db.batch([
      this.db.prepare("SELECT iif(EXISTS(SELECT 1 FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id JOIN music_ingestion_candidates c ON c.id=? AND c.external_video_id=? AND c.content_access='normal' WHERE o.transition_id=? AND o.operation_id=? AND o.payload_hash=? AND o.outcome_json IS NULL AND json_extract(o.envelope_json,'$.nativeReceipt.aiUnknown')=json(?) AND json_type(o.envelope_json,'$.nativeReceipt.aiDecision') IS NULL AND t.phase='target_owned' AND t.local_site=? AND t.local_resource=? AND t.generation=? AND t.plan_json=?),1,json('ai_response_owner_changed'))").bind(command.candidateId,command.videoId,id,operationId,payloadHash,JSON.stringify(stage),this.site,this.resource,row.generation,row.plan_json),
      ...historicalStatements(this.db,original,[{table:'music_ingestion_candidates',key:JSON.stringify([command.candidateId])}]),
      this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.nativeReceipt.aiResult',json(?)),attempt_json=?,outcome_json=? WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL").bind(JSON.stringify({projectedJson,responseHash:stage.response.hash,resultHash}),JSON.stringify(attempt),JSON.stringify(outcome),id,operationId,payloadHash),
    ]);
  }
  async sourceResponse(id:string,operationId:string,payloadHash:string,result:AiReviewResult|null) {
    const {row,envelope,command}=await this.authority(id,operationId,payloadHash,'source'),snapshot=envelope.sourceReceipt?.aiReview as AiUnknownSnapshot|undefined;
    if(!snapshot?.response||snapshot.decision||!snapshot.responseBody||row.aborted_at===null&&(!!row.fence_json||!['protected','copying','replaying','target_ingress_ready'].includes(row.phase))) throw new Error('Original source response is not ready for completion');
    const stage=await this.transfer(id,operationId,payloadHash),original=this.projected(JSON.parse(stage.response!.projectedJson),row),status=original.value.status;
    if(!['succeeded','partial','failed'].includes(String(status))||status==='failed'&&result!==null||status!=='failed'&&!result) throw new Error('Original AI retry remains pending');
    const review=JSON.parse(snapshot.review),body=JSON.parse(snapshot.responseBody),now=snapshot.response.recordedAt;
    const boundary=await this.db.prepare('SELECT max(seq) n FROM content_transition_commits WHERE transition_id=? AND sealed=1').bind(id).first<number>('n');
    if(boundary===null) throw new Error('Missing original source capture boundary');
    const final=await projectCapturedRecord('music_ai_reviews',JSON.stringify([command.reviewId]),{...review,status,result_json:result?JSON.stringify(result):null,error_code:body.error?.code??null,error_message:body.error?.message??null,updated_at:now,next_retry_at:null},await readProjectionContext(this.db,JSON.parse(row.plan_json),boundary));
    if(!final||final.destination!=='historical') throw new Error('Original source result has no approved projection');
    const projectedJson=JSON.stringify(final),resultHash=await digestText(projectedJson);
    const completion={operationId,attemptId:command.attemptId,requestHash:command.requestHash,evidenceHash:command.evidenceHash,issuance:command.issuance,disposition:'response_consumed' as const,responseHash:snapshot.response.hash,resultHash,status:status as 'succeeded'|'partial'|'failed'};
    const outcome:OperationOutcome={outcome:status==='failed'?'failed':'committed',sideEffectReconciled:true,detail:'Original AI response and owning follow-up completed',aiReviewResult:completion};
    return {review,body,now,status,statements:[
      this.db.prepare(`SELECT iif(((${aiReviewSnapshotSql}) IS ?) AND ((${aiAttemptSnapshotSql}) IS ?) AND EXISTS(SELECT 1 FROM content_transition_operations WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL AND json_extract(envelope_json,'$.sourceReceipt.aiReview')=json(?)),1,json('ai_original_result_race'))`).bind(command.reviewId,snapshot.review,command.reviewId,snapshot.attempts,id,operationId,payloadHash,JSON.stringify(snapshot)),
      this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.sourceReceipt.aiReview.result',json(?)),attempt_json=?,outcome_json=? WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL").bind(JSON.stringify({projectedJson,responseHash:snapshot.response.hash,resultHash}),JSON.stringify({identity:command.attemptId,status:status==='failed'?'failed':'completed'}),JSON.stringify(outcome),id,operationId,payloadHash),
    ]};
  }
  async sourceRetryReleased(reviewId:string) {
    return !!await this.db.prepare(`SELECT 1 FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE t.local_site=? AND t.local_resource=? AND json_extract(o.envelope_json,'$.codec.id')='otw-play.ai.unknown' AND json_extract(o.envelope_json,'$.sourceCommand.payload.reviewId')=? AND ${releasedSourceAiRetrySql('o','t')}`).bind(this.site,this.resource,reviewId).first();
  }
  async sourceRetry(id:string,operationId:string,payloadHash:string) {
    const {row,envelope,command}=await this.authority(id,operationId,payloadHash,'source'),snapshot=envelope.sourceReceipt?.aiReview as AiUnknownSnapshot|undefined;
    if(row.aborted_at===null||row.maintenance_state!=='open'||JSON.parse(row.installation_json??'{}').kind!=='target_aborted'||!snapshot?.response||!snapshot.responseBody||snapshot.decision||row.outcome_json)throw new Error('Original retry requires verified source restoration');
    if(await digestText(snapshot.responseBody)!==snapshot.response.hash)throw new Error('Original retry response changed');
    const review=JSON.parse(snapshot.review),body=JSON.parse(snapshot.responseBody),now=snapshot.response.recordedAt;
    if(body.result!==null||!body.error?.retryable||!['provider_rate_limit','provider_unavailable'].includes(body.error.code)||review.attempts>=3)throw new Error('Original response is not a known unissued retry');
    return [
      this.db.prepare(`SELECT iif(((${aiReviewSnapshotSql}) IS ?) AND ((${aiAttemptSnapshotSql}) IS ?) AND EXISTS(SELECT 1 FROM content_transition_operations WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL AND json_extract(envelope_json,'$.sourceReceipt.aiReview')=json(?)),1,json('ai_original_retry_race'))`).bind(command.reviewId,snapshot.review,command.reviewId,snapshot.attempts,id,operationId,payloadHash,JSON.stringify(snapshot)),
      this.db.prepare("UPDATE music_ai_review_attempts SET finished_at=?,outcome=?,usage_json=? WHERE token=? AND EXISTS(SELECT 1 FROM music_ai_reviews WHERE id=? AND lease_token=? AND status='running')").bind(now,body.error.code,body.usage?JSON.stringify(body.usage):null,review.lease_token,command.reviewId,review.lease_token),
      this.db.prepare("UPDATE music_ai_reviews SET status='retry_wait',error_code=?,error_message=?,next_retry_at=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=? AND status='running'").bind(body.error.code,body.error.message,now+30000*2**(review.attempts-1),now,command.reviewId,review.lease_token),
      this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.sourceReceipt.aiReview.retryReleased',json(?)) WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL").bind(JSON.stringify({responseHash:snapshot.response.hash,reviewId:command.reviewId,releasedAt:Date.now()}),id,operationId,payloadHash),
    ];
  }
  async closeSourceDecision(id:string,operationId:string,payloadHash:string,input:AiReviewCloseUnknownRequest,actor:string,now:number) {
    const {row,envelope,command}=await this.authority(id,operationId,payloadHash,'source'),snapshot=envelope.sourceReceipt?.aiReview as AiUnknownSnapshot|undefined;
    if(!actor||!snapshot||snapshot.response||now<snapshot.leaseUntil||row.aborted_at===null&&!['protected','copying','replaying','target_ingress_ready'].includes(row.phase)||input.decision!=='close_unknown'||input.operationId!==operationId||(['attemptId','requestHash','evidenceHash','issuance'] as const).some(key=>input[key]!==command[key])) throw new Error('Original source AI uncertainty is not eligible');
    if(snapshot.decision) {if(snapshot.decision.actorId!==actor||snapshot.decision.requestKey!==input.idempotencyKey) throw new Error('AI decision identity conflict');return;}
    const closure:AiReviewUnknownClosure={operationId,attemptId:command.attemptId,requestHash:command.requestHash,evidenceHash:command.evidenceHash,issuance:command.issuance,disposition:'admin_closed_unknown',decisionId:`decision-${await digestText(JSON.stringify([operationId,actor,input.idempotencyKey]))}`,decidedAt:now};
    const outcome={outcome:'administratively_closed',sideEffectReconciled:true,detail:'Administrator closed unknown AI recovery responsibility; model outcome remains unknown',aiReview:closure};
    await this.db.batch([
      this.db.prepare(`SELECT iif(((${aiReviewSnapshotSql}) IS ?) AND ((${aiAttemptSnapshotSql}) IS ?),1,json('ai_original_result_won'))`).bind(command.reviewId,snapshot.review,command.reviewId,snapshot.attempts),
      this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.sourceReceipt.aiReview.decision',json(?)),outcome_json=? WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL AND json_extract(envelope_json,'$.sourceReceipt.aiReview')=json(?) AND EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND ${sourceCompletionSql} AND local_site=? AND local_resource=? AND generation=? AND plan_json=?)`).bind(JSON.stringify({closure,actorId:actor,requestKey:input.idempotencyKey}),JSON.stringify(outcome),id,operationId,payloadHash,JSON.stringify(snapshot),id,this.site,this.resource,row.generation,row.plan_json),
      this.db.prepare("SELECT iif(outcome_json=?,1,json('ai_source_closure_race')) FROM content_transition_operations WHERE transition_id=? AND operation_id=?").bind(JSON.stringify(outcome),id,operationId),
    ]);
  }
  async decisionProof(id:string,operationId:string,payloadHash:string):Promise<AiReviewUnknownDecisionProof> {
    const {row,envelope}=await this.authority(id,operationId,payloadHash,'target'),decision=envelope.nativeReceipt?.aiDecision;
    if(!decision?.actorId||!decision.requestKey||!decision.proof||!['target_owned','complete'].includes(row.phase)) throw new Error('No actual target administrator decision receipt');
    return decision.proof;
  }
  async finishDecision(id:string,operationId:string,payloadHash:string) {
    const {row,envelope,command}=await this.authority(id,operationId,payloadHash,'target'),stage=envelope.nativeReceipt?.aiUnknown as AiUnknownTransfer|undefined,proof=await this.decisionProof(id,operationId,payloadHash);
    const local=await this.localStage(id,operationId,payloadHash);
    if(!local||!stage||stage.response||!['target_owned','complete'].includes(row.phase)) throw new Error('Original AI decision is not durably confirmed');
    const outcome={outcome:'administratively_closed',sideEffectReconciled:true,detail:'Administrator closed unknown AI recovery responsibility; model outcome remains unknown',aiReview:proof.closure};
    await this.db.prepare("UPDATE content_transition_operations SET outcome_json=? WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL AND json_extract(envelope_json,'$.nativeReceipt.aiUnknown')=json(?) AND json_extract(attempt_json,'$.identity')=? AND json_extract(attempt_json,'$.status')='unknown' AND EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND phase='target_owned' AND local_site=? AND local_resource=?)").bind(JSON.stringify(outcome),id,operationId,payloadHash,JSON.stringify(stage),command.attemptId,id,this.site,this.resource).run();
    const actual=await this.db.prepare('SELECT outcome_json FROM content_transition_operations WHERE transition_id=? AND operation_id=?').bind(id,operationId).first<string>('outcome_json');
    if(actual!==JSON.stringify(outcome)) throw new Error('AI final decision receipt conflict');
  }
  async acknowledgeLocal(id:string,operationId:string,payloadHash:string):Promise<boolean> {
    const stage=await this.localStage(id,operationId,payloadHash);if(!stage)return false;
    const {row,envelope,command}=await this.authority(id,operationId,payloadHash,'target');
    if(!row.outcome_json)throw new Error('Original AI responsibility is unfinished');
    const outcome=JSON.parse(row.outcome_json) as OperationOutcome;
    if(!outcome.sideEffectReconciled)throw new Error('Original AI follow-up is unfinished');
    if(outcome.aiReview) {
      if(stage.response||JSON.stringify(outcome.aiReview)!==JSON.stringify(envelope.nativeReceipt?.aiDecision?.proof?.closure))throw new Error('Missing own administrator closure receipt');
    } else if(!outcome.aiReviewResult||!stage.response||outcome.aiReviewResult.responseHash!==stage.response.hash||outcome.aiReviewResult.operationId!==operationId||(['attemptId','requestHash','evidenceHash','issuance'] as const).some(key=>outcome.aiReviewResult![key]!==command[key])) throw new Error('Missing original consumed AI response');
    await this.db.prepare("UPDATE content_transition_operations SET outcome_acknowledged=1 WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json=? AND json_extract(envelope_json,'$.nativeReceipt.aiUnknown')=json(?) AND EXISTS(SELECT 1 FROM content_transitions WHERE id=? AND local_site=? AND local_resource=? AND phase IN ('target_owned','complete') AND fence_json=?)").bind(id,operationId,payloadHash,row.outcome_json,JSON.stringify(stage),id,this.site,this.resource,row.fence_json).run();
    if(!await this.db.prepare('SELECT 1 FROM content_transition_operations WHERE transition_id=? AND operation_id=? AND outcome_acknowledged=1 AND outcome_json=?').bind(id,operationId,row.outcome_json).first())throw new Error('AI local completion acknowledgement changed');
    return true;
  }
  async recordOriginalResponse(reviewId:string,token:string,result:AiReviewResult|null,usage:AiReviewDto['usage'],error:{code:string;message:string;retryable:boolean}|null,now:number):Promise<boolean> {
    const found=await this.db.prepare("SELECT o.transition_id,o.operation_id,o.payload_hash FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE t.local_site=? AND t.local_resource=? AND t.local_site=t.source_site AND json_extract(o.envelope_json,'$.codec.id')='otw-play.ai.unknown' AND json_extract(o.envelope_json,'$.sourceCommand.payload.reviewId')=?").bind(this.site,this.resource,reviewId).first<{transition_id:string;operation_id:string;payload_hash:string}>();
    if(!found)return false;
    if(await this.sourceRetryReleased(reviewId)) {
      const tokenHash=await digestText(token),original=await this.authority(found.transition_id,found.operation_id,found.payload_hash,'source');
      if(original.command.attemptId!==`attempt-${tokenHash}`)return false;
    }
    const args=[found.transition_id,found.operation_id,found.payload_hash] as const,{envelope,command}=await this.authority(...args,'source'),snapshot=envelope.sourceReceipt?.aiReview as AiUnknownSnapshot|undefined;
    if(!snapshot||command.attemptId!==`attempt-${await digestText(token)}`) throw new Error('Wrong original AI callback attempt');
    // Network interruption does not become a model failure or permission to POST.
    if(error&&['network','timeout'].includes(error.code)) return true;
    const body=JSON.stringify({result,usage,error}),hash=await digestText(body);
    if(snapshot.response||snapshot.lateResponse) {
      if((snapshot.response?.hash??snapshot.lateResponse?.hash)!==hash) throw new Error('Conflicting original AI response');
      return true;
    }
    const next:AiUnknownSnapshot=snapshot.decision||snapshot.handoff?{...snapshot,lateResponse:{hash,recordedAt:now,body}}:{...snapshot,response:{hash,recordedAt:now},responseBody:body};
    await this.db.prepare("UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.sourceReceipt.aiReview',json(?)) WHERE transition_id=? AND operation_id=? AND payload_hash=? AND json_extract(envelope_json,'$.sourceReceipt.aiReview')=json(?)").bind(JSON.stringify(next),...args,JSON.stringify(snapshot)).run();
    const actual=await this.db.prepare("SELECT json_extract(envelope_json,'$.sourceReceipt.aiReview') value FROM content_transition_operations WHERE transition_id=? AND operation_id=?").bind(found.transition_id,found.operation_id).first<string>('value');
    if(actual!==JSON.stringify(next)) {
      // Closure may have won. Record the distinct late evidence against its new
      // immutable decision without reopening it or running any catalog work.
      return this.recordOriginalResponse(reviewId,token,result,usage,error,now);
    }
    return true;
  }
}
