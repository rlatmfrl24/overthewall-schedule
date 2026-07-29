export const R2_ASSET_PREFIX = "/r2-assets/";
export const NOTICE_THUMBNAIL_KEY_PREFIX = "notices/thumbnails/";
export const NOTICE_THUMBNAIL_PUBLIC_PREFIX =
  `${R2_ASSET_PREFIX}${NOTICE_THUMBNAIL_KEY_PREFIX}`;
export const NOTICE_THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;

export const NOTICE_THUMBNAIL_ACCEPTED_TYPES = [
  "image/webp",
  "image/png",
  "image/jpeg",
] as const;

const NOTICE_THUMBNAIL_KEY_PATTERN =
  /^notices\/thumbnails\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:webp|png|jpe?g)$/i;
const PROFILE_BACKGROUND_KEY =
  /^members\/[a-z0-9_]+\/backgrounds\/[a-z0-9][a-z0-9_-]*\/(?:original|w(?:960|1280|1672))\.webp$/i;

const EXTENSION_BY_TYPE = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
} as const;

const CONTENT_TYPE_BY_EXTENSION = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
} as const;

export const getNoticeThumbnailExtension = (contentType: string) =>
  NOTICE_THUMBNAIL_ACCEPTED_TYPES.includes(
    contentType as (typeof NOTICE_THUMBNAIL_ACCEPTED_TYPES)[number],
  )
    ? EXTENSION_BY_TYPE[
        contentType as keyof typeof EXTENSION_BY_TYPE
      ]
    : null;

export const isNoticeThumbnailAssetKey = (key: string) =>
  NOTICE_THUMBNAIL_KEY_PATTERN.test(key);

export const getNoticeThumbnailContentTypeFromKey = (key: string) => {
  if (!isNoticeThumbnailAssetKey(key)) return null;
  const extension = key.split(".").pop()?.toLowerCase();
  return extension
    ? (CONTENT_TYPE_BY_EXTENSION[
        extension as keyof typeof CONTENT_TYPE_BY_EXTENSION
      ] ?? null)
    : null;
};

export const buildNoticeThumbnailAssetUrl = (key: string) =>
  `${R2_ASSET_PREFIX}${key}`;

export const getOwnedNoticeThumbnailKey = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed?.startsWith(NOTICE_THUMBNAIL_PUBLIC_PREFIX)) return null;

  const path = trimmed.split(/[?#]/, 1)[0] ?? "";
  const encodedKey = path.slice(R2_ASSET_PREFIX.length);
  try {
    const key = decodeURIComponent(encodedKey);
    return isNoticeThumbnailAssetKey(key) ? key : null;
  } catch {
    return null;
  }
};

export const getR2AssetKey = (pathname: string) => {
  if (!pathname.startsWith(R2_ASSET_PREFIX)) return null;
  try {
    return decodeURIComponent(pathname.slice(R2_ASSET_PREFIX.length));
  } catch {
    return null;
  }
};

export const getAssetContentType = (key: string) => {
  if (PROFILE_BACKGROUND_KEY.test(key)) return "image/webp";
  return getNoticeThumbnailContentTypeFromKey(key);
};
