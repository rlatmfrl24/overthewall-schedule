import type {TransitionOperationMessage} from '@contracts/content-transition-queue';
import type {YouTubeVideoReadReceipt,YouTubeVideoReadResponse,YouTubeVideoFailure} from '@contracts/content-transition-youtube';
import {D1TransitionRepository,D1YouTubeVideoReadJournal,D1CandidateChannelStages,youtubeVideoRequestKey,candidateChannelRequestKey,type TransitionPeer} from '../../content-transition';
import type {CandidateChannelTransitionPort,CandidateChannelExecution} from '../application/ports/candidate-channel-transition';
import type {CandidateChannelContinuation} from './candidate-channel-continuation';
import {parseCandidateChannelMutation} from '../domain/candidate-channel-command';
import {parseChannelMutation} from '../domain/channel-mutation';
import {parseCandidateMetadataMutation,type CandidateMetadataCommand} from '../domain/candidate-metadata-command';
import {IngestionRepositoryError} from '../application/ports/ingestion-repository';
import {AdminCatalogRepositoryError} from '../application/ports/admin-catalog-repository';
import {IngestionServiceError} from '../application/ingestion-service';
import {OtwPlayYouTubeMetadataError,type OtwPlayYouTubeMetadataReader,type OtwPlayYouTubeBatchMetadataReader} from '../application/ports/youtube-metadata';

type Receipt=NonNullable<Awaited<ReturnType<D1TransitionRepository['readCandidateChannelReceipt']>>>;
type Active={receipt:Receipt;peer:TransitionPeer|null;source:boolean;step:'create'|'update'|null;refresh:CandidateMetadataCommand|null;businessAttempted:boolean;sqlRejection:string|null};
/** The original approve_channel orchestration remains in IngestionService.
 * This adapter binds only its four positions and two separate channel batches. */
