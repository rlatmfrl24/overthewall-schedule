import {currentRowFileIndexSql} from "./file-reference-index";
import { contentDispositionRegistry } from "../domain/disposition-registry";
import { contentJsonReferences } from "../domain/content-references";
import {jsonReferencePaths,jsonReferenceQuery} from "../domain/json-reference-paths";

// Directed content dependencies. A shared song/entity/channel never owns all of
// its performances. Reverse traversal below locates affected roots, not imports.
export type ContentTable = keyof typeof contentDispositionRegistry;
export interface CaptureEdge { from: ContentTable; to: ContentTable; join: string }
const edge = (from: ContentTable, to: ContentTable, join: string): CaptureEdge => ({ from, to, join });
export const capturedTables = (Object.keys(contentDispositionRegistry) as ContentTable[])
  .filter(table => !["source_only", "rebuild"].includes(contentDispositionRegistry[table].destination));
export const captureEdges: CaptureEdge[] = capturedTables.flatMap(table =>
  contentDispositionRegistry[table].foreignKeys.flatMap(fk => capturedTables.includes(fk.table as ContentTable)
    ? [edge(table, fk.table as ContentTable, fk.columns.map((column, i) => `a."${column}"=b."${fk.target[i]}"`).join(" AND "))] : []),
);
const owned = (parent: ContentTable, child: ContentTable, parentColumn: string, childColumn: string) =>
  captureEdges.push(edge(parent, child, `a."${parentColumn}"=b."${childColumn}"`));
