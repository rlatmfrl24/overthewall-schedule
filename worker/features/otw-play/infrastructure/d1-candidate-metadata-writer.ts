import type {CandidateChannelContinuation} from './candidate-channel-continuation';
import type {TransitionOperationMessage} from '@contracts/content-transition-queue';
import type {CandidateMetadataFacts,YouTubeVideoCompletion,YouTubeVideoFailure,YouTubeVideoReadResponse} from '@contracts/content-transition-youtube';
import { D1TransitionRepository, D1YouTubeVideoReadJournal, youtubeVideoRequestKey, type TransitionPeer } from '../../content-transition';
import type {CandidateMetadataTransitionPort} from '../application/ports/candidate-metadata-transition';
import {IngestionRepositoryError} from '../application/ports/ingestion-repository';
import {OtwPlayYouTubeMetadataError,type OtwPlayYouTubeBatchMetadataReader} from '../application/ports/youtube-metadata';
import {parseCandidateMetadataMutation} from '../domain/candidate-metadata-command';

type Receipt=NonNullable<Awaited<ReturnType<D1TransitionRepository['readCandidateMetadataReceipt']>>>;
type Active={receipt:Receipt;peer:TransitionPeer|null;source:boolean;businessAttempted:boolean};
/** Only the original administrator refresh uses this single observation. The
 * reader retains ingestion quota accounting and the original classification. */
