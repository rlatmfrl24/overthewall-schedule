import {contentDispositionRegistry} from "../domain/disposition-registry";
import {contentRowMovedSql} from "./content-retention";
import type {CollectorCommand} from "../../schedules/commands";
import { publicationHiddenSql } from "./publication-access";
import type { SiteId } from "@contracts/site-definition";

const tables=["members","schedules","pending_schedules","schedule_candidate_rejections","schedule_broadcast_observations","schedule_day_assessments"] as const;
const columns=(table:typeof tables[number])=>table==="members"?["uid","code","name","url_chzzk","is_deprecated","content_access"]:[...contentDispositionRegistry[table].values,...Object.keys(contentDispositionRegistry[table].json),"content_access"];
export const editableCollectorSql=(table:typeof tables[number],alias:string=table,siteId:SiteId="otw")=>`${alias}.content_access='normal' AND NOT (${contentRowMovedSql(table,alias)}) AND NOT (${publicationHiddenSql(table,alias,siteId)})`;
export function collectorState(siteId: SiteId = "otw") {
  const entries=tables.flatMap(table=>{
    const fields=columns(table);let row="'{}'";
    for(let n=0;n<fields.length;n+=15) row=`json_set(${row},${fields.slice(n,n+15).flatMap(field=>[`'$.${field}'`,`a."${field}"`]).join(",")})`;
    return [`'${table}'`,`json((SELECT json_group_array(json(value)) FROM (SELECT ${row} value FROM ${table} a WHERE ${editableCollectorSql(table,"a",siteId)} ORDER BY ${contentDispositionRegistry[table].primaryKey.map(key=>`a."${key}"`).join(",")})))`];
  });
  return `json_object(${entries.join(",")})`;
}
export function assertCollectorState(value:unknown) {
  if(!value || typeof value!=="object" || Array.isArray(value) || Object.keys(value).sort().join(",")!==[...tables].sort().join(",")) throw new Error("Invalid collector expected-state allowlist");
  for(const table of tables) {
    const rows=(value as Record<string,unknown>)[table];
    if(!Array.isArray(rows) || rows.some(row=>!row || typeof row!=="object" || Array.isArray(row) || Object.keys(row).sort().join(",")!==[...columns(table)].sort().join(",") || Object.values(row).some(field=>field!==null && typeof field!=="string" && typeof field!=="number"))) throw new Error("Invalid collector expected row");
  }
}
export const collectorMemberUid=(command:CollectorCommand)=>command.action==="insert_candidate"?Number(command.item.member_uid):command.action==="obsolete_candidate"?command.pending.member_uid:null;
