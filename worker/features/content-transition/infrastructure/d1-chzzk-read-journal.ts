import type {AcceptedOperation,OperationOutcome} from "@contracts/content-transition";
import type {ChzzkReadReceipt,ChzzkScanCommand} from "@contracts/content-transition-chzzk";
import type {SiteId} from "@contracts/site-definition";
import {parseChzzkScanCommand,parseChzzkScanRequest,parseChzzkScanResponse,chzzkScanRequestKey} from "../../schedules/commands";
import {digestText} from "./d1-baseline-store";
import {nativeChzzkWholeCompleteSql} from "./chzzk-read-retention";

type RequestRow={request_key:string;request_hash:string;request_json:string;response_hash:string|null;response_json:string|null;attempt:number;claim:string|null;retry_at:number};
const sourcePhases="'protected','copying','replaying','target_ingress_ready'";
/** One journal authority per original read, including a late source response.
 * The peer API supplies only an already admitted operation and registered key. */
export class D1ChzzkReadJournal {
  private readonly db:D1Database;
  private readonly site:SiteId;
  private readonly resource:string;
  constructor(db:D1Database,site:SiteId,resource:string) {this.db=db;this.site=site;this.resource=resource;}
  static async registration(db:D1Database,operation:AcceptedOperation,command:ChzzkScanCommand) {
    const requests=command.members.flatMap(member=>[
      ...[0,1,2].map(page=>({kind:"videos",channelId:member.channelId,page,size:5} as const)),
      {kind:"live",channelId:member.channelId} as const,
    ]);
    return Promise.all(requests.map(async request=>db.prepare(`INSERT OR IGNORE INTO content_transition_chzzk_requests(transition_id,operation_id,request_key,request_hash,request_json)
      SELECT transition_id,operation_id,?,?,? FROM content_transition_operations WHERE transition_id=? AND operation_id=? AND payload_hash=? AND outcome_json IS NULL`)
      .bind(chzzkScanRequestKey(request),await digestText(JSON.stringify(request)),JSON.stringify(request),operation.transitionId,operation.operationId,operation.payloadHash)));
  }
  private async authority(id:string,operationId:string,payloadHash:string) {
    const row=await this.db.prepare(`SELECT t.local_site,t.local_resource,t.source_site,t.target_site,t.phase,t.generation,t.fence_json,o.seq,o.source_seq,o.generation AS operation_generation,o.envelope_json,o.outcome_json
      FROM content_transitions t JOIN content_transition_operations o ON o.transition_id=t.id WHERE t.id=? AND o.operation_id=? AND o.payload_hash=? AND t.local_site=? AND t.local_resource=? AND json_extract(o.envelope_json,'$.codec.id')='schedules.chzzk_scan'`)
      .bind(id,operationId,payloadHash,this.site,this.resource).first<{source_site:SiteId;target_site:SiteId;phase:string;generation:number;fence_json:string|null;seq:number;source_seq:number|null;operation_generation:number;envelope_json:string;outcome_json:string|null}>();
    if(!row || row.source_seq!==null || row.operation_generation!==(this.site===row.source_site?row.generation-1:row.generation)) throw new Error("Wrong authoritative CHZZK operation identity");
    const envelope=JSON.parse(row.envelope_json),command=parseChzzkScanCommand(this.site===row.source_site?envelope.sourceCommand?.payload:envelope.payload);
    if(!command) throw new Error("Missing original CHZZK scan command");
    return {row,command};
  }
  async read(id:string,operationId:string,payloadHash:string,requestKey:string):Promise<ChzzkReadReceipt> {
    const {command}=await this.authority(id,operationId,payloadHash);
    const row=await this.db.prepare("SELECT * FROM content_transition_chzzk_requests WHERE transition_id=? AND operation_id=? AND request_key=?").bind(id,operationId,requestKey).first<RequestRow>();
    const request=row?parseChzzkScanRequest(JSON.parse(row.request_json),command):null;
    if(!row || !request || chzzkScanRequestKey(request)!==requestKey || await digestText(JSON.stringify(request))!==row.request_hash) throw new Error("Unknown registered CHZZK request");
    const response=row.response_json===null?null:parseChzzkScanResponse(JSON.parse(row.response_json),request);
    if(row.response_json!==null && (!response || await digestText(JSON.stringify(response))!==row.response_hash)) throw new Error("Corrupt immutable CHZZK response");
    return {transitionId:id,operationId,payloadHash,requestKey,requestHash:row.request_hash,request,response,responseHash:row.response_hash,attempt:row.attempt,claim:row.claim,retryAt:row.retry_at};
  }
  async claimLocal(id:string,operationId:string,payloadHash:string,requestKey:string,now:number) {
    return this.claimRequest(id,operationId,payloadHash,requestKey,now,false);
  }
  private async frozenAuthority(id:string,operationId:string,payloadHash:string) {
    const {row}=await this.authority(id,operationId,payloadHash);
    if(this.site!==row.source_site || row.phase!=="source_fenced" || !row.fence_json || row.seq>JSON.parse(row.fence_json).operationBoundary) throw new Error("Not a frozen original CHZZK request");
  }
  async readFrozenOriginal(id:string,operationId:string,payloadHash:string,requestKey:string) {
    await this.frozenAuthority(id,operationId,payloadHash);
    return this.read(id,operationId,payloadHash,requestKey);
  }
  async completeFrozenOriginal(id:string,operationId:string,payloadHash:string,requestKey:string,requestHash:string,attempt:number,claim:string,response:unknown,now:number) {
    await this.frozenAuthority(id,operationId,payloadHash);
    return this.complete(id,operationId,payloadHash,requestKey,requestHash,attempt,claim,response,now);
  }
  async claimFrozenOriginal(id:string,operationId:string,payloadHash:string,requestKey:string,now:number) {
    return this.claimRequest(id,operationId,payloadHash,requestKey,now,true);
  }
  private async claimRequest(id:string,operationId:string,payloadHash:string,requestKey:string,now:number,frozen:boolean) {
    if(!Number.isSafeInteger(now) || now<0) throw new Error("Invalid CHZZK claim time");
    const {row}=await this.authority(id,operationId,payloadHash),receipt=await this.read(id,operationId,payloadHash,requestKey);
    if(receipt.response) return {receipt,claimed:false};
    const source=this.site===row.source_site;
    const phase=frozen?"t.local_site=t.source_site AND t.phase='source_fenced' AND o.seq<=json_extract(t.fence_json,'$.operationBoundary')":source?`t.local_site=t.source_site AND t.phase IN (${sourcePhases})`:"t.local_site=t.target_site AND t.phase IN ('target_owned','complete') AND o.source_seq IS NULL";
    if(frozen && (!source || row.phase!=="source_fenced" || !row.fence_json || row.seq>JSON.parse(row.fence_json).operationBoundary)) throw new Error("Not a frozen original CHZZK request");
    const claim=crypto.randomUUID(),authority=`EXISTS(SELECT 1 FROM content_transitions t JOIN content_transition_operations o ON o.transition_id=t.id WHERE t.id=? AND o.operation_id=? AND o.payload_hash=? AND t.local_site=? AND t.local_resource=? AND o.outcome_json IS NULL AND ${phase})`;
    const match="transition_id=? AND operation_id=? AND request_key=?",bind=[id,operationId,requestKey];
    await this.db.batch([
      this.db.prepare(`UPDATE content_transition_chzzk_attempts SET state='uncertain',uncertain_at=? WHERE ${match} AND state='started' AND EXISTS(SELECT 1 FROM content_transition_chzzk_requests r WHERE r.transition_id=? AND r.operation_id=? AND r.request_key=? AND r.response_json IS NULL AND r.retry_at<=?) AND ${authority}`).bind(now,...bind,...bind,now,id,operationId,payloadHash,this.site,this.resource),
      this.db.prepare(`UPDATE content_transition_chzzk_requests SET attempt=attempt+1,claim=?,retry_at=? WHERE ${match} AND response_json IS NULL AND retry_at<=? AND attempt<3 AND ${authority}`).bind(claim,now+30000,...bind,now,id,operationId,payloadHash,this.site,this.resource),
      this.db.prepare(`INSERT INTO content_transition_chzzk_attempts(transition_id,operation_id,request_key,attempt,claim,started_at)
        SELECT transition_id,operation_id,request_key,attempt,claim,? FROM content_transition_chzzk_requests WHERE ${match} AND claim=? AND response_json IS NULL`).bind(now,...bind,claim),
    ]);
    const actual=await this.read(id,operationId,payloadHash,requestKey);
    return {receipt:actual,claimed:actual.claim===claim && actual.response===null};
  }
  async complete(id:string,operationId:string,payloadHash:string,requestKey:string,requestHash:string,attempt:number,claim:string,raw:unknown,now:number) {
    const receipt=await this.read(id,operationId,payloadHash,requestKey),response=parseChzzkScanResponse(raw,receipt.request);
    if(!response || JSON.stringify(response)!==JSON.stringify(raw) || requestHash!==receipt.requestHash || !Number.isSafeInteger(now) || now<0) throw new Error("Invalid CHZZK response identity");
    const responseHash=await digestText(JSON.stringify(response));
    const success=response.kind==="videos"?response.videos!==null:response.content!==null && response.error===null && !response.staleCacheUsed;
    const prior=await this.db.prepare("SELECT state,response_hash FROM content_transition_chzzk_attempts WHERE transition_id=? AND operation_id=? AND request_key=? AND attempt=? AND claim=?").bind(id,operationId,requestKey,attempt,claim).first<{state:string;response_hash:string|null}>();
    if(!prior || prior.response_hash!==null && prior.response_hash!==responseHash) throw new Error("Unknown or conflicting CHZZK attempt");
    if(prior.response_hash===responseHash) return receipt;
    // A valid late original attempt may race a retry. The source journal's one
    // CAS chooses the response; neither arrival replaces an already held page.
    await this.db.batch([
      this.db.prepare(`UPDATE content_transition_chzzk_requests SET response_json=?,response_hash=?,claim=NULL WHERE transition_id=? AND operation_id=? AND request_key=? AND request_hash=? AND response_json IS NULL AND (?=1 OR attempt>=3)
        AND EXISTS(SELECT 1 FROM content_transition_chzzk_attempts a WHERE a.transition_id=? AND a.operation_id=? AND a.request_key=? AND a.attempt=? AND a.claim=? AND a.response_hash IS NULL AND a.state IN ('started','uncertain'))`).bind(JSON.stringify(response),responseHash,id,operationId,requestKey,requestHash,success?1:0,id,operationId,requestKey,attempt,claim),
      this.db.prepare(`UPDATE content_transition_chzzk_attempts SET finished_at=?,response_hash=?,state=CASE WHEN resolved_at IS NOT NULL THEN state WHEN ?=0 THEN 'failed' WHEN EXISTS(SELECT 1 FROM content_transition_chzzk_requests r WHERE r.transition_id=? AND r.operation_id=? AND r.request_key=? AND r.response_hash=?) THEN 'response_committed' ELSE 'superseded' END WHERE transition_id=? AND operation_id=? AND request_key=? AND attempt=? AND claim=? AND response_hash IS NULL`).bind(now,responseHash,success?1:0,id,operationId,requestKey,responseHash,id,operationId,requestKey,attempt,claim),
    ]);
    return this.read(id,operationId,payloadHash,requestKey);
  }
  /** Composed after the actual terminal acknowledgement, in its same source
   * transaction. Only this registered read-only GET family may resolve unknown
   * attempts by the immutable replacement response consumed by the owner. */
  async settlementStatements(id:string,operationId:string,payloadHash:string,outcome:OperationOutcome,now:number) {
    const {command}=await this.authority(id,operationId,payloadHash),control=outcome.chzzkScan;
    if(!control || !outcome.sideEffectReconciled || control.result.channels!==command.members.length || control.result.channelResults.some(item=>!command.members.some(member=>member.channelId===item.channelId))) throw new Error("Missing actual CHZZK terminal control");
    for(const used of control.reads) {
      const actual=await this.read(id,operationId,payloadHash,used.requestKey);
      if(actual.requestHash!==used.requestHash || actual.responseHash!==used.responseHash || !actual.response) throw new Error("CHZZK consumed response mismatch");
    }
    const digest=await digestText(JSON.stringify(outcome)),reads=JSON.stringify(control.reads);
    const authority=`EXISTS(SELECT 1 FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id
      WHERE o.transition_id=? AND o.operation_id=? AND o.payload_hash=? AND o.outcome_json=? AND o.outcome_acknowledged=1 AND t.local_site=t.source_site AND t.local_site=? AND t.local_resource=?)`;
    const bindings=[id,operationId,payloadHash,JSON.stringify(outcome),this.site,this.resource];
    return [
      this.db.prepare(`SELECT iif(${authority} AND NOT EXISTS(SELECT 1 FROM content_transition_chzzk_requests r WHERE transition_id=? AND operation_id=? AND
        ((attempt>0 AND NOT EXISTS(SELECT 1 FROM json_each(?) used WHERE json_extract(used.value,'$.requestKey')=r.request_key AND json_extract(used.value,'$.requestHash')=r.request_hash AND json_extract(used.value,'$.responseHash')=r.response_hash)) OR (settled_outcome_digest IS NOT NULL AND settled_outcome_digest<>?))),1,json('chzzk_control_not_consumed'))`).bind(...bindings,id,operationId,reads,digest),
      this.db.prepare(`UPDATE content_transition_chzzk_requests SET disposition=CASE WHEN attempt=0 THEN 'not_requested' ELSE 'consumed' END,settled_outcome_digest=?,settled_at=coalesce(settled_at,?) WHERE transition_id=? AND operation_id=? AND ${authority}`).bind(digest,now,id,operationId,...bindings),
      this.db.prepare(`UPDATE content_transition_chzzk_attempts SET uncertain_at=coalesce(uncertain_at,?),state='superseded',resolved_at=coalesce(resolved_at,?),
        superseded_by_response_hash=(SELECT response_hash FROM content_transition_chzzk_requests r WHERE r.transition_id=content_transition_chzzk_attempts.transition_id AND r.operation_id=content_transition_chzzk_attempts.operation_id AND r.request_key=content_transition_chzzk_attempts.request_key)
        WHERE transition_id=? AND operation_id=? AND response_hash IS NULL AND state IN ('started','uncertain') AND ${authority}`).bind(now,now,id,operationId,...bindings),
    ];
  }
  /** Timestamp real native whole-work reconciliation, never admission or scan
   * stage completion. Unresolved attempts leave the payloads held. */
  async nativeSettlementStatements(id:string,operationId:string,payloadHash:string,outcome:OperationOutcome,now:number) {
    if(!await this.db.prepare("SELECT 1 pending FROM content_transition_chzzk_requests WHERE transition_id=? AND operation_id=? AND settled_at IS NULL LIMIT 1").bind(id,operationId).first("pending")) return [];
    const {row,command}=await this.authority(id,operationId,payloadHash),control=outcome.chzzkScan;
    if(this.site!==row.target_site || !control || !outcome.sideEffectReconciled || control.result.channels!==command.members.length || control.result.channelResults.some(item=>!command.members.some(member=>member.channelId===item.channelId))) throw new Error("Missing native CHZZK terminal control");
    for(const used of control.reads) {
      const actual=await this.read(id,operationId,payloadHash,used.requestKey);
      if(actual.requestHash!==used.requestHash || actual.responseHash!==used.responseHash || !actual.response) throw new Error("Native CHZZK consumed response mismatch");
    }
    const digest=await digestText(JSON.stringify(outcome));
    return [this.db.prepare(`UPDATE content_transition_chzzk_requests SET disposition=CASE WHEN attempt=0 THEN 'not_requested' ELSE 'consumed' END,
      settled_outcome_digest=?,settled_at=coalesce(settled_at,?) WHERE transition_id=? AND operation_id=?
      AND EXISTS(SELECT 1 FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id
        WHERE o.transition_id=? AND o.operation_id=? AND o.payload_hash=? AND o.outcome_json=? AND t.local_site=? AND t.local_resource=? AND ${nativeChzzkWholeCompleteSql()}
          AND NOT EXISTS(SELECT 1 FROM content_transition_chzzk_requests r WHERE r.transition_id=o.transition_id AND r.operation_id=o.operation_id AND r.attempt>0
            AND NOT EXISTS(SELECT 1 FROM json_each(o.outcome_json,'$.chzzkScan.reads') used WHERE json_extract(used.value,'$.requestKey')=r.request_key AND json_extract(used.value,'$.requestHash')=r.request_hash AND json_extract(used.value,'$.responseHash')=r.response_hash)))`)
      .bind(digest,now,id,operationId,id,operationId,payloadHash,JSON.stringify(outcome),this.site,this.resource)];
  }
}
