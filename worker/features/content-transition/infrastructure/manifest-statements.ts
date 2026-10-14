import type { TransitionPlan } from "../../../../contracts/content-transition";
import { contentDispositionRegistry } from "../domain/disposition-registry";
import { keySql,rootPredicates,type ContentTable } from "./capture-graph";
import {sourceJsonValidSql} from "./source-json-validation";

export const classifiedTables=(Object.keys(contentDispositionRegistry) as ContentTable[]).filter(table=>contentDispositionRegistry[table].destination==="classification");
/** Fixed canonical SQL, evaluated against the transaction's current source rows.
 * It gates handoff progress only; ordinary source writes are never gated here. */
export function manifestResolvedSql(includeJson=true):string {
  const members=`NOT EXISTS(SELECT 1 FROM json_each(t.plan_json,'$.members') approved WHERE (SELECT count(*) FROM members m WHERE m.code=json_extract(approved.value,'$.code'))<>1 OR NOT EXISTS(SELECT 1 FROM members m WHERE m.code=json_extract(approved.value,'$.code') AND m.uid=json_extract(approved.value,'$.uid')))`;
  return [members,...(includeJson?[sourceJsonValidSql("t.id")]:[]),...classifiedTables.map(table=>`NOT EXISTS(SELECT 1 FROM "${table}" a WHERE NOT (${rootPredicates[table]??"0"})
    AND NOT EXISTS(SELECT 1 FROM json_each(t.plan_json,'$.classifications') d WHERE json_extract(d.value,'$.table')='${table}'
      AND json_extract(d.value,'$.key')=${keySql(table,"a")} AND json_extract(d.value,'$.disposition') IN ('include','exclude')
      AND length(trim(json_extract(d.value,'$.reason')))>0))`)].join(" AND ");
}
export function validateClassifications(plan:TransitionPlan):void {
  const keys=new Set<string>();
  for(const entry of plan.classifications) {
    if(!classifiedTables.includes(entry.table as ContentTable) || !["include","exclude"].includes(entry.disposition) || !entry.reason.trim()) throw new Error("Invalid manifest classification");
    const key=JSON.stringify([entry.table,entry.key]);
    if(keys.has(key)) throw new Error("Duplicate manifest classification");
    keys.add(key);
    const registry=contentDispositionRegistry[entry.table as ContentTable];
    const identity:unknown=JSON.parse(entry.key);
    if(!Array.isArray(identity) || identity.length!==registry.primaryKey.length || identity.some(value=>typeof value!=="string" && (typeof value!=="number" || !Number.isFinite(value)))) throw new Error("Invalid manifest row key");
    if(entry.table==="settings" && entry.disposition==="include") throw new Error("Unresolved settings manifest value policy");
  }
}
