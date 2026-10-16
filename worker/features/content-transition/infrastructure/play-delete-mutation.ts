import type {CatalogDeleteCommand} from "../../otw-play/commands";
import {contentDispositionRegistry as registry} from "../domain/disposition-registry";

type Table=keyof typeof registry;
const fields=(table:Table)=>[...registry[table].values];
const object=(entries:string[]):string=>entries.length<=32?`json_object(${entries.join(",")})`:`json_patch(json_object(${entries.slice(0,32).join(",")}),${object(entries.slice(32))})`;
const rows=(table:Table,columns:string[],where:string)=>`(SELECT coalesce(json_group_array(json(value)),'[]') FROM (SELECT ${object(columns.flatMap(column=>[`'${column}'`,`a."${column}"`]))} value FROM ${table} a WHERE ${where} ORDER BY ${registry[table].primaryKey.map(column=>`a."${column}"`).join(",")}))`;
function scope(command:CatalogDeleteCommand) {
  const performance=command.kind==="song"?"SELECT id FROM music_performances WHERE song_id=scope.id":"SELECT id FROM music_performances WHERE id=scope.id";
  const song=command.kind==="song"?"scope.id":"(SELECT song_id FROM music_performances WHERE id=scope.id)";
  const media=`SELECT source_id FROM music_performance_sources WHERE performance_id IN (${performance})`;
  const selected:Array<{table:Table;columns:string[];where:string}>=command.kind==="entity"?[
    {table:"music_entities",columns:fields("music_entities"),where:"a.id=scope.id"},
    {table:"music_entity_aliases",columns:fields("music_entity_aliases"),where:"a.entity_id=scope.id"},
    {table:"music_song_original_artists",columns:fields("music_song_original_artists"),where:"a.entity_id=scope.id"},
    {table:"music_performance_participants",columns:fields("music_performance_participants"),where:"a.entity_id=scope.id"},
    {table:"music_channel_entities",columns:fields("music_channel_entities"),where:"a.entity_id=scope.id"},
    {table:"music_cover_proposal_participants",columns:fields("music_cover_proposal_participants"),where:"a.resolved_entity_id=scope.id"},
    {table:"music_cover_proposal_original_artists",columns:fields("music_cover_proposal_original_artists"),where:"a.resolved_entity_id=scope.id"},
    // The original delete guard scans active review JSON for entity references.
    {table:"music_ingestion_candidates",columns:["id","status","review_input_json"],where:"a.status NOT IN ('converted','ignored') AND a.review_input_json IS NOT NULL AND EXISTS(SELECT 1 FROM json_tree(CASE WHEN json_valid(a.review_input_json) THEN a.review_input_json ELSE 'null' END) j WHERE j.key='entityId' AND j.type='text' AND j.atom=scope.id)"},
  ]:command.kind==="channel"?[
    {table:"music_channels",columns:fields("music_channels"),where:"a.id=scope.id"},
    {table:"music_channel_entities",columns:fields("music_channel_entities"),where:"a.channel_id=scope.id"},
    // Existing RESTRICT FKs; retain their identities without copying actors,
    // leases or unrelated operational state into the admitted command.
    {table:"music_media_sources",columns:["id","channel_id"],where:"a.channel_id=scope.id"},
    {table:"music_channel_upload_monitors",columns:["id","channel_id"],where:"a.channel_id=scope.id"},
    {table:"music_channel_automation_approvals",columns:["channel_id"],where:"a.channel_id=scope.id"},
  ]:[
    {table:"music_songs",columns:fields("music_songs"),where:`a.id=${song} OR a.merged_into_song_id=${song}`},
    {table:"music_song_aliases",columns:fields("music_song_aliases"),where:`a.song_id=${song}`},
    {table:"music_song_original_artists",columns:fields("music_song_original_artists"),where:`a.song_id=${song}`},
    {table:"music_song_tags",columns:fields("music_song_tags"),where:`a.song_id=${song}`},
    {table:"music_performances",columns:[...fields("music_performances"),"broadcast_metadata","content_access"],where:`a.id IN (${performance})`},
    {table:"music_performance_participants",columns:fields("music_performance_participants"),where:`a.performance_id IN (${performance})`},
    {table:"music_performance_tags",columns:fields("music_performance_tags"),where:`a.performance_id IN (${performance})`},
    {table:"music_performance_sources",columns:fields("music_performance_sources"),where:`a.performance_id IN (${performance}) OR a.source_id IN (${media})`},
    {table:"music_media_sources",columns:fields("music_media_sources"),where:`a.id IN (${media})`},
    {table:"music_media_source_relations",columns:fields("music_media_source_relations"),where:`a.source_id IN (${media}) OR a.related_source_id IN (${media})`},
    {table:"music_cover_proposals",columns:["id","status","suggested_song_id","approved_performance_id","approved_performance_snapshot_json","version"],where:`a.approved_performance_id IN (${performance})${command.kind==="song"?" OR a.suggested_song_id=scope.id":""}`},
    {table:"music_ingestion_candidates",columns:["id","status","linked_performance_id","version"],where:`a.linked_performance_id IN (${performance})`},
  ];
  return selected;
}
export const catalogDeleteTable={entity:"music_entities",song:"music_songs",performance:"music_performances",channel:"music_channels"} as const;
export function playDeleteState(command:CatalogDeleteCommand) {
  return {sql:`(SELECT ${object(scope(command).flatMap(item=>[`'${item.table}'`,`json(${rows(item.table,item.columns,item.where)})`]))} FROM (SELECT ? id) scope)`,bindings:[command.id]};
}
export function assertPlayDeleteState(value:unknown,command:CatalogDeleteCommand) {
  const expected=scope(command);
  if(!value || typeof value!=="object" || Array.isArray(value) || Object.keys(value).sort().join(",")!==expected.map(item=>item.table).sort().join(",")) throw new Error("Invalid original catalog deletion state");
  for(const item of expected) {
    const list=(value as Record<string,unknown>)[item.table];
    if(!Array.isArray(list) || list.some(row=>!row || typeof row!=="object" || Array.isArray(row) || Object.keys(row).sort().join(",")!==[...item.columns].sort().join(",") || Object.values(row).some(field=>field!==null && typeof field!=="string" && typeof field!=="number"))) throw new Error("Invalid original catalog deletion rows");
  }
}
