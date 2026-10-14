import type {BaselineFileInventoryHeader} from "@contracts/content-transition";

/** The original source seal travels with the immutable baseline header. */
export async function readFileInventoryHeader(db:D1Database,id:string,state:"sealed"|"target"):Promise<BaselineFileInventoryHeader|null> {
  const rows=(await db.prepare(`SELECT inventory_id,plan_json,manifest_revision,source_boundary,coverage_json,expected_rows,expected_digest FROM content_transition_file_inventories WHERE transition_id=? AND ${state==="sealed"?"state='sealed'":"state IN ('receiving','received')"}`).bind(id).all<{inventory_id:string;plan_json:string;manifest_revision:number;source_boundary:number;coverage_json:string;expected_rows:number;expected_digest:string}>()).results;
  if(rows.length>1) throw new Error("Conflicting original baseline inventory seals");
  const row=rows[0];
  return row?{inventoryId:row.inventory_id,plan:JSON.parse(row.plan_json),manifestRevision:row.manifest_revision,sourceBoundary:row.source_boundary,coverage:JSON.parse(row.coverage_json),rows:row.expected_rows,digest:row.expected_digest}:null;
}
