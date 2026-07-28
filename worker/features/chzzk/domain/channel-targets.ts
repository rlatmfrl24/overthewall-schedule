export const CHZZK_CHANNEL_ID_PATTERN = /^[a-f0-9]{32}$/;
export const CHZZK_MAX_CHANNEL_IDS = 20;

export type ChzzkChannelTargetParseResult =
  | { ok: true; channelIds: string[] }
  | { ok: false; message: string };

export const parseChzzkChannelTargets = (
  value: string | null,
): ChzzkChannelTargetParseResult => {
  if (!value) {
    return { ok: false, message: "channelIds query required" };
  }

  const channelIds: string[] = [];
  const seen = new Set<string>();

  for (const part of value.split(",")) {
    const channelId = part.trim().toLowerCase();
    if (!channelId || !CHZZK_CHANNEL_ID_PATTERN.test(channelId)) {
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
  if (channelIds.length > CHZZK_MAX_CHANNEL_IDS) {
    return {
      ok: false,
      message: `channelIds must contain at most ${CHZZK_MAX_CHANNEL_IDS} items`,
    };
  }

  return { ok: true, channelIds };
};

export const parseSingleChzzkChannelTarget = (
  value: string | null,
): ChzzkChannelTargetParseResult => {
  const channelId = value?.trim().toLowerCase() ?? "";
  if (!CHZZK_CHANNEL_ID_PATTERN.test(channelId)) {
    return { ok: false, message: "Invalid channelId" };
  }
  return { ok: true, channelIds: [channelId] };
};

export const parseChzzkChannelTargetArray = (
  value: unknown,
): ChzzkChannelTargetParseResult => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return { ok: false, message: "channelIds must be an array of strings" };
  }
  return parseChzzkChannelTargets(value.join(","));
};
