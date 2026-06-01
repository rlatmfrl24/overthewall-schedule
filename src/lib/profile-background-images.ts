export const PROFILE_BACKGROUND_IMAGE_WIDTHS = [960, 1280, 1672] as const;

export const PROFILE_BACKGROUND_IMAGE_SIZES =
  "(min-width: 640px) 100vw, 0px";

export const DEFAULT_PROFILE_BACKGROUND_ID = "default";
export const MAX_PROFILE_BACKGROUND_IMAGES = 3;

const DEFAULT_PROFILE_BACKGROUND_BASE_URL = "/r2-assets";

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const encodePathSegment = (value: string) =>
  value
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

const appendVersion = (url: string, version?: string | null) => {
  if (!version) {
    return url;
  }

  return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}`;
};

export const getProfileBackgroundBaseUrl = () =>
  trimTrailingSlash(
    import.meta.env.VITE_PROFILE_BACKGROUND_BASE_URL ||
      DEFAULT_PROFILE_BACKGROUND_BASE_URL,
  );

export const buildProfileBackgroundImageSources = (
  code: string,
  baseUrl = getProfileBackgroundBaseUrl(),
  backgroundId = DEFAULT_PROFILE_BACKGROUND_ID,
  version?: string | null,
) => {
  const base = trimTrailingSlash(baseUrl || DEFAULT_PROFILE_BACKGROUND_BASE_URL);
  const safeCode = encodePathSegment(code);
  const safeBackgroundId = encodePathSegment(backgroundId);
  const keyPrefix = `${base}/members/${safeCode}/backgrounds/${safeBackgroundId}`;
  const variantUrl = (width: number) =>
    appendVersion(`${keyPrefix}/w${width}.webp`, version);

  return {
    fallbackSrc: appendVersion(`${keyPrefix}/original.webp`, version),
    sizes: PROFILE_BACKGROUND_IMAGE_SIZES,
    src: variantUrl(1280),
    srcSet: PROFILE_BACKGROUND_IMAGE_WIDTHS.map(
      (width) => `${variantUrl(width)} ${width}w`,
    ).join(", "),
  };
};

export const getProfileBackgroundIds = (
  backgroundImages:
    | Array<{ id: string; sortOrder?: number | null }>
    | null
    | undefined,
) => {
  if (!backgroundImages?.length) {
    return [DEFAULT_PROFILE_BACKGROUND_ID];
  }

  return [...backgroundImages]
    .filter((image) => Boolean(image.id))
    .sort(
      (a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
        a.id.localeCompare(b.id),
    )
    .map((image) => image.id)
    .slice(0, MAX_PROFILE_BACKGROUND_IMAGES);
};

const getProfileBackgroundEntries = (
  backgroundImages:
    | Array<{ id: string; sortOrder?: number | null; version?: string | null }>
    | null
    | undefined,
) => {
  if (!backgroundImages?.length) {
    return [
      {
        id: DEFAULT_PROFILE_BACKGROUND_ID,
        version: null,
      },
    ];
  }

  return [...backgroundImages]
    .filter((image) => Boolean(image.id))
    .sort(
      (a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
        a.id.localeCompare(b.id),
    )
    .map((image) => ({
      id: image.id,
      version: image.version ?? null,
    }))
    .slice(0, MAX_PROFILE_BACKGROUND_IMAGES);
};

export const buildProfileBackgroundImageSourceSets = (
  code: string,
  backgroundImages:
    | Array<{ id: string; sortOrder?: number | null; version?: string | null }>
    | null
    | undefined,
  baseUrl = getProfileBackgroundBaseUrl(),
) =>
  getProfileBackgroundEntries(backgroundImages).map((background) => ({
    id: background.id,
    sources: buildProfileBackgroundImageSources(
      code,
      baseUrl,
      background.id,
      background.version,
    ),
  }));
