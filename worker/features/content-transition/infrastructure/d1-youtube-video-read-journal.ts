import type {AcceptedOperation,OperationOutcome} from "@contracts/content-transition";
import type {SiteId} from "@contracts/site-definition";
import type {YouTubeVideoCompletion,YouTubeVideoReadReceipt,YouTubeVideoReadResponse,YouTubeVideoFailure,YouTubeVideoFailurePreparation,YouTubeVideoNoopPreparation,YouTubeVideoReadRequest} from "@contracts/content-transition-youtube";
import {parseVideoReadCommand,videoCatalogReads,parseCandidateMetadataMutation,parseCandidateChannelMutation,type CandidateChannelMutation,type CandidateMetadataMutation,type VideoCatalogMutation} from "../../otw-play/commands";
import {digestText} from "./d1-baseline-store";
import {parseYouTubeVideoResponse,parseVideoCatalogFailure,youtubeVideoRequest,youtubeVideoRequestKey,candidateChannelRequestKey} from "./youtube-video-read";

import {youtubeChannelRequest} from "./youtube-channel-read";

type RequestRow={request_key:string;request_hash:string;request_json:string;response_hash:string|null;response_json:string|null;attempt:number;claim:string|null;retry_at:number;disposition:string|null};
const originalCommand=(codec:string,payload:unknown)=>codec==='otw-play.candidate.channel_approve'?parseCandidateChannelMutation(payload):codec==='otw-play.candidate.refresh'?parseCandidateMetadataMutation(payload):parseVideoReadCommand(codec,payload);
const originalRequests=(command:CandidateChannelMutation|CandidateMetadataMutation|VideoCatalogMutation,channelId:string|null=null):Array<{requestKey:string;request:YouTubeVideoReadRequest}>=>{
  if(command.action==='candidate_channel_approve') return [
    {requestKey:youtubeVideoRequestKey(command.videoId,0),request:youtubeVideoRequest(command.videoId)},
    ...(channelId?(['create','update'] as const).map(step=>({requestKey:candidateChannelRequestKey(channelId,step),request:youtubeChannelRequest(channelId)})):[]),
    {requestKey:youtubeVideoRequestKey(command.videoId,3),request:youtubeVideoRequest(command.videoId,true)},
  ];
  return (command.action==='candidate_refresh'?[{videoId:command.videoId,index:0}]:videoCatalogReads(command)).map(({videoId,index})=>({requestKey:youtubeVideoRequestKey(videoId,index),request:youtubeVideoRequest(videoId,command.action==='candidate_refresh')}));
};
/** Original ordered admin video requests use the same request/attempt controls.
 * An early original validation failure leaves later never-issued reads unused. */
