import { YOUTUBE_CHANNEL_ID_PATTERN } from "../domain/channel-targets";

const ACTIVE_CHANNELS_TTL_MS = 5 * 60_000;

let activeChannelsCache:
  | { database: D1Database; fetchedAt: number; channelIds: ReadonlySet<string> }
  | undefined;

const getD1Results = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (!value || typeof value !== "object") return [];
  const results = (value as { results?: unknown }).results;
  return Array.isArray(results) ? (results as T[]) : [];
};

export class YouTubeAllowlistUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super("YouTube channel allowlist is unavailable", options);
    this.name = "YouTubeAllowlistUnavailableError";
  }
}

export const readActiveYouTubeChannels = async (
  database: D1Database,
): Promise<ReadonlySet<string>> => {
  const now = Date.now();
  if (
    activeChannelsCache?.database === database &&
    now - activeChannelsCache.fetchedAt < ACTIVE_CHANNELS_TTL_MS
  ) {
    return activeChannelsCache.channelIds;
  }

  try {
    const statement = database.prepare(
      `SELECT youtube_channel_id
         FROM members
         WHERE youtube_channel_id IS NOT NULL
           AND TRIM(youtube_channel_id) <> ''
           AND (is_deprecated IS NULL OR is_deprecated != 1)`,
    );
    const executable =
      typeof (statement as { all?: unknown }).all === "function"
        ? statement
        : statement.bind();
    const result = await executable.all<{
      youtube_channel_id: string | null;
    }>();
    const channelIds = new Set<string>();
    for (const row of getD1Results<{
      youtube_channel_id: string | null;
    }>(result)) {
      const channelId = row.youtube_channel_id?.trim();
      if (channelId && YOUTUBE_CHANNEL_ID_PATTERN.test(channelId)) {
        channelIds.add(channelId);
      }
    }
    activeChannelsCache = { database, fetchedAt: now, channelIds };
    return channelIds;
  } catch (error) {
    throw new YouTubeAllowlistUnavailableError({ cause: error });
  }
};

export const clearActiveYouTubeChannelsCacheForTests = () => {
  activeChannelsCache = undefined;
};
