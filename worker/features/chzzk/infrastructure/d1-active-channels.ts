import { publicationHiddenSql } from "../../content-transition";
import { type SiteId } from "@contracts/site-definition";
import {
  CHZZK_CHANNEL_ID_PATTERN,
} from "../domain/channel-targets";

const CHZZK_CHANNEL_URL_PATTERN =
  /(?:https?:\/\/)?chzzk\.naver\.com\/([a-f0-9]{32})(?:[/?#]|$)/i;


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
  siteId: SiteId = "otw",
): Promise<ReadonlySet<string>> => {

  try {
    const statement = database.prepare(
      `SELECT url_chzzk
         FROM members
         WHERE url_chzzk IS NOT NULL
           AND TRIM(url_chzzk) <> ''
           AND content_access = 'normal' AND NOT (${publicationHiddenSql("members","members",siteId)})
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
    return channelIds;
  } catch (error) {
    throw new ChzzkAllowlistUnavailableError({ cause: error });
  }
};

export const clearActiveChzzkChannelsCacheForTests = () => {
  // The access allowlist is read fresh before every provider/cache lookup.
};