export class D1YouTubeVideoReadJournal {
  private readonly db:D1Database;
  private readonly site:SiteId;
  private readonly resource:string;
  constructor(db:D1Database,site:SiteId,resource:string) {this.db=db;this.site=site;this.resource=resource;}
  static async registration(db:D1Database,operation:AcceptedOperation,channelId:string|null=null) {
    const command=originalCommand(operation.codec.id,operation.payload);if(!command) throw new Error("Missing original video catalog command");
    return Promise.all(originalRequests(command,channelId).map(async({requestKey,request})=>{
      return db.prepare(`INSERT OR IGNORE INTO content_transition_chzzk_requests(transition_id,operation_id,request_key,request_hash,request_json)
      SELECT transition_id,operation_id,?,?,? FROM content_transition_operations WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL`)
        .bind(requestKey,await digestText(JSON.stringify(request)),JSON.stringify(request),operation.transitionId,operation.operationId,operation.payloadHash);
    }));
  }
  private async authority(id:string,operationId:string,payloadHash:string,frozen=false) {
    const row=await this.db.prepare(`SELECT t.source_site,t.target_site,t.phase,t.generation,t.fence_json,o.seq,o.source_seq,o.generation operation_generation,o.envelope_json,o.outcome_json
      FROM content_transitions t JOIN content_transition_operations o ON o.transition_id=t.id WHERE t.id=? AND o.operation_id=? AND o.payload_hash=? AND t.local_site=? AND t.local_resource=?
      AND json_extract(o.envelope_json,'$.codec.id') IN ('otw-play.video.mutate','otw-play.candidate.convert','otw-play.candidate.refresh','otw-play.candidate.channel_approve')`)
      .bind(id,operationId,payloadHash,this.site,this.resource).first<{source_site:SiteId;target_site:SiteId;phase:string;generation:number;fence_json:string|null;seq:number;source_seq:number|null;operation_generation:number;envelope_json:string;outcome_json:string|null}>();
    if(!row || row.source_seq!==null || row.operation_generation!==(this.site===row.source_site?row.generation-1:row.generation)) throw new Error("Wrong original YouTube request authority");
    if(frozen && (this.site!==row.source_site || row.phase!=="source_fenced" || !row.fence_json || row.seq>JSON.parse(row.fence_json).operationBoundary)) throw new Error("Not a frozen original YouTube request");
    const value=JSON.parse(row.envelope_json),command=originalCommand(value.codec.id,this.site===row.source_site?value.sourceCommand?.payload:value.payload);
    if(!command) throw new Error("Missing original admitted video metadata request");
    const receipt=this.site===row.source_site?value.sourceReceipt:value.nativeReceipt;
    const channelId=command.action==='candidate_channel_approve'?receipt?.channelApproval?.snapshot?.externalChannelId??null:null;
    if(channelId!==null&&(typeof channelId!=='string'||!/^UC[A-Za-z0-9_-]{22}$/.test(channelId))) throw new Error('Invalid original approval channel identity');
    return {row,command,channelId,receipt};
  }
  async read(id:string,operationId:string,payloadHash:string,requestKey:string,frozen=false):Promise<YouTubeVideoReadReceipt> {
    const {command,channelId}=await this.authority(id,operationId,payloadHash,frozen);
    const original=originalRequests(command,channelId).find(item=>item.requestKey===requestKey);
    if(!original) throw new Error("Video metadata request outside original admitted scope");
    const request=original.request;
    const row=await this.db.prepare("SELECT * FROM content_transition_chzzk_requests WHERE transition_id=? AND operation_id=? AND request_key=?").bind(id,operationId,requestKey).first<RequestRow>();
    if(!row || row.request_json!==JSON.stringify(request) || row.request_hash!==await digestText(row.request_json)) throw new Error("Unknown registered YouTube request");
    const response=row.response_json===null?null:parseYouTubeVideoResponse(JSON.parse(row.response_json),request);
    if(row.response_json!==null && (!response || JSON.stringify(response)!==row.response_json || await digestText(row.response_json)!==row.response_hash)) throw new Error("Invalid immutable YouTube response");
    return {transitionId:id,operationId,payloadHash,requestKey,requestHash:row.request_hash,request,response,responseHash:row.response_hash,attempt:row.attempt,claim:row.claim,retryAt:row.retry_at,exhausted:row.disposition==="exhausted_unknown"};
  }
  private phase(frozen:boolean) {
    return frozen?"t.local_site=t.source_site AND t.phase='source_fenced' AND o.seq<=json_extract(t.fence_json,'$.operationBoundary')":`((t.local_site=t.source_site AND t.phase IN ('protected','copying','replaying','target_ingress_ready')) OR (t.local_site=t.target_site AND t.phase IN ('target_owned','complete') AND o.source_seq IS NULL))`;
  }
  /** Only the admitted parent's exact prepared continuation may issue a GET.
   * Reading immutable evidence or sealing a never-issued slot is separate. */
  private candidateChannelIssueGuard() {
    const receipt="CASE WHEN t.local_site=t.source_site THEN '$.sourceReceipt' ELSE '$.nativeReceipt' END";
    return `(json_extract(o.envelope_json,'$.codec.id')<>'otw-play.candidate.channel_approve' OR (
      content_transition_chzzk_requests.request_key='youtube:videos:0:'||json_extract(o.envelope_json,(${receipt})||'.command.videoId') OR
      (content_transition_chzzk_requests.request_key='youtube:channels:create:'||json_extract(o.envelope_json,(${receipt})||'.channelApproval.snapshot.externalChannelId') AND json_type(o.envelope_json,(${receipt})||'.channelApproval.create.command')='object' AND json_type(o.envelope_json,(${receipt})||'.channelApproval.create.result')='null') OR
      (content_transition_chzzk_requests.request_key='youtube:channels:update:'||json_extract(o.envelope_json,(${receipt})||'.channelApproval.snapshot.externalChannelId') AND json_type(o.envelope_json,(${receipt})||'.channelApproval.update.command')='object' AND json_type(o.envelope_json,(${receipt})||'.channelApproval.update.result')='null') OR
      (content_transition_chzzk_requests.request_key='youtube:videos:3:'||json_extract(o.envelope_json,(${receipt})||'.command.videoId') AND json_type(o.envelope_json,(${receipt})||'.channelApproval.refresh.command')='object' AND json_type(o.envelope_json,(${receipt})||'.channelApproval.refresh.resultHash')='null')
    ))`;
  }
  async claim(id:string,operationId:string,payloadHash:string,requestKey:string,now:number,frozen=false) {
    const receipt=await this.read(id,operationId,payloadHash,requestKey,frozen);
    if(receipt.response || receipt.exhausted) return {receipt,claimed:false};
    if(!Number.isSafeInteger(now) || now<0) throw new Error("Invalid YouTube claim time");
    const claim=crypto.randomUUID();
    // Reserving a delivery claim is not an issued HTTP attempt. The reader
    // reserves real quota first, then calls start immediately before fetch.
    await this.db.prepare(`UPDATE content_transition_chzzk_requests SET claim=?,retry_at=? WHERE transition_id=? AND operation_id=? AND request_key=? AND request_hash=?
      AND response_json IS NULL AND disposition IS NULL AND retry_at<=? AND attempt<4 AND EXISTS(
        SELECT 1 FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE o.transition_id=? AND o.operation_id=? AND o.payload_hash=? AND o.outcome_json IS NULL AND t.local_site=? AND t.local_resource=? AND ${this.phase(frozen)} AND ${this.candidateChannelIssueGuard()})`)
      .bind(claim,now+30000,id,operationId,requestKey,receipt.requestHash,now,id,operationId,payloadHash,this.site,this.resource).run();
    const actual=await this.read(id,operationId,payloadHash,requestKey,frozen);
    return {receipt:actual,claimed:actual.claim===claim && !actual.response};
  }
  async start(id:string,operationId:string,payloadHash:string,requestKey:string,requestHash:string,claim:string,now:number,frozen=false) {
    const receipt=await this.read(id,operationId,payloadHash,requestKey,frozen);
    if(receipt.requestHash!==requestHash || !Number.isSafeInteger(now) || now<0) throw new Error("Invalid original YouTube HTTP identity");
    await this.db.batch([
      this.db.prepare(`UPDATE content_transition_chzzk_requests SET attempt=attempt+1 WHERE transition_id=? AND operation_id=? AND request_key=? AND request_hash=? AND claim=? AND retry_at>? AND attempt<4 AND response_json IS NULL AND disposition IS NULL
        AND NOT EXISTS(SELECT 1 FROM content_transition_chzzk_attempts a WHERE a.transition_id=? AND a.operation_id=? AND a.request_key=? AND a.claim=?)
        AND EXISTS(SELECT 1 FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE o.transition_id=? AND o.operation_id=? AND o.payload_hash=? AND o.outcome_json IS NULL AND t.local_site=? AND t.local_resource=? AND ${this.phase(frozen)} AND ${this.candidateChannelIssueGuard()})`)
        .bind(id,operationId,requestKey,requestHash,claim,now,id,operationId,requestKey,claim,id,operationId,payloadHash,this.site,this.resource),
      this.db.prepare("SELECT iif(changes()=1,1,json('youtube_http_claim_lost'))"),
      this.db.prepare(`UPDATE content_transition_chzzk_attempts SET state='uncertain',uncertain_at=coalesce(uncertain_at,?) WHERE transition_id=? AND operation_id=? AND request_key=? AND state='started' AND claim<>?
        AND EXISTS(SELECT 1 FROM content_transition_chzzk_requests r WHERE r.transition_id=? AND r.operation_id=? AND r.request_key=? AND r.claim=? AND r.retry_at>? AND r.response_json IS NULL)`)
        .bind(now,id,operationId,requestKey,claim,id,operationId,requestKey,claim,now),
      this.db.prepare(`INSERT INTO content_transition_chzzk_attempts(transition_id,operation_id,request_key,attempt,claim,started_at)
        SELECT transition_id,operation_id,request_key,attempt,claim,? FROM content_transition_chzzk_requests WHERE transition_id=? AND operation_id=? AND request_key=? AND claim=? AND retry_at>? AND attempt>0 AND response_json IS NULL AND disposition IS NULL
        AND NOT EXISTS(SELECT 1 FROM content_transition_chzzk_attempts a WHERE a.transition_id=? AND a.operation_id=? AND a.request_key=? AND a.claim=?)`)
        .bind(now,id,operationId,requestKey,claim,now,id,operationId,requestKey,claim),
      this.db.prepare(`SELECT iif(EXISTS(SELECT 1 FROM content_transition_chzzk_attempts WHERE transition_id=? AND operation_id=? AND request_key=? AND claim=? AND started_at=? AND response_hash IS NULL AND state='started'),1,json('youtube_http_claim_lost'))`).bind(id,operationId,requestKey,claim,now),
    ]);
    return this.read(id,operationId,payloadHash,requestKey,frozen);
  }
  async complete(id:string,operationId:string,payloadHash:string,requestKey:string,requestHash:string,attempt:number,claim:string,raw:YouTubeVideoReadResponse,now:number,frozen=false) {
    const receipt=await this.read(id,operationId,payloadHash,requestKey,frozen),response=parseYouTubeVideoResponse(raw,receipt.request);
    if(receipt.requestHash!==requestHash || !response || JSON.stringify(response)!==JSON.stringify(raw) || !Number.isSafeInteger(now) || now<0) throw new Error("Invalid YouTube response identity");
    const responseHash=await digestText(JSON.stringify(response));
    const prior=await this.db.prepare("SELECT response_hash FROM content_transition_chzzk_attempts WHERE transition_id=? AND operation_id=? AND request_key=? AND attempt=? AND claim=?").bind(id,operationId,requestKey,attempt,claim).first<{response_hash:string|null}>();
    // Configuration/quota denial before HTTP has no attempt row; it still has
    // the exact held delivery claim and a durable original typed error result.
    if((!prior && !(response.status==="error" && receipt.claim===claim && receipt.attempt===attempt)) || (prior?.response_hash && prior.response_hash!==responseHash)) throw new Error("Unknown or conflicting YouTube attempt");
    if(prior?.response_hash===responseHash) return receipt;
    await this.db.batch([
      this.db.prepare(`UPDATE content_transition_chzzk_requests SET response_json=?,response_hash=?,claim=NULL WHERE transition_id=? AND operation_id=? AND request_key=? AND request_hash=? AND response_json IS NULL AND disposition IS NULL
        AND EXISTS(SELECT 1 FROM content_transition_operations WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL)`)
        .bind(JSON.stringify(response),responseHash,id,operationId,requestKey,requestHash,id,operationId,payloadHash),
      this.db.prepare(`UPDATE content_transition_chzzk_attempts SET response_hash=?,finished_at=?,state=CASE WHEN EXISTS(SELECT 1 FROM content_transition_chzzk_requests r WHERE r.transition_id=content_transition_chzzk_attempts.transition_id AND r.operation_id=content_transition_chzzk_attempts.operation_id AND r.request_key=content_transition_chzzk_attempts.request_key AND r.disposition='exhausted_unknown') THEN state WHEN EXISTS(SELECT 1 FROM content_transition_chzzk_requests r WHERE r.transition_id=? AND r.operation_id=? AND r.request_key=? AND r.response_hash=?) THEN 'response_committed' ELSE 'superseded' END
        WHERE transition_id=? AND operation_id=? AND request_key=? AND attempt=? AND claim=? AND response_hash IS NULL`).bind(responseHash,now,id,operationId,requestKey,responseHash,id,operationId,requestKey,attempt,claim),
    ]);
    return this.read(id,operationId,payloadHash,requestKey,frozen);
  }
  async failurePreparation(id:string,operationId:string,payloadHash:string,frozen=false):Promise<YouTubeVideoFailurePreparation|null> {
    const {row}=await this.authority(id,operationId,payloadHash,frozen),value=JSON.parse(row.envelope_json),preparation=(this.site===row.source_site?value.sourceReceipt:value.nativeReceipt)?.videoFailurePreparation;
    if(!preparation) return null;
    if(!parseVideoCatalogFailure(preparation.failure)||JSON.stringify(preparation.control)!==JSON.stringify(await this.completion(id,operationId,payloadHash,frozen))) throw new Error('Invalid original video failure preparation');
    return preparation;
  }
  /** Freeze only unused continuations after an exact original caller failure.
   * Unknown/in-flight reads fail completionGuard and remain recoverable. */
  async prepareFailure(id:string,operationId:string,payloadHash:string,control:YouTubeVideoCompletion,raw:YouTubeVideoFailure,now:number,frozen=false) {
    if(!Number.isSafeInteger(now)||now<0) throw new Error('Invalid original failure reconciliation time');
    const failure=parseVideoCatalogFailure(raw);if(!failure||JSON.stringify(failure)!==JSON.stringify(raw)) throw new Error('Not an original definitive video failure');
    const prior=await this.failurePreparation(id,operationId,payloadHash,frozen);
    if(prior) {if(JSON.stringify(prior)!==JSON.stringify({control,failure})) throw new Error('Conflicting original video failure');return prior;}
    const {row,command}=await this.authority(id,operationId,payloadHash,frozen),key=this.site===row.source_site?'sourceReceipt':'nativeReceipt';
    if(Boolean(failure.conversionOutcome)!==(command.action==='candidate_convert')) throw new Error('Original conversion outcome preparation mismatch');
    const channelConstraint=command.action==='candidate_channel_approve'&&failure.kind==='repository'&&failure.code==='validation_failed'&&Boolean(failure.sqlError);
    if(['candidate_refresh','candidate_channel_approve'].includes(command.action)?!channelConstraint&&!['ingestion','metadata'].includes(failure.kind):failure.kind==='ingestion') throw new Error('Failure outside original metadata caller');
    await this.assertCompletion(id,operationId,payloadHash,control);
    await this.db.batch([
      ...this.completionGuard(id,operationId,control),
      this.db.prepare(`SELECT iif(EXISTS(SELECT 1 FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE o.transition_id=? AND o.operation_id=? AND o.payload_hash=? AND o.outcome_json IS NULL AND o.attempt_json IS NULL AND t.local_site=? AND t.local_resource=? AND ${this.phase(frozen)} AND json_extract(o.envelope_json,'$.${key}.result') IS NULL AND json_type(o.envelope_json,'$.${key}.videoApprovalNoopReads') IS NULL AND NOT EXISTS(SELECT 1 FROM content_transition_commits c WHERE c.transition_id=o.transition_id AND c.operation_id=o.operation_id)),1,json('video_failure_preparation_race'))`).bind(id,operationId,payloadHash,this.site,this.resource),
      this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.videoFailurePreparation',json(?)) WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL AND json_type(envelope_json,'$.${key}.videoFailurePreparation') IS NULL`).bind(JSON.stringify({control,failure}),id,operationId,payloadHash),
      this.db.prepare(`UPDATE content_transition_chzzk_requests SET disposition='not_issued' WHERE transition_id=? AND operation_id=? AND attempt=0 AND claim IS NULL AND response_json IS NULL AND request_key IN (SELECT json_extract(value,'$.requestKey') FROM json_each(?) WHERE json_extract(value,'$.disposition')='not_issued')`).bind(id,operationId,JSON.stringify(control.reads)),
    ]);
    return (await this.failurePreparation(id,operationId,payloadHash,frozen))!;
  }
  async approvalNoopPreparation(id:string,operationId:string,payloadHash:string,frozen=false):Promise<YouTubeVideoNoopPreparation|null> {
    const {row,command}=await this.authority(id,operationId,payloadHash,frozen);
    if(command.action!=='proposal_approve') throw new Error('Not an original proposal approval');
    const value=JSON.parse(row.envelope_json),proof=(this.site===row.source_site?value.sourceReceipt:value.nativeReceipt)?.videoApprovalNoopReads;
    if(!proof) return null;
    if(!/^[a-f0-9]{64}$/.test(proof.resultHash)||proof.control.failure||JSON.stringify(proof.control)!==JSON.stringify(await this.completion(id,operationId,payloadHash,frozen))) throw new Error('Invalid original approved-result read preparation');
    return proof;
  }
  async prepareApprovalNoop(id:string,operationId:string,payloadHash:string,proof:YouTubeVideoNoopPreparation,frozen=false) {
    const {row,command}=await this.authority(id,operationId,payloadHash,frozen),key=this.site===row.source_site?'sourceReceipt':'nativeReceipt';
    if(command.action!=='proposal_approve'||!/^[a-f0-9]{64}$/.test(proof.resultHash)||proof.control.failure||proof.control.reads.some(read=>read.disposition==='exhausted_unknown')) throw new Error('Invalid original approved-result read preparation');
    const prior=await this.approvalNoopPreparation(id,operationId,payloadHash,frozen);
    if(prior) {if(JSON.stringify(prior)!==JSON.stringify(proof)) throw new Error('Conflicting original approved result');return prior;}
    await this.assertCompletion(id,operationId,payloadHash,proof.control);
    await this.db.batch([
      ...this.completionGuard(id,operationId,proof.control),
      this.db.prepare(`SELECT iif(EXISTS(SELECT 1 FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE o.transition_id=? AND o.operation_id=? AND o.payload_hash=? AND o.outcome_json IS NULL AND o.attempt_json IS NULL AND t.local_site=? AND t.local_resource=? AND ${this.phase(frozen)} AND json_type(o.envelope_json,'$.${key}.videoFailurePreparation') IS NULL ${frozen?'':`AND json_extract(o.envelope_json,'$.${key}.videoApprovalNoop.resultHash')=?`} AND NOT EXISTS(SELECT 1 FROM content_transition_commits c WHERE c.transition_id=o.transition_id AND c.operation_id=o.operation_id)),1,json('video_noop_read_preparation_race'))`).bind(id,operationId,payloadHash,this.site,this.resource,...(frozen?[]:[proof.resultHash])),
      this.db.prepare(`UPDATE content_transition_operations SET envelope_json=json_set(envelope_json,'$.${key}.videoApprovalNoopReads',json(?)) WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL AND json_type(envelope_json,'$.${key}.videoApprovalNoopReads') IS NULL`).bind(JSON.stringify(proof),id,operationId,payloadHash),
      this.db.prepare("UPDATE content_transition_chzzk_requests SET disposition='not_issued' WHERE transition_id=? AND operation_id=? AND attempt=0 AND claim IS NULL AND response_json IS NULL AND request_key IN (SELECT json_extract(value,'$.requestKey') FROM json_each(?) WHERE json_extract(value,'$.disposition')='not_issued')").bind(id,operationId,JSON.stringify(proof.control.reads)),
    ]);
    return (await this.approvalNoopPreparation(id,operationId,payloadHash,frozen))!;
  }
  async exhaust(id:string,operationId:string,payloadHash:string,requestKey:string,now:number,frozen=false) {
    const {command}=await this.authority(id,operationId,payloadHash,frozen);
    const receipt=await this.read(id,operationId,payloadHash,requestKey,frozen);
    if(receipt.response || receipt.exhausted) return receipt;
    if(!Number.isSafeInteger(now) || now<0) throw new Error("Invalid YouTube disposition time");
    const control=await this.completion(id,operationId,payloadHash,frozen,requestKey);
    const outcome:OperationOutcome={outcome:"failed",sideEffectReconciled:true,detail:"Original admin video GET exhausted four interrupted HTTP attempts without a durable response; no catalog business committed",youtubeVideo:control};
    // Failure and the read disposition are a single source/native CAS. A live
    // claim, recorded response, owning commit or original result defeats it.
    await this.db.batch([
      ...this.completionGuard(id,operationId,control,requestKey),
      this.db.prepare(`UPDATE content_transition_chzzk_requests SET disposition='exhausted_unknown',claim=NULL WHERE transition_id=? AND operation_id=? AND request_key=? AND request_hash=? AND attempt=4 AND retry_at<=? AND response_json IS NULL AND disposition IS NULL
        AND (SELECT count(*) FROM content_transition_chzzk_attempts a WHERE a.transition_id=? AND a.operation_id=? AND a.request_key=? AND a.response_hash IS NULL AND a.state IN ('started','uncertain'))=4
        AND EXISTS(SELECT 1 FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE o.transition_id=? AND o.operation_id=? AND o.payload_hash=? AND o.outcome_json IS NULL AND o.attempt_json IS NULL AND t.local_site=? AND t.local_resource=? AND ${this.phase(frozen)}
          AND json_extract(o.envelope_json,'$.nativeReceipt.result') IS NULL AND json_extract(o.envelope_json,'$.sourceReceipt.result') IS NULL
          AND NOT EXISTS(SELECT 1 FROM content_transition_commits c WHERE c.transition_id=o.transition_id AND c.operation_id=o.operation_id))`)
        .bind(id,operationId,requestKey,receipt.requestHash,now,id,operationId,requestKey,id,operationId,payloadHash,this.site,this.resource),
      this.db.prepare(`UPDATE content_transition_chzzk_attempts SET state='uncertain',uncertain_at=coalesce(uncertain_at,?) WHERE transition_id=? AND operation_id=? AND request_key=? AND state='started'
        AND EXISTS(SELECT 1 FROM content_transition_chzzk_requests r WHERE r.transition_id=? AND r.operation_id=? AND r.request_key=? AND r.disposition='exhausted_unknown')`).bind(now,id,operationId,requestKey,id,operationId,requestKey),
      ...(['candidate_convert','candidate_channel_approve'].includes(command.action)?[]:[this.db.prepare(`UPDATE content_transition_operations SET outcome_json=? WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL
        AND EXISTS(SELECT 1 FROM content_transition_chzzk_requests r WHERE r.transition_id=? AND r.operation_id=? AND r.request_key=? AND r.disposition='exhausted_unknown')`).bind(JSON.stringify(outcome),id,operationId,payloadHash,id,operationId,requestKey),
      ]),
    ]);
    return this.read(id,operationId,payloadHash,requestKey,frozen);
  }
  async assertCompletion(id:string,operationId:string,payloadHash:string,control:YouTubeVideoCompletion) {
    if(JSON.stringify(await this.completion(id,operationId,payloadHash))!==JSON.stringify(control)) throw new Error("Original video completion identity mismatch");
  }
  async completion(id:string,operationId:string,payloadHash:string,frozen=false,exhausting?:string):Promise<YouTubeVideoCompletion> {
    const {command,channelId}=await this.authority(id,operationId,payloadHash,frozen),control:YouTubeVideoCompletion={...(command.action==='candidate_channel_approve'?{flow:'candidate_channel_approve' as const}:{}),reads:[],failure:null};
    for(const {requestKey} of originalRequests(command,channelId)) {
      const receipt=await this.read(id,operationId,payloadHash,requestKey,frozen);
      const exhausted=receipt.exhausted || receipt.requestKey===exhausting;
      if(!receipt.response && !exhausted && (receipt.attempt!==0 || receipt.claim!==null)) throw new Error("Unresolved original video read");
      if(receipt.requestKey===exhausting && receipt.attempt!==4) throw new Error("Original video HTTP budget not exhausted");
      control.reads.push({requestKey:receipt.requestKey,requestHash:receipt.requestHash,responseHash:receipt.responseHash,disposition:exhausted?"exhausted_unknown":receipt.response?"consumed":"not_issued"});
      if(receipt.response?.status==="error") control.failure??=receipt.response.error;
      if(exhausted) control.failure={message:"YouTube metadata request could not be recovered after four interrupted attempts",code:"network",retryable:false,retryAfterMs:null};
    }
    return control;
  }
  /** Use in the actual owner terminal transaction, preventing a concurrent
   * delivery from starting a supposedly never-issued continuation. */
  completionGuard(id:string,operationId:string,control:YouTubeVideoCompletion,exhausting?:string) {
    return [this.db.prepare(`SELECT iif((SELECT count(*) FROM content_transition_chzzk_requests WHERE transition_id=? AND operation_id=?)=json_array_length(?) AND NOT EXISTS(
      SELECT 1 FROM json_each(?) c WHERE NOT EXISTS(SELECT 1 FROM content_transition_chzzk_requests r WHERE r.transition_id=? AND r.operation_id=?
        AND r.request_key=json_extract(c.value,'$.requestKey') AND r.request_hash=json_extract(c.value,'$.requestHash') AND r.response_hash IS json_extract(c.value,'$.responseHash')
        AND CASE json_extract(c.value,'$.disposition') WHEN 'consumed' THEN r.response_json IS NOT NULL
          WHEN 'not_issued' THEN r.response_json IS NULL AND r.attempt=0 AND r.claim IS NULL
          WHEN 'exhausted_unknown' THEN r.disposition='exhausted_unknown' OR (r.request_key=? AND r.attempt=4 AND r.response_json IS NULL)
          ELSE 0 END)),1,json('video_read_completion_race'))`).bind(id,operationId,JSON.stringify(control.reads),JSON.stringify(control.reads),id,operationId,exhausting??null)];
  }
  async settlementStatements(id:string,operationId:string,payloadHash:string,outcome:OperationOutcome,now:number) {
    const control=outcome.youtubeVideo;
    if(!control || !outcome.sideEffectReconciled) return [];
    const {row}=await this.authority(id,operationId,payloadHash);
    const rows=(await this.db.prepare('SELECT request_key FROM content_transition_chzzk_requests WHERE transition_id=? AND operation_id=?').bind(id,operationId).all<{request_key:string}>()).results;
    if(this.site===row.target_site&&row.outcome_json===JSON.stringify(outcome)) {
      // The reviewed pruner may reclaim consumed positions separately. Verify
      // retained positions against the immutable whole result; missing controls
      // never authorize registration, a fresh read or a new HTTP attempt.
      if(rows.some(item=>!control.reads.some(read=>read.requestKey===item.request_key))) throw new Error('Unexpected native video request');
      for(const read of control.reads) {
        if(!rows.some(item=>item.request_key===read.requestKey)) {if(read.disposition!=='consumed') throw new Error('Missing unresolved native video evidence');continue;}
        const actual=await this.read(id,operationId,payloadHash,read.requestKey);
        if(actual.requestHash!==read.requestHash||actual.responseHash!==read.responseHash||read.disposition==='not_issued'&&(actual.attempt!==0||actual.claim!==null||actual.response!==null)||read.disposition==='exhausted_unknown'&&!actual.exhausted||read.disposition==='consumed'&&!actual.response) throw new Error('Changed terminal native video evidence');
      }
    } else await this.assertCompletion(id,operationId,payloadHash,control);
    const source=this.site===row.source_site,guard=`EXISTS(SELECT 1 FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE o.transition_id=? AND o.operation_id=? AND o.payload_hash=? AND o.outcome_json=? AND t.local_site=? AND t.local_resource=? AND ${source?"o.outcome_acknowledged=1 AND t.local_site=t.source_site":"o.source_seq IS NULL AND o.generation=t.generation AND t.local_site=t.target_site AND t.phase IN ('target_owned','complete')"})`;
    const bind=[id,operationId,payloadHash,JSON.stringify(outcome),this.site,this.resource];
    const digest=await digestText(JSON.stringify(outcome));
    return control.reads.flatMap(read=>[
      this.db.prepare(`UPDATE content_transition_chzzk_requests SET disposition=?,settled_outcome_digest=?,settled_at=coalesce(settled_at,?) WHERE transition_id=? AND operation_id=? AND request_key=? AND response_hash IS ? AND ${guard}`)
        .bind(read.disposition,digest,now,id,operationId,read.requestKey,read.responseHash,...bind),
      ...(read.disposition==="consumed"?[this.db.prepare(`UPDATE content_transition_chzzk_attempts SET state='superseded',uncertain_at=coalesce(uncertain_at,?),resolved_at=coalesce(resolved_at,?),superseded_by_response_hash=?
        WHERE transition_id=? AND operation_id=? AND request_key=? AND response_hash IS NULL AND state IN ('started','uncertain') AND ${guard}`).bind(now,now,read.responseHash,id,operationId,read.requestKey,...bind),
      ]:[]),
    ]);
  }
  async settle(id:string,operationId:string,payloadHash:string,outcome:OperationOutcome,now:number) {
    const statements=await this.settlementStatements(id,operationId,payloadHash,outcome,now);
    if(statements.length) await this.db.batch(statements);
  }
}
