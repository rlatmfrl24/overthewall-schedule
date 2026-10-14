import {cacheShapes,shapes,subjectFields} from "../domain/projected-content";
import {contentDispositionRegistry} from "../domain/disposition-registry";
import {contentJsonReferences} from "../domain/content-references";
import {jsonReferencePaths,jsonReferenceQuery} from "../domain/json-reference-paths";

const literal=(value:string)=>`'${value.replaceAll("'","''")}'`;
const subjectPolicy=literal(JSON.stringify(subjectFields));
/** Compiles the exact parsed projector declarations, not a second shape list.
 * These read-only views gate handoff only. Business capture never calls them. */
export function sourceJsonValidationStatements():string[] {
  const columns=Object.entries(contentDispositionRegistry).filter(([,entry])=>Object.keys(entry.json).length).map(([table,entry])=>`WHEN '${table}' THEN ${literal(JSON.stringify(Object.entries(entry.json)))}`).join(" ");
  const shapeCase=Object.entries(shapes).map(([name,shape])=>`WHEN '${name}' THEN ${literal(JSON.stringify(shape))}`).join(" ");
  const cacheCase=Object.entries(cacheShapes).map(([name,types])=>`WHEN '${name}' THEN CASE json_extract(i.image_json,'$.type') ${Object.entries(types).map(([type,shape])=>`WHEN '${type}' THEN ${literal(JSON.stringify(shape))}`).join(" ")} ELSE 'null' END`).join(" ");
  const raw="json_extract(i.image_json,'$.'||json_extract(field.value,'$[0]'))";
  const allowedSubject=`json_extract(${subjectPolicy},'$.'||json_extract(n.value_json,'$.kind'))`;
  const childValue="CASE child.type WHEN 'text' THEN json_quote(child.value) WHEN 'true' THEN 'true' WHEN 'false' THEN 'false' ELSE coalesce(CAST(child.value AS TEXT),'null') END";
  const childShape=`CASE WHEN json_type(n.shape_json,'$.array') IS NOT NULL THEN json_quote(json_extract(n.shape_json,'$.array')) WHEN json_extract(n.shape_json,'$')='subject' THEN iif(EXISTS(SELECT 1 FROM json_each(${allowedSubject}) allowed WHERE allowed.value=child.key),'"scalar"','null') ELSE json_quote(json_extract(n.shape_json,'$.fields.'||child.key)) END`;
  const scalarValid="json_type(n.value_json) IN ('text','integer','real','true','false')";
  const subjectValid=`json_type(n.value_json)='object' AND ${allowedSubject} IS NOT NULL AND NOT EXISTS(SELECT 1 FROM json_each(${allowedSubject}) required WHERE json_type(n.value_json,'$.'||required.value) IS NULL) AND (json_extract(n.value_json,'$.kind')<>'member' OR (json_type(n.value_json,'$.memberUid')='integer' AND (n.commit_seq=0 AND EXISTS(SELECT 1 FROM members m WHERE m.uid=json_extract(n.value_json,'$.memberUid')) OR n.commit_seq>0 AND (SELECT j.after_json IS NOT NULL FROM content_transition_journal j WHERE j.transition_id=n.transition_id AND j.row_table='members' AND j.row_key=json_array(json_extract(n.value_json,'$.memberUid')) AND j.commit_seq<=n.commit_seq ORDER BY j.commit_seq DESC,j.seq DESC LIMIT 1)))) AND (json_extract(n.value_json,'$.kind')<>'entity' OR (json_type(n.value_json,'$.entityId')='text' AND length(json_extract(n.value_json,'$.entityId'))>0))`;
  const valid=`CASE WHEN n.valid_json=0 OR json_type(n.shape_json)='null' THEN 0 WHEN json_extract(n.shape_json,'$')='drop' OR json_type(n.value_json)='null' THEN 1 WHEN json_extract(n.shape_json,'$')='scalar' THEN ${scalarValid} WHEN json_extract(n.shape_json,'$')='subject' THEN ${subjectValid} WHEN json_type(n.shape_json,'$.array') IS NOT NULL THEN json_type(n.value_json)='array' WHEN json_type(n.shape_json,'$.fields')='object' THEN json_type(n.value_json)='object' ELSE 0 END`;
  // Current review input references are live dependencies. Historical snapshots
  // and events retain descriptive references even if the original was deleted.
  const references=contentJsonReferences.filter(reference=>reference.table==="music_ingestion_candidates").flatMap(reference=>reference.columns.flatMap(column=>jsonReferencePaths((contentDispositionRegistry[reference.table].json as Record<string,string>)[column],reference.keys).map(path=>`(r.row_table='${reference.table}' AND r.column_name='${column}' AND EXISTS(SELECT 1 FROM (${jsonReferenceQuery("r.value_json",path)}) ref WHERE ref.type<>'null' AND (ref.type<>'text' OR NOT (r.commit_seq=0 AND EXISTS(SELECT 1 FROM "${reference.target}" target WHERE target.id=ref.value) OR r.commit_seq>0 AND coalesce((SELECT j.after_json IS NOT NULL FROM content_transition_journal j WHERE j.transition_id=r.transition_id AND j.row_table='${reference.target}' AND j.row_key=json_array(ref.value) AND j.commit_seq<=r.commit_seq ORDER BY j.commit_seq DESC,j.seq DESC LIMIT 1),0)))))`))).join(" OR ")||"0";
  return [
    `CREATE VIEW content_transition_json_roots AS WITH images AS MATERIALIZED(SELECT * FROM content_transition_validation_images) SELECT i.transition_id,i.row_table,i.row_key,i.commit_seq,json_extract(field.value,'$[0]') column_name,CASE json_extract(field.value,'$[1]') ${shapeCase} ${cacheCase} ELSE 'null' END shape_json,iif(${raw} IS NULL OR json_valid(${raw}),coalesce(${raw},'null'),'null') value_json,iif(${raw} IS NULL,1,json_valid(${raw})) valid_json FROM images i CROSS JOIN json_each(CASE i.row_table ${columns} ELSE '[]' END) field`,
    `CREATE VIEW content_transition_invalid_json AS WITH RECURSIVE roots AS MATERIALIZED(SELECT * FROM content_transition_json_roots),nodes(transition_id,row_table,row_key,commit_seq,column_name,shape_json,value_json,valid_json) AS (
      SELECT transition_id,row_table,row_key,commit_seq,column_name,shape_json,value_json,valid_json FROM roots
      UNION ALL SELECT n.transition_id,n.row_table,n.row_key,n.commit_seq,n.column_name,${childShape},${childValue},1 FROM nodes n CROSS JOIN json_each(CASE WHEN json_extract(n.shape_json,'$')<>'drop' AND json_type(n.value_json) IN ('array','object') THEN n.value_json ELSE '[]' END) child
    ) SELECT DISTINCT n.transition_id,n.row_table,n.row_key,n.commit_seq,n.column_name,'unknown JSON shape/member reference' reason FROM nodes n WHERE NOT coalesce((${valid}),0) UNION SELECT r.transition_id,r.row_table,r.row_key,r.commit_seq,r.column_name,'missing committed content reference' FROM roots r WHERE ${references}`,
  ];
}
export const sourceJsonValidSql=(transitionId:string)=>`NOT EXISTS(SELECT 1 FROM content_transition_invalid_json invalid WHERE invalid.transition_id=${transitionId})`;
