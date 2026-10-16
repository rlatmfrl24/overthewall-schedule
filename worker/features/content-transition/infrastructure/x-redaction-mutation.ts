import {contentDispositionRegistry} from "../domain/disposition-registry";

const tables=["x_posts","x_post_facts","x_post_references","x_api_cache"] as const;
const columns=(table:typeof tables[number])=>[...contentDispositionRegistry[table].values,...Object.keys(contentDispositionRegistry[table].json),...(["x_posts","x_post_facts"].includes(table)?["content_access"]:[])];
export function assertXRedactionState(value:unknown) {
  if(!value || typeof value!=="object" || Array.isArray(value) || Object.keys(value).sort().join(",")!==[...tables].sort().join(",")) throw new Error("Invalid X redaction expected state");
  for(const table of tables) {
    const rows=(value as Record<string,unknown>)[table];
    if(!Array.isArray(rows) || rows.some(row=>!row || typeof row!=="object" || Array.isArray(row) || Object.keys(row).sort().join(",")!==columns(table).sort().join(",") || Object.values(row).some(item=>item!==null && typeof item!=="string" && typeof item!=="number"))) throw new Error("Invalid X redaction expected row");
  }
}
/** The original redaction affects the post, facts, embedded previews, references
 * and cache eviction. A deferred target command binds that complete set. */
export function xRedactionState(postId:string) {
  const queries:Array<[typeof tables[number],string,string[]]>=[
    ["x_posts","a.id=? OR json_extract(a.value,'$.reply.post.id')=? OR json_extract(a.value,'$.quote.post.id')=? OR EXISTS(SELECT 1 FROM json_each(a.value,'$.links') link WHERE json_extract(link.value,'$.linkedPost.id')=?)",[postId,postId,postId,postId]],
    ["x_post_facts","a.post_id=?",[postId]],
    ["x_post_references","a.referenced_post_id=?",[postId]],
    ["x_api_cache","a.type='posts' OR (a.type='linked_post' AND a.key='x:linked-post:v1:'||?)",[postId]],
  ];
  return {sql:`json_object(${queries.flatMap(([table,where])=>[`'${table}'`,`json((SELECT json_group_array(json(value)) FROM (SELECT json_object(${columns(table).flatMap(column=>[`'${column}'`,`a."${column}"`]).join(",")}) value FROM ${table} a WHERE ${where} ORDER BY ${contentDispositionRegistry[table].primaryKey.map(column=>`a."${column}"`).join(",")})))`]).join(",")})`,bindings:queries.flatMap(entry=>entry[2])};
}
