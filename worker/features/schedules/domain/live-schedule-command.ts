import {parseScheduleInput} from "./schedule-input";
export type LiveScheduleFillPlanBase={memberUid:number;memberName:string;scheduleDate:string;startTime:string;title:string};
export type LiveScheduleFillPlan=(LiveScheduleFillPlanBase & {action:"create";scheduleId:null;previousStatus:null})
  | (LiveScheduleFillPlanBase & {action:"update";scheduleId:number;previousStatus:string;previousStartTime:string|null;previousTitle:string|null});
export type LiveScheduleExpectedRow={id:number;member_uid:number;date:string;start_time:string|null;title:string|null;status:string;created_at:string|null};
export type LiveScheduleCommand={plan:LiveScheduleFillPlan;expectedRows:LiveScheduleExpectedRow[]};
export function parseLiveSchedulePlan(value:unknown):LiveScheduleFillPlan|null {
  if(!value || typeof value!=="object" || Array.isArray(value)) return null;
  const raw=value as Record<string,unknown>;
  const input=parseScheduleInput({id:raw.scheduleId,member_uid:raw.memberUid,date:raw.scheduleDate,start_time:raw.startTime,title:raw.title,status:"방송"},{requireId:raw.action==="update"});
  if(!input || typeof raw.memberUid!=="number" || typeof raw.memberName!=="string" || typeof raw.startTime!=="string" || typeof raw.title!=="string" || !["create","update"].includes(String(raw.action))) return null;
  const base={memberUid:input.memberUid,memberName:raw.memberName,scheduleDate:input.date,startTime:input.startTime!,title:input.title??""};
  if(raw.action==="create") return raw.scheduleId===null && raw.previousStatus===null?{...base,action:"create",scheduleId:null,previousStatus:null}:null;
  if(typeof raw.previousStatus!=="string" || !(raw.previousStartTime===null || typeof raw.previousStartTime==="string") || !(raw.previousTitle===null || typeof raw.previousTitle==="string")) return null;
  return {...base,action:"update",scheduleId:input.id!,previousStatus:raw.previousStatus,previousStartTime:raw.previousStartTime,previousTitle:raw.previousTitle};
}
