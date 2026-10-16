import type {CatalogImportProjection} from "./catalog-import-projection";
import {contentDispositionRegistry} from "../domain/disposition-registry";
import type {ProjectedRecord} from "../domain/projected-content";

const all=(parts:readonly string[]):string=>parts.length===1?parts[0]:`(${all(parts.slice(0,Math.floor(parts.length/2)))} AND ${all(parts.slice(Math.floor(parts.length/2)))})`;

/** Compare approved canonical values at the actual target boundary. The same
 * transaction rechecks the comparison before any mutation or import receipt. */
export async function importCatalogEffects(db:D1Database,changes:readonly {before:ProjectedRecord|null;after:ProjectedRecord|null}[],now:number,projection:CatalogImportProjection|null) {
  if(!projection && changes.some(change=>[change.before,change.after].some(record=>record?.destination==="content"&&record.table.startsWith("music_")))) throw new Error("Catalog import projection adapter required");
  const catalog=changes.filter(change=>[change.before,change.after].some(record=>record?.destination==="content"&&projection?.isTable(record.table)));
  if(!catalog.length) return {guard:[] as D1PreparedStatement[],before:[] as D1PreparedStatement[],after:[] as D1PreparedStatement[]};
  const groups=new Map<string,typeof catalog>();
  for(const change of catalog) {
    const record=change.after??change.before!,key=JSON.stringify([record.table,change.after?Object.keys(record.value):null]);
    groups.set(key,[...(groups.get(key)??[]),change]);
  }
  const predicates:string[]=[],bindings:string[]=[];
  for(const group of groups.values()) {
    const record=group[0].after??group[0].before!,registry=contentDispositionRegistry[record.table];
    const columns=Object.keys(record.value);
    const key=registry.primaryKey.map((column,index)=>`a."${column}" IS json_extract(json_extract(r.value,'$.key'),'$[${index}]')`).join(" AND ");
    const equal=all(columns.map(column=>`a."${column}" IS json_extract(r.value,'$.value.${column}')`));
    predicates.push(group[0].after?`EXISTS(SELECT 1 FROM json_each(?) r WHERE NOT EXISTS(SELECT 1 FROM "${record.table}" a WHERE ${key} AND ${equal}))`:`EXISTS(SELECT 1 FROM json_each(?) r JOIN "${record.table}" a ON ${key})`);
    bindings.push(JSON.stringify(group.map(change=>change.after??change.before)));
  }
  // Keep each bounded table shape independently guarded. Balanced field
  // comparisons avoid SQLite's depth100 limit for the wider projected rows.
  const comparisons=await db.batch<{changed:number}>(predicates.map((sql,index)=>db.prepare(`SELECT ${sql} changed`).bind(bindings[index])));
  const changed=comparisons.some(result=>Number(result.results[0].changed)===1);
  const guard=predicates.map((sql,index)=>db.prepare(`SELECT iif(${sql}=?,1,json('catalog_import_image_race'))`).bind(bindings[index],Number(comparisons[index].results[0].changed)));
  return {guard,...(changed?projection!.statements(db,catalog.flatMap(change=>[change.before,change.after].flatMap(record=>record?[{table:record.table,value:record.value}]:[])),now):{before:[],after:[]})};
}
