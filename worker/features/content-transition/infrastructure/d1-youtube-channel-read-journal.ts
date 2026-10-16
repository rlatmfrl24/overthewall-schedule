import type {AcceptedOperation,OperationOutcome} from "@contracts/content-transition";
import type {SiteId} from "@contracts/site-definition";
import type {YouTubeChannelCompletion,YouTubeChannelReadReceipt,YouTubeChannelReadResponse} from "@contracts/content-transition-youtube";
import {parseChannelMutation} from "../../otw-play/commands";
import {digestText} from "./d1-baseline-store";
import {parseYouTubeChannelResponse,youtubeChannelRequest,youtubeChannelRequestKey,youtubeExhaustedOutcome} from "./youtube-channel-read";

type RequestRow={request_key:string;request_hash:string;request_json:string;response_hash:string|null;response_json:string|null;attempt:number;claim:string|null;retry_at:number;disposition:string|null};
/** Uses the existing durable request/attempt storage. Authorization is closed
 * to the original admin channel command, independently of the CHZZK adapter. */
export class D1YouTubeChannelReadJournal {
  private readonly db:D1Database;
  private readonly site:SiteId;
  private readonly resource:string;
  constructor(db:D1Database,site:SiteId,resource:string) {this.db=db;this.site=site;this.resource=resource;}
  static async registration(db:D1Database,operation:AcceptedOperation) {
    const command=parseChannelMutation(operation.payload);if(!command) throw new Error("Missing original channel command");
    const request=youtubeChannelRequest(command.input.externalChannelId);
    return db.prepare(`INSERT OR IGNORE INTO content_transition_chzzk_requests(transition_id,operation_id,request_key,request_hash,request_json)
      SELECT transition_id,operation_id,?,?,? FROM content_transition_operations WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL`)
      .bind(youtubeChannelRequestKey(command.input.externalChannelId),await digestText(JSON.stringify(request)),JSON.stringify(request),operation.transitionId,operation.operationId,operation.payloadHash);
  }
  private async authority(id:string,operationId:string,payloadHash:string,frozen=false) {
    const row=await this.db.prepare(`SELECT t.source_site,t.target_site,t.phase,t.generation,t.fence_json,o.seq,o.source_seq,o.generation operation_generation,o.envelope_json,o.outcome_json
      FROM content_transitions t JOIN content_transition_operations o ON o.transition_id=t.id WHERE t.id=? AND o.operation_id=? AND o.payload_hash=? AND t.local_site=? AND t.local_resource=?
      AND json_extract(o.envelope_json,'$.codec.id')='otw-play.channel.mutate'`)
      .bind(id,operationId,payloadHash,this.site,this.resource).first<{source_site:SiteId;target_site:SiteId;phase:string;generation:number;fence_json:string|null;seq:number;source_seq:number|null;operation_generation:number;envelope_json:string;outcome_json:string|null}>();
    if(!row || row.source_seq!==null || row.operation_generation!==(this.site===row.source_site?row.generation-1:row.generation)) throw new Error("Wrong original YouTube request authority");
    if(frozen && (this.site!==row.source_site || row.phase!=="source_fenced" || !row.fence_json || row.seq>JSON.parse(row.fence_json).operationBoundary)) throw new Error("Not a frozen original YouTube request");
    const value=JSON.parse(row.envelope_json),command=parseChannelMutation(this.site===row.source_site?value.sourceCommand?.payload:value.payload);
    if(!command) throw new Error("Missing original admitted channel metadata request");
    return {row,command};
  }
  async read(id:string,operationId:string,payloadHash:string,requestKey:string,frozen=false):Promise<YouTubeChannelReadReceipt> {
    const {command}=await this.authority(id,operationId,payloadHash,frozen),request=youtubeChannelRequest(command.input.externalChannelId);
    const row=await this.db.prepare("SELECT * FROM content_transition_chzzk_requests WHERE transition_id=? AND operation_id=? AND request_key=?").bind(id,operationId,requestKey).first<RequestRow>();
    if(!row || requestKey!==youtubeChannelRequestKey(command.input.externalChannelId) || row.request_json!==JSON.stringify(request) || row.request_hash!==await digestText(row.request_json)) throw new Error("Unknown registered YouTube request");
    const response=row.response_json===null?null:parseYouTubeChannelResponse(JSON.parse(row.response_json),request);
    if(row.response_json!==null && (!response || JSON.stringify(response)!==row.response_json || await digestText(row.response_json)!==row.response_hash)) throw new Error("Invalid immutable YouTube response");
    return {transitionId:id,operationId,payloadHash,requestKey,requestHash:row.request_hash,request,response,responseHash:row.response_hash,attempt:row.attempt,claim:row.claim,retryAt:row.retry_at,exhausted:row.disposition==="exhausted_unknown"};
  }
  private phase(frozen:boolean) {
    return frozen?"t.local_site=t.source_site AND t.phase='source_fenced' AND o.seq<=json_extract(t.fence_json,'$.operationBoundary')":`((t.local_site=t.source_site AND t.phase IN ('protected','copying','replaying','target_ingress_ready')) OR (t.local_site=t.target_site AND t.phase IN ('target_owned','complete') AND o.source_seq IS NULL))`;
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
        SELECT 1 FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE o.transition_id=? AND o.operation_id=? AND o.payload_hash=? AND o.outcome_json IS NULL AND t.local_site=? AND t.local_resource=? AND ${this.phase(frozen)})`)
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
        AND EXISTS(SELECT 1 FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE o.transition_id=? AND o.operation_id=? AND o.payload_hash=? AND o.outcome_json IS NULL AND t.local_site=? AND t.local_resource=? AND ${this.phase(frozen)})`)
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
  async complete(id:string,operationId:string,payloadHash:string,requestKey:string,requestHash:string,attempt:number,claim:string,raw:YouTubeChannelReadResponse,now:number,frozen=false) {
    const receipt=await this.read(id,operationId,payloadHash,requestKey,frozen),response=parseYouTubeChannelResponse(raw,receipt.request);
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
  async exhaust(id:string,operationId:string,payloadHash:string,requestKey:string,now:number,frozen=false) {
    const receipt=await this.read(id,operationId,payloadHash,requestKey,frozen);
    if(receipt.response || receipt.exhausted) return receipt;
    if(!Number.isSafeInteger(now) || now<0) throw new Error("Invalid YouTube disposition time");
    const outcome=youtubeExhaustedOutcome(receipt);
    // Failure and the read disposition are a single source/native CAS. A live
    // claim, recorded response, owning commit or original result defeats it.
    await this.db.batch([
      this.db.prepare(`UPDATE content_transition_chzzk_requests SET disposition='exhausted_unknown',claim=NULL WHERE transition_id=? AND operation_id=? AND request_key=? AND request_hash=? AND attempt=4 AND retry_at<=? AND response_json IS NULL AND disposition IS NULL
        AND (SELECT count(*) FROM content_transition_chzzk_attempts a WHERE a.transition_id=? AND a.operation_id=? AND a.request_key=? AND a.response_hash IS NULL AND a.state IN ('started','uncertain'))=4
        AND EXISTS(SELECT 1 FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE o.transition_id=? AND o.operation_id=? AND o.payload_hash=? AND o.outcome_json IS NULL AND o.attempt_json IS NULL AND t.local_site=? AND t.local_resource=? AND ${this.phase(frozen)}
          AND json_extract(o.envelope_json,'$.nativeReceipt.result') IS NULL AND json_extract(o.envelope_json,'$.sourceReceipt.result') IS NULL
          AND NOT EXISTS(SELECT 1 FROM content_transition_commits c WHERE c.transition_id=o.transition_id AND c.operation_id=o.operation_id))`)
        .bind(id,operationId,requestKey,receipt.requestHash,now,id,operationId,requestKey,id,operationId,payloadHash,this.site,this.resource),
      this.db.prepare(`UPDATE content_transition_chzzk_attempts SET state='uncertain',uncertain_at=coalesce(uncertain_at,?) WHERE transition_id=? AND operation_id=? AND request_key=? AND state='started'
        AND EXISTS(SELECT 1 FROM content_transition_chzzk_requests r WHERE r.transition_id=? AND r.operation_id=? AND r.request_key=? AND r.disposition='exhausted_unknown')`).bind(now,id,operationId,requestKey,id,operationId,requestKey),
      this.db.prepare(`UPDATE content_transition_operations SET outcome_json=? WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL
        AND EXISTS(SELECT 1 FROM content_transition_chzzk_requests r WHERE r.transition_id=? AND r.operation_id=? AND r.request_key=? AND r.disposition='exhausted_unknown')`).bind(JSON.stringify(outcome),id,operationId,payloadHash,id,operationId,requestKey),
    ]);
    return this.read(id,operationId,payloadHash,requestKey,frozen);
  }
  async assertCompletion(id:string,operationId:string,payloadHash:string,control:YouTubeChannelCompletion) {
    const receipt=await this.read(id,operationId,payloadHash,control.requestKey);
    if(receipt.requestHash!==control.requestHash || receipt.responseHash!==control.responseHash) throw new Error("Original YouTube completion identity mismatch");
    if(control.disposition==="exhausted_unknown") {
      if(!receipt.exhausted || JSON.stringify(control)!==JSON.stringify(youtubeExhaustedOutcome(receipt).youtubeChannel)) throw new Error("Missing original exhausted HTTP proof");
    } else {
      const failure=receipt.response?.status==="error"?receipt.response.error:receipt.response?.channel===null?{code:"channel_unverified",message:"YouTube channel metadata could not be verified",retryable:false,retryAfterMs:null}:null;
      if(!receipt.response || JSON.stringify(failure)!==JSON.stringify(control.failure)) throw new Error("Original YouTube consumed result mismatch");
    }
  }
  async settlementStatements(id:string,operationId:string,payloadHash:string,outcome:OperationOutcome,now:number) {
    const control=outcome.youtubeChannel;
    if(!control || !outcome.sideEffectReconciled) return [];
    const {row}=await this.authority(id,operationId,payloadHash);
    const existing=await this.db.prepare("SELECT 1 present FROM content_transition_chzzk_requests WHERE transition_id=? AND operation_id=? AND request_key=?").bind(id,operationId,control.requestKey).first("present");
    if(!existing && this.site===row.target_site && row.outcome_json===JSON.stringify(outcome)) return []; // Pruned native terminal work cannot register again.
    await this.assertCompletion(id,operationId,payloadHash,control);
    const source=this.site===row.source_site,guard=`EXISTS(SELECT 1 FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id WHERE o.transition_id=? AND o.operation_id=? AND o.payload_hash=? AND o.outcome_json=? AND t.local_site=? AND t.local_resource=? AND ${source?"o.outcome_acknowledged=1 AND t.local_site=t.source_site":"o.source_seq IS NULL AND o.generation=t.generation AND t.local_site=t.target_site AND t.phase IN ('target_owned','complete')"})`;
    const bind=[id,operationId,payloadHash,JSON.stringify(outcome),this.site,this.resource];
    return [
      this.db.prepare(`UPDATE content_transition_chzzk_requests SET disposition=?,settled_outcome_digest=?,settled_at=coalesce(settled_at,?) WHERE transition_id=? AND operation_id=? AND request_key=? AND response_hash IS ? AND ${guard}`)
        .bind(control.disposition,await digestText(JSON.stringify(outcome)),now,id,operationId,control.requestKey,control.responseHash,...bind),
      ...(control.disposition==="consumed"?[this.db.prepare(`UPDATE content_transition_chzzk_attempts SET state='superseded',uncertain_at=coalesce(uncertain_at,?),resolved_at=coalesce(resolved_at,?),superseded_by_response_hash=?
        WHERE transition_id=? AND operation_id=? AND request_key=? AND response_hash IS NULL AND state IN ('started','uncertain') AND ${guard}`).bind(now,now,control.responseHash,id,operationId,control.requestKey,...bind),
      ]:[]),
    ];
  }
  async settle(id:string,operationId:string,payloadHash:string,outcome:OperationOutcome,now:number) {
    const statements=await this.settlementStatements(id,operationId,payloadHash,outcome,now);
    if(statements.length) await this.db.batch(statements);
  }
}