for (const child of ["member_links", "member_profile_images"] as const) owned("members", child, "uid", "member_uid");
for (const child of ["music_performance_participants", "music_performance_sources", "music_performance_tags"] as const) owned("music_performances", child, "id", "performance_id");
for (const child of ["music_song_aliases", "music_song_original_artists", "music_song_tags"] as const) owned("music_songs", child, "id", "song_id");
owned("music_entities", "music_entity_aliases", "id", "entity_id");
owned("music_channels", "music_channel_entities", "id", "channel_id");
for (const child of ["music_cover_proposal_original_artists", "music_cover_proposal_participants"] as const) owned("music_cover_proposals", child, "id", "proposal_id");
owned("music_media_sources", "music_media_source_relations", "id", "source_id");
owned("music_ingestion_candidates", "music_ingestion_candidate_origins", "id", "candidate_id");
owned("music_ingestion_candidates", "music_channel_upload_candidate_origins", "id", "candidate_id");
owned("music_ingestion_candidates", "music_ingestion_events", "id", "candidate_id");
owned("music_ingestion_candidates", "music_ai_reviews", "id", "candidate_id");
owned("music_ingestion_candidates", "music_ai_review_batch_items", "id", "candidate_id");
owned("music_ingestion_candidates", "music_playlist_work_items", "id", "candidate_id");
owned("music_ai_reviews", "music_ai_review_attempts", "id", "review_id");
owned("music_ai_reviews", "music_ai_review_requests", "id", "review_id");
owned("music_channel_upload_monitors", "music_channel_automation_approvals", "channel_id", "channel_id");
owned("x_posts", "x_post_references", "id", "source_post_id");
owned("x_posts", "x_post_facts", "id", "post_id");
owned("x_posts", "x_post_sources", "handle", "handle");
owned("x_post_references", "x_posts", "referenced_post_id", "id");
owned("update_logs", "schedules", "schedule_id", "id");
owned("pending_schedules", "schedules", "existing_schedule_id", "id");
owned("schedule_candidate_rejections", "schedules", "existing_schedule_id", "id");
// No schema FK exists for these historical materialization identities.
owned("music_playlist_work_batches", "music_ingestion_jobs", "job_id", "id");
owned("music_playlist_work_batches", "music_ai_review_batches", "ai_batch_id", "id");
owned("music_ai_review_batch_items", "music_ai_reviews", "review_id", "id");
captureEdges.push(edge("music_catalog_events", "music_performances", "a.aggregate_type='performance' AND a.aggregate_id=b.id"));
captureEdges.push(edge("music_catalog_events", "music_songs", "a.aggregate_type='song' AND a.aggregate_id=b.id"));
captureEdges.push(edge("music_performances", "music_catalog_events", "b.aggregate_type='performance' AND b.aggregate_id=a.id"));
captureEdges.push(edge("music_songs", "music_catalog_events", "b.aggregate_type='song' AND b.aggregate_id=a.id"));
captureEdges.push(edge("music_ingestion_candidates","music_catalog_events","b.aggregate_type='review_candidate' AND b.aggregate_id=a.id"));
captureEdges.push(edge("music_cover_proposals","music_catalog_events","b.aggregate_type='review_proposal' AND b.aggregate_id=a.id"));
captureEdges.push(edge("music_ingestion_jobs","music_ingestion_events","b.job_id=a.id AND b.candidate_id IS NULL"));
for(const [type,table] of [["entity","music_entities"],["channel","music_channels"]] as const) {
  captureEdges.push(edge(table,"music_catalog_events",`b.aggregate_type='${type}' AND b.aggregate_id=a.id`));
  captureEdges.push(edge("music_catalog_events",table,`a.aggregate_type='${type}' AND a.aggregate_id=b.id`));
}
owned("music_default_playlist_settings","music_performances","representative_performance_id","id");
owned("music_ingestion_candidates","music_channels","channel_id","external_channel_id");
for(const column of ["post_id","edit_root_post_id","superseded_by_post_id"]) owned("x_post_facts","x_posts",column,"id");
for(const table of ["pending_schedules","schedule_candidate_rejections"] as const) captureEdges.push(edge(table,"schedules","b.id IN (SELECT value FROM json_each(COALESCE(a.ranked_schedule_ids,'[]')))"));
for(const reference of contentJsonReferences) {
  const lookups=reference.columns.flatMap(column=>jsonReferencePaths((contentDispositionRegistry[reference.table].json as Record<string,string>)[column],reference.keys).map(path=>`b.id IN (SELECT value FROM (${jsonReferenceQuery(`a."${column}"`,path)}) WHERE type='text')`));
  captureEdges.push(edge(reference.table,reference.target,`(${lookups.join(" OR ")})`));
}
// Subject/member arrays are numeric roster references, including historical
// credits. Capture their exact source image before externalizing on target.
for(const table of capturedTables) {
  const lookups=Object.entries(contentDispositionRegistry[table].json).flatMap(([column,format])=>jsonReferencePaths(format,["memberUid"]).map(path=>`b.uid IN (SELECT value FROM (${jsonReferenceQuery(`a."${column}"`,path)}) WHERE type='integer')`));
  if(lookups.length) captureEdges.push(edge(table,"members",`(${lookups.join(" OR ")})`));
}
owned("members","music_entities","uid","member_uid");
captureEdges.push(edge("members","asset_file_references","b.logical_key LIKE 'members/'||a.code||'/backgrounds/%' OR b.logical_key='profile/'||a.code||'.webp' OR b.logical_key='profile/signatures/'||a.code||'.png'"));
const fileReferenceEdge=(table:string,alias:string,key:string,transition="t.id")=>`EXISTS(WITH f AS MATERIALIZED(SELECT * FROM content_transition_file_paths WHERE transition_id=${transition} AND row_table='${table}' AND row_key=json_array(${alias}.id)) SELECT 1 FROM f WHERE (${currentRowFileIndexSql("f",table,alias)}) AND f.path IN ('/r2-assets/'||${key},'/'||${key}))`;
for(const table of ["member_profile_images","notices","naver_cafe_posts"] as const) captureEdges.push(edge(table,"asset_file_references",fileReferenceEdge(table,"a","b.logical_key","c.transition_id")));

export const keySql = (table: ContentTable, alias: string) => `json_array(${contentDispositionRegistry[table].primaryKey.map(key => `${alias}."${key}"`).join(",")})`;
export const matchKey = (table: ContentTable, alias: string, expression: string) => contentDispositionRegistry[table].primaryKey
  .map((key, i) => `${alias}."${key}"=json_extract(${expression},'$[${i}]')`).join(" AND ");
