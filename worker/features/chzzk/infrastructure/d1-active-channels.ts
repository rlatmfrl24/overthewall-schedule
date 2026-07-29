import {
  CHZZK_CHANNEL_ID_PATTERN,
} from "../domain/channel-targets";

const ACTIVE_CHANNELS_TTL_MS = 5 * 60_000;
const CHZZK_CHANNEL_URL_PATTERN =
  /(?:https?:\/\/)?chzzk\.naver\.com\/([a-f0-9]{32})(?:[/?#]|$)/i;

let activeChannelsCache:
  | { database: D1Database; fetchedAt: number; channelIds: ReadonlySet<string> }
  | undefined;

const getD1Results = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (!value || typeof value !== "object") return [];
  const results = (value as { results?: unknown }).results;
  return Array.isArray(results) ? (results as T[]) : [];
};

export class ChzzkAllowlistUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super("CHZZK channel allowlist is unavailable", options);
    this.name = "ChzzkAllowlistUnavailableError";
  }
}

const extractChannelId = (value: string | null) => {
  const channelId = value?.match(CHZZK_CHANNEL_URL_PATTERN)?.[1]?.toLowerCase();
  return channelId && CHZZK_CHANNEL_ID_PATTERN.test(channelId)
    ? channelId
    : null;
};

export const readActiveChzzkChannels = async (
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
      `SELECT url_chzzk
         FROM members
         WHERE url_chzzk IS NOT NULL
           AND TRIM(url_chzzk) <> ''
           AND (is_deprecated IS NULL OR is_deprecated != 1)`,
    );
    const executable =
      typeof (statement as { all?: unknown }).all === "function"
        ? statement
        : statement.bind();
    const result = await executable.all<{ url_chzzk: string | null }>();
    const channelIds = new Set<string>();
    for (const row of getD1Results<{ url_chzzk: string | null }>(result)) {
      const channelId = extractChannelId(row.url_chzzk);
      if (channelId) channelIds.add(channelId);
    }
    activeChannelsCache = { database, fetchedAt: now, channelIds };
    return channelIds;
  } catch (error) {
    throw new ChzzkAllowlistUnavailableError({ cause: error });
  }
};

export const clearActiveChzzkChannelsCacheForTests = () => {
  activeChannelsCache = undefined;
};
