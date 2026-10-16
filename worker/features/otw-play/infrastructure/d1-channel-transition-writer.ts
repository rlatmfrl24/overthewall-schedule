import type {CandidateChannelContinuation} from './candidate-channel-continuation';
import type {OtwPlayAdminChannelDto,OtwPlayAdminCommandResponse} from "@contracts/otw-play";
import type {TransitionOperationMessage} from "@contracts/content-transition-queue";
import type {YouTubeChannelCompletion,YouTubeChannelReadResponse} from "@contracts/content-transition-youtube";
import { D1TransitionRepository, D1YouTubeChannelReadJournal, TransitionWriteError, youtubeChannelRequestKey, youtubeExhaustedOutcome, type TransitionPeer } from "../../content-transition";
import {parseChannelMutation,type ChannelMutationCommand} from "../domain/channel-mutation";
import type {ChannelTransitionPort} from "../application/ports/channel-transition";
import {OtwPlayYouTubeMetadataError,type OtwPlayYouTubeMetadataReader} from "../application/ports/youtube-metadata";
import {AdminCatalogServiceError} from "../application/admin-catalog-service";
import {AdminCatalogRepositoryError} from "../application/ports/admin-catalog-repository";

type Receipt=NonNullable<Awaited<ReturnType<D1TransitionRepository["readChannelReceipt"]>>>;
type ChannelResult=OtwPlayAdminCommandResponse<OtwPlayAdminChannelDto>;
export class D1ChannelTransitionWriter implements ChannelTransitionPort {
  private readonly approval?:CandidateChannelContinuation;
  private active:{receipt:Receipt;control:YouTubeChannelCompletion|null;businessAttempted:boolean}|null=null;
  private readonly repository:D1TransitionRepository;private readonly journal:D1YouTubeChannelReadJournal;
  private readonly reader:OtwPlayYouTubeMetadataReader;private readonly site:"otw"|"luvdia";
  private readonly requestKey?:string;private readonly dispatch:(message:TransitionOperationMessage)=>Promise<void>;
  private readonly peer:()=>Promise<TransitionPeer>;private readonly resume?:TransitionOperationMessage;
  constructor(repository:D1TransitionRepository,journal:D1YouTubeChannelReadJournal,reader:OtwPlayYouTubeMetadataReader,site:"otw"|"luvdia",dispatch:(message:TransitionOperationMessage)=>Promise<void>,peer:()=>Promise<TransitionPeer>,requestKey?:string,resume?:TransitionOperationMessage,approval?:CandidateChannelContinuation) {
    this.repository=repository;this.journal=journal;this.reader=reader;this.site=site;this.dispatch=dispatch;this.peer=peer;this.requestKey=requestKey;this.resume=resume;this.approval=approval;
  }
  private failure(control:YouTubeChannelCompletion) {
    const failure=control.failure;
    if(failure?.code==="channel_unverified") throw new AdminCatalogServiceError("validation_failed",failure.message,{externalChannelId:"unverified"});
    if(failure) throw new OtwPlayYouTubeMetadataError(failure.message,failure.code,failure.retryable,failure.retryAfterMs);
  }
  private async pending(receipt:Receipt):Promise<never> {
    const operation=receipt.operation;
    try {await this.dispatch({type:"content-transition.operation",version:1,transitionId:operation.transitionId,operationId:operation.operationId,payloadHash:operation.payloadHash});} catch { /* Durable original recovery remains authoritative. */ }
    throw new TransitionWriteError("CONTENT_ACCEPTED",this.site,operation.operationId);
  }
  async run(command:ChannelMutationCommand,execute:(command:ChannelMutationCommand,reader:OtwPlayYouTubeMetadataReader)=>Promise<ChannelResult>):Promise<ChannelResult> {
    if(this.approval?.channelActive) return this.approval.runChannelChild(command,execute);
    if(this.active) throw new Error("Concurrent channel command on one owning service");
    if(!this.resume && !command.actor?.userId) throw new Error("New channel admission requires its own authenticated actor");
    const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify([command.actor?.userId,this.requestKey??crypto.randomUUID()])));
    const operationId=this.resume?.operationId??`channel-${Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,"0")).join("")}`;
    let receipt=await this.repository.readChannelReceipt(operationId);
    if(receipt) {
      if(receipt.command.action!==command.action || JSON.stringify(receipt.command.input)!==JSON.stringify(command.input) || !this.resume && receipt.command.actor?.userId!==command.actor?.userId || this.resume && (receipt.operation.transitionId!==this.resume.transitionId || receipt.operation.payloadHash!==this.resume.payloadHash)) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
    } else {
      if(this.resume) throw new Error("Missing original accepted channel command");
      const preparation=await this.repository.prepareChannelMutation(command),transition=preparation.transition;
      if(!transition) return execute(command,this.reader);
      if(transition.sourceSite===this.site && ["source_fenced","target_owned","complete"].includes(transition.phase)) throw new TransitionWriteError("CONTENT_MOVED",transition.targetSite);
      const parsed=parseChannelMutation(command)!;
      receipt=await this.repository.admitChannelMutation({transitionId:transition.id,operationId,idempotencyKey:operationId,codec:{id:"otw-play.channel.mutate",version:1},kind:"content_edit",subject:{table:"music_channels",key:JSON.stringify([command.id])},expectedVersion:command.action==="update"?command.input.expectedVersion:null,validation:{contract:1,validatedAt:command.now},admittedAt:command.now,payload:{...parsed,expectedState:preparation.expectedState}},command);
    }
    if(receipt.operation.outcome) {
      if(receipt.failure) throw new AdminCatalogRepositoryError(receipt.failure.code,receipt.failure.message);
      const control=receipt.operation.outcome.youtubeChannel;
      if(control) this.failure(control);
      if(receipt.operation.outcome.outcome!=="committed" || !receipt.result) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
      return receipt.result;
    }
    const owner=await this.repository.readTransition(receipt.operation.transitionId);
    if(owner.sourceSite===this.site?["source_fenced","target_owned","complete"].includes(owner.phase):!["target_owned","complete"].includes(owner.phase)) return this.pending(receipt);
    const peer=owner.targetSite===this.site && receipt.operation.sourceSequence!==null?await this.peer():null;
    const original=parseChannelMutation((await this.repository.readExecutableCommand(owner.id,operationId)).payload)!;
    const active={receipt,control:null as YouTubeChannelCompletion|null,businessAttempted:false};this.active=active;
    try {
      return await execute({...original,actor:receipt.command.actor},{readVideo:()=>{throw new Error("Channel command cannot expand its admitted metadata scope");},readChannel:async channelId=>{
        if(channelId!==original.input.externalChannelId) throw new Error("Metadata request is outside the original channel command");
        const args=[owner.id,operationId,receipt.operation.payloadHash,youtubeChannelRequestKey(channelId)] as const;
        let read=peer?await peer.youtubeChannelRead(...args):await this.journal.read(...args);
        if(!read.response && !read.exhausted && read.attempt>=4) read=peer?await peer.exhaustYouTubeChannelRead(...args):await this.journal.exhaust(...args,Date.now());
        if(read.exhausted) {
          const outcome=youtubeExhaustedOutcome(read);
          if(!(await this.repository.exportOperation(owner.id,operationId)).outcome) await this.repository.recordOutcome(owner.id,operationId,outcome);
          this.failure(outcome.youtubeChannel!);
        }
        if(!read.response) {
          const claimed=peer?await peer.claimYouTubeChannelRead(...args):await this.journal.claim(...args,Date.now());read=claimed.receipt;
          if(!claimed.claimed || !read.claim) return this.pending(receipt);
          const claim=read.claim;
          let response:YouTubeChannelReadResponse;
          try {
            const channel=await this.reader.readChannel(channelId,{beforeHttp:async()=>{
              read=peer?await peer.startYouTubeChannelRead(...args,read.requestHash,claim):await this.journal.start(...args,read.requestHash,claim,Date.now());
            }});
            response={status:"success",channel};
          } catch(error) {
            if(!(error instanceof OtwPlayYouTubeMetadataError)) throw error;
            response={status:"error",error:{message:error.message,code:error.code,retryable:error.retryable,retryAfterMs:error.retryAfterMs}};
          }
          read=peer?await peer.completeYouTubeChannelRead(...args,read.requestHash,read.attempt,claim,response):await this.journal.complete(...args,read.requestHash,read.attempt,claim,response,Date.now());
        }
        if(!read.response || !read.responseHash) return this.pending(receipt);
        active.control={requestKey:read.requestKey,requestHash:read.requestHash,responseHash:read.responseHash,disposition:"consumed",result:null,failure:read.response.status==="error"?read.response.error:read.response.channel===null?{code:"channel_unverified",message:"YouTube channel metadata could not be verified",retryable:false,retryAfterMs:null}:null};
        if(active.control.failure) {
          try {await this.repository.recordOutcome(owner.id,operationId,{outcome:"failed",sideEffectReconciled:true,detail:"Original channel metadata validation failed",youtubeChannel:active.control});}
          catch(error) {if((await this.repository.readTransition(owner.id)).sourceSite===this.site && (await this.repository.readTransition(owner.id)).phase==="source_fenced") return this.pending(receipt);throw error;}
          this.failure(active.control);
        }
        if(!await this.repository.reconcileChannelPrecondition(owner.id,operationId,active.control)) throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operationId);
        return read.response.status==="success"?read.response.channel:null;
      }});
    } catch(error) {
      if(owner.sourceSite===this.site && (await this.repository.readTransition(owner.id)).phase==="source_fenced" && !(await this.repository.exportOperation(owner.id,operationId)).outcome) return await this.pending(receipt);
      // These are the original repository's definitive local validation
      // results. Runtime/delivery failures keep the durable command pending.
      // The original HTTP error mapper also labels arbitrary SQLite trigger
      // aborts as validation failures. Only pre-batch validation is definitive
      // here; actual batch failures use the repository's exact rejection proof.
      if(!active.businessAttempted && error instanceof AdminCatalogRepositoryError && (error.code==="not_found" || error.code==="stale_write" || error.code==="validation_failed") && active.control && !active.control.failure && !(await this.repository.exportOperation(owner.id,operationId)).outcome) {
        try {await this.repository.recordChannelFailure(owner.id,operationId,active.control,{code:error.code,message:error.message});}
        catch(failure) {if(owner.sourceSite===this.site && (await this.repository.readTransition(owner.id)).phase==="source_fenced") return await this.pending(receipt);throw failure;}
      }
      throw error;
    } finally {
      this.active=null;
      const terminal=await this.repository.exportOperation(owner.id,operationId);
      if(!peer && terminal.outcome?.youtubeChannel) await this.journal.settle(owner.id,operationId,terminal.payloadHash,terminal.outcome,Date.now());
    }
  }
  async write(statements:D1PreparedStatement[]) {
    if(this.approval?.channelActive) return this.approval.writeChannelChild(statements);
    const active=this.active;if(!active) return null;
    const {receipt,control}=active,operation=receipt.operation;
    if(!control || control.failure) throw new Error("Missing durable original metadata result");
    const owner=await this.repository.readTransition(operation.transitionId);
    active.businessAttempted=true;
    try {await this.repository.commitChannel(owner.id,operation.operationId,owner.sourceSite===this.site?owner.generation-1:owner.generation,statements,control);}
    catch(error) {
      const terminal=(await this.repository.exportOperation(owner.id,operation.operationId)).outcome;
      if(terminal?.outcome!=="committed") {
        if(owner.sourceSite===this.site && (await this.repository.readTransition(owner.id)).phase==="source_fenced") return this.pending(receipt);
        if(terminal?.outcome==="conflicted") throw new TransitionWriteError("CONTENT_CONFLICT",this.site,operation.operationId);
        throw error;
      }
    }
    const actual=await this.repository.readChannelReceipt(operation.operationId);
    if(!actual?.result || actual.operation.outcome?.outcome!=="committed") throw new Error("Missing original channel saved result");
    return actual.result;
  }
  async historicalEvent(event:Parameters<D1TransitionRepository["transferredChannelEvent"]>[2]) {
    if(this.approval?.channelActive) return this.approval.channelChildEvent(event);
    const active=this.active;
    if(!active || active.receipt.command.actor!==null || active.receipt.operation.sourceSequence===null) throw new Error("Historical event requires the actual transferred source channel command");
    return this.repository.transferredChannelEvent(active.receipt.operation.transitionId,active.receipt.operation.operationId,event);
  }
}
