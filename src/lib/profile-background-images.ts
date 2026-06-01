export const PROFILE_BACKGROUND_IMAGE_WIDTHS = [960, 1280, 1672] as const;

export const PROFILE_BACKGROUND_IMAGE_SIZES =
  "(min-width: 640px) 100vw, 0px";

export const DEFAULT_PROFILE_BACKGROUND_ID = "default";

const DEFAULT_PROFILE_BACKGROUND_BASE_URL = "/r2-assets";

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const encodePathSegment = (value: string) =>
  value
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

export const getProfileBackgroundBaseUrl = () =>
  trimTrailingSlash(
    import.meta.env.VITE_PROFILE_BACKGROUND_BASE_URL ||
      DEFAULT_PROFILE_BACKGROUND_BASE_URL,
  );

export const buildProfileBackgroundImageSources = (
  code: string,
  baseUrl = getProfileBackgroundBaseUrl(),
  backgroundId = DEFAULT_PROFILE_BACKGROUND_ID,
) => {
  const base = trimTrailingSlash(baseUrl || DEFAULT_PROFILE_BACKGROUND_BASE_URL);
  const safeCode = encodePathSegment(code);
  const safeBackgroundId = encodePathSegment(backgroundId);
  const keyPrefix = `${base}/members/${safeCode}/backgrounds/${safeBackgroundId}`;
  const variantUrl = (width: number) =>
    `${keyPrefix}/w${width}.webp`;

  return {
    fallbackSrc: `${keyPrefix}/original.webp`,
    sizes: PROFILE_BACKGROUND_IMAGE_SIZES,
    src: variantUrl(1280),
    srcSet: PROFILE_BACKGROUND_IMAGE_WIDTHS.map(
      (width) => `${variantUrl(width)} ${width}w`,
    ).join(", "),
  };
};
