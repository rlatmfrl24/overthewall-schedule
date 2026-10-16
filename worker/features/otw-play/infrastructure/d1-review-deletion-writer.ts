import { D1TransitionRepository, TransitionWriteError } from '../../content-transition';
import type {TransitionOperationMessage} from '@contracts/content-transition-queue';
import {parseReviewDeletion,type ReviewDeletionCommand} from '../domain/review-deletion-command';
import {IngestionRepositoryError} from '../application/ports/ingestion-repository';

type Acceptance={transition:NonNullable<Awaited<ReturnType<D1TransitionRepository['prepareReviewDeletion']>>>;operationId:string;source:boolean;command:ReviewDeletionCommand};
export class D1ReviewDeletionWriter {
  private readonly repository:D1TransitionRepository;private readonly site:'otw'|'luvdia';
  private readonly resume?:TransitionOperationMessage;
  constructor(repository:D1TransitionRepository,site:'otw'|'luvdia',resume?:TransitionOperationMessage) {
    this.repository=repository;this.site=site;this.resume=resume;
  }
  async accept(command:ReviewDeletionCommand) {
    // A deletion already has an exact original identity: own actor + item +
    // version + kind. Repeated clicks cannot mint another accepted deletion.
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([command.actorUserId,parseReviewDeletion(command)])));
    const operationId=this.resume?.operationId??`review-delete-${Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')}`;
    const prior=await this.repository.readReviewDeletionReceipt(operationId);
    if(prior) {
      if(prior.command.actorUserId!==command.actorUserId||JSON.stringify(parseReviewDeletion(prior.command))!==JSON.stringify(parseReviewDeletion(command))||this.resume&&(prior.operation.transitionId!==this.resume.transitionId||prior.operation.payloadHash!==this.resume.payloadHash)) throw new TransitionWriteError('CONTENT_CONFLICT',this.site,operationId);
      const transition=await this.repository.readTransition(prior.operation.transitionId),source=transition.sourceSite===this.site;
      if(source&&['source_fenced','target_owned','complete'].includes(transition.phase)) throw new TransitionWriteError('CONTENT_MOVED',transition.targetSite,operationId);
      if(prior.operation.outcome) {
        if(prior.operation.outcome.outcome==='committed'&&prior.result?.deleted) return {done:true,acceptance:null};
        throw new IngestionRepositoryError('stale_write',prior.failure?.message??'검토 항목의 상태가 변경되었습니다.');
      }
      if(!['target_owned','complete'].includes(transition.phase)) throw new TransitionWriteError('CONTENT_ACCEPTED',this.site,operationId);
      if(!await this.repository.reconcileNativeReviewDeletion(transition.id,operationId)) throw new IngestionRepositoryError('stale_write','검토 항목의 상태가 변경되었습니다.');
      return {done:false,acceptance:{transition,operationId,source:false,command:prior.command}};
    }
    if(this.resume) throw new Error('Missing original review deletion receipt');
    const transition=await this.repository.prepareReviewDeletion(command);
    if(!transition) return {done:false,acceptance:null};
    const source=transition.sourceSite===this.site;
    if(source&&['source_fenced','target_owned','complete'].includes(transition.phase)) throw new TransitionWriteError('CONTENT_MOVED',transition.targetSite);
    const acceptance={transition,operationId,source,command};
    if(!source) {
      const receipt=await this.repository.admitNativeReviewDeletion(this.input(acceptance),command).catch(error=>{
        if(String(error).includes('review_deletion_state_conflict')) throw new IngestionRepositoryError('stale_write','검토 항목의 상태가 변경되었습니다.');
        throw error;
      });
      // Concurrent identical admission uses the first private event identity.
      // The owning repository builds statements only after this readback.
      acceptance.command=receipt.command;
    }
    return {done:false,acceptance};
  }
  private input(a:Acceptance) {
    return {transitionId:a.transition.id,operationId:a.operationId,idempotencyKey:a.operationId,codec:{id:a.source?'otw-play.review.delete_local':'otw-play.review.delete',version:1},kind:'content_edit' as const,
      subject:{table:a.command.kind==='candidate'?'music_ingestion_candidates':'music_cover_proposals',key:JSON.stringify([a.command.id])},expectedVersion:a.command.expectedVersion,
      validation:{contract:1,validatedAt:a.command.now},admittedAt:a.command.now,payload:{...parseReviewDeletion(a.command)!}};
  }
  async write(a:Acceptance,statements:D1PreparedStatement[]) {
    try {
      await this.repository.commitReviewDeletion(a.transition.id,a.operationId,a.source?a.transition.generation-1:a.transition.generation,statements,a.source?{input:this.input(a),command:a.command}:undefined);
    } catch(error) {
      const receipt=await this.repository.readReviewDeletionReceipt(a.operationId);
      if(receipt?.operation.outcome?.outcome==='committed') return;
      if(a.source&&['source_fenced','target_owned','complete'].includes((await this.repository.readTransition(a.transition.id)).phase)) throw new TransitionWriteError('CONTENT_MOVED',a.transition.targetSite,a.operationId);
      if(receipt?.operation.outcome?.outcome==='conflicted'||/Expected version conflict|review_deletion_state_conflict/.test(String(error))) throw new IngestionRepositoryError('stale_write','검토 항목의 상태가 변경되었습니다.');
      throw error;
    }
  }
}
