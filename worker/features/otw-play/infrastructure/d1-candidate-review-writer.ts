import { D1TransitionRepository, TransitionWriteError } from '../../content-transition';
import type {TransitionOperationMessage} from '@contracts/content-transition-queue';
import type {OtwPlayIngestionReviewCandidateDto} from '@contracts/otw-play';
import {IngestionRepositoryError} from '../application/ports/ingestion-repository';
import {parseCandidateReviewMutation,type CandidateReviewCommand} from '../domain/candidate-review-command';
import {candidateReviewSqlError} from './candidate-review-error';

type Acceptance={transition:NonNullable<Awaited<ReturnType<D1TransitionRepository['prepareCandidateReview']>>>;operationId:string;source:boolean;command:CandidateReviewCommand;businessAttempted:boolean};
type Capture=Parameters<D1TransitionRepository['commitCandidateReview']>[4];
const ownershipError=(code:TransitionWriteError['code'],site:'otw'|'luvdia',operationId:string)=>{
  const error=new TransitionWriteError(code,site,operationId);
  return new IngestionRepositoryError(code==='CONTENT_ACCEPTED'?'content_accepted':code==='CONTENT_MOVED'?'content_moved':'content_conflict',error.message,{targetSite:site,operationId});
};
export class D1CandidateReviewWriter {
  private active:Acceptance|null=null;
  private readonly repository:D1TransitionRepository;private readonly site:'otw'|'luvdia';
  private readonly dispatch:(message:TransitionOperationMessage)=>Promise<void>;private readonly resume?:TransitionOperationMessage;
  constructor(repository:D1TransitionRepository,site:'otw'|'luvdia',dispatch:(message:TransitionOperationMessage)=>Promise<void>,resume?:TransitionOperationMessage) {this.repository=repository;this.site=site;this.dispatch=dispatch;this.resume=resume;}
  async execute<T extends CandidateReviewCommand>(command:T,execute:(original:T)=>Promise<OtwPlayIngestionReviewCandidateDto>):Promise<OtwPlayIngestionReviewCandidateDto> {
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([command.actorUserId,parseCandidateReviewMutation(command)])));
    const operationId=this.resume?.operationId??`candidate-review-${Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')}`;
    const receipt=await this.repository.readCandidateReviewReceipt(operationId);
    if(receipt&&(receipt.command.actorUserId!==command.actorUserId||JSON.stringify(parseCandidateReviewMutation(receipt.command))!==JSON.stringify(parseCandidateReviewMutation(command))||this.resume&&(receipt.operation.transitionId!==this.resume.transitionId||receipt.operation.payloadHash!==this.resume.payloadHash))) throw ownershipError('CONTENT_CONFLICT',this.site,operationId);
    if(!receipt&&this.resume) throw new Error('Missing original candidate review receipt');
    const transition=receipt?await this.repository.readTransition(receipt.operation.transitionId):await this.repository.prepareCandidateReview(command);
    if(!transition) return execute(command);
    const source=transition.sourceSite===this.site;
    if(source&&['source_fenced','target_owned','complete'].includes(transition.phase)) throw ownershipError('CONTENT_MOVED',transition.targetSite,operationId);
    if(receipt?.operation.outcome) {
      if(receipt.operation.outcome.outcome==='committed'&&receipt.result) return receipt.result;
      if(receipt.command.action==='save'&&receipt.failure&&!receipt.failure.code) {const failure=candidateReviewSqlError(receipt.failure.message);if(failure) throw failure;}
      const code=receipt.failure?.code;
      throw new IngestionRepositoryError(code==='not_found'||code==='validation_failed'||code==='stale_message'||code==='stale_write'?code:receipt.operation.outcome.outcome==='conflicted'?'stale_write':'unavailable',code?receipt.failure!.message:receipt.operation.outcome.outcome==='conflicted'?'Ingestion candidate changed during review':'Playlist ingestion is temporarily unavailable');
    }
    if(receipt&&!['target_owned','complete'].includes(transition.phase)) throw ownershipError('CONTENT_ACCEPTED',this.site,operationId);
    const original=receipt?.command??command;
    if(original.action!==command.action) throw new Error('Candidate action changed');
    this.active={transition,operationId,source,command:original,businessAttempted:false};
    try {
      const result=await execute(original as T);
      const saved=await this.repository.readCandidateReviewReceipt(operationId);
      return saved?.operation.outcome?.outcome==='committed'&&saved.result?saved.result:result;
    } catch(error) {
      const saved=await this.repository.readCandidateReviewReceipt(operationId);
      if(saved?.operation.outcome?.outcome==='committed'&&saved.result) return saved.result;
      if(!source&&receipt&&!this.active.businessAttempted&&error instanceof IngestionRepositoryError&&['not_found','stale_write','stale_message','validation_failed'].includes(error.code)) await this.repository.recordCandidateReviewFailure(transition.id,operationId,error);
      throw error;
    } finally {this.active=null;}
  }
  async batch(statements:D1PreparedStatement[],ordinary:()=>Promise<unknown>,capture:Capture,validatedVersion:number) {
    const active=this.active;if(!active) {await ordinary();return;}
    const {transition,operationId,source,command}=active;
    const payload=source?{action:command.action,candidateId:command.candidateId,expectedVersion:command.expectedVersion}:{...parseCandidateReviewMutation(command)!};
    const input={transitionId:transition.id,operationId,idempotencyKey:operationId,codec:{id:source?'otw-play.candidate.local':'otw-play.candidate.mutate',version:1},kind:'content_edit' as const,subject:{table:'music_ingestion_candidates',key:JSON.stringify([command.candidateId])},expectedVersion:command.action==='save'?null:command.expectedVersion,validation:{contract:1,validatedAt:command.now},admittedAt:command.now,payload};
    if(!source&&!this.resume) {
      const receipt=await this.repository.admitNativeCandidateReview(input,command,validatedVersion);
      if(!['target_owned','complete'].includes(transition.phase)||JSON.stringify(receipt.command)!==JSON.stringify(command)) {
        try {await this.dispatch({type:'content-transition.operation',version:1,transitionId:transition.id,operationId,payloadHash:receipt.operation.payloadHash});} catch { /* The admitted original command survives delivery loss. */ }
        throw ownershipError('CONTENT_ACCEPTED',this.site,operationId);
      }
    }
    active.businessAttempted=true;
    try {await this.repository.commitCandidateReview(transition.id,operationId,source?transition.generation-1:transition.generation,statements,capture,source?{input,command}:undefined);}
    catch(error) {
      if(source&&['source_fenced','target_owned','complete'].includes((await this.repository.readTransition(transition.id)).phase)) throw ownershipError('CONTENT_MOVED',transition.targetSite,operationId);
      // This exact guard is after the original mutation/event in a rolled-back
      // atomic batch. It proves zero committed business, not a delivery failure.
      if(/Expected version conflict|candidate_review_state_conflict/.test(String(error))) {
        const failure=new IngestionRepositoryError(command.action==='save'?'stale_message':'stale_write','Ingestion candidate changed during review');
        if(!source) await this.repository.recordCandidateReviewFailure(transition.id,operationId,failure);
        throw failure;
      }
      throw error;
    }
  }
}
