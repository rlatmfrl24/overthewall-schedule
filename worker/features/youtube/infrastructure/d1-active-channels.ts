import { publicationHiddenSql } from "../../content-access";
import { type SiteId } from "@contracts/site-definition";
import { YOUTUBE_CHANNEL_ID_PATTERN } from "../domain/channel-targets";



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
  siteId: SiteId = "otw",
): Promise<ReadonlySet<string>> => {

  try {
    const statement = database.prepare(
      `SELECT youtube_channel_id
         FROM members
         WHERE youtube_channel_id IS NOT NULL
           AND TRIM(youtube_channel_id) <> ''
           AND content_access = 'normal' AND NOT (${publicationHiddenSql("members","members",siteId)})
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
    return channelIds;
  } catch (error) {
    throw new YouTubeAllowlistUnavailableError({ cause: error });
  }
};

export const clearActiveYouTubeChannelsCacheForTests = () => {
  // The access allowlist is read fresh before every provider/cache lookup.
};
