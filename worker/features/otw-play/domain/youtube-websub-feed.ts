import { XMLParser } from "fast-xml-parser";

const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/u;
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/u;
const FORBIDDEN_XML_PATTERN = /<!\s*(?:DOCTYPE|ENTITY)\b/iu;

export interface YoutubeWebsubEntry {
  videoId: string;
  channelId: string;
  updatedAt: number;
}

export interface YoutubeWebsubFeed {
  topicUrl: string;
  entries: YoutubeWebsubEntry[];
}

export class YoutubeWebsubFeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YoutubeWebsubFeedError";
  }
}

const textValue = (value: unknown) => typeof value === "string" ? value.trim() : "";

export const parseYoutubeWebsubFeed = (xml: string): YoutubeWebsubFeed => {
  if (FORBIDDEN_XML_PATTERN.test(xml)) {
    throw new YoutubeWebsubFeedError("DTD and entity declarations are not allowed");
  }
  let parsed: unknown;
  try {
    parsed = new XMLParser({
      ignoreAttributes: false,
      processEntities: false,
      parseTagValue: false,
      trimValues: true,
    }).parse(xml);
  } catch {
    throw new YoutubeWebsubFeedError("Invalid Atom XML");
  }
  const feed = typeof parsed === "object" && parsed !== null
    ? (parsed as Record<string, unknown>).feed
    : null;
  if (typeof feed !== "object" || feed === null) {
    throw new YoutubeWebsubFeedError("Atom feed is required");
  }
  const feedRecord = feed as Record<string, unknown>;
  const rawLinks = Array.isArray(feedRecord.link)
    ? feedRecord.link
    : feedRecord.link && typeof feedRecord.link === "object"
      ? [feedRecord.link]
      : [];
  const topicUrl = rawLinks.flatMap((raw) => {
    if (typeof raw !== "object" || raw === null) return [];
    const link = raw as Record<string, unknown>;
    return link["@_rel"] === "self" && typeof link["@_href"] === "string"
      ? [link["@_href"].trim()]
      : [];
  })[0] ?? "";
  const rawEntries = feedRecord.entry;
  const entries = Array.isArray(rawEntries)
    ? rawEntries
    : rawEntries && typeof rawEntries === "object"
      ? [rawEntries]
      : [];
  const parsedEntries = entries.map((raw) => {
    const entry = raw as Record<string, unknown>;
    const videoId = textValue(entry["yt:videoId"]);
    const channelId = textValue(entry["yt:channelId"]);
    const updated = textValue(entry.updated);
    const updatedAt = Date.parse(updated);
    if (
      !VIDEO_ID_PATTERN.test(videoId) ||
      !CHANNEL_ID_PATTERN.test(channelId) ||
      !Number.isFinite(updatedAt)
    ) {
      throw new YoutubeWebsubFeedError("Invalid YouTube Atom entry");
    }
    return { videoId, channelId, updatedAt };
  });
  if (!topicUrl || parsedEntries.length === 0) {
    throw new YoutubeWebsubFeedError("Atom topic and entry are required");
  }
  return { topicUrl, entries: parsedEntries };
};
