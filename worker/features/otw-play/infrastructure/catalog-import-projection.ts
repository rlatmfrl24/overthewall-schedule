import {decrementSelectedGramStats,selectedSongProjectionStatements} from "./d1-catalog-projection";

export type ImportedCatalogImage={table:string;value:Readonly<Record<string,unknown>>};
const catalogTables=new Set(["music_entities","music_entity_aliases","music_songs","music_song_aliases","music_song_original_artists","music_song_tags","music_channels","music_channel_entities","music_media_sources","music_performances","music_performance_sources","music_performance_participants","music_performance_tags","music_cover_proposals","music_cover_proposal_participants","music_cover_proposal_original_artists","music_cover_proposal_tags"]);
export const isImportedCatalogTable=(table:string)=>catalogTables.has(table);

/** Current target edges plus approved old/new images cover indirect changes and
 * removals. The relation is evaluated inside the original import transaction. */
export function importedCatalogProjection(database:D1Database,images:readonly ImportedCatalogImage[],now:number) {
  const json=JSON.stringify(images.filter(image=>isImportedCatalogTable(image.table)));
  const songs=`WITH image AS (SELECT json_extract(value,'$.table') tab,json_extract(value,'$.value') val FROM json_each(?)),
    entity(id) AS (SELECT json_extract(val,'$.id') FROM image WHERE tab='music_entities' UNION SELECT json_extract(val,'$.entity_id') FROM image WHERE tab='music_entity_aliases'),
    channel(id) AS (SELECT json_extract(val,'$.id') FROM image WHERE tab='music_channels' UNION SELECT json_extract(val,'$.channel_id') FROM image WHERE tab='music_channel_entities'),
    media(id) AS (SELECT json_extract(val,'$.id') FROM image WHERE tab='music_media_sources' UNION SELECT id FROM music_media_sources WHERE channel_id IN (SELECT id FROM channel)),
    performance(id) AS (
      SELECT json_extract(val,'$.id') FROM image WHERE tab='music_performances'
      UNION SELECT json_extract(val,'$.performance_id') FROM image WHERE tab IN ('music_performance_sources','music_performance_participants','music_performance_tags')
      UNION SELECT performance_id FROM music_performance_participants WHERE entity_id IN (SELECT id FROM entity)
      UNION SELECT performance_id FROM music_performance_sources WHERE source_id IN (SELECT id FROM media)),
    affected(id) AS (
      SELECT json_extract(val,'$.id') FROM image WHERE tab='music_songs'
      UNION SELECT json_extract(val,'$.song_id') FROM image WHERE tab IN ('music_song_aliases','music_song_original_artists','music_song_tags','music_performances')
      UNION SELECT song_id FROM music_song_original_artists WHERE entity_id IN (SELECT id FROM entity)
      UNION SELECT song_id FROM music_performances WHERE id IN (SELECT id FROM performance)
      UNION SELECT json_extract(val,'$.song_id') FROM image WHERE tab='music_performances' AND json_extract(val,'$.id') IN (SELECT id FROM performance))
    SELECT id FROM affected WHERE id IS NOT NULL`;
  return {
    before:[
      database.prepare("SELECT iif(EXISTS(SELECT 1 FROM music_catalog_meta c JOIN music_public_read_model_meta r ON r.id=c.id WHERE c.id=1 AND c.revision=r.revision),1,json('catalog_import_projection_stale'))"),
      ...decrementSelectedGramStats(database,songs,[json]),
      // Remove old grams before canonical FK cascades, retaining accurate counts.
      database.prepare(`DELETE FROM music_search_grams WHERE song_id IN (${songs})`).bind(json),
    ],
    after:[
      ...selectedSongProjectionStatements(database,songs,[json],{decrementExistingGrams:false}),
      database.prepare("UPDATE music_catalog_meta SET revision=revision+1,updated_at=? WHERE id=1").bind(now),
      database.prepare("UPDATE music_public_read_model_meta SET revision=(SELECT revision FROM music_catalog_meta WHERE id=1),updated_at=? WHERE id=1").bind(now),
    ],
  };
}

export const catalogImportProjection={isTable:isImportedCatalogTable,statements:importedCatalogProjection};
