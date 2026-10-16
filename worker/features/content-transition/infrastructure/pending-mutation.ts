import type {PendingCommand} from "../../schedules/commands";
import { contentDispositionRegistry } from "../domain/disposition-registry";

const columns=(table:keyof typeof contentDispositionRegistry)=>[...contentDispositionRegistry[table].values,...Object.keys(contentDispositionRegistry[table].json),"content_access"];
export const pendingStateColumns={pending:columns("pending_schedules"),rejection:columns("schedule_candidate_rejections"),schedules:columns("schedules"),assessment:columns("schedule_day_assessments"),observations:columns("schedule_broadcast_observations"),member:["uid","code","url_chzzk","is_deprecated","content_access"]};
export function assertPendingState(value:unknown):asserts value is Record<keyof typeof pendingStateColumns,Array<Record<string,string|number|null>>> {
  if(!value || typeof value!=="object" || Array.isArray(value) || Object.keys(value).sort().join(",")!==Object.keys(pendingStateColumns).sort().join(",")) throw new Error("Invalid pending expected-state allowlist");
  for(const [key,fields] of Object.entries(pendingStateColumns)) {
    const rows=(value as Record<string,unknown>)[key];
    if(!Array.isArray(rows) || rows.some(row=>!row || typeof row!=="object" || Array.isArray(row) || Object.keys(row).sort().join(",")!==[...fields].sort().join(",") || Object.values(row).some(v=>v!==null && typeof v!=="string" && typeof v!=="number"))) throw new Error("Invalid pending expected-state row");
  }
}
const row=(fields:readonly string[],alias:string)=>{
  let result="'{}'";
  for(let i=0;i<fields.length;i+=15) result=`json_set(${result},${fields.slice(i,i+15).flatMap(field=>[`'$.${field}'`,`${alias}."${field}"`]).join(",")})`;
  return result;
};
export function pendingMutationState(command:PendingCommand,memberUid:number,date:string,holiday:boolean) {
  const queries:Array<[keyof typeof pendingStateColumns,string,string,unknown[]]>=[
    ["pending","pending_schedules",command.action==="reopen_rejection"?"0":"a.id=?",command.action==="reopen_rejection"?[]:[command.id]],
    ["rejection","schedule_candidate_rejections",command.action==="reopen_rejection"?"a.id=?":command.action==="reject"?"a.vod_id=(SELECT vod_id FROM pending_schedules WHERE id=?)":"0",["reopen_rejection","reject"].includes(command.action)?[command.id]:[]],
    ["schedules","schedules",["approve","apply_empty"].includes(command.action)?"a.member_uid=? AND a.date=?":"0",["approve","apply_empty"].includes(command.action)?[memberUid,date]:[]],
    ["assessment","schedule_day_assessments",holiday?"a.member_uid=? AND a.date=?":"0",holiday?[memberUid,date]:[]],
    ["observations","schedule_broadcast_observations",holiday?"a.member_uid=? AND EXISTS(SELECT 1 FROM schedule_day_assessments d WHERE d.member_uid=a.member_uid AND d.date=? AND a.started_at<d.range_end AND a.ended_at>d.range_start)":"0",holiday?[memberUid,date]:[]],
    ["member","members","a.uid=?",[memberUid]],
  ];
  return {sql:`json_object(${queries.flatMap(([key,table,where])=>[`'${key}'`,`json((SELECT json_group_array(json(value)) FROM (SELECT ${row(pendingStateColumns[key],"a")} value FROM ${table} a WHERE ${where} ORDER BY ${key==="observations"?"a.vod_id":key==="assessment"?"a.member_uid,a.date":key==="member"?"a.uid":"a.id"})))`]).join(",")})`,bindings:queries.flatMap(entry=>entry[3])};
}