const selectedUid = (expression: string) => `${expression} IN (SELECT iif(t.local_site=t.source_site,json_extract(value,'$.uid'),json_extract(value,'$.targetUid')) FROM json_each(t.plan_json,'$.members'))`;
const selectedChannel = (expression: string) => `EXISTS(SELECT 1 FROM music_channel_entities ce JOIN music_entities e ON e.id=ce.entity_id WHERE ce.channel_id=${expression} AND ${selectedUid("e.member_uid")}) OR EXISTS(SELECT 1 FROM music_channels ch JOIN members m ON m.youtube_channel_id=ch.external_channel_id WHERE ch.id=${expression} AND ${selectedUid("m.uid")}) OR EXISTS(SELECT 1 FROM music_channels ch JOIN member_links ml ON ml.youtube_channel_id=ch.external_channel_id WHERE ch.id=${expression} AND ${selectedUid("ml.member_uid")})`;
const selectedPerformance = (expression: string) => `EXISTS(SELECT 1 FROM music_performance_participants p JOIN music_entities e ON e.id=p.entity_id WHERE p.performance_id=${expression} AND ${selectedUid("e.member_uid")})`;
const selectedHandle = (expression:string) => {
  const url="lower(trim(m.url_twitter))";
  const normalized=`iif(instr(${url},'://')>0,substr(${url},instr(${url},'://')+3),${url})`;
  // Match the existing X handle contract's direct/@ and accepted host forms,
  // including URL path/query suffixes; do not match a longer handle prefix.
  return `EXISTS(SELECT 1 FROM members m WHERE ${selectedUid("m.uid")} AND (${url}=lower(${expression}) OR ${url}='@'||lower(${expression}) OR EXISTS(SELECT 1 FROM json_each('["x.com","www.x.com","twitter.com","www.twitter.com"]') host WHERE substr(${normalized},1,length(host.value)+1+length(${expression}))=host.value||'/'||lower(${expression}) AND substr(${normalized},length(host.value)+length(${expression})+2,1) IN ('','/','?','#'))))`;
};
// Ambiguous/global rows only enter through a persisted, reviewed classification.
// The manifest validator must reject unresolved rows, including unknown JSON.
export const rootPredicates: Partial<Record<ContentTable, string>> = {
  asset_file_references: `EXISTS(SELECT 1 FROM members m WHERE ${selectedUid("m.uid")} AND (a.logical_key LIKE 'members/'||m.code||'/backgrounds/%' OR a.logical_key='profile/'||m.code||'.webp' OR a.logical_key='profile/signatures/'||m.code||'.png' OR EXISTS(SELECT 1 FROM member_profile_images image WHERE image.member_uid=m.uid AND ${fileReferenceEdge("member_profile_images","image","a.logical_key")}))) OR EXISTS(SELECT 1 FROM notices n WHERE ${fileReferenceEdge("notices","n","a.logical_key")} AND (${selectedUid("n.publisher_member_uid")} OR EXISTS(SELECT 1 FROM json_each(n.related_member_uids) member WHERE ${selectedUid("member.value")}))) OR EXISTS(SELECT 1 FROM naver_cafe_posts p WHERE ${fileReferenceEdge("naver_cafe_posts","p","a.logical_key")} AND ${selectedUid("p.member_uid")})`,
  members: selectedUid("a.uid"),
  schedules: selectedUid("a.member_uid"), pending_schedules: selectedUid("a.member_uid"),
  schedule_broadcast_observations: selectedUid("a.member_uid"), schedule_candidate_rejections: selectedUid("a.member_uid"),
  schedule_day_assessments: selectedUid("a.member_uid"), update_logs: selectedUid("a.member_uid"),
  naver_cafe_sources: selectedUid("a.member_uid"), naver_cafe_posts: selectedUid("a.member_uid"),
  youtube_feed_sources: selectedUid("a.member_uid"),
  youtube_feed_videos: `EXISTS(SELECT 1 FROM youtube_feed_sources s WHERE s.id=a.source_id AND ${selectedUid("s.member_uid")})`,
  music_performances: selectedPerformance("a.id"),
  music_cover_proposals: `EXISTS(SELECT 1 FROM music_cover_proposal_participants p LEFT JOIN music_entities e ON e.id=p.resolved_entity_id WHERE p.proposal_id=a.id AND (${selectedUid("p.submitted_member_uid")} OR ${selectedUid("e.member_uid")}))`,
  music_channels: selectedChannel("a.id"),
  music_channel_upload_monitors: selectedChannel("a.channel_id"),
  music_ingestion_candidates: `(${selectedPerformance("a.linked_performance_id")}) OR EXISTS(SELECT 1 FROM music_channels ch WHERE ch.external_channel_id=a.channel_id AND (${selectedChannel("ch.id")})) OR EXISTS(SELECT 1 FROM json_tree(COALESCE(a.review_input_json,'null')) j WHERE j.key='memberUid' AND ${selectedUid("j.value")})`,
  notices: `${selectedUid("a.publisher_member_uid")} OR EXISTS(SELECT 1 FROM json_each(a.related_member_uids) j WHERE ${selectedUid("j.value")})`,
  x_post_facts: selectedUid("a.member_uid"),
  x_posts: `${selectedHandle("a.handle")} OR EXISTS(SELECT 1 FROM x_post_facts f WHERE f.post_id=a.id AND ${selectedUid("f.member_uid")})`,
  x_post_sources:selectedHandle("a.handle"),
};

