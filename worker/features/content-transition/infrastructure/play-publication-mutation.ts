import {contentDispositionRegistry} from "../domain/disposition-registry";

const columns={performances:[...contentDispositionRegistry.music_performances.values,"broadcast_metadata","content_access"],participants:contentDispositionRegistry.music_performance_participants.values,
  tags:contentDispositionRegistry.music_performance_tags.values,sources:contentDispositionRegistry.music_performance_sources.values,
  media:contentDispositionRegistry.music_media_sources.values,channels:contentDispositionRegistry.music_channels.values,entities:contentDispositionRegistry.music_entities.values} as const;
const rows=(table:string,fields:readonly string[],where:string,order:string)=>`(SELECT coalesce(json_group_array(json(value)),'[]') FROM (SELECT json_object(${fields.flatMap(field=>[`'${field}'`,`a."${field}"`]).join(",")}) value FROM ${table} a WHERE ${where} ORDER BY ${order}))`;
export function playPublicationState(id:string) {
  const sql=`(SELECT json_object(
    'performances',json(${rows("music_performances",columns.performances,"a.id=scope.id","a.id")}),
    'participants',json(${rows("music_performance_participants",columns.participants,"a.performance_id=scope.id","a.credit_order,a.entity_id")}),
    'tags',json(${rows("music_performance_tags",columns.tags,"a.performance_id=scope.id","a.tag_key")}),
    'sources',json(${rows("music_performance_sources",columns.sources,"a.performance_id=scope.id","a.priority,a.source_id,a.start_seconds")}),
    'media',json(${rows("music_media_sources",columns.media,"a.id IN (SELECT source_id FROM music_performance_sources WHERE performance_id=scope.id)","a.id")}),
    'channels',json(${rows("music_channels",columns.channels,"a.id IN (SELECT source.channel_id FROM music_performance_sources link JOIN music_media_sources source ON source.id=link.source_id WHERE link.performance_id=scope.id)","a.id")}),
    'entities',json(${rows("music_entities",columns.entities,"a.id IN (SELECT entity_id FROM music_performance_participants WHERE performance_id=scope.id)","a.id")})
  ) FROM (SELECT ? id) scope)`;
  return {sql,bindings:[id]};
}
export function assertPlayPublicationState(value:unknown):void {
  if(!value || typeof value!=="object" || Array.isArray(value) || Object.keys(value).sort().join(",")!==Object.keys(columns).sort().join(",")) throw new Error("Invalid original publication state");
  for(const [key,fields] of Object.entries(columns)) {
    const list=(value as Record<string,unknown>)[key];
    if(!Array.isArray(list) || list.some(row=>!row || typeof row!=="object" || Array.isArray(row) || Object.keys(row).sort().join(",")!==[...fields].sort().join(",") || Object.values(row).some(item=>item!==null && typeof item!=="string" && typeof item!=="number"))) throw new Error("Invalid original publication state rows");
  }
}
export const playPublicationResultSql=`(SELECT json_object('catalogRevision',(SELECT revision FROM music_catalog_meta WHERE id=1),'data',json_object(
  'id',p.id,'songId',p.song_id,'relationType',p.relation_type,'releaseType',p.release_type,'participationType',p.participation_type,
  'contentAccess',p.content_access,'publicationStatus',p.publication_status,'qualityStatus',p.quality_status,'releasedAt',p.released_at,'internalNote',p.internal_note,'version',p.version,
  'broadcastJson',p.broadcast_metadata,
  'tags',json((SELECT coalesce(json_group_array(display_name),'[]') FROM (SELECT display_name FROM music_performance_tags WHERE performance_id=p.id ORDER BY tag_key))),
  'participants',json((SELECT coalesce(json_group_array(json(value)),'[]') FROM (SELECT json_object('entityId',r.entity_id,'displayName',e.display_name,'participantRole',r.participant_role,'creditOrder',r.credit_order,'creditNameSnapshot',r.credit_name_snapshot) value FROM music_performance_participants r JOIN music_entities e ON e.id=r.entity_id WHERE r.performance_id=p.id ORDER BY r.credit_order,r.entity_id))),
  'sources',json((SELECT coalesce(json_group_array(json(value)),'[]') FROM (SELECT json_object(
    'source',json_object('id',s.id,'provider',s.provider,'externalId',s.external_id,'channelId',s.channel_id,'title',s.title,'thumbnailUrl',s.thumbnail_url,'durationSeconds',s.duration_seconds,'providerPublishedAt',s.provider_published_at,'availabilityStatus',s.availability_status,'lastCheckedAt',s.last_checked_at,'nextCheckAt',s.next_check_at,'version',s.version),
    'startSeconds',r.start_seconds,'endSeconds',r.end_seconds,'sourceRole',r.source_role,'priority',r.priority,'isPrimary',json(iif(r.is_primary,'true','false'))
  ) value FROM music_performance_sources r JOIN music_media_sources s ON s.id=r.source_id WHERE r.performance_id=p.id ORDER BY r.priority,s.id)))
)) FROM music_performances p WHERE p.id=?)`;
