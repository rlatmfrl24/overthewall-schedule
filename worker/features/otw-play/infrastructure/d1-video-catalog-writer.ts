import type {OtwPlayAdminCommandResponse} from '@contracts/otw-play';
import type {TransitionOperationMessage} from '@contracts/content-transition-queue';
import type {YouTubeVideoCompletion,YouTubeVideoDependency,YouTubeVideoFailure,YouTubeVideoReadResponse} from '@contracts/content-transition-youtube';
import { D1TransitionRepository, D1YouTubeVideoReadJournal, TransitionWriteError, youtubeVideoRequestKey, parseVideoCatalogFailure, type TransitionPeer } from '../../content-transition';
import { isPublicationCutoffSqlError } from '../../content-access';
import {parseVideoCatalogMutation,videoCatalogReads,type VideoCatalogCommand} from '../domain/video-catalog-command';
import type {VideoCatalogTransitionPort,VideoCatalogResultData} from '../application/ports/video-catalog-transition';
import {AdminCatalogServiceError} from '../application/admin-catalog-service';
import {AdminCatalogRepositoryError} from '../application/ports/admin-catalog-repository';
import {OtwPlayYouTubeMetadataError,type OtwPlayYouTubeMetadataReader} from '../application/ports/youtube-metadata';
import type {VideoCatalogBatchWriter,VideoCatalogResultCapture,VideoCatalogEvent} from './video-catalog-batch';
import type {CandidateConversionTransitionPort,CandidateConversionIdentity,CandidateConversionCommand,CandidateConversionExecution} from '../application/ports/candidate-conversion-transition';
import {IngestionRepositoryError} from '../application/ports/ingestion-repository';
import type {OtwPlayIngestionConversionResultDto} from '@contracts/otw-play';
import {parseConversionOutcome,type ConversionOutcomeCommand} from '../domain/conversion-outcome-command';
type OriginalOutcome=Omit<ConversionOutcomeCommand,'actorUserId'> & {actorUserId:string|null};

type Receipt=NonNullable<Awaited<ReturnType<D1TransitionRepository['readVideoReceipt']>>>;
type Active={receipt:Receipt;peer:TransitionPeer|null;control:YouTubeVideoCompletion|null;dependency:YouTubeVideoDependency|null;businessAttempted:boolean;sqlRejection:string|null;reviewLock:string};
/** Original admin video commands and the explicit two-read candidate conversion
 * share exact admitted requests. Other ingestion/provider work cannot enter. */