export class D1CandidateMetadataWriter implements CandidateMetadataTransitionPort {
  get hasAdmittedRefresh() { return Boolean(this.active||this.approval?.refreshActive); }
  private readonly approval?:CandidateChannelContinuation;
  private active:Active|null=null;
  private readonly repository:D1TransitionRepository;private readonly journal:D1YouTubeVideoReadJournal;private readonly reader:OtwPlayYouTubeBatchMetadataReader;private readonly site:'otw'|'luvdia';
  private readonly dispatch:(message:TransitionOperationMessage)=>Promise<void>;private readonly peer:()=>Promise<TransitionPeer>;private readonly resume?:TransitionOperationMessage;
  constructor(repository:D1TransitionRepository,journal:D1YouTubeVideoReadJournal,reader:OtwPlayYouTubeBatchMetadataReader,site:'otw'|'luvdia',dispatch:(message:TransitionOperationMessage)=>Promise<void>,peer:()=>Promise<TransitionPeer>,resume?:TransitionOperationMessage,approval?:CandidateChannelContinuation) {
    this.repository=repository;this.journal=journal;this.reader=reader;this.site=site;this.dispatch=dispatch;this.peer=peer;this.resume=resume;this.approval=approval;
  }
  private async pending(receipt:Receipt):Promise<never> {
    const op=receipt.operation;
    try {await this.dispatch({type:'content-transition.operation',version:1,transitionId:op.transitionId,operationId:op.operationId,payloadHash:op.payloadHash});} catch { /* The admitted request remains recoverable. */ }
    throw new IngestionRepositoryError('content_accepted','메타데이터 새로고침 요청이 접수되었습니다. 잠시 후 다시 확인해 주세요.',{targetSite:this.site,operationId:op.operationId});
  }
  private failure(failure:YouTubeVideoFailure,control:YouTubeVideoCompletion):never {
    if(failure.kind==='ingestion') throw new IngestionRepositoryError(failure.code,failure.message);
    if(failure.kind!=='metadata'||!control.failure) throw new Error('Invalid original metadata refresh failure');
    const error=control.failure;throw new OtwPlayYouTubeMetadataError(error.message,error.code,error.retryable,error.retryAfterMs);
  }
  private completion(active:Active) {
    const op=active.receipt.operation,args=[op.transitionId,op.operationId,op.payloadHash] as const;
    return active.peer?active.peer.youtubeVideoCompletion(...args):this.journal.completion(...args);
  }
  private async read(active:Active) {
    const op=active.receipt.operation,peer=active.peer,command=active.receipt.command,args=[op.transitionId,op.operationId,op.payloadHash,youtubeVideoRequestKey(command.videoId,0)] as const;
    let read=peer?await peer.youtubeVideoRead(...args):await this.journal.read(...args);
    if(!read.response&&!read.exhausted&&read.attempt>=4) read=peer?await peer.exhaustYouTubeVideoRead(...args):await this.journal.exhaust(...args,Date.now());
    if(read.exhausted) {
      const control=await this.completion(active);
      if(!(await this.repository.exportOperation(op.transitionId,op.operationId)).outcome) await this.repository.recordOutcome(op.transitionId,op.operationId,{outcome:'failed',sideEffectReconciled:true,detail:'Original admin video GET exhausted four interrupted HTTP attempts without a durable response; no catalog business committed',youtubeVideo:control});
      this.failure({kind:'metadata',code:'network',message:control.failure!.message},control);
    }
    if(!read.response) {
      const claimed=peer?await peer.claimYouTubeVideoRead(...args):await this.journal.claim(...args,Date.now());read=claimed.receipt;
      if(!claimed.claimed||!read.claim) return this.pending(active.receipt);
      const claim=read.claim;let response:YouTubeVideoReadResponse;
      try {
        const observation=(await this.reader.readVideos([command.videoId],{beforeHttp:async()=>{read=peer?await peer.startYouTubeVideoRead(...args,read.requestHash,claim):await this.journal.start(...args,read.requestHash,claim,Date.now());}}))[0];
        if(!observation||observation.videoId!==command.videoId) throw new OtwPlayYouTubeMetadataError('YouTube candidate metadata is unavailable');
        response={status:'observation',observation};
      } catch(error) {
        if(!(error instanceof OtwPlayYouTubeMetadataError)) throw error;
        response={status:'error',error:{message:error.message,code:error.code,retryable:error.retryable,retryAfterMs:error.retryAfterMs}};
      }
      read=peer?await peer.completeYouTubeVideoRead(...args,read.requestHash,read.attempt,claim,response):await this.journal.complete(...args,read.requestHash,read.attempt,claim,response,Date.now());
    }
    if(!read.response) return this.pending(active.receipt);
    if(read.response.status==='error') {const error=read.response.error;throw new OtwPlayYouTubeMetadataError(error.message,error.code,error.retryable,error.retryAfterMs);}
    if(read.response.status!=='observation') throw new Error('Wrong original ingestion observation');
    return read.response.observation;
  }
  runRefresh:CandidateMetadataTransitionPort['runRefresh']=async(identity,prepare,execute)=>{
    if(this.approval?.refreshActive) return this.approval.runRefreshChild(identity,execute);
    if(this.active||!this.resume&&!identity.actor?.userId) throw new Error('Missing own administrator refresh authority');
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([identity.actor?.userId,identity.candidateId,identity.expectedVersion])));
    const operationId=this.resume?.operationId??`candidate-metadata-${Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')}`;
    let receipt=await this.repository.readCandidateMetadataReceipt(operationId);
    if(receipt) {
      if(receipt.command.candidateId!==identity.candidateId||receipt.command.expectedVersion!==identity.expectedVersion||!this.resume&&receipt.command.actor?.userId!==identity.actor?.userId||this.resume&&(receipt.operation.transitionId!==this.resume.transitionId||receipt.operation.payloadHash!==this.resume.payloadHash)) throw new IngestionRepositoryError('content_conflict','원래 새로고침 요청과 일치하지 않습니다.');
    } else {
      if(this.resume) throw new Error('Missing admitted original refresh');
      const owner=await this.repository.findConversionCandidateTransition(identity.candidateId);
      if(owner?.sourceSite===this.site&&['source_fenced','target_owned','complete'].includes(owner.phase)) throw new IngestionRepositoryError('content_moved','이 자료는 대상 사이트에서 편집해 주세요.',{targetSite:owner.targetSite});
      const command=await prepare();
      if(!owner) return execute(command,async()=>(await this.reader.readVideos([command.videoId]))[0]);
      receipt=await this.repository.admitCandidateMetadata({transitionId:owner.id,operationId,idempotencyKey:operationId,codec:{id:'otw-play.candidate.refresh',version:1},kind:'content_edit',subject:{table:'music_ingestion_candidates',key:JSON.stringify([command.candidateId])},expectedVersion:command.expectedVersion,validation:{contract:1,validatedAt:command.now},admittedAt:command.now,payload:{...parseCandidateMetadataMutation(command)!}},command);
    }
    const op=receipt.operation,owner=await this.repository.readTransition(op.transitionId),source=owner.sourceSite===this.site;
    if(op.outcome) {
      if(source&&['source_fenced','target_owned','complete'].includes(owner.phase)) throw new IngestionRepositoryError('content_moved','이 자료는 대상 사이트에서 편집해 주세요.',{targetSite:owner.targetSite});
      if(!op.outcome.youtubeVideo) throw new Error('Missing original refresh completion');
      if(receipt.failure) this.failure(receipt.failure,op.outcome.youtubeVideo);
      if(op.outcome.youtubeVideo.failure) this.failure({kind:'metadata',code:op.outcome.youtubeVideo.failure.code,message:op.outcome.youtubeVideo.failure.message},op.outcome.youtubeVideo);
      if(op.outcome.outcome!=='committed'||!receipt.result) throw new Error('Missing original refresh result');
      return receipt.result;
    }
    if(source?['source_fenced','target_owned','complete'].includes(owner.phase):!['target_owned','complete'].includes(owner.phase)) return this.pending(receipt);
    const peer=!source&&op.sourceSequence!==null?await this.peer():null,active:Active={receipt,peer,source,businessAttempted:false};this.active=active;
    try {
      const prepared=peer?await peer.youtubeVideoFailure(owner.id,operationId,op.payloadHash):await this.journal.failurePreparation(owner.id,operationId,op.payloadHash);
      if(prepared) {await this.repository.recordCandidateMetadataFailure(owner.id,operationId,prepared.control,prepared.failure);this.failure(prepared.failure,prepared.control);}
      await execute(receipt.command,()=>this.read(active));
      const saved=await this.repository.readCandidateMetadataReceipt(operationId);
      if(!saved?.operation.outcome||!saved.result) throw new Error('Original refresh result is not committed');
      return saved.result;
    } catch(error) {
      if(source&&['source_fenced','target_owned','complete'].includes((await this.repository.readTransition(owner.id)).phase)&&!(await this.repository.exportOperation(owner.id,operationId)).outcome) return await this.pending(receipt);
      const failure:YouTubeVideoFailure|null=error instanceof IngestionRepositoryError&&(error.code==='not_found'||error.code==='stale_message'||error.code==='stale_write'||error.code==='validation_failed'||error.code==='unavailable')?{kind:'ingestion',code:error.code,message:error.message}:error instanceof OtwPlayYouTubeMetadataError?{kind:'metadata',code:error.code,message:error.message}:null;
      if(failure&&!active.businessAttempted&&!(await this.repository.exportOperation(owner.id,operationId)).outcome) {
        const args=[owner.id,operationId,op.payloadHash,youtubeVideoRequestKey(receipt.command.videoId,0)] as const,read=peer?await peer.youtubeVideoRead(...args):await this.journal.read(...args);
        if(!read.response&&!read.exhausted&&(read.attempt>0||read.claim!==null)) {try {await this.read(active);}catch(recoveryError){if(!(recoveryError instanceof OtwPlayYouTubeMetadataError)) throw recoveryError;}}
        const control=await this.completion(active),prepared=peer?await peer.prepareYouTubeVideoFailure(owner.id,operationId,op.payloadHash,control,failure):await this.journal.prepareFailure(owner.id,operationId,op.payloadHash,control,failure,Date.now());
        await this.repository.recordCandidateMetadataFailure(owner.id,operationId,prepared.control,prepared.failure);
      }
      throw error;
    } finally {
      this.active=null;
      const saved=await this.repository.exportOperation(owner.id,operationId);
      if(!peer&&saved.outcome?.youtubeVideo) await this.journal.settle(owner.id,operationId,op.payloadHash,saved.outcome,Date.now());
    }
  };
  async facts(read:()=>Promise<CandidateMetadataFacts>):Promise<CandidateMetadataFacts> {
    if(this.approval?.refreshActive) return this.approval.refreshFacts(read);
    const active=this.active;if(!active) return read();
    const op=active.receipt.operation;
    const stage=active.peer?await active.peer.candidateMetadataStage(op.transitionId,op.operationId,op.payloadHash):active.source?await this.repository.candidateMetadataStage(op.transitionId,op.operationId,op.payloadHash):null;
    if(active.peer&&!stage) throw new Error('Missing frozen original refresh facts');
    if(stage) {
      const response=active.peer?await active.peer.youtubeVideoRead(op.transitionId,op.operationId,op.payloadHash,stage.requestKey):await this.journal.read(op.transitionId,op.operationId,op.payloadHash,stage.requestKey);
      if(stage.transitionId!==op.transitionId||stage.operationId!==op.operationId||stage.payloadHash!==op.payloadHash||stage.generation!==op.generation||stage.requestHash!==response.requestHash||stage.responseHash!==response.responseHash||response.response?.status!=='observation'||stage.externalChannelId!==(response.response.observation.video?.channelId??null)) throw new Error('Refresh facts do not match original observation');
      return stage.facts;
    }
    const facts=await read();
    return active.source?(await this.repository.sealCandidateMetadataStage(op.transitionId,op.operationId,op.payloadHash,facts)).facts:facts;
  }
  assertCommand(command:{candidateId:string;expectedVersion:number;observation:{videoId:string};actorUserId:string|null;eventId:string;now:number}) {
    if(this.approval?.refreshActive) {this.approval.assertRefreshChild(command);return;}
    const active=this.active;
    if(!active) {if(command.actorUserId===null) throw new Error('Refresh requires its own administrator');return;}
    const original=active.receipt.command;
    if(command.candidateId!==original.candidateId||command.expectedVersion!==original.expectedVersion||command.observation.videoId!==original.videoId||command.eventId!==original.eventId||command.now!==original.now||command.actorUserId!==(original.actor?.userId??null)||command.actorUserId===null&&!active.peer) throw new Error('Refresh batch outside original command');
  }
  async events(detailJson:string,ordinary:()=>D1PreparedStatement[]) {
    if(this.approval?.refreshActive) return this.approval.refreshEvent(detailJson,ordinary);
    const active=this.active;if(!active?.peer) return ordinary();
    const op=active.receipt.operation;return this.repository.transferredCandidateMetadataEvent(op.transitionId,op.operationId,detailJson);
  }
  async eventExists(eventId:string):Promise<boolean|null> {
    if(this.approval?.refreshActive) return this.approval.refreshEventExists(eventId);
    const active=this.active;if(!active?.peer) return null;
    if(eventId!==active.receipt.command.eventId) throw new Error('Refresh event outside original command');
    return this.repository.candidateMetadataEventExists(active.receipt.operation.transitionId,active.receipt.operation.operationId);
  }
  async batch(statements:D1PreparedStatement[],capture:{sql:string;bindings:(string|number|null)[]},ordinary:()=>Promise<unknown>) {
    if(this.approval?.refreshActive) {await this.approval.writeRefreshChild(statements,capture);return;}
    const active=this.active;if(!active) {await ordinary();return;}
    const op=active.receipt.operation,control=await this.completion(active),owner=await this.repository.readTransition(op.transitionId);active.businessAttempted=true;
    try {await this.repository.commitCandidateMetadata(op.transitionId,op.operationId,active.source?owner.generation-1:owner.generation,statements,capture,control);}
    catch(error) {
      if(/Expected version conflict|candidate_metadata_state_conflict/.test(String(error))) {active.businessAttempted=false;throw new IngestionRepositoryError('stale_message','Ingestion candidate changed during metadata refresh');}
      throw error;
    }
  }
}
