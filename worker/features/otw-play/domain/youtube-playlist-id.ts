const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9_-]{10,100}$/;
const YOUTUBE_PLAYLIST_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
]);

export const extractYouTubePlaylistId = (value: string) => {
  const input = value.trim();
  if (PLAYLIST_ID_PATTERN.test(input)) return input;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !YOUTUBE_PLAYLIST_HOSTS.has(url.hostname)) {
    return null;
  }
  const playlistId = url.searchParams.get("list")?.trim() ?? "";
  return PLAYLIST_ID_PATTERN.test(playlistId) ? playlistId : null;
};

export const canonicalYouTubePlaylistUrl = (playlistId: string) =>
  `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;
