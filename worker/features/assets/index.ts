export { createHandleR2Asset,createHandleProtectedAssetReference } from "./http/handler";
export {D1ProtectedAssetReferenceResolver} from "./infrastructure/d1-protected-asset-reference-resolver";
export { R2AssetReader } from "./infrastructure/r2-asset-reader";
export { D1AssetAccessReader } from "./infrastructure/d1-asset-access-reader";
export type { AssetObject, AssetReader } from "./application/ports/asset-reader";
export {
  buildNoticeThumbnailAssetUrl,
  getAssetContentType,
  getNoticeThumbnailContentTypeFromKey,
  getNoticeThumbnailExtension,
  getOwnedNoticeThumbnailKey,
  getR2AssetKey,
  isNoticeThumbnailAssetKey,
  NOTICE_THUMBNAIL_ACCEPTED_TYPES,
  NOTICE_THUMBNAIL_KEY_PREFIX,
  NOTICE_THUMBNAIL_MAX_BYTES,
  NOTICE_THUMBNAIL_PUBLIC_PREFIX,
  R2_ASSET_PREFIX,
  isStaticProfileAsset,
} from "./domain/asset-key-policy";
export { D1R2FileStore } from "./infrastructure/d1-r2-file-store";
export { D1TransitionFileWriter } from "./infrastructure/d1-transition-file-writer";
export { D1FileAvailability } from "./infrastructure/d1-file-availability";
