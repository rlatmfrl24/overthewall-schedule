import type {ChzzkReadReceipt,ChzzkScanCommand,ChzzkScanRequest,ChzzkScanResponse,ChzzkScanResult} from "@contracts/content-transition-chzzk";
import type {OperationEnvelope} from "@contracts/content-transition";
import type {TransitionOperationMessage} from "@contracts/content-transition-queue";
import {D1ChzzkReadJournal,D1TransitionRepository,type TransitionPeer} from "../../content-transition";
import {parseChzzkScanCommand,chzzkScanRequestKey} from "../domain/chzzk-scan-command";
import type {ChzzkScanExecution,ChzzkScanExecutionResult,ChzzkScanProvider} from "./chzzk-scan-types";

/** The original admitted scan is the unit of recovery. Provider pages are
 * retained before the owning observation/assessment batch can consume them. */
export class D1ChzzkScanTransitionWriter {
  get siteId() { return this.site; }
  private readonly repository:D1TransitionRepository;
  private readonly journal:D1ChzzkReadJournal;
  private readonly site:"otw"|"luvdia";
  private readonly sourcePeer:(id:string)=>Promise<TransitionPeer>;
  private readonly dispatch?: (message:TransitionOperationMessage)=>Promise<void>;
  constructor(
    repository:D1TransitionRepository,journal:D1ChzzkReadJournal,site:"otw"|"luvdia",
    sourcePeer:(id:string)=>Promise<TransitionPeer>,dispatch?:(message:TransitionOperationMessage)=>Promise<void>,
  ) {this.repository=repository;this.journal=journal;this.site=site;this.sourcePeer=sourcePeer;this.dispatch=dispatch;}
  private async enqueue(operation:OperationEnvelope) {
    try {await this.dispatch?.({type:"content-transition.operation",version:1,transitionId:operation.transitionId,operationId:operation.operationId,payloadHash:operation.payloadHash});} catch { /* Existing Cron scans durable receipts after a lost send. */ }
  }
  async run(command:ChzzkScanCommand,provider:ChzzkScanProvider,execute:ChzzkScanExecution,key=crypto.randomUUID()):Promise<ChzzkScanExecutionResult> {
    const result:ChzzkScanExecutionResult={channels:0,observations:0,channelResults:[]};
    const groups=new Map<string,{command:ChzzkScanCommand;owner:Awaited<ReturnType<D1TransitionRepository["readTransition"]>>|null}>();
    for(const member of command.members) {
      if(await this.repository.publicationMemberHidden(member.uid)) continue;
      const owner=await this.repository.findScheduleTransition(null,member.uid),groupKey=owner?.id??"ordinary";
      const group=groups.get(groupKey)??{command:{...command,members:[]},owner};
      group.command.members.push(member);groups.set(groupKey,group);
    }
    for(const group of groups.values()) {
      if(!group.owner) {const ordinary=await execute(group.command,provider,async statements=>{await this.repository.commitPublicationBatch(group.command.members.map(member=>member.uid),statements);});result.channels+=ordinary.channels;result.observations+=ordinary.observations;result.channelResults.push(...ordinary.channelResults);continue;}
      const owner=group.owner,operationId=`chzzk-scan:${key}:${owner.id}`,source=owner.sourceSite===this.site;
      let operation=await this.repository.readOperation(owner.id,operationId);
      const stage=operation?await this.repository.readChzzkScanStage(owner.id,operationId):null;
      if(stage) {result.channels+=stage.completion.result.channels;result.observations+=stage.completion.result.observations;result.channelResults.push(...stage.completion.result.channelResults);continue;}
      const feedback=(status:"accepted"|"moved"|"conflicted")=>{result.channels+=group.command.members.length;result.channelResults.push(...group.command.members.map(member=>({channelId:member.channelId,status,...(operation?{operationId}: {})})));};
      if(operation?.outcome) {
        if(operation.outcome.outcome==="committed" && operation.outcome.chzzkScan) {const completed=operation.outcome.chzzkScan.result;result.channels+=completed.channels;result.observations+=completed.observations;result.channelResults.push(...completed.channelResults);}
        else feedback("conflicted");
        continue;
      }
      if(source && ["source_fenced","target_owned","complete"].includes(owner.phase)) {feedback(operation?"accepted":"moved");continue;}
      if(!operation) operation=await this.repository.admitChzzkScan({transitionId:owner.id,operationId,idempotencyKey:operationId,kind:"collection_due",codec:{id:"schedules.chzzk_scan",version:1},subject:{table:"schedule_broadcast_observations",key:JSON.stringify([operationId])},expectedVersion:null,validation:{contract:1,validatedAt:command.startedAt},admittedAt:command.startedAt,payload:{...group.command}});
      if(!source && !["target_owned","complete"].includes(owner.phase)) {await this.enqueue(operation);feedback("accepted");continue;}
      try {
        const completed=await this.resume(operation,provider,execute);
        result.channels+=completed.channels;result.observations+=completed.observations;result.channelResults.push(...completed.channelResults);
      } catch(error) {
        const actual=await this.repository.exportOperation(owner.id,operationId);
        if(actual.outcome?.outcome==="conflicted") {feedback("conflicted");continue;}
        await this.enqueue(actual);
        // A provider failure or source fence preserves accepted responsibility;
        // the aggregate must not count it as successful persistence.
        if(error instanceof ChzzkReadPending || source && (await this.repository.readTransition(owner.id)).phase==="source_fenced") {feedback("accepted");continue;}
        throw error;
      }
    }
    return result;
  }
  async resume(operation:OperationEnvelope,provider:ChzzkScanProvider,execute:ChzzkScanExecution):Promise<ChzzkScanResult> {
    const owner=await this.repository.readTransition(operation.transitionId);
    if(operation.codec.id!=="schedules.chzzk_scan") throw new Error("Wrong CHZZK executor codec");
    const stage=await this.repository.readChzzkScanStage(operation.transitionId,operation.operationId);
    if(stage) return stage.completion.result;
    if(operation.outcome?.outcome==="committed" && operation.outcome.chzzkScan) return operation.outcome.chzzkScan.result;
    const executable=await this.repository.readExecutableCommand(operation.transitionId,operation.operationId),command=parseChzzkScanCommand(executable.payload);
    if(!command) throw new Error("Missing original CHZZK scan command");
    const remote=owner.targetSite===this.site && operation.sourceSequence!==null;
    const peer=remote?await this.sourcePeer(owner.id):null;
    if(peer && command.parent) {
      const originalStage=await peer.chzzkStage(owner.id,operation.operationId);
      if(originalStage) return (await this.repository.receiveChzzkScanStage(originalStage)).completion.result;
    }
    let pending=false;
    const reads=new Map<string,ChzzkReadReceipt>();
    const read=async(request:ChzzkScanRequest,fetch:()=>Promise<ChzzkScanResponse>)=>{
      const key=chzzkScanRequestKey(request),args=[owner.id,operation.operationId,operation.payloadHash,key] as const;
      const claimed=peer?await peer.claimChzzkRead(...args):await this.journal.claimLocal(...args,Date.now());
      const receipt=claimed.receipt;
      if(receipt.transitionId!==owner.id || receipt.operationId!==operation.operationId || receipt.payloadHash!==operation.payloadHash || receipt.requestKey!==key || JSON.stringify(receipt.request)!==JSON.stringify(request)) throw new Error("Original CHZZK request receipt mismatch");
      if(receipt.response) {reads.set(key,receipt);return receipt.response;}
      if(!claimed.claimed || !receipt.claim) {pending=true;throw new ChzzkReadPending();}
      let response:ChzzkScanResponse;
      try {response=await fetch();} catch {response=request.kind==="videos"?{kind:"videos",videos:null}:{kind:"live",content:null,error:"request_failed",staleCacheUsed:false};}
      const completed=peer?await peer.completeChzzkRead(...args,receipt.requestHash,receipt.attempt,receipt.claim,response):await this.journal.complete(...args,receipt.requestHash,receipt.attempt,receipt.claim,response,Date.now());
      if(!completed.response) {pending=true;throw new ChzzkReadPending();}
      reads.set(key,completed);return completed.response;
    };
    const catalog:ChzzkScanProvider={
      fetchVideosBatch:async(requests,cacheDb,options)=>Promise.all(requests.map(async request=>{
        if(request.size!==5) throw new Error("Unexpected original scan page size");
        const response=await read({kind:"videos",channelId:request.channelId,page:request.page,size:5},async()=>{
          const items=await provider.fetchVideosBatch([request],cacheDb,options),data=items.find(item=>item.channelId===request.channelId)?.content?.data;
          return {kind:"videos",videos:data?data.map(video=>({videoId:video.videoId,videoTitle:video.videoTitle,publishDateAt:Number.isFinite(video.publishDateAt)?video.publishDateAt:null,duration:Number.isFinite(video.duration)?video.duration:null,thumbnailImageUrl:video.thumbnailImageUrl??null})):null};
        });
        if(response.kind!=="videos") throw new Error("Wrong CHZZK page response");
        return {channelId:request.channelId,content:response.videos?{data:response.videos.map(video=>({...video,publishDateAt:video.publishDateAt??NaN,duration:video.duration??NaN}))}:null};
      })),
      fetchLiveStatus:async channelId=>{
        const response=await read({kind:"live",channelId},async()=>{
          if(!provider.fetchLiveStatus) return {kind:"live",content:null,error:"live_reader_unavailable",staleCacheUsed:false};
          const live=await provider.fetchLiveStatus(channelId),status=live.content?.status;
          return {kind:"live",content:live.content && status && ["OPEN","CLOSE","CLOSED"].includes(status)?{status:status as "OPEN"|"CLOSE"|"CLOSED",openDate:live.content.openDate??null}:null,error:live.debug.error??null,staleCacheUsed:live.debug.staleCacheUsed===true};
        });
        if(response.kind!=="live") throw new Error("Wrong CHZZK live response");
        return {content:response.content,debug:{error:response.error,staleCacheUsed:response.staleCacheUsed}};
      },
    };
    return execute(command,catalog,async(statements,result)=>{
      if(pending) throw new ChzzkReadPending();
      for(const receipt of reads.values()) if(!receipt.responseHash) throw new Error("Uncommitted CHZZK response cannot mutate business state");
      await this.repository.commitChzzkScan(owner.id,operation.operationId,owner.sourceSite===this.site?owner.generation-1:owner.generation,statements,{result,reads:[...reads.values()].map(receipt=>({requestKey:receipt.requestKey,requestHash:receipt.requestHash,responseHash:receipt.responseHash!})).sort((a,b)=>a.requestKey.localeCompare(b.requestKey))});
    });
  }
}
export class ChzzkReadPending extends Error {constructor(){super("Original CHZZK read is pending durable recovery");}}
