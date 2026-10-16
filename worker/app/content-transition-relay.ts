import {catalogImportProjection} from "../features/otw-play";
import {WorkerEntrypoint} from "cloudflare:workers";
import {parseSiteStorageResources} from "@contracts/site-definition";
import {D1TransitionRepository,D1CandidateChannelStages,D1ChzzkReadJournal,D1YouTubeChannelReadJournal,D1YouTubeVideoReadJournal,D1AiUnknownControl,D1AiResumeControl,type TransitionPeer} from "../features/content-transition";
import type {YouTubeChannelReadResponse,YouTubeVideoReadResponse,YouTubeVideoCompletion,YouTubeVideoFailure} from "@contracts/content-transition-youtube";
import type {ChzzkScanResponse} from "@contracts/content-transition-chzzk";
import type {Env} from "../platform/types";
import {deliverTransitionOutcome,transitionPeer} from "./content-transition";
import {executeOriginalChzzkChild,finishOriginalChzzkParent} from "./content-transition-chzzk";
import {D1ChzzkCollectorWriter,reconcileHolidaySuggestions} from "../features/schedules";

/** Only named Service Binding RPC exposes this entrypoint. The account operator
 * configuring the binding is the trust boundary; RPC does not attest a caller
 * site. Mutations pull original receipts from the configured peer's persistence.
 * Private # methods cannot be invoked through RPC. */
