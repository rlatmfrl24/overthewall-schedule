import {selectedFileRowSql} from "./file-reference-integrity";
import {resolvedFilePathSql,originMatchesPlanSql} from "./file-reference-index";

/** Exact source inputs. This is a bounded selected-row snapshot, not ownership. */
export function inventoryReferencesSql(plan="t.plan_json") {
  const selected=["notices","member_profile_images","naver_cafe_posts"].map(table=>`(raw.row_table='${table}' AND EXISTS(SELECT 1 FROM ${table} owner WHERE owner.id=raw.row_id AND ${selectedFileRowSql(table,"owner",plan,"json_extract("+plan+",'$.sourceSite')")}))`).join(" OR ");
  return `WITH refs AS MATERIALIZED(SELECT raw.*,f.path,f.origin FROM asset_file_reference_inputs raw LEFT JOIN asset_file_reference_paths f ON f.row_table=raw.row_table AND f.row_key=raw.row_key AND f.field=raw.field AND f.raw_url=raw.raw_url WHERE ${selected}),
    paths AS MATERIALIZED(SELECT *,${resolvedFilePathSql("refs",plan)} resolved_path,${originMatchesPlanSql("refs",plan)} own_origin FROM refs)
    SELECT json_array(row_table,row_key,field) identity,json_object('table',row_table,'key',row_key,'field',field,'rawUrl',raw_url,'logicalKey',iif(own_origin AND resolved_path LIKE '/r2-assets/%',substr(resolved_path,12),NULL)) value_json FROM paths
    UNION ALL SELECT json_array('members',json_array(m.uid),'code'),json_object('table','members','key',json_array(m.uid),'field','code','rawUrl',m.code,'logicalKey',NULL) FROM members m JOIN json_each(${plan},'$.members') a ON m.uid=json_extract(a.value,'$.uid') AND m.code=json_extract(a.value,'$.code')
    UNION ALL SELECT json_array('asset_file_references',json_array(r.logical_key),'version'),json_object('table','asset_file_references','key',json_array(r.logical_key),'field','version','rawUrl',json_object('versionKey',r.version_key,'hash',r.hash,'size',r.size),'logicalKey',r.logical_key) FROM asset_file_references r WHERE EXISTS(SELECT 1 FROM paths WHERE own_origin AND resolved_path='/r2-assets/'||r.logical_key) OR EXISTS(SELECT 1 FROM json_each(${plan},'$.members') a WHERE r.logical_key LIKE 'members/'||json_extract(a.value,'$.code')||'/backgrounds/%')`;
}

export function inventoryReferencesMatchSql(inventory="i",transition="t") {
  return `(WITH current_refs AS MATERIALIZED(${inventoryReferencesSql(`${transition}.plan_json`)}),stored_refs AS MATERIALIZED(SELECT identity,value_json FROM content_transition_file_inventory_rows WHERE transition_id=${inventory}.transition_id AND inventory_id=${inventory}.inventory_id AND kind='reference')
    SELECT NOT EXISTS(SELECT * FROM current_refs EXCEPT SELECT * FROM stored_refs) AND NOT EXISTS(SELECT * FROM stored_refs EXCEPT SELECT * FROM current_refs))`;
}

export function inventorySealValidSql(inventoryId:string) {
  return `EXISTS(SELECT 1 FROM content_transition_file_inventories i WHERE i.transition_id=t.id AND i.inventory_id=${inventoryId} AND i.state='observed' AND i.plan_json=t.plan_json AND i.manifest_revision=t.manifest_revision AND i.coverage_json=(SELECT json_group_array(prefix) FROM (SELECT 'members/'||json_extract(m.value,'$.code')||'/backgrounds/' prefix FROM json_each(i.plan_json,'$.members') m ORDER BY prefix)) AND json_array_length(i.coverage_json)=3 AND i.expected_rows=(SELECT count(*) FROM content_transition_file_inventory_rows r WHERE r.transition_id=i.transition_id AND r.inventory_id=i.inventory_id) AND ${inventoryReferencesMatchSql()}
    AND NOT EXISTS(SELECT 1 FROM content_transition_file_inventory_rows r WHERE r.transition_id=i.transition_id AND r.inventory_id=i.inventory_id AND r.kind='reference' AND json_extract(r.value_json,'$.logicalKey') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM asset_file_references v WHERE v.logical_key=json_extract(r.value_json,'$.logicalKey')) AND NOT EXISTS(SELECT 1 FROM content_transition_file_inventory_rows o WHERE o.transition_id=i.transition_id AND o.inventory_id=i.inventory_id AND o.kind='object' AND o.identity=json_extract(r.value_json,'$.logicalKey')))
    AND NOT EXISTS(SELECT 1 FROM asset_file_cleanup c WHERE EXISTS(SELECT 1 FROM content_transition_file_inventory_rows r WHERE r.transition_id=i.transition_id AND r.inventory_id=i.inventory_id AND r.kind='object' AND r.identity=c.object_key)))`;
}

export function fileInventoryGuardStatements():string[] {
  return [
    `CREATE TRIGGER ct_file_inventory_identity BEFORE UPDATE ON content_transition_file_inventories WHEN OLD.transition_id IS NOT NEW.transition_id OR OLD.inventory_id IS NOT NEW.inventory_id OR OLD.plan_json IS NOT NEW.plan_json OR OLD.manifest_revision IS NOT NEW.manifest_revision OR (OLD.state<>'armed' AND (OLD.coverage_json IS NOT NEW.coverage_json OR OLD.expected_rows IS NOT NEW.expected_rows OR OLD.expected_digest IS NOT NEW.expected_digest)) OR (OLD.source_boundary IS NOT NULL AND OLD.source_boundary IS NOT NEW.source_boundary) BEGIN SELECT RAISE(ABORT,'file_inventory_immutable_identity'); END`,
    `CREATE TRIGGER ct_file_inventory_row_insert BEFORE INSERT ON content_transition_file_inventory_rows WHEN NOT EXISTS(SELECT 1 FROM content_transition_file_inventories i WHERE i.transition_id=NEW.transition_id AND i.inventory_id=NEW.inventory_id AND i.state IN ('armed','receiving')) BEGIN SELECT RAISE(ABORT,'file_inventory_sealed_rows'); END`,
    `CREATE TRIGGER ct_file_inventory_row_update BEFORE UPDATE ON content_transition_file_inventory_rows BEGIN SELECT RAISE(ABORT,'file_inventory_immutable_row'); END`,
    `CREATE TRIGGER ct_file_inventory_row_delete BEFORE DELETE ON content_transition_file_inventory_rows WHEN EXISTS(SELECT 1 FROM content_transition_file_inventories i WHERE i.transition_id=OLD.transition_id AND i.inventory_id=OLD.inventory_id) BEGIN SELECT RAISE(ABORT,'file_inventory_immutable_row'); END`,
  ];
}
