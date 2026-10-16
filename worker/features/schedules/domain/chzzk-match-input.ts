import type {ChzzkChildResult} from "@contracts/content-transition-chzzk";

/** Positive, local decision input retained for one original derived member/day.
 * It contains no actor or runnable job and cannot choose a transition owner. */
export interface ChzzkMatchInput {
  startedAt:number;
  members:Array<{uid:number;name:string;url_chzzk:string|null}>;
  schedules:Array<{id:number;member_uid:number;date:string;start_time:string|null;title:string|null;status:string}>;
  observations:Array<{member_uid:number;vod_id:string;title:string;started_at:number;ended_at:number;duration_seconds:number;thumbnail_url:string|null}>;
  rejections:Array<{vod_id:string;source_vod_ids:string}>;
  pending:Array<{id:number;member_uid:number;date:string;start_time:string|null;action_type:string;existing_schedule_id:number|null;candidate_kind:string|null;vod_id:string|null}>;
}
export function parseChzzkMatchInput(raw:unknown):ChzzkMatchInput|null {
  if(!raw || typeof raw!=="object" || Array.isArray(raw)) return null;
  const input=raw as Record<string,unknown>;
  if(!Number.isSafeInteger(input.startedAt) || Number(input.startedAt)<0 || Object.keys(input).sort().join(",")!=="members,observations,pending,rejections,schedules,startedAt") return null;
  const fields={members:"name,uid,url_chzzk",schedules:"date,id,member_uid,start_time,status,title",observations:"duration_seconds,ended_at,member_uid,started_at,thumbnail_url,title,vod_id",rejections:"source_vod_ids,vod_id",pending:"action_type,candidate_kind,date,existing_schedule_id,id,member_uid,start_time,vod_id"};
  const nullable:Record<string,Set<string>>={members:new Set(["url_chzzk"]),schedules:new Set(["start_time","title"]),observations:new Set(["thumbnail_url"]),rejections:new Set(),pending:new Set(["start_time","existing_schedule_id","candidate_kind","vod_id"])};
  const positive=new Set(["uid","id","member_uid","existing_schedule_id"]),nonnegative=new Set(["started_at","ended_at","duration_seconds"]);
  for(const [key,shape] of Object.entries(fields)) {
    const rows=input[key];
    if(!Array.isArray(rows) || rows.some(row=>!row || typeof row!=="object" || Array.isArray(row) || Object.keys(row).sort().join(",")!==shape || Object.entries(row).some(([field,value])=>value===null?!nullable[key].has(field):positive.has(field)?!Number.isSafeInteger(value)||Number(value)<1:nonnegative.has(field)?!Number.isSafeInteger(value)||Number(value)<0:typeof value!=="string"))) return null;
  }
  return input as unknown as ChzzkMatchInput;
}
export function parseChzzkChildResult(raw:unknown):ChzzkChildResult|null {
  if(!raw || typeof raw!=="object" || Array.isArray(raw)) return null;
  const value=raw as Record<string,unknown>,result=value.result;
  if(Object.keys(value).sort().join(",")!==(value.notAdmitted===undefined?"result,status":"notAdmitted,result,status") || !["succeeded","partial","failed"].includes(String(value.status)) || !result || typeof result!=="object" || Array.isArray(result)) return null;
  const body=result as Record<string,unknown>,counts=["updated","checked","segmentCount","sessionCount","resumeMergedCount","rejectedSuppressed","duplicatePending","shortSuppressed","holidaySuppressed","ambiguous","obsoletePending"];
  if(Object.keys(body).sort().join(",")!==[...counts,"details"].sort().join(",") || counts.some(key=>!Number.isSafeInteger(body[key]) || Number(body[key])<0) || !Array.isArray(body.details)) return null;
  if(value.notAdmitted!==undefined) {
    const proof=value.notAdmitted as Record<string,unknown>;
    if(!proof || typeof proof!=="object" || Array.isArray(proof) || Object.keys(proof).sort().join(",")!=="scanItemId,status" || typeof proof.scanItemId!=="string" || !proof.scanItemId || !["failed","throttled"].includes(String(proof.status)) || value.status!=="failed" || counts.some(key=>body[key]!==0) || body.details.length!==0) return null;
  }
  const fields=new Set(["memberUid","memberName","scheduleId","scheduleDate","action","title","previousStatus","vodId","candidateKind","matchReason","matchConfidence","sessionStartedAt","sessionEndedAt","segmentCount"]);
  for(const detail of body.details) {
    if(!detail || typeof detail!=="object" || Array.isArray(detail) || Object.keys(detail).some(key=>!fields.has(key)) || !Number.isSafeInteger(detail.memberUid) || detail.memberUid<1 || !(detail.scheduleId===null || Number.isSafeInteger(detail.scheduleId)&&detail.scheduleId>0) || typeof detail.memberName!=="string" || typeof detail.action!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(detail.scheduleDate) || !(detail.previousStatus===null || typeof detail.previousStatus==="string")) return null;
    for(const [key,entry] of Object.entries(detail)) {
      if(["memberUid","scheduleId"].includes(key)) continue;
      if(key==="segmentCount"? !Number.isSafeInteger(entry)||Number(entry)<0:entry!==null && typeof entry!=="string") return null;
    }
  }
  return raw as ChzzkChildResult;
}
