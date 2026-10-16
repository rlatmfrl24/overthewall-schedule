import type { OtwPlayAdminUpdateSongRequest, OtwPlayAdminCreateSongRequest } from "@contracts/otw-play";
import { contentDispositionRegistry } from "../domain/disposition-registry";

const columns = {
  song: contentDispositionRegistry.music_songs.values,
  aliases: contentDispositionRegistry.music_song_aliases.values,
  artists: contentDispositionRegistry.music_song_original_artists.values,
  tags: contentDispositionRegistry.music_song_tags.values,
  entities: contentDispositionRegistry.music_entities.values,
  members: ["uid", "code", "name", "is_deprecated", "content_access"],
} as const;

const rows = (table:string,fields:readonly string[],where:string,order:string) =>
  `(SELECT coalesce(json_group_array(json(value)),'[]') FROM (SELECT json_object(${fields.flatMap(field=>[`'${field}'`,`a."${field}"`]).join(",")}) value FROM ${table} a WHERE ${where} ORDER BY ${order}))`;

/** Exact rows read or replaced by the original updateSong transaction. Included
 * absent member-entity matches protect the inline-create phantom boundary. */
export function playSongState(input:OtwPlayAdminUpdateSongRequest) {
  const entities=input.originalArtists.flatMap(artist=>artist.subject.kind==="entity"?[artist.subject.entityId]:[]);
  const members=input.originalArtists.flatMap(artist=>artist.subject.kind==="member"?[artist.subject.memberUid]:[]);
  const sql=`(SELECT json_object(
    'song',json(${rows("music_songs",columns.song,"a.id=scope.id","a.id")}),
    'aliases',json(${rows("music_song_aliases",columns.aliases,"a.song_id=scope.id","a.normalized_alias,a.alias")}),
    'artists',json(${rows("music_song_original_artists",columns.artists,"a.song_id=scope.id","a.credit_order,a.entity_id")}),
    'tags',json(${rows("music_song_tags",columns.tags,"a.song_id=scope.id","a.tag_key")}),
    'entities',json(${rows("music_entities",columns.entities,"a.id IN (SELECT value FROM json_each(scope.entities)) OR a.member_uid IN (SELECT value FROM json_each(scope.members)) OR a.id IN (SELECT entity_id FROM music_song_original_artists WHERE song_id=scope.id)","a.id")}),
    'members',json(${rows("members",columns.members,"a.uid IN (SELECT value FROM json_each(scope.members))","a.uid")})
  ) FROM (SELECT ? id,? entities,? members) scope)`;
  return {sql,bindings:[input.id,JSON.stringify(entities),JSON.stringify(members)]};
}

export function playSongCreateState(id:string,input:OtwPlayAdminCreateSongRequest) {
  return playSongState({...input,id,expectedVersion:0,originalArtists:input.originalArtists.map(artist=>({subject:{kind:"entity",entityId:artist.entityId},creditOrder:artist.creditOrder,isPrimary:Boolean(artist.isPrimary)}))});
}

export function assertPlaySongState(value:unknown):asserts value is Record<keyof typeof columns,Record<string,string|number|null>[]> {
  if(!value || typeof value!=="object" || Array.isArray(value) || Object.keys(value).sort().join(",")!==Object.keys(columns).sort().join(",")) throw new Error("Invalid original song state");
  for(const [key,fields] of Object.entries(columns)) {
    const list=(value as Record<string,unknown>)[key];
    if(!Array.isArray(list) || list.some(row=>!row || typeof row!=="object" || Array.isArray(row) || Object.keys(row).sort().join(",")!==[...fields].sort().join(",") || Object.values(row).some(item=>item!==null && typeof item!=="string" && typeof item!=="number"))) throw new Error("Invalid original song state rows");
  }
}

/** Same public song result as readCatalog/readSong, captured in the owning
 * transaction so a retry cannot return a later editor's version as this save. */
export const playSongResultSql = `(SELECT json_object('catalogRevision',(SELECT revision FROM music_catalog_meta WHERE id=1),'data',json_object(
  'id',song.id,'slug',song.slug,'title',song.title,'normalizedTitle',song.normalized_title,
  'isOtwOriginal',json(iif(song.is_otw_original,'true','false')),
  'originalReleaseDate',song.original_release_date,'originalReleasePrecision',song.original_release_precision,
  'archivedAt',song.archived_at,'version',song.version,
  'tags',json((SELECT coalesce(json_group_array(display_name),'[]') FROM (SELECT display_name FROM music_song_tags WHERE song_id=song.id ORDER BY tag_key))),
  'aliases',json((SELECT coalesce(json_group_array(json(value)),'[]') FROM (SELECT json_object('alias',alias,'normalizedAlias',normalized_alias,'locale',locale,'aliasKind',alias_kind) value FROM music_song_aliases WHERE song_id=song.id ORDER BY normalized_alias))),
  'originalArtists',json((SELECT coalesce(json_group_array(json(value)),'[]') FROM (SELECT json_object('entityId',artist.entity_id,'displayName',entity.display_name,'creditOrder',artist.credit_order,'isPrimary',json(iif(artist.is_primary,'true','false'))) value FROM music_song_original_artists artist JOIN music_entities entity ON entity.id=artist.entity_id WHERE artist.song_id=song.id ORDER BY artist.credit_order,artist.entity_id)))
)) FROM music_songs song WHERE song.id=?)`;