export class D1VideoCatalogWriter implements VideoCatalogTransitionPort,VideoCatalogBatchWriter,CandidateConversionTransitionPort {
  private active:Active|null=null;
  private outcomeActive:{owner:Awaited<ReturnType<D1TransitionRepository['readTransition']>>;operationId:string;command:ConversionOutcomeCommand;source:boolean}|null=null;
  private readonly repository:D1TransitionRepository;private readonly journal:D1YouTubeVideoReadJournal;
  private readonly reader:OtwPlayYouTubeMetadataReader;private readonly site:'otw'|'luvdia';
  private readonly dispatch:(message:TransitionOperationMessage)=>Promise<void>;private readonly peer:()=>Promise<TransitionPeer>;
  private readonly requestKey?:string;private readonly resume?:TransitionOperationMessage;
  constructor(repository:D1TransitionRepository,journal:D1YouTubeVideoReadJournal,reader:OtwPlayYouTubeMetadataReader,site:'otw'|'luvdia',dispatch:(message:TransitionOperationMessage)=>Promise<void>,peer:()=>Promise<TransitionPeer>,requestKey?:string,resume?:TransitionOperationMessage) {
    this.repository=repository;this.journal=journal;this.reader=reader;this.site=site;this.dispatch=dispatch;this.peer=peer;this.requestKey=requestKey;this.resume=resume;
  }
  private async pending(receipt:Receipt):Promise<never> {
    const op=receipt.operation;
    try {await this.dispatch({type:'content-transition.operation',version:1,transitionId:op.transitionId,operationId:op.operationId,payloadHash:op.payloadHash});} catch { /* Existing durable dispatcher retains responsibility. */ }
    if(receipt.command.action==='candidate_convert') throw new IngestionRepositoryError('content_accepted','변환 요청이 접수되었습니다. 잠시 후 다시 확인해 주세요.',{targetSite:this.site,operationId:op.operationId});
    throw new TransitionWriteError('CONTENT_ACCEPTED',this.site,op.operationId);
  }
  private failure(failure:YouTubeVideoFailure,control:YouTubeVideoCompletion):never {
    if(failure.kind==='service') throw new AdminCatalogServiceError(failure.code,failure.message,failure.fields);
    if(failure.kind==='repository') throw new AdminCatalogRepositoryError(failure.code,failure.message,failure.fields);
    if(!control.failure) throw new Error('Missing original metadata error');
    const error=control.failure;throw new OtwPlayYouTubeMetadataError(error.message,error.code,error.retryable,error.retryAfterMs);
  }
  private async completion(active:Active) {
    const op=active.receipt.operation,args=[op.transitionId,op.operationId,op.payloadHash] as const;
    return active.peer?active.peer.youtubeVideoCompletion(...args):this.journal.completion(...args);
  }
  private async read(active:Active,videoId:string,index:number) {
    const op=active.receipt.operation,peer=active.peer,args=[op.transitionId,op.operationId,op.payloadHash,youtubeVideoRequestKey(videoId,index)] as const;
    let read=peer?await peer.youtubeVideoRead(...args):await this.journal.read(...args);
    if(!read.response&&!read.exhausted&&read.attempt>=4) read=peer?await peer.exhaustYouTubeVideoRead(...args):await this.journal.exhaust(...args,Date.now());
    if(read.exhausted) {
      const control=await this.completion(active),outcome={outcome:'failed' as const,sideEffectReconciled:true,detail:'Original admin video GET exhausted four interrupted HTTP attempts without a durable response; no catalog business committed',youtubeVideo:control};
      if(active.receipt.command.action!=='candidate_convert'&&!(await this.repository.exportOperation(op.transitionId,op.operationId)).outcome) await this.repository.recordOutcome(op.transitionId,op.operationId,outcome);
      this.failure({kind:'metadata',code:'network',message:control.failure!.message},control);
    }
    if(!read.response) {
      const claimed=peer?await peer.claimYouTubeVideoRead(...args):await this.journal.claim(...args,Date.now());read=claimed.receipt;
      if(!claimed.claimed||!read.claim) return this.pending(active.receipt);
      const claim=read.claim;let response:YouTubeVideoReadResponse;
      try {
        const video=await this.reader.readVideo(videoId,{beforeHttp:async()=>{read=peer?await peer.startYouTubeVideoRead(...args,read.requestHash,claim):await this.journal.start(...args,read.requestHash,claim,Date.now());}});
        response={status:'success',video};
      } catch(error) {
        if(!(error instanceof OtwPlayYouTubeMetadataError)) throw error;
        response={status:'error',error:{message:error.message,code:error.code,retryable:error.retryable,retryAfterMs:error.retryAfterMs}};
      }
      read=peer?await peer.completeYouTubeVideoRead(...args,read.requestHash,read.attempt,claim,response):await this.journal.complete(...args,read.requestHash,read.attempt,claim,response,Date.now());
    }
    if(!read.response) return this.pending(active.receipt);
    if(read.response.status==='error') {
      const error=read.response.error;throw new OtwPlayYouTubeMetadataError(error.message,error.code,error.retryable,error.retryAfterMs);
    }
    if(read.response.status!=='success') throw new Error('Wrong original catalog metadata result');
    const owner=await this.repository.readTransition(op.transitionId);
    if(owner.sourceSite===this.site) active.dependency=await this.repository.resolveVideoDependency(op.transitionId,op.operationId,op.payloadHash,read.requestKey);
    return read.response.video;
  }
  /** A new business validation failure cannot discard a read already reached
   * by the original delivery. Never-issued later positions remain untouched. */
  private async reconcileReached(active:Active,command:VideoCatalogCommand) {
    const op=active.receipt.operation;
    for(const {videoId,index} of videoCatalogReads(command)) {
      const args=[op.transitionId,op.operationId,op.payloadHash,youtubeVideoRequestKey(videoId,index)] as const;
      const read=active.peer?await active.peer.youtubeVideoRead(...args):await this.journal.read(...args);
      if(!read.response&&!read.exhausted&&(read.attempt>0||read.claim!==null)) {
        try {await this.read(active,videoId,index);} catch(error) {if(!(error instanceof OtwPlayYouTubeMetadataError)) throw error;}
      }
    }
  }
  private async finishApprovalNoop(active:Active,command:VideoCatalogCommand) {
    const op=active.receipt.operation;
    await this.reconcileReached(active,command);
    const control=await this.completion(active);
    if(control.failure) this.failure({kind:'metadata',code:control.failure.code,message:control.failure.message},control);
    const saved=await this.repository.prepareVideoApprovalNoop(op.transitionId,op.operationId,control);
    const proof=active.peer?await active.peer.prepareVideoApprovalNoop(op.transitionId,op.operationId,op.payloadHash):await this.journal.prepareApprovalNoop(op.transitionId,op.operationId,op.payloadHash,{control,resultHash:saved.resultHash});
    await this.repository.completeVideoApprovalNoop(op.transitionId,op.operationId,proof);
    const receipt=await this.repository.readVideoReceipt(op.operationId);
    if(!receipt?.result) throw new Error('Missing original approved result');
    return receipt.result;
  }
  async run<T extends VideoCatalogResultData>(command:VideoCatalogCommand,execute:(command:VideoCatalogCommand,reader:OtwPlayYouTubeMetadataReader)=>Promise<OtwPlayAdminCommandResponse<T>>):Promise<OtwPlayAdminCommandResponse<T>> {
    if(command.action==='candidate_convert') throw new Error('Conversion requires its original whole-command executor');
    if(this.active) throw new Error('Concurrent video command on one owning service');
    if(!this.resume&&!command.actor?.userId) throw new Error('Video admission requires its authenticated own actor');
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([command.actor?.userId,this.requestKey??crypto.randomUUID()])));
    const operationId=this.resume?.operationId??`video-${Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,'0')).join('')}`;
    let receipt=await this.repository.readVideoReceipt(operationId);
    if(receipt) {
      if(receipt.command.action!==command.action||JSON.stringify(receipt.command.input)!==JSON.stringify(command.input)||command.action==='proposal_approve'&&(receipt.command.action!=='proposal_approve'||receipt.command.proposalId!==command.proposalId)||!this.resume&&receipt.command.actor?.userId!==command.actor?.userId||this.resume&&(receipt.operation.transitionId!==this.resume.transitionId||receipt.operation.payloadHash!==this.resume.payloadHash)) throw new TransitionWriteError('CONTENT_CONFLICT',this.site,operationId);
    } else {
      if(this.resume) throw new Error('Missing original accepted video command');
      const owner=await this.repository.prepareVideoMutation(command);
      if(!owner) return execute(command,this.reader);
      if(owner.sourceSite===this.site&&['source_fenced','target_owned','complete'].includes(owner.phase)) throw new TransitionWriteError('CONTENT_MOVED',owner.targetSite);
      const parsed=parseVideoCatalogMutation(command)!;
      const subject=command.action==='proposal_approve'?{table:'music_cover_proposals',id:command.proposalId,version:command.input.expectedVersion}:{table:'music_performances',id:command.action==='performance_update'?command.input.id:command.ids.performanceId,version:command.action==='performance_update'?command.input.expectedVersion:null};
      receipt=await this.repository.admitVideoMutation({transitionId:owner.id,operationId,idempotencyKey:operationId,codec:{id:'otw-play.video.mutate',version:1},kind:'content_edit',subject:{table:subject.table,key:JSON.stringify([subject.id])},expectedVersion:subject.version,validation:{contract:1,validatedAt:command.now},admittedAt:command.now,payload:{...parsed}},command);
    }
    if(receipt.operation.outcome) {
      const control=receipt.operation.outcome.youtubeVideo;
      if(!control) throw new Error('Missing original video completion');
      if(receipt.failure) {const failure=parseVideoCatalogFailure(receipt.failure);if(!failure) throw new Error('Invalid original video failure');this.failure(failure,control);}
      if(control.failure) this.failure({kind:'metadata',code:control.failure.code,message:control.failure.message},control);
      if(receipt.operation.outcome.outcome!=='committed'||!receipt.result) throw new TransitionWriteError('CONTENT_CONFLICT',this.site,operationId);
      return receipt.result as OtwPlayAdminCommandResponse<T>;
    }
    const owner=await this.repository.readTransition(receipt.operation.transitionId);
    if(owner.sourceSite===this.site?['source_fenced','target_owned','complete'].includes(owner.phase):!['target_owned','complete'].includes(owner.phase)) return this.pending(receipt);
    const peer=owner.targetSite===this.site&&receipt.operation.sourceSequence!==null?await this.peer():null;
    const original=await this.repository.videoExecutionCommand(owner.id,operationId);
    const active:Active={receipt,peer,control:null,dependency:peer?await peer.youtubeVideoDependency(owner.id,operationId,receipt.operation.payloadHash):null,businessAttempted:false,sqlRejection:null,reviewLock:crypto.randomUUID()};this.active=active;
    let readIndex=0;
    try {
      const prepared=peer?await peer.youtubeVideoFailure(owner.id,operationId,receipt.operation.payloadHash):await this.journal.failurePreparation(owner.id,operationId,receipt.operation.payloadHash);
      if(prepared) {await this.repository.recordVideoFailure(owner.id,operationId,prepared.control,prepared.failure);this.failure(prepared.failure,prepared.control);}
      for(const {videoId,index} of videoCatalogReads(original.command)) {
        const args=[owner.id,operationId,receipt.operation.payloadHash,youtubeVideoRequestKey(videoId,index)] as const;
        const read=peer?await peer.youtubeVideoRead(...args):await this.journal.read(...args);
        if(read.response?.status==='error') {const error=read.response.error;throw new OtwPlayYouTubeMetadataError(error.message,error.code,error.retryable,error.retryAfterMs);}
      }
      if(original.command.action==='proposal_approve'&&await this.repository.videoApprovalNoop(owner.id,operationId,receipt.operation.payloadHash)) return await this.finishApprovalNoop(active,original.command) as OtwPlayAdminCommandResponse<T>;
      const result=await execute({...original.command,reviewLockToken:active.reviewLock},{readChannel:()=>{throw new Error('Video command cannot expand its admitted metadata scope');},readVideo:async videoId=>{
        if(!original.sourceRevisionValid&&original.command.action==='proposal_approve') throw new AdminCatalogServiceError('stale_write','Catalog changed during proposal review');
        const expected=videoCatalogReads(original.command)[readIndex++];
        if(!expected||expected.videoId!==videoId) throw new Error('Metadata request outside original video command');
        return this.read(active,videoId,expected.index);
      }});
      const saved=await this.repository.readVideoReceipt(operationId);
      if(saved?.operation.outcome?.outcome==='committed'&&saved.result) return saved.result as OtwPlayAdminCommandResponse<T>;
      if(original.command.action==='proposal_approve') {
        return await this.finishApprovalNoop(active,original.command) as OtwPlayAdminCommandResponse<T>;
      }
      if(active.businessAttempted) throw new Error('Missing original video saved result');
      return result;
    } catch(error) {
      if(owner.sourceSite===this.site&&(await this.repository.readTransition(owner.id)).phase==='source_fenced'&&!(await this.repository.exportOperation(owner.id,operationId)).outcome) return await this.pending(receipt);
      const known=error instanceof AdminCatalogServiceError?{kind:'service' as const,code:error.code,message:error.message,...(error.fields?{fields:error.fields}:{})}:error instanceof AdminCatalogRepositoryError?{kind:'repository' as const,code:error.code,message:error.message,...(error.fields?{fields:error.fields}:{}),...(active.sqlRejection?{sqlError:active.sqlRejection}:{})}:error instanceof OtwPlayYouTubeMetadataError?{kind:'metadata' as const,code:error.code,message:error.message}:null;
      const failure=parseVideoCatalogFailure(known);
      if(failure&&(!active.businessAttempted||active.sqlRejection)&&!(await this.repository.exportOperation(owner.id,operationId)).outcome) {
        try {
        await this.reconcileReached(active,original.command);
        const control=await this.completion(active),args=[owner.id,operationId,receipt.operation.payloadHash,control,failure] as const;
        const prepared=peer?await peer.prepareYouTubeVideoFailure(...args):await this.journal.prepareFailure(...args,Date.now());
        await this.repository.recordVideoFailure(owner.id,operationId,prepared.control,prepared.failure);
        this.failure(prepared.failure,prepared.control);
        } catch(closureError) {
          if(owner.sourceSite===this.site&&['source_fenced','target_owned','complete'].includes((await this.repository.readTransition(owner.id)).phase)&&!(await this.repository.exportOperation(owner.id,operationId)).outcome) return await this.pending(receipt);
          throw closureError;
        }
      }
      throw error;
    } finally {
      this.active=null;
      const terminal=await this.repository.exportOperation(owner.id,operationId);
      if(!peer&&terminal.outcome?.youtubeVideo) await this.journal.settle(owner.id,operationId,terminal.payloadHash,terminal.outcome,Date.now());
    }
  }
  async runConversion(identity:CandidateConversionIdentity,prepare:()=>Promise<CandidateConversionCommand>,execute:(command:CandidateConversionCommand,execution:CandidateConversionExecution)=>Promise<OtwPlayIngestionConversionResultDto>,reject:(error:unknown)=>Promise<OtwPlayIngestionConversionResultDto>) {
    if(this.active) throw new Error('Concurrent original conversion');
    if(!this.resume&&!identity.actor?.userId) throw new Error('Conversion requires its own authenticated actor');
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([identity.actor?.userId,identity.jobId,identity.candidateId,identity.expectedVersion])));
    const operationId=this.resume?.operationId??`conversion-${Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,'0')).join('')}`;
    const outcomeReceipt=await this.repository.readConversionOutcomeReceipt(operationId);
    if(outcomeReceipt) {
      if(outcomeReceipt.command.actorUserId!==identity.actor?.userId||outcomeReceipt.command.jobId!==identity.jobId||outcomeReceipt.command.candidateId!==identity.candidateId||outcomeReceipt.command.expectedVersion!==identity.expectedVersion) throw new IngestionRepositoryError('content_conflict','원래 변환 요청과 일치하지 않습니다.');
      const owner=await this.repository.readTransition(outcomeReceipt.operation.transitionId);
      if(!outcomeReceipt.command.jobOnly&&owner.sourceSite===this.site&&['source_fenced','target_owned','complete'].includes(owner.phase)) throw new IngestionRepositoryError('content_moved','이 자료는 대상 사이트에서 편집해 주세요.',{targetSite:owner.targetSite});
      if(outcomeReceipt.result&&outcomeReceipt.operation.outcome) return outcomeReceipt.result;
      throw new IngestionRepositoryError('content_accepted','변환 요청이 접수되었습니다. 잠시 후 다시 확인해 주세요.');
    }
    let receipt=await this.repository.readVideoReceipt(operationId);
    if(receipt) {
      const command=receipt.command;
      if(command.action!=='candidate_convert'||command.input.candidateId!==identity.candidateId||command.input.jobId!==identity.jobId||command.input.expectedVersion!==identity.expectedVersion||(!this.resume&&command.actor?.userId!==identity.actor?.userId)||(this.resume&&(receipt.operation.transitionId!==this.resume.transitionId||receipt.operation.payloadHash!==this.resume.payloadHash))) throw new IngestionRepositoryError('content_conflict','원래 변환 요청과 일치하지 않습니다.');
    } else {
      if(this.resume) throw new Error('Missing admitted conversion');
      // Preserve the original job-scope rejection before claiming any authority
      // over a candidate which the requested job does not actually contain.
      const belongs=await this.repository.conversionCandidateBelongsToJob(identity.jobId,identity.candidateId);
      const candidateOwner=belongs?await this.repository.findConversionCandidateTransition(identity.candidateId):null;
      if(candidateOwner?.sourceSite===this.site&&['source_fenced','target_owned','complete'].includes(candidateOwner.phase)) throw new IngestionRepositoryError('content_moved','이 자료는 대상 사이트에서 편집해 주세요.',{targetSite:candidateOwner.targetSite});
      let command:CandidateConversionCommand;
      try {command=await prepare();}catch(error){if(error instanceof IngestionRepositoryError&&['not_found','stale_message','stale_write','validation_failed'].includes(error.code)) return reject(error);throw error;}
      const owner=await this.repository.prepareVideoMutation(command);
      if(!owner) return execute(command,{reader:this.reader,preflight:read=>read()});
      if(owner.sourceSite===this.site&&['source_fenced','target_owned','complete'].includes(owner.phase)) throw new IngestionRepositoryError('content_moved','이 자료는 대상 사이트에서 편집해 주세요.',{targetSite:owner.targetSite});
      receipt=await this.repository.admitVideoMutation({transitionId:owner.id,operationId,idempotencyKey:operationId,codec:{id:'otw-play.candidate.convert',version:1},kind:'content_edit',subject:{table:'music_ingestion_candidates',key:JSON.stringify([command.input.candidateId])},expectedVersion:command.input.expectedVersion,validation:{contract:1,validatedAt:command.now},admittedAt:command.now,payload:{...parseVideoCatalogMutation(command)!}},command);
    }
    const owner=await this.repository.readTransition(receipt.operation.transitionId),op=receipt.operation;
    if(receipt.operation.outcome) {
      if(owner.sourceSite===this.site&&['source_fenced','target_owned','complete'].includes(owner.phase)) throw new IngestionRepositoryError('content_moved','이 자료는 대상 사이트에서 편집해 주세요.',{targetSite:owner.targetSite});
      if(!receipt.conversionResult) throw new Error('Missing original conversion result');
      return receipt.conversionResult;
    }
    if(owner.sourceSite===this.site?['source_fenced','target_owned','complete'].includes(owner.phase):!['target_owned','complete'].includes(owner.phase)) return this.pending(receipt);
    const peer=owner.targetSite===this.site&&op.sourceSequence!==null?await this.peer():null;
    const execution=await this.repository.videoExecutionCommand(owner.id,operationId),command=execution.command;
    if(command.action!=='candidate_convert') throw new Error('Wrong original conversion executor');
    const active:Active={receipt,peer,control:null,dependency:null,businessAttempted:false,sqlRejection:null,reviewLock:''};this.active=active;
    let readIndex=0;
    try {
      const prepared=peer?await peer.youtubeVideoFailure(owner.id,operationId,op.payloadHash):await this.journal.failurePreparation(owner.id,operationId,op.payloadHash);
      if(prepared&&!prepared.failure.conversionOutcome) throw new Error('Missing original prepared conversion outcome');
      const result=await execute(command,{preparedOutcome:prepared?.failure.conversionOutcome,reader:{readChannel:()=>{throw new Error('Conversion cannot expand admitted metadata scope');},readVideo:async videoId=>{
        const expected=videoCatalogReads(command)[readIndex++];if(!expected||expected.videoId!==videoId) throw new Error('Conversion metadata outside admitted positions');
        return this.read(active,videoId,expected.index);
      }},preflight:async read=>{
        let stage=await this.repository.conversionPreflight(owner.id,operationId,op.payloadHash);
        if(!stage&&peer) stage=await peer.conversionPreflight(owner.id,operationId,op.payloadHash);
        if(stage) {
          await this.repository.saveConversionPreflight(owner.id,operationId,stage);readIndex=1;
        } else {
          const result=await read(),key=youtubeVideoRequestKey(command.input.videoId,0),response=peer?await peer.youtubeVideoRead(owner.id,operationId,op.payloadHash,key):await this.journal.read(owner.id,operationId,op.payloadHash,key);
          if(!response.responseHash||response.response?.status!=='success') throw new Error('Missing original preflight response');
          stage=await this.repository.saveConversionPreflight(owner.id,operationId,{site:this.site,transitionId:owner.id,operationId,payloadHash:op.payloadHash,generation:this.site===owner.sourceSite?owner.generation-1:owner.generation,requestHash:response.requestHash,responseHash:response.responseHash,result:{catalogRevision:result.catalogRevision,duplicate:result.duplicate,channel:{state:result.channel.state,catalogChannelId:result.channel.catalogChannelId,channelRole:result.channel.channelRole}}});
        }
        const revision=await this.repository.conversionRevision(owner.id,operationId);
        return {...stage.result,catalogRevision:revision.revision};
      }});
      const saved=await this.repository.readVideoReceipt(operationId);
      if(!saved?.operation.outcome||!saved.conversionResult) throw new Error('Original conversion bookkeeping is not complete');
      if(JSON.stringify(result)!==JSON.stringify(saved.conversionResult)) throw new Error('Original conversion result mismatch');
      return saved.conversionResult;
    } catch(error) {
      const saved=await this.repository.readVideoReceipt(operationId);
      if(saved?.operation.outcome&&saved.conversionResult) return saved.conversionResult;
      if(owner.sourceSite===this.site&&['source_fenced','target_owned','complete'].includes((await this.repository.readTransition(owner.id)).phase)) return await this.pending(receipt);
      throw error;
    } finally {
      this.active=null;
      const saved=await this.repository.exportOperation(owner.id,operationId);
      if(!peer&&saved.outcome?.youtubeVideo) await this.journal.settle(owner.id,operationId,op.payloadHash,saved.outcome,Date.now());
    }
  }
  async write<T extends VideoCatalogResultData>(statements:D1PreparedStatement[],capture:VideoCatalogResultCapture):Promise<OtwPlayAdminCommandResponse<T>|null> {
    const active=this.active;if(!active) return null;
    const op=active.receipt.operation,execution=await this.repository.videoExecutionCommand(op.transitionId,op.operationId);
    if(!execution.sourceRevisionValid||execution.command.action==='candidate_convert'&&!(await this.repository.conversionRevision(op.transitionId,op.operationId)).valid) throw new AdminCatalogRepositoryError('stale_write','Catalog changed after video preflight');
    if(active.dependency?.recognizedChannelAllowed===false) throw new AdminCatalogRepositoryError('validation_failed','The detected channel is not an authoritative member channel',{channel:'member_mismatch'});
    await this.repository.checkVideoDependency(op.transitionId,op.operationId,active.dependency);
    active.control=await this.completion(active);
    if(active.control.failure||active.control.reads.some(read=>read.disposition!=='consumed')) throw new Error('Missing durable original video metadata');
    const owner=await this.repository.readTransition(op.transitionId);active.businessAttempted=true;
    try {await this.repository.commitVideo(owner.id,op.operationId,owner.sourceSite===this.site?owner.generation-1:owner.generation,statements,active.control,capture,active.dependency);}
    catch(error) {
      const message=error instanceof Error?error.message:String(error);
      if(execution.command.action==='candidate_convert'&&/Expected version conflict/.test(message)) throw new AdminCatalogRepositoryError('stale_write','Ingestion candidate changed during conversion');
      if(isPublicationCutoffSqlError(message)||/^D1_ERROR: (?:UNIQUE|NOT NULL|CHECK|FOREIGN KEY) constraint failed(?:: music_[A-Za-z0-9_. ,]+)?: SQLITE_CONSTRAINT\b/.test(message)) active.sqlRejection=message;
      const terminal=(await this.repository.exportOperation(owner.id,op.operationId)).outcome;
      if(terminal?.outcome!=='committed') {
        if(owner.sourceSite===this.site&&(await this.repository.readTransition(owner.id)).phase==='source_fenced') return this.pending(active.receipt);
        if(terminal?.outcome==='conflicted') throw new TransitionWriteError('CONTENT_CONFLICT',this.site,op.operationId);
        if(execution.command.action==='candidate_convert'&&!active.sqlRejection) return this.pending(active.receipt);
        throw error;
      }
    }
    const saved=await this.repository.readVideoReceipt(op.operationId),result=capture.kind==='entry'?saved?.entryResult:saved?.result;
    if(!result||saved?.operation.outcome?.outcome!=='committed') throw new Error('Missing original video saved result');
    return result as OtwPlayAdminCommandResponse<T>;
  }
  async historicalEvent(event:VideoCatalogEvent) {
    const active=this.active;if(!active||active.receipt.command.actor!==null||active.receipt.operation.sourceSequence===null) throw new Error('Historical event requires the original transferred video command');
    return this.repository.transferredVideoEvent(active.receipt.operation.transitionId,active.receipt.operation.operationId,event);
  }
  async transferredApproval(proposalId:string,lockToken:string) {
    const active=this.active;if(!active||active.reviewLock!==lockToken) throw new Error('Approval requires its actual target-local execution lock');
    return this.repository.transferredVideoApproval(active.receipt.operation.transitionId,active.receipt.operation.operationId,proposalId,lockToken);
  }
  async conversionJobScope(jobId:string|null,candidateId:string,alias:'candidate'|'music_ingestion_candidates'='candidate') {
    const active=this.active;if(!active||active.receipt.command.action!=='candidate_convert') return null;
    const command=active.receipt.command;
    if(command.input.jobId!==jobId||command.input.candidateId!==candidateId) throw new Error('Conversion job scope changed');
    return this.repository.conversionJobScope(active.receipt.operation.transitionId,active.receipt.operation.operationId,alias);
  }
  async conversionEvent(event:{eventId:string;jobId:string|null;candidateId:string;eventType:string;detailJson:string;now:number;fromChanges?:boolean}) {
    const active=this.active;if(!active||active.receipt.command.action!=='candidate_convert'||active.receipt.command.actor!==null||active.receipt.operation.sourceSequence===null) throw new Error('Historical conversion event requires original imported command');
    return this.repository.transferredConversionEvent(active.receipt.operation.transitionId,active.receipt.operation.operationId,event);
  }
  async writeConversionOutcome(command:Parameters<import('../application/ports/ingestion-repository').IngestionRepository['recordConversionOutcome']>[0],statements:D1PreparedStatement[]) {
    if(this.outcomeActive) {
      const {owner,operationId,source,command:original}=this.outcomeActive;
      if(JSON.stringify(parseConversionOutcome(command))!==JSON.stringify(parseConversionOutcome(original))||command.eventId!==original.eventId||command.actorUserId!==original.actorUserId||command.now!==original.now) throw new Error('Changed original no-GET conversion outcome');
      const input={transitionId:owner.id,operationId,idempotencyKey:operationId,codec:{id:source?'otw-play.conversion-outcome.local':'otw-play.conversion-outcome.mutate',version:1},kind:'content_edit' as const,subject:await this.repository.conversionOutcomeSubject(original),expectedVersion:null,validation:{contract:1,validatedAt:original.now},admittedAt:original.now,payload:{...parseConversionOutcome(original)!}};
      if(!source&&!this.resume) {
        const accepted=await this.repository.admitNativeConversionOutcome(input,original);
        if(!['target_owned','complete'].includes(owner.phase)||JSON.stringify(accepted.command)!==JSON.stringify(original)) {
          try {await this.dispatch({type:'content-transition.operation',version:1,transitionId:owner.id,operationId,payloadHash:accepted.operation.payloadHash});}catch{/* Durable dispatch retains the exact outcome responsibility. */}
          throw new IngestionRepositoryError('content_accepted','변환 요청이 접수되었습니다. 잠시 후 다시 확인해 주세요.');
        }
      }
      try {await this.repository.commitLocalConversionOutcome(owner.id,operationId,source?owner.generation-1:owner.generation,statements,original,source?input:undefined);}
      catch(error) {if(source&&['source_fenced','target_owned','complete'].includes((await this.repository.readTransition(owner.id)).phase)) throw new IngestionRepositoryError('content_moved','이 자료는 대상 사이트에서 편집해 주세요.',{targetSite:owner.targetSite});throw error;}
      const saved=await this.repository.readConversionOutcomeReceipt(operationId);if(!saved?.result||!saved.operation.outcome) throw new Error('Missing original no-GET conversion result');return saved.result;
    }
    const active=this.active;if(!active||active.receipt.command.action!=='candidate_convert') return null;
    const op=active.receipt.operation,original=active.receipt.command;
    if(command.candidateId!==original.input.candidateId||command.jobId!==original.input.jobId||command.expectedVersion!==original.input.expectedVersion||command.actorUserId!==(original.actor?.userId??null)||command.eventId!==original.ids.outcomeEventId||command.now!==original.now) throw new Error('Conversion bookkeeping changed original authority');
    const prior=await this.repository.readVideoReceipt(op.operationId);
    if(prior?.operation.outcome&&prior.conversionResult) return prior.conversionResult;
    await this.reconcileReached(active,original);
    const control=await this.completion(active);
    const failure:YouTubeVideoFailure={kind:'repository',code:command.outcome==='duplicate'?'duplicate_source':command.outcome==='stale'?'stale_write':'validation_failed',message:`Original conversion outcome: ${command.outcome}`,conversionOutcome:{outcome:command.outcome,performanceId:command.performanceId,errorCode:command.errorCode}};
    const prepared=active.peer?await active.peer.prepareYouTubeVideoFailure(op.transitionId,op.operationId,op.payloadHash,control,failure):await this.journal.prepareFailure(op.transitionId,op.operationId,op.payloadHash,control,failure,Date.now());
    const owner=await this.repository.readTransition(op.transitionId);
    await this.repository.commitConversionOutcome(op.transitionId,op.operationId,owner.sourceSite===this.site?owner.generation-1:owner.generation,command,statements,prepared.control);
    const saved=await this.repository.readVideoReceipt(op.operationId);
    if(!saved?.operation.outcome||!saved.conversionResult) throw new Error('Missing original conversion bookkeeping result');
    return saved.conversionResult;
  }
  async executeConversionOutcome(command:OriginalOutcome,belongsToJob:boolean,execute:(original:OriginalOutcome)=>Promise<ConversionOutcomeCommand['outcome']>) {
    if(this.active) return execute(command);
    if(!command.actorUserId||this.outcomeActive) throw new Error('Missing own conversion outcome actor');
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([command.actorUserId,command.jobId,command.candidateId,command.expectedVersion]))),operationId=this.resume?.operationId??`conversion-${Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,'0')).join('')}`;
    const receipt=await this.repository.readConversionOutcomeReceipt(operationId),owner=receipt?await this.repository.readTransition(receipt.operation.transitionId):!belongsToJob&&command.jobId?await this.repository.findConversionJobTransition(command.jobId):await this.repository.findConversionCandidateTransition(command.candidateId);
    if(!owner) return execute(command);
    if(receipt&&(receipt.command.actorUserId!==command.actorUserId||receipt.command.jobId!==command.jobId||receipt.command.candidateId!==command.candidateId||receipt.command.expectedVersion!==command.expectedVersion||this.resume&&(receipt.operation.payloadHash!==this.resume.payloadHash||receipt.operation.transitionId!==this.resume.transitionId))) throw new IngestionRepositoryError('content_conflict','원래 변환 요청과 일치하지 않습니다.');
    const source=owner.sourceSite===this.site;
    if(source&&['source_fenced','target_owned','complete'].includes(owner.phase)) throw new IngestionRepositoryError('content_moved','이 자료는 대상 사이트에서 편집해 주세요.',{targetSite:owner.targetSite});
    if(receipt?.result&&receipt.operation.outcome) return receipt.result.outcome as ConversionOutcomeCommand['outcome'];
    if(receipt&&!['target_owned','complete'].includes(owner.phase)) throw new IngestionRepositoryError('content_accepted','변환 요청이 접수되었습니다. 잠시 후 다시 확인해 주세요.');
    const version=!belongsToJob?undefined:receipt?.command.validatedVersion??await this.repository.readConversionCandidateVersion(command.candidateId);
    if(version===null) throw new IngestionRepositoryError('not_found','Ingestion candidate was not found');
    const original=receipt?.command??{...command,actorUserId:command.actorUserId,...(!belongsToJob?{jobOnly:true as const,outcome:'validation_failed' as const}: {validatedVersion:version!})};
    this.outcomeActive={owner,operationId,source,command:original};
    try {return await execute(original);}finally {this.outcomeActive=null;}
  }
}
