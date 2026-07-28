export const NOTICE_THUMBNAIL_KEY_PREFIX = "notices/thumbnails/";
export const NOTICE_THUMBNAIL_ASSET_PREFIX = "/r2-assets/";
export const NOTICE_THUMBNAIL_PUBLIC_PREFIX = `${NOTICE_THUMBNAIL_ASSET_PREFIX}${NOTICE_THUMBNAIL_KEY_PREFIX}`;
export const NOTICE_THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;
export const NOTICE_THUMBNAIL_MAX_LABEL = "2MB";
export const NOTICE_THUMBNAIL_ACCEPTED_TYPES = [
  "image/webp",
  "image/png",
  "image/jpeg",
] as const;
export const NOTICE_THUMBNAIL_ACCEPT = NOTICE_THUMBNAIL_ACCEPTED_TYPES.join(",");

const NOTICE_THUMBNAIL_KEY_PATTERN =
  /^notices\/thumbnails\/[a-z0-9][a-z0-9_-]*\.(?:webp|png|jpe?g)$/i;

const NOTICE_THUMBNAIL_EXTENSION_BY_TYPE = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
} as const;

const NOTICE_THUMBNAIL_CONTENT_TYPE_BY_EXTENSION = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
} as const;

export type NoticeThumbnailContentType =
  (typeof NOTICE_THUMBNAIL_ACCEPTED_TYPES)[number];

export const isAcceptedNoticeThumbnailType = (
  value?: string | null,
): value is NoticeThumbnailContentType =>
  NOTICE_THUMBNAIL_ACCEPTED_TYPES.includes(
    value as NoticeThumbnailContentType,
  );

export const getNoticeThumbnailExtension = (contentType?: string | null) =>
  isAcceptedNoticeThumbnailType(contentType)
    ? NOTICE_THUMBNAIL_EXTENSION_BY_TYPE[contentType]
    : null;

export const isNoticeThumbnailAssetKey = (key: string) =>
  NOTICE_THUMBNAIL_KEY_PATTERN.test(key);

export const getNoticeThumbnailContentTypeFromKey = (key: string) => {
  if (!isNoticeThumbnailAssetKey(key)) return null;
  const extension = key.split(".").pop()?.toLowerCase();
  if (!extension) return null;
  return (
    NOTICE_THUMBNAIL_CONTENT_TYPE_BY_EXTENSION[
      extension as keyof typeof NOTICE_THUMBNAIL_CONTENT_TYPE_BY_EXTENSION
    ] ?? null
  );
};

export const buildNoticeThumbnailAssetUrl = (key: string) =>
  `${NOTICE_THUMBNAIL_ASSET_PREFIX}${key}`;

export const getOwnedNoticeThumbnailKey = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed?.startsWith(NOTICE_THUMBNAIL_PUBLIC_PREFIX)) return null;

  const path = trimmed.split(/[?#]/, 1)[0];
  const encodedKey = path.slice(NOTICE_THUMBNAIL_ASSET_PREFIX.length);

  try {
    const key = decodeURIComponent(encodedKey);
    return isNoticeThumbnailAssetKey(key) ? key : null;
  } catch {
    return null;
  }
};