export class ContentTransitionRelay extends WorkerEntrypoint<Env> implements TransitionPeer {
  #repository() {
    const {site,database,bucket}=parseSiteStorageResources(this.env);
    return new D1TransitionRepository(this.env.otw_db,site,database,bucket, null, catalogImportProjection);
  }
  async describe(id:string) {return this.#repository().describePeer(id);}
  #aiUnknown() {const {site,database}=parseSiteStorageResources(this.env);return new D1AiUnknownControl(this.env.otw_db,site,database);}
  async aiUnknown(id:string,operationId:string,payloadHash:string) {
    await this.#context(id,'source');return this.#aiUnknown().transfer(id,operationId,payloadHash);
  }
  #aiResume() {const {site,database}=parseSiteStorageResources(this.env);return new D1AiResumeControl(this.env.otw_db,site,database);}
  async aiResume(id:string,operationId:string,payloadHash:string) {
    await this.#context(id,'source');return this.#aiResume().transfer(id,operationId,payloadHash);
  }
  #videoJournal() {const {site,database}=parseSiteStorageResources(this.env);return new D1YouTubeVideoReadJournal(this.env.otw_db,site,database);}
  async videoApprovalNoop(id:string,operationId:string,payloadHash:string) {
    const {repository}=await this.#context(id,'target');return repository.videoApprovalNoop(id,operationId,payloadHash);
  }
  async prepareVideoApprovalNoop(id:string,operationId:string,payloadHash:string) {
    const {peer}=await this.#context(id,'source');
    const proof=await peer.videoApprovalNoop(id,operationId,payloadHash);
    if(!proof) throw new Error('Missing durable owning already-approved result');
    const journal=this.#videoJournal();
    return journal.prepareApprovalNoop(id,operationId,payloadHash,{resultHash:proof.resultHash,control:await journal.completion(id,operationId,payloadHash,true)},true);
  }
  async youtubeVideoRead(id:string,operationId:string,payloadHash:string,requestKey:string) {
    await this.#context(id,'source');return this.#videoJournal().read(id,operationId,payloadHash,requestKey,true);
  }
  async claimYouTubeVideoRead(id:string,operationId:string,payloadHash:string,requestKey:string) {
    await this.#context(id,'source');return this.#videoJournal().claim(id,operationId,payloadHash,requestKey,Date.now(),true);
  }
  async startYouTubeVideoRead(id:string,operationId:string,payloadHash:string,requestKey:string,requestHash:string,claim:string) {
    await this.#context(id,'source');return this.#videoJournal().start(id,operationId,payloadHash,requestKey,requestHash,claim,Date.now(),true);
  }
  async completeYouTubeVideoRead(id:string,operationId:string,payloadHash:string,requestKey:string,requestHash:string,attempt:number,claim:string,response:YouTubeVideoReadResponse) {
    await this.#context(id,'source');return this.#videoJournal().complete(id,operationId,payloadHash,requestKey,requestHash,attempt,claim,response,Date.now(),true);
  }
  async exhaustYouTubeVideoRead(id:string,operationId:string,payloadHash:string,requestKey:string) {
    await this.#context(id,'source');return this.#videoJournal().exhaust(id,operationId,payloadHash,requestKey,Date.now(),true);
  }
  async youtubeVideoCompletion(id:string,operationId:string,payloadHash:string) {
    await this.#context(id,'source');return this.#videoJournal().completion(id,operationId,payloadHash,true);
  }
  async youtubeVideoFailure(id:string,operationId:string,payloadHash:string) {
    await this.#context(id,'source');return this.#videoJournal().failurePreparation(id,operationId,payloadHash,true);
  }
  async prepareYouTubeVideoFailure(id:string,operationId:string,payloadHash:string,control:YouTubeVideoCompletion,failure:YouTubeVideoFailure) {
    await this.#context(id,'source');return this.#videoJournal().prepareFailure(id,operationId,payloadHash,control,failure,Date.now(),true);
  }
  async youtubeVideoDependency(id:string,operationId:string,payloadHash:string) {
    const {repository}=await this.#context(id,'source');return repository.videoDependency(id,operationId,payloadHash);
  }
  async conversionPreflight(id:string,operationId:string,payloadHash:string) {
    const {repository}=await this.#context(id,'source');
    return repository.conversionPreflight(id,operationId,payloadHash);
  }
  #candidateChannelStages() {const {site,database}=parseSiteStorageResources(this.env);return new D1CandidateChannelStages(this.env.otw_db,site,database);}
  async candidateChannelStages(id:string,operationId:string,payloadHash:string) {
    await this.#context(id,'source');return this.#candidateChannelStages().read(id,operationId,payloadHash,true);
  }
  async prepareCandidateChannelChild(id:string,operationId:string,payloadHash:string,step:'create'|'update',command:import('@contracts/content-transition-youtube').CandidateChannelApprovalChildCommand) {
    await this.#context(id,'source');return this.#candidateChannelStages().prepareChild(id,operationId,payloadHash,step,command,true);
  }
  async prepareCandidateChannelRefresh(id:string,operationId:string,payloadHash:string,command:import('@contracts/content-transition-youtube').CandidateChannelApprovalRefresh['command']) {
    await this.#context(id,'source');return this.#candidateChannelStages().prepareRefresh(id,operationId,payloadHash,command,true);
  }
  async candidateChannelChildReceipt(id:string,operationId:string,payloadHash:string,step:'create'|'update') {
    const {repository}=await this.#context(id,'target');return repository.candidateChannelChildReceipt(id,operationId,payloadHash,step);
  }
  async acknowledgeCandidateChannelChild(id:string,operationId:string,payloadHash:string,step:'create'|'update') {
    const {peer}=await this.#context(id,'source');
    const actual=await peer.candidateChannelChildReceipt(id,operationId,payloadHash,step);
    return this.#candidateChannelStages().acknowledgeChild(id,operationId,payloadHash,step,actual);
  }
  async candidateMetadataStage(id:string,operationId:string,payloadHash:string) {
    const {repository}=await this.#context(id,'source');
    return repository.candidateMetadataStage(id,operationId,payloadHash);
  }
  #youtubeJournal() {const {site,database}=parseSiteStorageResources(this.env);return new D1YouTubeChannelReadJournal(this.env.otw_db,site,database);}
  async youtubeChannelRead(id:string,operationId:string,payloadHash:string,requestKey:string) {
    await this.#context(id,"source");return this.#youtubeJournal().read(id,operationId,payloadHash,requestKey,true);
  }
  async claimYouTubeChannelRead(id:string,operationId:string,payloadHash:string,requestKey:string) {
    await this.#context(id,"source");return this.#youtubeJournal().claim(id,operationId,payloadHash,requestKey,Date.now(),true);
  }
  async startYouTubeChannelRead(id:string,operationId:string,payloadHash:string,requestKey:string,requestHash:string,claim:string) {
    await this.#context(id,"source");return this.#youtubeJournal().start(id,operationId,payloadHash,requestKey,requestHash,claim,Date.now(),true);
  }
  async completeYouTubeChannelRead(id:string,operationId:string,payloadHash:string,requestKey:string,requestHash:string,attempt:number,claim:string,response:YouTubeChannelReadResponse) {
    await this.#context(id,"source");return this.#youtubeJournal().complete(id,operationId,payloadHash,requestKey,requestHash,attempt,claim,response,Date.now(),true);
  }
  async exhaustYouTubeChannelRead(id:string,operationId:string,payloadHash:string,requestKey:string) {
    await this.#context(id,"source");return this.#youtubeJournal().exhaust(id,operationId,payloadHash,requestKey,Date.now(),true);
  }
  async chzzkStage(id:string,operationId:string) {return this.#repository().readChzzkScanStage(id,operationId);}
  async chzzkChild(id:string,operationId:string,childKey:string) {
    const {repository}=await this.#context(id,"source");return repository.exportChzzkChild(id,operationId,childKey);
  }
  async executeChzzkChild(id:string,operationId:string,childKey:string) {
    await this.#context(id,"target");return executeOriginalChzzkChild(this.env,id,operationId,childKey);
  }
  async executeChzzkSourceHoliday(id:string,operationId:string,childKey:string) {
    const {repository}=await this.#context(id,"source"),args=[id,operationId,childKey] as const;
    const original=await repository.originalChzzkHolidayCommand(...args,"holiday_obsolete");
    await reconcileHolidaySuggestions(this.env.otw_db,original.target,original.now,await D1ChzzkCollectorWriter.create(repository,...args));
    return repository.chzzkSourceSupplement(...args);
  }
  async chzzkFinalizer(id:string,operationId:string) {
    const {repository}=await this.#context(id,"source");return repository.chzzkFinalizer(id,operationId);
  }
  async finishChzzkParent(id:string,operationId:string) {
    return finishOriginalChzzkParent(this.env,id,operationId);
  }
  async receiveChzzkStage(id:string,operationId:string,payloadHash:string) {
    const repository=this.#repository(),own=await repository.describePeer(id);
    const {peer}=await this.#context(id,own.role),stage=await peer.chzzkStage(id,operationId);
    if(!stage || stage.transitionId!==id || stage.operationId!==operationId || stage.payloadHash!==payloadHash) throw new Error("Missing original peer scan stage");
    return repository.receiveChzzkScanStage(stage);
  }
  #chzzkJournal() {
    const {site,database}=parseSiteStorageResources(this.env);
    return new D1ChzzkReadJournal(this.env.otw_db,site,database);
  }
  async chzzkRead(id:string,operationId:string,payloadHash:string,requestKey:string) {
    await this.#context(id,"source");
    return this.#chzzkJournal().readFrozenOriginal(id,operationId,payloadHash,requestKey);
  }
  async claimChzzkRead(id:string,operationId:string,payloadHash:string,requestKey:string) {
    await this.#context(id,"source");
    return this.#chzzkJournal().claimFrozenOriginal(id,operationId,payloadHash,requestKey,Date.now());
  }
  async completeChzzkRead(id:string,operationId:string,payloadHash:string,requestKey:string,requestHash:string,attempt:number,claim:string,response:ChzzkScanResponse) {
    await this.#context(id,"source");
    return this.#chzzkJournal().completeFrozenOriginal(id,operationId,payloadHash,requestKey,requestHash,attempt,claim,response,Date.now());
  }
  async #context(id:string,role:"source"|"target") {
    return transitionPeer(this.env,id,role);
  }
  async openIngress(id:string) {
    const {repository}=await this.#context(id,"target");
    return repository.openIngress(id,crypto.randomUUID(),Date.now()+60000);
  }
  async connectIngress(id:string) {
    const {repository,peer}=await this.#context(id,"source");
    const receipt=await peer.openIngress(id);
    await repository.acknowledgeIngress(receipt,Date.now());
    return receipt;
  }
  async operation(id:string,operationId:string) {
    const repository=this.#repository();
    if((await repository.describePeer(id)).role!=="source") throw new Error("Only source exports an original operation");
    return repository.exportOperation(id,operationId);
  }
  async fileIntent(id:string,intentId:string) {
    const repository=this.#repository();
    if((await repository.describePeer(id)).role!=="source") throw new Error("Only source exports an original file intent");
    return repository.exportFileIntent(id,intentId);
  }
  async sourceFence(id:string) {return this.#repository().readSourceFence(id);}
  async targetActivationReceipt(id:string) {return await this.#repository().targetActivationReceipt(id);}
  async targetAbortReceipt(id:string) {return await this.#repository().readTargetAbort(id);}
  async resumeSourceAfterAbort(id:string) {
    const {repository,peer}=await this.#context(id,'source');
    const receipt=await peer.targetAbortReceipt(id);
    if(!receipt)return {resumed:false as const,reason:'target_not_aborted' as const};
    await repository.resumeSourceAfterAbort(receipt,Date.now());
    return {resumed:true as const};
  }
  async resumeRemainingSource(id:string) {
    const {repository,peer}=await this.#context(id,'source');
    const receipt=await peer.targetActivationReceipt(id);
    if(!receipt)return {resumed:false as const,reason:'target_not_activated_or_archived' as const};
    await repository.resumeRemainingSource(receipt);
    return {resumed:true as const};
  }
  async receiveFence(id:string) {
    const {repository,peer}=await this.#context(id,"target");
    await repository.installFence(await peer.sourceFence(id));
  }
  async receiveOperation(id:string,operationId:string,payloadHash:string) {
    const {repository,peer}=await this.#context(id,"target");
    const envelope=await peer.operation(id,operationId);
    if(envelope.transitionId!==id || envelope.operationId!==operationId || envelope.payloadHash!==payloadHash) return {accepted:false as const,reason:"original_receipt_mismatch" as const};
    const receipt=await repository.receiveOperation(envelope);
    if(envelope.codec.id==='otw-play.ai.unknown'&&envelope.sourceFence) await this.#aiUnknown().install(id,operationId,payloadHash,await peer.aiUnknown(id,operationId,payloadHash));
    if(envelope.codec.id==='otw-play.ai.resume'&&envelope.sourceFence) await this.#aiResume().install(id,operationId,payloadHash,await peer.aiResume(id,operationId,payloadHash));
    return {accepted:true as const,receipt};
  }
  async receiveFileIntent(id:string,intentId:string,versionKey:string) {
    const {repository,peer}=await this.#context(id,"target");
    const envelope=await peer.fileIntent(id,intentId);
    if(envelope.transitionId!==id || envelope.intentId!==intentId || envelope.versionKey!==versionKey) return {accepted:false as const,reason:"original_receipt_mismatch" as const};
    return {accepted:true as const,receipt:await repository.receiveFileIntent(envelope)};
  }
  async outcome(id:string,kind:"operation"|"file",recordId:string) {
    if(kind!=="operation" && kind!=="file") throw new Error("Unknown outcome kind");
    return this.#repository().readOutcomeReceipt(id,kind,recordId);
  }
  async acknowledgeOutcome(id:string,kind:"operation"|"file",recordId:string) {
    const {repository,peer}=await this.#context(id,"source");
    return repository.acknowledgeOutcome(await peer.outcome(id,kind,recordId));
  }
  async deliverOutcome(id:string,kind:"operation"|"file",recordId:string) {
    return deliverTransitionOutcome(this.env,id,kind,recordId);
  }
}
