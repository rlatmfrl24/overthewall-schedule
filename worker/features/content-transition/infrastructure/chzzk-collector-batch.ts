import type {CollectorCommand} from "../../schedules/commands";

export function chzzkCollectorBatchKey(command:CollectorCommand) {
  return command.action==="insert_candidate"?`${command.action}:${command.item.vod_id??command.item.date+":"+command.item.start_time}`:
    command.action==="obsolete_candidate"?`${command.action}:${command.pending.id}`:command.action;
}
export const collectorPendingIdsSql="(SELECT json_group_array(id) FROM (SELECT id FROM pending_schedules ORDER BY id))";
export function assertChzzkBatchResults(command:CollectorCommand,raw:unknown) {
  const holiday=command.action==="holiday_create" || command.action==="holiday_obsolete",returned=command.action==="holiday_obsolete"?1:0;
  if(!Array.isArray(raw) || raw.length!==(holiday?3:2)) throw new Error("Invalid original child result count");
  for(const [index,entry] of raw.entries()) {
    if(!entry || typeof entry!=="object" || Array.isArray(entry) || Object.keys(entry).some(key=>!["results","affectedCount","conflicted"].includes(key)) || !Array.isArray(entry.results) || entry.conflicted!==undefined && entry.conflicted!==true || entry.affectedCount!==undefined && (command.action!=="holiday_obsolete" || !Number.isSafeInteger(entry.affectedCount) || entry.affectedCount<entry.results.length) || (index!==returned || entry.conflicted) && entry.results.length!==0 || entry.conflicted && entry.affectedCount!==undefined && entry.affectedCount!==0) throw new Error("Invalid original child returned rows");
    if(!holiday && entry.results.length>1) throw new Error("Invalid original child candidate row count");
    for(const value of entry.results) {
      if(!value || typeof value!=="object" || Array.isArray(value)) throw new Error("Invalid original child row");
      if(command.action==="holiday_create") {
        if(Object.keys(value).sort().join(",")!=="date,member_name,member_uid" || value.member_uid!==command.target?.memberUid || value.date!==command.target?.date || typeof value.member_name!=="string") throw new Error("Original holiday row outside child scope");
      } else if(Object.keys(value).join(",")!=="id" || !Number.isSafeInteger(value.id) || value.id<1 || command.action==="obsolete_candidate" && value.id!==command.pending.id) throw new Error("Invalid original candidate returned row");
    }
  }
}
/** Store only the original statements' observable returned rows. D1 metadata
 * is deliberately absent: trigger counters are not business result counts. */
export function collectorBatchResultSql(command:CollectorCommand) {
  const gone="json((SELECT json_group_array(json_object('id',old.value)) FROM json_each(before_json,'$.pendingIds') old WHERE NOT EXISTS(SELECT 1 FROM pending_schedules p WHERE p.id=old.value)))";
  const added=(holiday:boolean)=>`json((SELECT json_group_array(${holiday?"json_object('member_uid',p.member_uid,'member_name',p.member_name,'date',p.date)":"json_object('id',p.id)"}) FROM pending_schedules p WHERE NOT EXISTS(SELECT 1 FROM json_each(before_json,'$.pendingIds') old WHERE old.value=p.id)))`;
  const empty="json_object('results',json('[]'))";
  return command.action==="insert_candidate"?`json_array(json_object('results',${added(false)}),${empty})`:
    command.action==="obsolete_candidate"?`json_array(json_object('results',${gone}),${empty})`:
    command.action==="holiday_obsolete"?`json_array(${empty},json_object('results',${gone}),${empty})`:
    `json_array(json_object('results',${added(true)}),${empty},${empty})`;
}
