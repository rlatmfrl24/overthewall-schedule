import type {ChannelMutation} from "../../otw-play/commands";
import {contentDispositionRegistry} from "../domain/disposition-registry";

const columns={channel:contentDispositionRegistry.music_channels.values,relations:contentDispositionRegistry.music_channel_entities.values,entities:["id"],sources:["id","channel_id"]} as const;
const rows=(table:string,fields:readonly string[],where:string,order:string)=>`(SELECT coalesce(json_group_array(json(value)),'[]') FROM (SELECT json_object(${fields.flatMap(field=>[`'${field}'`,`a."${field}"`]).join(",")}) value FROM ${table} a WHERE ${where} ORDER BY ${order}))`;
/** Generic dependency membership does not become exclusive source ownership. */
export function playChannelSourceScope(command:ChannelMutation) {
  return {sql:`(
    EXISTS(SELECT 1 FROM content_transition_membership m WHERE m.transition_id=t.id AND m.row_table='music_channels' AND m.row_key=json_array(?)
      AND (t.phase NOT IN ('source_fenced','target_owned','complete') OR (m.root_table=m.row_table AND m.root_key=m.row_key))) OR
    EXISTS(SELECT 1 FROM music_entities e JOIN json_each(t.plan_json,'$.members') approved ON json_extract(approved.value,'$.uid')=e.member_uid WHERE e.id IN (SELECT value FROM json_each(?))) OR
    EXISTS(SELECT 1 FROM members m JOIN json_each(t.plan_json,'$.members') approved ON json_extract(approved.value,'$.uid')=m.uid
      WHERE m.youtube_channel_id=? OR EXISTS(SELECT 1 FROM member_links l WHERE l.member_uid=m.uid AND l.youtube_channel_id=?))
  )`,bindings:[command.id,JSON.stringify(command.input.entityIds),command.input.externalChannelId,command.input.externalChannelId]};
}
export function playChannelState(command:ChannelMutation) {return playChannelStateFor(command.id,command.input.entityIds);}
export function playChannelStateFor(id:string|null,entityIds:readonly string[]) {
  return {sql:`(SELECT json_object(
    'channel',json(${rows("music_channels",columns.channel,"a.id=scope.id","a.id")}),
    'relations',json(${rows("music_channel_entities",columns.relations,"a.channel_id=scope.id","a.entity_id")}),
    'entities',json(${rows("music_entities",columns.entities,"a.id IN (SELECT value FROM json_each(scope.entities))","a.id")}),
    'sources',json(${rows("music_media_sources",columns.sources,"a.channel_id=scope.id","a.id")})
  ) FROM (SELECT ? id,? entities) scope)`,bindings:[id,JSON.stringify(entityIds)]};
}
export function assertPlayChannelState(value:unknown):void {
  if(!value || typeof value!=="object" || Array.isArray(value) || Object.keys(value).sort().join(",")!==Object.keys(columns).sort().join(",")) throw new Error("Invalid original channel state");
  for(const [key,fields] of Object.entries(columns)) {
    const list=(value as Record<string,unknown>)[key];
    if(!Array.isArray(list) || list.some(row=>!row || typeof row!=="object" || Array.isArray(row) || Object.keys(row).sort().join(",")!==[...fields].sort().join(",") || Object.values(row).some(item=>item!==null && typeof item!=="string" && typeof item!=="number"))) throw new Error("Invalid original channel state rows");
  }
}
export const playChannelResultSql=`(SELECT json_object('catalogRevision',(SELECT revision FROM music_catalog_meta WHERE id=1),'data',json_object(
  'id',id,'provider',provider,'externalChannelId',external_channel_id,'displayName',display_name,'channelRole',channel_role,'verificationStatus',verification_status,'active',json(iif(active,'true','false')),
  'entityIds',json((SELECT coalesce(json_group_array(entity_id),'[]') FROM (SELECT entity_id FROM music_channel_entities WHERE channel_id=c.id ORDER BY entity_id))),'version',version
)) FROM music_channels c WHERE id=?)`;
