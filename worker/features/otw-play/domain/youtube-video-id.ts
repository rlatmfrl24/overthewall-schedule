export const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_VIDEO_ID_SOURCE = "[A-Za-z0-9_-]{11}";
const YOUTU_BE_PATH_PATTERN = new RegExp(
  "^/(" + YOUTUBE_VIDEO_ID_SOURCE + ")/?$",
);
const YOUTUBE_EMBED_PATH_PATTERN = new RegExp(
  "^/(?:embed|shorts)/(" + YOUTUBE_VIDEO_ID_SOURCE + ")/?$",
);

const hasUnsafeRawUrlCharacter = (value: string): boolean =>
  [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return (
      character === "\\" ||
      codePoint === 0x7f ||
      (codePoint !== undefined && codePoint <= 0x1f)
    );
  });

const YOUTUBE_WATCH_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
]);

const isSafeYouTubeUrl = (url: URL): boolean =>
  url.protocol === "https:" &&
  url.username === "" &&
  url.password === "" &&
  url.port === "";

const readWatchVideoId = (url: URL): string | null => {
  if (url.pathname !== "/watch") return null;
  const videoIds = url.searchParams.getAll("v");
  return videoIds.length === 1 ? videoIds[0] : null;
};

const readPathVideoId = (url: URL): string | null => {
  if (url.hostname === "youtu.be") {
    return YOUTU_BE_PATH_PATTERN.exec(url.pathname)?.[1] ?? null;
  }

  return YOUTUBE_EMBED_PATH_PATTERN.exec(url.pathname)?.[1] ?? null;
};

export const extractYouTubeVideoId = (value: string): string | null => {
  if (hasUnsafeRawUrlCharacter(value)) return null;

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }

  if (!isSafeYouTubeUrl(url)) return null;

  const isWatchHost = YOUTUBE_WATCH_HOSTS.has(url.hostname);
  const isShortHost = url.hostname === "youtu.be";
  if (!isWatchHost && !isShortHost) return null;

  const videoId = isWatchHost
    ? readWatchVideoId(url) ?? readPathVideoId(url)
    : readPathVideoId(url);

  return videoId && YOUTUBE_VIDEO_ID_PATTERN.test(videoId)
    ? videoId
    : null;
};
