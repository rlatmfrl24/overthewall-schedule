export const YOUTUBE_CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;
export const YOUTUBE_MAX_CHANNEL_IDS = 20;
export const YOUTUBE_MAX_RESULTS = 20;
export const KIRINUKI_MAX_RESULTS = 40;

export type YouTubeChannelTargetParseResult =
  | { ok: true; channelIds: string[] }
  | { ok: false; message: string };

export const parseYouTubeChannelTargets = (
  value: string | null,
): YouTubeChannelTargetParseResult => {
  if (!value) {
    return { ok: false, message: "channelIds query required" };
  }

  const channelIds: string[] = [];
  const seen = new Set<string>();
  for (const part of value.split(",")) {
    const channelId = part.trim();
    if (!channelId || !YOUTUBE_CHANNEL_ID_PATTERN.test(channelId)) {
      return { ok: false, message: "Invalid channelIds" };
    }
    if (!seen.has(channelId)) {
      seen.add(channelId);
      channelIds.push(channelId);
    }
  }

  if (channelIds.length === 0) {
    return { ok: false, message: "No valid channelIds" };
  }
  if (channelIds.length > YOUTUBE_MAX_CHANNEL_IDS) {
    return {
      ok: false,
      message: `channelIds must contain at most ${YOUTUBE_MAX_CHANNEL_IDS} items`,
    };
  }
  return { ok: true, channelIds };
};

const parseMaxResults = (
  value: string | null,
  fallback: number,
  maximum: number,
) => {
  const normalized = value?.trim() || String(fallback);
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum
    ? parsed
    : null;
};

export const parseYouTubeMaxResults = (
  value: string | null,
  fallback = YOUTUBE_MAX_RESULTS,
) => parseMaxResults(value, fallback, YOUTUBE_MAX_RESULTS);

export const parseKirinukiMaxResults = (
  value: string | null,
  fallback = YOUTUBE_MAX_RESULTS,
) => parseMaxResults(value, fallback, KIRINUKI_MAX_RESULTS);
