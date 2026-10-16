import {IngestionRepositoryError} from '../application/ports/ingestion-repository';

/** The original Ready-save SQLite error mapping also governs receipt retries. */
export function candidateReviewSqlError(error:unknown) {
  const message=error instanceof Error?error.message:String(error);
  if(/music_catalog_meta_singleton_check/iu.test(message)) return new IngestionRepositoryError('stale_message','Catalog or ingestion state changed during review saving');
  if(/music_entities.*(?:entity_kind|normalized_name)|uidx_music_entities_external_kind_normalized_name/iu.test(message)) return new IngestionRepositoryError('validation_failed','The external identity already exists; refresh the catalog and select it');
  if(/music_songs.*dedupe_key|uidx_music_songs_dedupe_key/iu.test(message)) return new IngestionRepositoryError('validation_failed','The song already exists; refresh the catalog and select it');
  return null;
}
