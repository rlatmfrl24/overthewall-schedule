import {D1TransitionRepository,TransitionWriteError} from "../../content-transition";
import type {TransitionOperationMessage} from "@contracts/content-transition-queue";
import type {OtwPlayCreateSubmissionResponse} from "@contracts/otw-play";
import {MemberSubmissionRepositoryError} from "../application/ports/member-submission-repository";
import {parseMemberSubmissionMutation,memberSubmissionVersion,type MemberSubmissionCommand} from "../domain/member-submission-command";

type Acceptance={transition:NonNullable<Awaited<ReturnType<D1TransitionRepository['prepareMemberSubmission']>>>;operationId:string;source:boolean;command:MemberSubmissionCommand;businessAttempted:boolean};
function identity(command:MemberSubmissionCommand) {
  const parsed=parseMemberSubmissionMutation(command)!;
  if(command.action==='withdraw' || parsed.action==='withdraw') return parsed;
  const subject=(value:typeof parsed.input.originalArtists[number])=>value.kind==='member'?{kind:value.kind,memberUid:value.memberUid}:value.entityId?{kind:value.kind,entityId:value.entityId}:{kind:value.kind,displayName:value.displayName};
  return {...parsed,proposalId:parsed.action==='create'?null:parsed.proposalId,input:{...parsed.input,youtubeUrl:command.canonicalUrl,participants:parsed.input.participants.map(value=>({...subject(value),participantRole:value.participantRole??'vocal'})),originalArtists:parsed.input.originalArtists.map(subject)}};
}
export class D1MemberSubmissionWriter {
  private active:Acceptance|null=null;
  private readonly repository:D1TransitionRepository;private readonly site:'otw'|'luvdia';private readonly requestKey?:string;private readonly resume?:TransitionOperationMessage;
  constructor(repository:D1TransitionRepository,site:'otw'|'luvdia',requestKey?:string,resume?:TransitionOperationMessage) {this.repository=repository;this.site=site;this.requestKey=requestKey;this.resume=resume;}
  private async operationId(command:MemberSubmissionCommand) {
    const key=command.action==='create'?command.input.clientRequestId:this.requestKey??crypto.randomUUID();
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([command.userId,command.action,key])));
    return this.resume?.operationId??`member-submission-${Array.from(new Uint8Array(hash),value=>value.toString(16).padStart(2,'0')).join('')}`;
  }
  private async access(receipt:NonNullable<Awaited<ReturnType<D1TransitionRepository['readMemberSubmissionReceipt']>>>) {
    const transition=await this.repository.readTransition(receipt.operation.transitionId);
    if(transition.sourceSite===this.site && ['source_fenced','target_owned','complete'].includes(transition.phase)) throw new TransitionWriteError('CONTENT_MOVED',transition.targetSite);
    return transition;
  }
  async replay(command:MemberSubmissionCommand):Promise<OtwPlayCreateSubmissionResponse|null> {
    const operationId=await this.operationId(command),receipt=await this.repository.readMemberSubmissionReceipt(operationId);
    if(!receipt) {if(this.resume) throw new Error('Missing original member submission receipt');return null;}
    if(receipt.command.userId!==command.userId || JSON.stringify(identity(receipt.command))!==JSON.stringify(identity(command)) || this.resume && (receipt.operation.transitionId!==this.resume.transitionId || receipt.operation.payloadHash!==this.resume.payloadHash)) throw new MemberSubmissionRepositoryError('idempotency_conflict','Submission request identity changed');
    await this.access(receipt);
    if(receipt.operation.outcome) {
      if(receipt.operation.outcome.outcome==='failed' && receipt.failure) {
        const code=receipt.failure.code;
        if(!code && receipt.command.action==='withdraw') throw new Error(receipt.failure.message);
        const explicit=code==='not_found'||code==='duplicate'||code==='stale_write'||code==='idempotency_conflict'||code==='rate_limited'||code==='invalid_request';
        throw new MemberSubmissionRepositoryError(explicit?code:/constraint failed/i.test(receipt.failure.message)?'duplicate':'unavailable',explicit?receipt.failure.message:/constraint failed/i.test(receipt.failure.message)?'This video is already in the catalog or awaiting review':receipt.command.action==='create'?'Submission could not be stored':'Submission update could not be stored');
      }
      if(receipt.operation.outcome.outcome!=='committed' || !receipt.result) throw new TransitionWriteError('CONTENT_CONFLICT',this.site,operationId);
      return {data:receipt.result,idempotentReplay:true};
    }
    if(!this.resume) throw new TransitionWriteError('CONTENT_ACCEPTED',this.site,operationId);
    return null;
  }
  async execute<T extends MemberSubmissionCommand>(command:T,execute:(original:T)=>Promise<OtwPlayCreateSubmissionResponse>):Promise<OtwPlayCreateSubmissionResponse> {
    const replay=await this.replay(command);if(replay) return replay;
    const operationId=await this.operationId(command),receipt=await this.repository.readMemberSubmissionReceipt(operationId);
    const transition=receipt?await this.access(receipt):await this.repository.prepareMemberSubmission(command);
    if(!transition) return execute(command);
    const source=transition.sourceSite===this.site;
    if(source && ['source_fenced','target_owned','complete'].includes(transition.phase)) throw new TransitionWriteError('CONTENT_MOVED',transition.targetSite);
    const original=receipt?.command??command;
    if(original.action!==command.action) throw new Error('Submission action changed');
    this.active={transition,operationId,source,command:original,businessAttempted:false};
    try {
      // The original command retains its actual IDs/time/day and own-site actor.
      const result=await execute(original as T);
      const saved=await this.repository.readMemberSubmissionReceipt(operationId);
      if(saved?.result && saved.operation.outcome?.outcome==='committed') {await this.access(saved);return {data:saved.result,idempotentReplay:!!receipt};}
      return result;
    } catch(error) {
      const saved=await this.repository.readMemberSubmissionReceipt(operationId);
      if(saved?.result && saved.operation.outcome?.outcome==='committed') {await this.access(saved);return {data:saved.result,idempotentReplay:true};}
      if(!source && receipt && !this.active.businessAttempted && error instanceof MemberSubmissionRepositoryError && error.code!=='unavailable') await this.repository.recordMemberSubmissionFailure(transition.id,operationId,error);
      throw error;
    } finally {this.active=null;}
  }
  async batch(statements:D1PreparedStatement[],ordinary:()=>Promise<unknown>) {
    const active=this.active;if(!active) {await ordinary();return;}
    const {transition,operationId,source,command}=active,version=memberSubmissionVersion(command);
    const input={transitionId:transition.id,operationId,idempotencyKey:operationId,codec:{id:source?'otw-play.member.local':'otw-play.member.mutate',version:1},kind:'content_edit' as const,subject:{table:'music_cover_proposals',key:JSON.stringify([command.proposalId])},expectedVersion:version,validation:{contract:1,validatedAt:command.now},admittedAt:command.now,payload:source?{action:command.action,proposalId:command.proposalId,expectedVersion:version}:{...parseMemberSubmissionMutation(command)!}};
    if(!source && !this.resume) {
      await this.repository.admitNativeMemberSubmission(input,command);
    }
    active.businessAttempted=true;
    try {await this.repository.commitMemberSubmission(transition.id,operationId,source?transition.generation-1:transition.generation,statements,source?{input,command}:undefined);}
    catch(error) {
      if(source && ['source_fenced','target_owned','complete'].includes((await this.repository.readTransition(transition.id)).phase)) throw new TransitionWriteError('CONTENT_MOVED',transition.targetSite);
      const noWrite=/^Error: D1_ERROR: malformed JSON|^D1_ERROR: malformed JSON/.test(String(error))?await this.repository.memberSubmissionNoWrite(command):null;
      if(noWrite==='rate_limited'||noWrite==='duplicate') {
        const failure=new MemberSubmissionRepositoryError(noWrite,noWrite==='rate_limited'?'Daily submission limit reached':'This video is already in the catalog or awaiting review');
        if(!source) await this.repository.recordMemberSubmissionFailure(transition.id,operationId,failure);
        throw failure;
      }
      if(/Expected version conflict|member_submission_state_conflict/.test(String(error))) throw new TransitionWriteError('CONTENT_CONFLICT',this.site,operationId);
      throw error;
    }
  }
}
