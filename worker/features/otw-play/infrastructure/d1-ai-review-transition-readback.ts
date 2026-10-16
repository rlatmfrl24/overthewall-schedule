import type { SiteId } from '@contracts/site-definition';
import type { AiReviewCloseUnknownRequest,AiReviewResult,AiReviewResumeRequest } from '@contracts/otw-play-ai-review';
import { D1TransitionRepository, D1AiUnknownControl, D1AiResumeControl } from '../../content-transition';
import type { AiReviewTransitionReadback } from '../application/ports/ai-review-transition';
import { AiReviewError,type AiReviewRecord } from '../application/ports/ai-review';
import { D1AiReviewContext } from './d1-ai-review-context';
import { parseUnknownAiReviewCommand } from '../domain/ai-review-command';
import {D1AiReviewRepository} from './d1-ai-review-repository';

export class D1AiReviewTransitionReadback implements AiReviewTransitionReadback {
  private readonly db:D1Database;private readonly repository:D1TransitionRepository;private readonly control:D1AiUnknownControl;private readonly site:SiteId;
  private readonly resume:D1AiResumeControl|null;
  constructor(db:D1Database,repository:D1TransitionRepository,control:D1AiUnknownControl,site:SiteId,resume:D1AiResumeControl|null=null) {
    this.db=db;this.repository=repository;this.control=control;this.site=site;
    this.resume=resume;
  }
  private async find(reviewId:string) {
    if(await this.control.sourceRetryReleased(reviewId))return null;
    const rows=(await this.db.prepare("SELECT o.transition_id,o.operation_id FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE t.local_site=? AND json_extract(o.envelope_json,'$.codec.id')='otw-play.ai.unknown' AND json_extract(o.envelope_json,'$.payload.reviewId')=?").bind(this.site,reviewId).all<{transition_id:string;operation_id:string}>()).results;
    if(rows.length>1) throw new AiReviewError('idempotency_conflict','분석 책임의 원래 식별자가 충돌합니다.',409);
    if(!rows[0]) return null;
    const owner=await this.repository.readTransition(rows[0].transition_id),operation=await this.repository.exportOperation(owner.id,rows[0].operation_id),command=parseUnknownAiReviewCommand(operation.payload);
    if(!command) throw new Error('Missing original AI command');
    if(owner.sourceSite===this.site&&owner.abortedAt===undefined&&['source_fenced','target_owned','complete'].includes(owner.phase)) throw new AiReviewError('CONTENT_MOVED','이 분석은 대상 사이트에서 확인해 주세요.',409);
    const current=await new D1AiReviewContext(this.db).candidate(command.candidateId);
    if(current.videoId!==command.videoId) throw new AiReviewError('stale_review','원래 분석 대상이 변경되었습니다.',409);
    return {owner,operation,command};
  }
  private async stage(found:NonNullable<Awaited<ReturnType<D1AiReviewTransitionReadback['find']>>>) {
    const {owner,operation}=found,args=[owner.id,operation.operationId,operation.payloadHash] as const;
    if(owner.sourceSite===this.site) return this.control.transfer(...args);
    const local=await this.control.localStage(...args);
    if(!local)throw new Error('Original AI responsibility has not been installed locally');
    return local;
  }
  private async record(found:NonNullable<Awaited<ReturnType<D1AiReviewTransitionReadback['find']>>>,recorded=false):Promise<AiReviewRecord> {
    const stage=await this.stage(found),c=found.command;
    const completed=await this.db.prepare("SELECT coalesce(json_extract(envelope_json,'$.nativeReceipt.aiResult.projectedJson'),json_extract(envelope_json,'$.sourceReceipt.aiReview.result.projectedJson')) value FROM content_transition_operations WHERE transition_id=? AND operation_id=? AND outcome_json IS NOT NULL").bind(found.owner.id,found.operation.operationId).first<string>('value')??(found.operation.outcome?.aiReviewResult?stage.response?.projectedJson:null);
    if(stage.response&&!recorded&&!completed) throw new AiReviewError('result_pending','원래 분석 응답이 저장되어 결과 조정 중입니다.',409);
    const v=JSON.parse(completed??(recorded?stage.response?.projectedJson:undefined)??stage.projectedJson).value;
    const current=await this.repository.exportOperation(found.owner.id,found.operation.operationId);
    const closure=current.outcome?.aiReview??stage.closure,unknown=Date.now()>=stage.availableAt;
    const recovery=unknown&&!stage.response?{operationId:found.operation.operationId,attemptId:c.attemptId,requestHash:c.requestHash,evidenceHash:c.evidenceHash,issuance:c.issuance,...(closure?{state:'closed_by_admin' as const,decisionId:closure.decisionId,decidedAt:closure.decidedAt}:{state:'outcome_unknown' as const})}:undefined;
    return {id:c.reviewId,candidateId:c.candidateId,videoId:c.videoId,candidateKind:v.candidate_kind as AiReviewRecord['candidateKind'],range:v.range_json as AiReviewRecord['range'],status:v.status as AiReviewRecord['status'],result:(v.result_json??null) as AiReviewResult|null,model:String(v.model),attempts:Number(v.attempts),errorCode:v.error_code as string|null,errorMessage:v.error_message as string|null,retryable:false,createdAt:Number(v.created_at),updatedAt:Number(v.updated_at),expiresAt:Number(v.expires_at),nextRetryAt:v.next_retry_at as number|null,usage:null,input:v.input_json as unknown as AiReviewRecord['input'],inputHash:c.requestHash,targetKey:JSON.stringify([c.candidateId,c.videoId,v.candidate_kind,v.range_json]),leaseToken:null,...(recovery?{recovery}:{})};
  }
  async recordedResponse(id:string) {
    const execution=await this.resume?.execution(id);
    if(execution) {
      if(!execution.last?.response||execution.last.settled||execution.row.outcome_json)return null;
      const native=await new D1AiReviewRepository(this.db).get(id);if(!native)throw new Error('Missing confirmed AI execution');
      const body=execution.last.response.body,error=body.error;
      return {...native,status:(error?error.retryable&&native.attempts<3?'retry_wait':'failed':body.result?.videoAnalyzed?'succeeded':'partial') as AiReviewRecord['status'],result:body.result,usage:body.usage,errorCode:error?.code??null,errorMessage:error?.message??null,continuation:{operationId:execution.operation_id,attemptId:execution.command.attemptId,requestHash:execution.command.requestHash,evidenceHash:execution.command.evidenceHash,issuance:'unissued' as const,state:'confirmed' as const,executionId:id,confirmedAt:execution.envelope.nativeReceipt.aiResume.confirmation.confirmedAt}};
    }
    const found=await this.find(id);if(!found||found.operation.outcome) return null;
    const stage=await this.stage(found);if(!stage.response)return null;
    return this.record(found,true);
  }
  async finishResponse(id:string,result:AiReviewResult|null) {
    const execution=await this.resume?.execution(id);
    if(execution) {
      if(!execution.last?.response||execution.row.outcome_json)throw new Error('Missing confirmed AI response');
      const native=await new D1AiReviewRepository(this.db).get(id);if(!native?.leaseToken)throw new Error('Missing original confirmed AI claim');
      const body=execution.last.response.body,error=body.error;
      await new D1AiReviewRepository(this.db,this.control,(action,reviewId,statements)=>this.repository.commitAiReviewBatch(action,reviewId,statements),this.resume).finish(id,native.leaseToken,result,body.usage,error?new AiReviewError(error.code,error.message,502,error.retryable):null,Date.now());
      return;
    }
    const found=await this.find(id);if(!found) throw new Error('Missing owning AI continuation');
    const args=[found.owner.id,found.operation.operationId,found.operation.payloadHash] as const;
    if(found.owner.sourceSite===this.site) {
      const stage=await this.stage(found);
      if(stage.response&&JSON.parse(stage.response.projectedJson).value.status==='retry_wait') {
        await this.repository.commitSourceAiResponse(...args,await this.control.sourceRetry(...args));return;
      }
      const prepared=await this.control.sourceResponse(...args,result),{review,body,now,status}=prepared;
      // The original two owning updates, their capture and terminal receipt
      // share the same source permit/fence transaction.
      await this.repository.commitSourceAiResponse(...args,[prepared.statements[0],
        this.db.prepare("UPDATE music_ai_review_attempts SET finished_at=?,outcome=?,usage_json=? WHERE token=? AND EXISTS(SELECT 1 FROM music_ai_reviews WHERE id=? AND lease_token=? AND status='running')").bind(now,body.error?.code??status,body.usage?JSON.stringify(body.usage):null,review.lease_token,id,review.lease_token),
        this.db.prepare("UPDATE music_ai_reviews SET status=?,result_json=?,usage_json=?,error_code=?,error_message=?,next_retry_at=NULL,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=? AND status='running'").bind(status,result?JSON.stringify(result):null,body.usage?JSON.stringify(body.usage):null,body.error?.code??null,body.error?.message??null,now,id,review.lease_token),
        prepared.statements[1],
      ]);
    } else await this.control.finishResponse(...args,result);
  }
  private async pendingResume(id:string):Promise<AiReviewRecord|null> {
    const found=await this.resume?.find(id);if(!found?.target)return null;
    const {command:c,projected,envelope}=await this.resume!.local(found.transition_id,found.operation_id,found.payload_hash),v=projected.value;
    const confirmation=envelope.nativeReceipt.aiResume?.confirmation;
    const identity={operationId:found.operation_id,attemptId:c.attemptId,requestHash:c.requestHash,evidenceHash:c.evidenceHash,issuance:'unissued' as const};
    if(confirmation) {
      const native=await this.executionRecord(confirmation.reviewId);
      if(!native)throw new Error('Missing actual confirmed AI execution');
      return {...native,continuation:{...identity,state:'confirmed',executionId:native.id,confirmedAt:confirmation.confirmedAt}};
    }
    const current=await new D1AiReviewContext(this.db).candidate(c.candidateId);
    if(current.videoId!==c.videoId||current.candidateKind!==v.candidate_kind)throw new AiReviewError('stale_review','원래 분석 대상이 변경되었습니다.',409);
    return {id:c.reviewId,candidateId:c.candidateId,videoId:c.videoId,candidateKind:v.candidate_kind as AiReviewRecord['candidateKind'],range:v.range_json as AiReviewRecord['range'],status:v.status as AiReviewRecord['status'],result:null,model:String(v.model),attempts:Number(v.attempts),errorCode:v.error_code as string|null,errorMessage:v.error_message as string|null,retryable:false,createdAt:Number(v.created_at),updatedAt:Number(v.updated_at),expiresAt:Number(v.expires_at),nextRetryAt:null,usage:null,input:v.input_json as unknown as AiReviewRecord['input'],inputHash:c.requestHash,targetKey:JSON.stringify([c.candidateId,c.videoId,v.candidate_kind,v.range_json]),leaseToken:null,continuation:{...identity,state:'confirmation_required'}};
  }
  private async executionRecord(id:string):Promise<AiReviewRecord|null> {
    const execution=await this.resume?.execution(id);if(!execution)return null;
    const native=await new D1AiReviewRepository(this.db).get(id);if(!native)throw new Error('Missing actual confirmed AI execution');
    const last=execution.last;
    if(last&&!last.response&&!last.settled&&Date.now()>=last.availableAt) {
      const closure=execution.row.outcome_json?JSON.parse(execution.row.outcome_json).aiReview:null;
      return {...native,recovery:{operationId:execution.operation_id,attemptId:last.identity,requestHash:execution.command.requestHash,evidenceHash:execution.command.evidenceHash,issuance:'issued',...(closure?{state:'closed_by_admin' as const,decisionId:closure.decisionId,decidedAt:closure.decidedAt}:{state:'outcome_unknown' as const})}};
    }
    return native;
  }
  async confirmResume(id:string,input:AiReviewResumeRequest,actor:string) {
    const found=await this.resume?.find(id);if(!found?.target)throw new AiReviewError('not_found','이어 실행할 원래 분석을 찾을 수 없습니다.',404);
    try{return await this.resume!.confirm(found.transition_id,found.operation_id,found.payload_hash,input,actor,Date.now(),(action,reviewId,statements)=>this.repository.commitAiReviewBatch(action,reviewId,statements));}
    catch(error){throw new AiReviewError('recovery_conflict',error instanceof Error?error.message:'원래 분석 상태가 변경되었습니다.',409);}
  }
  async get(id:string) {const execution=await this.executionRecord(id);if(execution)return execution;const pending=await this.pendingResume(id);if(pending)return pending;const found=await this.find(id);return found?this.record(found):null;}
  async state(reviewId:string) {
    if(await this.control.sourceRetryReleased(reviewId))return null;
    const execution=await this.resume?.execution(reviewId);
    if(execution){if(execution.row.outcome_json)return 'terminal' as const;return execution.last&&!execution.last.settled?'pending' as const:null;}
    const resume=await this.resume?.find(reviewId);
    if(resume){if(resume.target&&(await this.resume!.local(resume.transition_id,resume.operation_id,resume.payload_hash)).row.outcome_json)return 'terminal' as const;return !resume.target&&await this.resume!.sourceHandedOff(resume.transition_id,resume.operation_id,resume.payload_hash)?'transferred' as const:'pending' as const;}
    const original=await this.db.prepare("SELECT o.transition_id,o.operation_id,o.payload_hash FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE t.local_site=? AND t.local_site=t.source_site AND json_extract(o.envelope_json,'$.codec.id')='otw-play.ai.unknown' AND json_extract(o.envelope_json,'$.payload.reviewId')=?").bind(this.site,reviewId).first<{transition_id:string;operation_id:string;payload_hash:string}>();
    if(original&&await this.control.sourceHandedOff(original.transition_id,original.operation_id,original.payload_hash))return 'transferred' as const;
    const rows=(await this.db.prepare("SELECT o.outcome_json,o.outcome_acknowledged,o.source_seq,t.local_site,t.source_site,t.fence_json,t.aborted_at FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE t.local_site=? AND json_extract(o.envelope_json,'$.codec.id')='otw-play.ai.unknown' AND json_extract(o.envelope_json,'$.payload.reviewId')=?").bind(this.site,reviewId).all<{outcome_json:string|null;outcome_acknowledged:number;source_seq:number|null;local_site:string;source_site:string;fence_json:string|null;aborted_at:number|null}>()).results;
    if(rows.length>1) throw new Error('Ambiguous original AI control');
    const r=rows[0];if(!r)return null;
    const terminal=r.outcome_json&&JSON.parse(r.outcome_json).sideEffectReconciled&&(r.local_site===r.source_site?!r.fence_json||r.aborted_at!==null||r.outcome_acknowledged===1:r.source_seq===null||r.outcome_acknowledged===1);
    return terminal?'terminal' as const:'pending' as const;
  }
  async latest(targetKey:string) {
    let target:unknown;try{target=JSON.parse(targetKey);}catch{return null;}
    if(!Array.isArray(target)||typeof target[0]!=='string') return null;
    let resumed:AiReviewRecord|null=null;
    for(const row of await this.resume?.latest(target[0])??[]) {const pending=await this.pendingResume(row.id);if(pending?.targetKey===targetKey){if(pending.recovery?.state==='outcome_unknown')return pending;resumed??=pending;}}
    const rows=(await this.db.prepare("SELECT json_extract(o.envelope_json,'$.payload.reviewId') id FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE t.local_site=? AND json_extract(o.envelope_json,'$.codec.id')='otw-play.ai.unknown' AND json_extract(o.envelope_json,'$.payload.candidateId')=? ORDER BY o.admitted_at DESC,o.seq DESC").bind(this.site,target[0]).all<{id:string}>()).results;
    let latest:AiReviewRecord|null=null;
    for(const row of rows){const record=await this.get(row.id);if(record?.targetKey===targetKey){if(record.recovery?.state==='outcome_unknown')return record;latest??=record;}}
    return resumed??latest;
  }
  async closeUnknown(id:string,input:AiReviewCloseUnknownRequest,actor:string) {
    if(await this.resume?.execution(id)) {
      try{await this.resume!.closeUnknown(id,input,actor,Date.now());}
      catch(error){throw new AiReviewError('recovery_conflict',error instanceof Error?error.message:'미확인 분석 상태가 변경되었습니다.',409);}
      const record=await this.executionRecord(id);if(!record)throw new Error('Missing confirmed AI decision readback');return record;
    }
    const found=await this.find(id);if(!found) throw new AiReviewError('not_found','원래 분석을 찾을 수 없습니다.',404);
    const {owner,operation}=found,args=[owner.id,operation.operationId,operation.payloadHash] as const;
    await this.stage(found);
    try {
      if(owner.sourceSite===this.site) await this.control.closeSourceDecision(...args,input,actor,Date.now());
      else {
        await this.control.prepareDecision(...args,input,actor,Date.now());
        await this.control.finishDecision(...args);
        if(!await this.control.acknowledgeLocal(...args))throw new Error('Original AI responsibility has not been installed locally');
      }
    } catch(error) {throw new AiReviewError('recovery_conflict',error instanceof Error?error.message:'미확인 책임의 상태가 변경되었습니다.',409);}
    return this.record(found);
  }
}
