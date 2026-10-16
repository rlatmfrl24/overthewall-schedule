import type {EntityMutation} from "../../otw-play/commands";
import {contentDispositionRegistry} from "../domain/disposition-registry";

const columns={entities:contentDispositionRegistry.music_entities.values,aliases:contentDispositionRegistry.music_entity_aliases.values,
  artists:contentDispositionRegistry.music_song_original_artists.values,participants:contentDispositionRegistry.music_performance_participants.values,
  performances:["id","song_id"],members:["uid","code","name","is_deprecated","content_access"]} as const;
const rows=(table:string,fields:readonly string[],where:string,order:string)=>`(SELECT coalesce(json_group_array(json(value)),'[]') FROM (SELECT json_object(${fields.flatMap(field=>[`'${field}'`,`a."${field}"`]).join(",")}) value FROM ${table} a WHERE ${where} ORDER BY ${order}))`;

/** Includes the actual relation set used to build all song search projections,
 * plus absent member identity matches for the original create/update command. */
export function playEntityState(command:EntityMutation) {
  const sql=`(SELECT json_object(
    'entities',json(${rows("music_entities",columns.entities,"a.id=scope.id OR (scope.uid IS NOT NULL AND a.member_uid=scope.uid)","a.id")}),
    'aliases',json(${rows("music_entity_aliases",columns.aliases,"a.entity_id=scope.id","a.alias")}),
    'artists',json(${rows("music_song_original_artists",columns.artists,"a.entity_id=scope.id","a.song_id,a.entity_id")}),
    'participants',json(${rows("music_performance_participants",columns.participants,"a.entity_id=scope.id","a.performance_id,a.entity_id,a.participant_role")}),
    'performances',json(${rows("music_performances",columns.performances,"a.id IN (SELECT performance_id FROM music_performance_participants WHERE entity_id=scope.id)","a.id")}),
    'members',json(${rows("members",columns.members,"a.uid=scope.uid","a.uid")})
  ) FROM (SELECT ? id,? uid) scope)`;
  return {sql,bindings:[command.id,command.input.memberUid??null]};
}
export function assertPlayEntityState(value:unknown):void {
  if(!value || typeof value!=="object" || Array.isArray(value) || Object.keys(value).sort().join(",")!==Object.keys(columns).sort().join(",")) throw new Error("Invalid original entity state");
  for(const [key,fields] of Object.entries(columns)) {
    const list=(value as Record<string,unknown>)[key];
    if(!Array.isArray(list) || list.some(row=>!row || typeof row!=="object" || Array.isArray(row) || Object.keys(row).sort().join(",")!==[...fields].sort().join(",") || Object.values(row).some(item=>item!==null && typeof item!=="string" && typeof item!=="number"))) throw new Error("Invalid original entity state rows");
  }
}
export const playEntityResultSql=`(SELECT json_object('catalogRevision',(SELECT revision FROM music_catalog_meta WHERE id=1),'data',json_object(
  'id',id,'memberUid',member_uid,'entityKind',entity_kind,'displayName',display_name,'normalizedName',normalized_name,'slug',slug,'archivedAt',archived_at,'version',version
)) FROM music_entities WHERE id=?)`;
