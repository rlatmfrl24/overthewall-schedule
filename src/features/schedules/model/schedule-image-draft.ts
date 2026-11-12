import type { ApplyScheduleImageGroup, ScheduleImageContext, ScheduleImageDraftRow } from "@contracts/schedule-image-import";
import { NON_BROADCAST_SCHEDULE_STATUSES } from "@contracts/schedules";
export type EditableImageRow = ScheduleImageDraftRow & { selected:boolean; choice:"keep"|"add"|`edit:${number}`|null };
export const imageGroupKey = (row:{memberUid:number|null;date:string|null}) => `${row.memberUid}:${row.date}`;
const isDate = (date:string|null) => Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date+"T00:00:00Z")) && new Date(date+"T00:00:00Z").toISOString().slice(0,10)===date);
const complete = (r:EditableImageRow) => r.memberUid !== null && isDate(r.date) && !r.needsWeekConfirmation && r.status !== null &&
  (r.status !== "방송" || r.timeState === "undecided" || r.timeState === "specified" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(r.startTime ?? ""));
export function inspectImageRows(rows:EditableImageRow[],contexts:Map<string,ScheduleImageContext>) {
  const duplicates=new Set<string>(),unresolved=new Set<string>(),seen=new Set<string>();
  for (const row of rows) {
    if (!complete(row)) {unresolved.add(row.clientId);continue;}
    const key=JSON.stringify([row.memberUid,row.date,row.status,row.startTime,row.title??""]);
    const existing=contexts.get(imageGroupKey(row))?.schedules.some(s=>s.status===row.status && s.start_time===row.startTime && (s.title??"")===(row.title??""));
    if(existing || seen.has(key)) duplicates.add(row.clientId);
    if(row.selected)seen.add(key);
  }
  return {duplicates,unresolved};
}
export function mapImageMember(rows:EditableImageRow[],id:string,memberUid:number|null) {
  const source=rows.find(r=>r.clientId===id)?.sourceMemberName;
  return rows.map(r=>r.clientId===id || Boolean(source) && r.sourceMemberName===source ? {...r,memberUid}:r);
}
export function confirmImageWeek(rows:EditableImageRow[],weekStart:string) {
  if(!isDate(weekStart))return rows;
  const monday=new Date(weekStart+"T00:00:00Z");monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7));
  return rows.map(r=>{
    if(!r.needsWeekConfirmation || r.weekday===null)return r;
    const date=new Date(monday);date.setUTCDate(date.getUTCDate()+r.weekday-1+r.dateShiftDays);
    return {...r,date:date.toISOString().slice(0,10),needsWeekConfirmation:false};
  });
}
export function buildImageGroups(rows:EditableImageRow[],contexts:Map<string,ScheduleImageContext>):ApplyScheduleImageGroup[] {
  const {duplicates,unresolved}=inspectImageRows(rows,contexts), groups=new Map<string,ApplyScheduleImageGroup>();
  for(const row of rows){
    if(!row.selected || duplicates.has(row.clientId) || unresolved.has(row.clientId))continue;
    const key=imageGroupKey(row), context=contexts.get(key);
    if(!context)throw new Error("기존 일정 비교를 먼저 완료해주세요.");
    const choice=row.choice ?? (context.schedules.length?"keep":"add");
    if(choice==="keep")continue;
    const id=choice.startsWith("edit:")?Number(choice.slice(5)):null;
    if(id!==null && !context.schedules.some(s=>s.id===id))throw new Error("수정할 기존 일정을 다시 선택해주세요.");
    let group=groups.get(key);
    if(!group){group={operationId:`${Date.now()}_${crypto.randomUUID()}`,memberUid:row.memberUid!,date:row.date!,expected:context.expected,changes:[],confirmedDeletedIds:[]};groups.set(key,group);}
    group.changes.push({clientId:row.clientId,id,startTime:row.status==="방송"?row.startTime:null,title:row.title,status:row.status!});
  }
  for(const [key,group] of groups){
    if(group.changes.length>1 && group.changes.some(c=>c.status!=="방송") || new Set(group.changes.filter(c=>c.id!==null).map(c=>c.id)).size!==group.changes.filter(c=>c.id!==null).length)throw new Error("같은 멤버·날짜 안의 충돌을 해결하거나 적용에서 제외해주세요.");
    group.confirmedDeletedIds=contexts.get(key)!.schedules.filter(s=>group.changes.some(c=>s.id!==c.id && (c.status!=="방송" || (NON_BROADCAST_SCHEDULE_STATUSES as readonly string[]).includes(s.status)))).map(s=>s.id).sort((a,b)=>a-b);
  }
  return [...groups.values()];
}
