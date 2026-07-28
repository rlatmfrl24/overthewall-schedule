export { createHandleR2Asset } from "./http/handler";
export { R2AssetReader } from "./infrastructure/r2-asset-reader";
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
} from "./domain/asset-key-policy";