export class D1CandidateChannelWriter implements CandidateChannelTransitionPort,CandidateChannelContinuation {
  private readonly repository:D1TransitionRepository;private readonly journal:D1YouTubeVideoReadJournal;private readonly stages:D1CandidateChannelStages;
  private readonly admin:OtwPlayYouTubeMetadataReader;private readonly ingestion:OtwPlayYouTubeBatchMetadataReader;private readonly site:'otw'|'luvdia';
  private readonly dispatch:(message:TransitionOperationMessage)=>Promise<void>;private readonly peer:()=>Promise<TransitionPeer>;private readonly resume?:TransitionOperationMessage;
  private active:Active|null=null;
  constructor(repository:D1TransitionRepository,journal:D1YouTubeVideoReadJournal,stages:D1CandidateChannelStages,admin:OtwPlayYouTubeMetadataReader,ingestion:OtwPlayYouTubeBatchMetadataReader,site:'otw'|'luvdia',dispatch:(message:TransitionOperationMessage)=>Promise<void>,peer:()=>Promise<TransitionPeer>,resume?:TransitionOperationMessage) {
    this.repository=repository;this.journal=journal;this.stages=stages;this.admin=admin;this.ingestion=ingestion;this.site=site;this.dispatch=dispatch;this.peer=peer;this.resume=resume;
  }
  get channelActive() {return this.active?.step!==null&&this.active?.step!==undefined;}
  get refreshActive() {return this.active?.refresh!==null&&this.active?.refresh!==undefined;}
  private current() {if(!this.active) throw new Error('No original channel approval execution');return this.active;}
  private args(active=this.current()) {const op=active.receipt.operation;return [op.transitionId,op.operationId,op.payloadHash] as const;}
  private async pending(receipt:Receipt):Promise<never> {
    const op=receipt.operation;
    try {await this.dispatch({type:'content-transition.operation',version:1,transitionId:op.transitionId,operationId:op.operationId,payloadHash:op.payloadHash});} catch { /* Original accepted responsibility remains durable. */ }
    throw new IngestionRepositoryError('content_accepted','채널 승인 요청이 접수되었습니다. 잠시 후 다시 확인해 주세요.',{targetSite:this.site,operationId:op.operationId});
  }
  private completion() {const a=this.current(),args=this.args(a);return a.peer?a.peer.youtubeVideoCompletion(...args):this.journal.completion(...args);}
  private async read(key:string):Promise<YouTubeVideoReadReceipt> {
    const active=this.current(),args=[...this.args(active),key] as const,peer=active.peer;
    let read=peer?await peer.youtubeVideoRead(...args):await this.journal.read(...args);
    if(!read.response&&!read.exhausted&&read.attempt>=4) read=peer?await peer.exhaustYouTubeVideoRead(...args):await this.journal.exhaust(...args,Date.now());
    if(read.exhausted) throw new OtwPlayYouTubeMetadataError('YouTube metadata request could not be recovered after four interrupted attempts','network',false,null);
    if(!read.response) {
      const claimed=peer?await peer.claimYouTubeVideoRead(...args):await this.journal.claim(...args,Date.now());read=claimed.receipt;
      if(!claimed.claimed||!read.claim) return this.pending(active.receipt);
      const claim=read.claim,beforeHttp=async()=>{read=peer?await peer.startYouTubeVideoRead(...args,read.requestHash,claim):await this.journal.start(...args,read.requestHash,claim,Date.now());};
      let response:YouTubeVideoReadResponse;
      try {
        if(read.request.path==='channels') response={status:'channel',channel:await this.admin.readChannel(read.request.parameters.id,{beforeHttp})};
        else if(read.request.result==='observation') {
          const observation=(await this.ingestion.readVideos([read.request.parameters.id],{beforeHttp}))[0];
          if(!observation) throw new OtwPlayYouTubeMetadataError('YouTube candidate metadata is unavailable','invalid_response',false,null);
          response={status:'observation',observation};
        } else response={status:'success',video:await this.admin.readVideo(read.request.parameters.id,{beforeHttp})};
      } catch(error) {
        if(!(error instanceof OtwPlayYouTubeMetadataError)) throw error;
        response={status:'error',error:{message:error.message,code:error.code,retryable:error.retryable,retryAfterMs:error.retryAfterMs}};
      }
      read=peer?await peer.completeYouTubeVideoRead(...args,read.requestHash,read.attempt,claim,response):await this.journal.complete(...args,read.requestHash,read.attempt,claim,response,Date.now());
    }
    if(!read.response) return this.pending(active.receipt);
    if(read.response.status==='error') {const error=read.response.error;throw new OtwPlayYouTubeMetadataError(error.message,error.code,error.retryable,error.retryAfterMs);}
    return read;
  }
  private failure(receipt:Receipt):never {
    const failure=receipt.failure,control=receipt.operation.outcome?.youtubeVideo;
    if(failure?.kind==='ingestion') {
      if(failure.code==='unavailable') throw new IngestionServiceError('unavailable',failure.message);
      throw new IngestionRepositoryError(failure.code,failure.message);
    }
    if(failure?.kind==='repository'&&failure.code==='validation_failed'&&failure.sqlError) throw new IngestionRepositoryError('validation_failed',failure.message);
    if(control?.failure) {const e=control.failure;throw new OtwPlayYouTubeMetadataError(e.message,e.code,e.retryable,e.retryAfterMs);}
    throw new Error('Missing original channel approval failure');
  }
  run:CandidateChannelTransitionPort['run']=async(identity,prepare,execute)=>{
    if(this.active) throw new Error('Concurrent original channel approval');
    if(!this.resume&&!identity.actor?.userId) throw new Error('Channel approval requires its own administrator');
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([identity.actor?.userId,identity.candidateId,identity.expectedVersion,identity.channel])));
    const operationId=this.resume?.operationId??`candidate-channel-${Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('')}`;
    let receipt=await this.repository.readCandidateChannelReceipt(operationId);
    if(receipt) {
      if(receipt.command.candidateId!==identity.candidateId||receipt.command.expectedVersion!==identity.expectedVersion||JSON.stringify(receipt.command.channel)!==JSON.stringify(identity.channel)||!this.resume&&receipt.command.actor?.userId!==identity.actor?.userId||this.resume&&(receipt.operation.transitionId!==this.resume.transitionId||receipt.operation.payloadHash!==this.resume.payloadHash)) throw new IngestionRepositoryError('content_conflict','원래 채널 승인 요청과 일치하지 않습니다.');
    } else {
      if(this.resume) throw new Error('Missing admitted original channel approval');
      const owner=await this.repository.findConversionCandidateTransition(identity.candidateId);
      if(owner?.sourceSite===this.site&&['source_fenced','target_owned','complete'].includes(owner.phase)) throw new IngestionRepositoryError('content_moved','이 자료는 대상 사이트에서 수정해 주세요.',{targetSite:owner.targetSite});
      const command=await prepare();if(!owner) return execute(command);
      receipt=await this.repository.admitCandidateChannel({transitionId:owner.id,operationId,idempotencyKey:operationId,codec:{id:'otw-play.candidate.channel_approve',version:1},kind:'content_edit',subject:{table:'music_ingestion_candidates',key:JSON.stringify([command.candidateId])},expectedVersion:command.expectedVersion,validation:{contract:1,validatedAt:command.now},admittedAt:command.now,payload:{...parseCandidateChannelMutation(command)!}},command);
    }
    const op=receipt.operation,owner=await this.repository.readTransition(op.transitionId),source=owner.sourceSite===this.site;
    if(op.outcome) {
      if(source&&['source_fenced','target_owned','complete'].includes(owner.phase)) throw new IngestionRepositoryError('content_moved','이 자료는 대상 사이트에서 수정해 주세요.',{targetSite:owner.targetSite});
      if(op.outcome.outcome!=='committed'||!receipt.result) this.failure(receipt);
      return receipt.result;
    }
    if(source?['source_fenced','target_owned','complete'].includes(owner.phase):!['target_owned','complete'].includes(owner.phase)) return this.pending(receipt);
    const peer=!source&&op.sourceSequence!==null?await this.peer():null;
    if(peer) receipt=await this.repository.installCandidateChannelStages(op.transitionId,operationId,op.payloadHash,await peer.candidateChannelStages(op.transitionId,operationId,op.payloadHash));
    const active:Active={receipt,peer,source,step:null,refresh:null,businessAttempted:false,sqlRejection:null};this.active=active;
    try {
      const args=this.args(active),prepared=peer?await peer.youtubeVideoFailure(...args):await this.journal.failurePreparation(...args);
      if(prepared) {await this.repository.recordCandidateMetadataFailure(op.transitionId,operationId,prepared.control,prepared.failure,true);this.failure((await this.repository.readCandidateChannelReceipt(operationId))!);}
      await execute(receipt.command,this.execution());
      const saved=await this.repository.readCandidateChannelReceipt(operationId);
      if(!saved?.result||saved.operation.outcome?.outcome!=='committed') throw new Error('Original channel approval is not complete');
      return saved.result;
    } catch(error) {
      if(source&&['source_fenced','target_owned','complete'].includes((await this.repository.readTransition(owner.id)).phase)&&!(await this.repository.exportOperation(owner.id,operationId)).outcome) return await this.pending(receipt);
      const failure:YouTubeVideoFailure|null=active.sqlRejection&&error instanceof IngestionRepositoryError&&error.code==='validation_failed'?{kind:'repository',code:'validation_failed',message:error.message,sqlError:active.sqlRejection}:error instanceof IngestionRepositoryError&&['not_found','stale_message','stale_write','validation_failed','unavailable'].some(code=>code===error.code)?{kind:'ingestion',code:error.code as 'not_found'|'stale_message'|'stale_write'|'validation_failed'|'unavailable',message:error.message}:error instanceof IngestionServiceError&&error.code==='unavailable'?{kind:'ingestion',code:'unavailable',message:error.message}:error instanceof OtwPlayYouTubeMetadataError?{kind:'metadata',code:error.code,message:error.message}:null;
      if(failure&&(!active.businessAttempted||active.sqlRejection)&&!(await this.repository.exportOperation(owner.id,operationId)).outcome) {
        await this.recoverIssuedReads();
        const args=this.args(active),control=await this.completion(),prepared=peer?await peer.prepareYouTubeVideoFailure(...args,control,failure):await this.journal.prepareFailure(...args,control,failure,Date.now());
        await this.repository.recordCandidateMetadataFailure(owner.id,operationId,prepared.control,prepared.failure,true);
      }
      throw error;
    } finally {
      this.active=null;
      const saved=await this.repository.exportOperation(owner.id,operationId);
      if(!peer&&saved.outcome?.youtubeVideo) await this.journal.settle(owner.id,operationId,op.payloadHash,saved.outcome,Date.now());
    }
  };
  private async controlStages() {const active=this.current(),args=this.args(active);return active.peer?active.peer.candidateChannelStages(...args):this.stages.read(...args);}
  private async recoverIssuedReads() {
    const active=this.current(),stages=await this.controlStages(),videoId=active.receipt.command.videoId;
    const keys=[youtubeVideoRequestKey(videoId,0),...(stages.snapshot?(['create','update'] as const).map(step=>candidateChannelRequestKey(stages.snapshot!.externalChannelId,step)):[]),youtubeVideoRequestKey(videoId,3)];
    for(const key of keys) {
      const args=[...this.args(active),key] as const,read=active.peer?await active.peer.youtubeVideoRead(...args):await this.journal.read(...args);
      if(!read.response&&!read.exhausted&&(read.attempt>0||read.claim!==null)) {try {await this.read(key);}catch(error){if(!(error instanceof OtwPlayYouTubeMetadataError)) throw error;}}
    }
  }
  private execution():CandidateChannelExecution {
    return {
      preflight:async read=>read({readVideo:async id=>{if(id!==this.current().receipt.command.videoId) throw new Error('Approval video scope mismatch');const result=await this.read(youtubeVideoRequestKey(id,0));if(result.response?.status!=='success') throw new Error('Missing original approval video');return result.response.video;},readChannel:()=>{throw new Error('Preflight cannot issue a channel child request');}}),
      snapshot:async read=>{
        const active=this.current(),args=this.args(active);let stages=await this.controlStages();
        if(!stages.snapshot) {
          if(active.peer) throw new Error('Missing source channel dependency snapshot');
          const value=await read();if(value.channels.length>1) throw new Error('Ambiguous original channel snapshot');
          await this.repository.sealCandidateChannelSnapshot(...args,{entities:value.entities,existing:value.channels[0]??null});stages=await this.controlStages();
        }
        return {entities:stages.snapshot!.entities,channels:stages.snapshot!.existing?[stages.snapshot!.existing]:[]};
      },
      channel:async(step,command,execute)=>{
        const active=this.current(),args=this.args(active),pure=parseChannelMutation(command);if(!pure) throw new Error('Invalid original channel child');
        const child=active.peer?await active.peer.prepareCandidateChannelChild(...args,step,pure):await this.stages.prepareChild(...args,step,pure);
        if(child.result) return child.result;
        if(active.peer) active.receipt=await this.repository.installCandidateChannelStages(...args,await this.controlStages());
        active.step=step;active.businessAttempted=false;
        try {
          const result=await execute({...child.command,actor:active.receipt.command.actor});
          if(active.peer) await active.peer.acknowledgeCandidateChannelChild(...args,step);
          active.businessAttempted=false;return result;
        } finally {active.step=null;}
      },
      refresh:async(prepare,execute)=>{
        const active=this.current(),args=this.args(active);let child=(await this.controlStages()).refresh;
        if(!child) {const command=parseCandidateMetadataMutation(await prepare());if(!command) throw new Error('Invalid original refresh child');child=active.peer?await active.peer.prepareCandidateChannelRefresh(...args,command):await this.stages.prepareRefresh(...args,command);}
        if(active.peer) active.receipt=await this.repository.installCandidateChannelStages(...args,await this.controlStages());
        active.refresh={...child.command,actor:active.receipt.command.actor};active.businessAttempted=false;
        try {return await execute(active.refresh);} finally {active.refresh=null;}
      },
    };
  }
  runChannelChild:CandidateChannelContinuation['runChannelChild']=async(command,execute)=>{
    const active=this.current(),child=(await this.repository.readCandidateChannelReceipt(active.receipt.operation.operationId))?.stages?.[active.step!];
    if(!child||JSON.stringify({...child.command,actor:active.receipt.command.actor})!==JSON.stringify(command)) throw new Error('Channel batch is outside its admitted parent');
    if(child.result) return child.result;
    return execute(command,{readVideo:()=>{throw new Error('Channel child cannot issue video metadata');},readChannel:async id=>{if(id!==command.input.externalChannelId) throw new Error('Channel child identity mismatch');const read=await this.read(candidateChannelRequestKey(id,active.step!));if(read.response?.status!=='channel') throw new Error('Missing original channel response');return read.response.channel;}});
  };
  writeChannelChild:CandidateChannelContinuation['writeChannelChild']=async statements=>{
    const active=this.current(),op=active.receipt.operation,owner=await this.repository.readTransition(op.transitionId);active.businessAttempted=true;
    try {return await this.repository.commitCandidateChannelChild(op.transitionId,op.operationId,active.source?owner.generation-1:owner.generation,active.step!,statements,await this.completion());}
    catch(error) {
      const message=error instanceof Error?error.message:String(error);
      if(/Expected version conflict/.test(message)) {active.businessAttempted=false;throw new AdminCatalogRepositoryError('stale_write','Channel changed during approval');}
      // Only the actual rolled-back owning D1 batch can supply this proof.
      // Delivery errors and arbitrary trigger aborts remain recoverable.
      if(/^D1_ERROR: (?:UNIQUE|NOT NULL|CHECK|FOREIGN KEY) constraint failed(?:: music_[A-Za-z0-9_. ,]+)?: SQLITE_CONSTRAINT\b/.test(message)) active.sqlRejection=message;
      throw error;
    }
  };
  channelChildEvent:CandidateChannelContinuation['channelChildEvent']=event=>{const active=this.current();return this.repository.transferredChannelEvent(active.receipt.operation.transitionId,active.receipt.operation.operationId,event,active.step!);};
  runRefreshChild:CandidateChannelContinuation['runRefreshChild']=async(identity,execute)=>{
    const active=this.current(),command=active.refresh;
    if(!command||identity.candidateId!==command.candidateId||identity.expectedVersion!==command.expectedVersion||identity.actor?.userId!==command.actor?.userId) throw new Error('Refresh batch is outside its admitted parent');
    return execute(command,async()=>{const read=await this.read(youtubeVideoRequestKey(command.videoId,3));if(read.response?.status!=='observation') throw new Error('Missing original refresh observation');return read.response.observation;});
  };
  refreshFacts:CandidateChannelContinuation['refreshFacts']=async read=>{
    const active=this.current(),args=this.args(active),receipt=await this.repository.readCandidateChannelReceipt(active.receipt.operation.operationId),prior=receipt?.stages?.refresh?.facts;
    const key=youtubeVideoRequestKey(active.refresh!.videoId,3),response=active.peer?await active.peer.youtubeVideoRead(...args,key):await this.journal.read(...args,key);
    if(prior) {if(prior.operationId!==args[1]||prior.payloadHash!==args[2]||prior.requestHash!==response.requestHash||prior.responseHash!==response.responseHash) throw new Error('Changed original refresh child facts');return prior.facts;}
    return (await this.repository.sealCandidateChannelRefreshFacts(...args,await read(),response)).facts;
  };
  assertRefreshChild:CandidateChannelContinuation['assertRefreshChild']=value=>{const command=this.current().refresh;if(!command||value.candidateId!==command.candidateId||value.expectedVersion!==command.expectedVersion||value.observation.videoId!==command.videoId||value.eventId!==command.eventId||value.now!==command.now||value.actorUserId!==(command.actor?.userId??null)) throw new Error('Refresh statements outside original parent');};
  refreshEvent:CandidateChannelContinuation['refreshEvent']=(detail,ordinary)=>{const active=this.current();return active.peer?this.repository.transferredCandidateMetadataEvent(active.receipt.operation.transitionId,active.receipt.operation.operationId,detail,true):Promise.resolve(ordinary());};
  refreshEventExists:CandidateChannelContinuation['refreshEventExists']=id=>{const active=this.current();if(id!==active.refresh?.eventId) throw new Error('Refresh event outside original parent');return active.peer?this.repository.candidateMetadataEventExists(active.receipt.operation.transitionId,active.receipt.operation.operationId,true):Promise.resolve(null);};
  writeRefreshChild:CandidateChannelContinuation['writeRefreshChild']=async(statements,capture)=>{
    const active=this.current(),op=active.receipt.operation,owner=await this.repository.readTransition(op.transitionId);active.businessAttempted=true;
    try {await this.repository.commitCandidateMetadata(op.transitionId,op.operationId,active.source?owner.generation-1:owner.generation,statements,capture,await this.completion(),true);}
    catch(error) {if(/Expected version conflict|candidate_metadata_state_conflict/.test(String(error))) {active.businessAttempted=false;throw new IngestionRepositoryError('stale_message','Ingestion candidate changed during metadata refresh');}throw error;}
  };
}