// Ownership is deliberately smaller than capture closure. Shared song/entity/
// channel/source metadata stays editable by legitimate remaining OTW content;
// after the fence LuvDia owns its independent materialized copy.
export const ownershipParents: Partial<Record<ContentTable,{table:ContentTable;column:string}>> = {
  member_links:{table:"members",column:"member_uid"},member_profile_images:{table:"members",column:"member_uid"},
  music_performance_participants:{table:"music_performances",column:"performance_id"},
  music_performance_sources:{table:"music_performances",column:"performance_id"},music_performance_tags:{table:"music_performances",column:"performance_id"},
  music_cover_proposal_participants:{table:"music_cover_proposals",column:"proposal_id"},music_cover_proposal_original_artists:{table:"music_cover_proposals",column:"proposal_id"},
  music_ingestion_candidate_origins:{table:"music_ingestion_candidates",column:"candidate_id"},
  music_channel_upload_candidate_origins:{table:"music_ingestion_candidates",column:"candidate_id"},
  music_ingestion_events:{table:"music_ingestion_candidates",column:"candidate_id"},
  music_ai_reviews:{table:"music_ingestion_candidates",column:"candidate_id"},
  music_ai_review_batch_items:{table:"music_ingestion_candidates",column:"candidate_id"},
  music_playlist_work_items:{table:"music_ingestion_candidates",column:"candidate_id"},
  x_post_references:{table:"x_posts",column:"source_post_id"},
};
export const ownedRootTables = capturedTables.filter(table=>(contentDispositionRegistry[table].excluded as readonly string[]).includes("content_access") || ["naver_cafe_sources","youtube_feed_sources","music_channel_upload_monitors","x_post_sources","update_logs","asset_file_references"].includes(table));

export const structuralColumns = (table: ContentTable): string[] => {
  const registry = contentDispositionRegistry[table];
  const columns = new Set<string>(registry.primaryKey);
  for (const fk of registry.foreignKeys) for (const column of fk.columns) columns.add(column);
  for(const reference of contentJsonReferences) if(reference.table===table) for(const column of reference.columns) columns.add(column);
  // These selectors/references do not have database FKs. Other values may use
  // the single-image path without walking every root sharing the row.
  for (const column of ["code","image_url","image_urls","thumbnail_url","member_uid", "submitted_member_uid", "resolved_entity_id", "publisher_member_uid", "related_member_uids", "review_input_json", "ranked_schedule_ids", "representative_performance_id", "url_twitter", "edit_root_post_id", "superseded_by_post_id", "channel_id", "youtube_channel_id", "external_channel_id", "handle", "post_id", "referenced_post_id", "performance_id", "candidate_id", "review_id", "job_id", "ai_batch_id", "aggregate_type", "aggregate_id", "existing_schedule_id", "schedule_id"]) {
    if ([...registry.values, ...registry.excluded, ...Object.keys(registry.json)].includes(column as never)) columns.add(column);
  }
  return [...columns];
};
