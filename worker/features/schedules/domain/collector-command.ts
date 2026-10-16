import {isIsoDate} from "./schedule-input";
export type CollectorCommand =
  | {action:"insert_candidate";item:Record<string,string|number|null>;log:Record<string,string|number|null>;schedules:Array<{id:number;member_uid:number;date:string;start_time:string|null;title:string|null;status:string}>}
  | {action:"obsolete_candidate";pending:{id:number;member_uid:number;date:string;existing_schedule_id:number|null;vod_id:string|null;action_type:string;candidate_kind:string|null};memberName:string|null}
  | {action:"holiday_obsolete"|"holiday_create";now:number;target:{memberUid:number;date:string}|null};
const object=(v:unknown):v is Record<string,unknown>=>!!v && typeof v==="object" && !Array.isArray(v);
const nullableText=(v:unknown)=>v===null || typeof v==="string";
export const candidateFields=["member_uid","member_name","date","start_time","title","status","action_type","existing_schedule_id","previous_status","previous_title","previous_start_time","candidate_kind","match_reason","match_confidence","ranked_schedule_ids","source_vod_ids","session_started_at","session_ended_at","vod_segment_count","vod_id","vod_started_at","vod_duration_seconds","vod_thumbnail_url"] as const;
const numeric=new Set(["member_uid","existing_schedule_id","vod_segment_count","vod_duration_seconds"]);
const logFields=["schedule_id","member_uid","member_name","schedule_date","action","title","previous_status","vod_id","actor_name"];
export function parseCollectorCommand(raw:unknown):CollectorCommand|null {
  if(!object(raw)) return null;
  if(raw.action==="insert_candidate") {
    if(!object(raw.item) || !object(raw.log)) return null;
    const item:Record<string,string|number|null>={},log:Record<string,string|number|null>={};
    for(const field of candidateFields) {
      const value=raw.item[field]??(field==="vod_segment_count"?1:field==="status"?"방송":null);
      if(numeric.has(field)?value!==null && (!Number.isSafeInteger(value) || Number(value)<0):!nullableText(value)) return null;
      item[field]=value as string|number|null;
    }
    if(!Number.isSafeInteger(item.member_uid) || Number(item.member_uid)<1 || typeof item.member_name!=="string" || !isIsoDate(item.date) || !["create","update"].includes(String(item.action_type))) return null;
    for(const key of ["ranked_schedule_ids","source_vod_ids"]) if(item[key]!==null) {
      try {const array=JSON.parse(String(item[key]));if(!Array.isArray(array) || array.some(value=>key==="ranked_schedule_ids"?!Number.isSafeInteger(value)||value<1:typeof value!=="string")) return null;} catch {return null;}
    }
    for(const field of logFields) {
      const value=raw.log[field]??(field==="actor_name"?"system":null);
      if(["schedule_id","member_uid"].includes(field)?value!==null && (!Number.isSafeInteger(value)||Number(value)<1):!nullableText(value)) return null;
      log[field]=value as string|number|null;
    }
    if(log.member_uid!==item.member_uid || log.schedule_date!==item.date || !["auto_collected","auto_updated"].includes(String(log.action)) || log.actor_name!=="system") return null;
    if(!Array.isArray(raw.schedules)) return null;
    const schedules=[];
    for(const row of raw.schedules) {
      if(!object(row) || !Number.isSafeInteger(row.id) || Number(row.id)<1 || row.member_uid!==item.member_uid || row.date!==item.date || !nullableText(row.start_time) || !nullableText(row.title) || typeof row.status!=="string") return null;
      schedules.push({id:Number(row.id),member_uid:Number(row.member_uid),date:String(row.date),start_time:row.start_time as string|null,title:row.title as string|null,status:row.status});
    }
    return {action:raw.action,item,log,schedules};
  }
  if(raw.action==="obsolete_candidate") {
    const p=raw.pending;
    if(!object(p) || !Number.isSafeInteger(p.id) || Number(p.id)<1 || !Number.isSafeInteger(p.member_uid) || Number(p.member_uid)<1 || !isIsoDate(p.date) || !(p.existing_schedule_id===null || Number.isSafeInteger(p.existing_schedule_id)&&Number(p.existing_schedule_id)>0) || !nullableText(p.vod_id) || !nullableText(p.candidate_kind) || typeof p.action_type!=="string" || !nullableText(raw.memberName)) return null;
    return {action:raw.action,pending:{id:Number(p.id),member_uid:Number(p.member_uid),date:p.date,existing_schedule_id:p.existing_schedule_id as number|null,vod_id:p.vod_id as string|null,action_type:p.action_type,candidate_kind:p.candidate_kind as string|null},memberName:raw.memberName as string|null};
  }
  if(raw.action!=="holiday_obsolete" && raw.action!=="holiday_create") return null;
  if(!Number.isSafeInteger(raw.now) || Number(raw.now)<0 || !(raw.target===null || object(raw.target)&&Number.isSafeInteger(raw.target.memberUid)&&Number(raw.target.memberUid)>0&&isIsoDate(raw.target.date))) return null;
  return {action:raw.action,now:Number(raw.now),target:raw.target===null?null:{memberUid:Number((raw.target as Record<string,unknown>).memberUid),date:String((raw.target as Record<string,unknown>).date)}};
}
