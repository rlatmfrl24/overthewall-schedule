import { AdminCatalogRepositoryError } from "../application/ports/admin-catalog-repository";
import { isPublicationCutoffSqlError } from '../../content-access';

/** Original owning catalog error mapping, also used for immutable failed receipts. */
export function catalogBatchError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if(isPublicationCutoffSqlError(message)) return new AdminCatalogRepositoryError('validation_failed','이관된 멤버의 신규 수집은 종료되었습니다.',{policy:'publication_cutoff'});
  if (/music_catalog_meta_singleton_check/i.test(message)) {
    return new AdminCatalogRepositoryError("stale_write", "Catalog command conflicted with a newer write");
  }
  if (/UNIQUE|constraint/i.test(message)) {
    return new AdminCatalogRepositoryError("validation_failed", "Catalog command violates an identity or relationship constraint");
  }
  return null;
}
