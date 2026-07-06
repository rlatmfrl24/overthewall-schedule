import type { MultiviewUrlState } from "./types";

const CHZZK_CHANNEL_ID_PATTERN = /^[a-f0-9]{32}$/i;

export function isValidChzzkChannelId(value?: string | null): value is string {
  return Boolean(value && CHZZK_CHANNEL_ID_PATTERN.test(value));
}

export function extractMultiviewChzzkChannelId(input?: string | null) {
  const trimmed = input?.trim();
  if (!trimmed) return null;

  if (isValidChzzkChannelId(trimmed)) {
    return trimmed.toLowerCase();
  }

  try {
    const url = new URL(trimmed);
    if (url.hostname !== "chzzk.naver.com") return null;

    const segments = url.pathname.split("/").filter(Boolean);
    const candidate =
      segments[0] === "live" || segments[0] === "channel"
        ? segments[1]
        : segments[0];

    return isValidChzzkChannelId(candidate) ? candidate.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function dedupeChannelIds(channelIds: string[]) {
  const seen = new Set<string>();
  const nextIds: string[] = [];

  channelIds.forEach((channelId) => {
    const normalized = extractMultiviewChzzkChannelId(channelId);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    nextIds.push(normalized);
  });

  return nextIds;
}

export function parseMultiviewUrlState(
  params: URLSearchParams,
): MultiviewUrlState {
  return {
    channelIds: dedupeChannelIds(params.getAll("c")),
  };
}

export function buildMultiviewSearchParams(state: MultiviewUrlState) {
  const params = new URLSearchParams();

  dedupeChannelIds(state.channelIds).forEach((channelId) => {
    params.append("c", channelId);
  });

  return params;
}

export function buildMulLiveUrl(channelIds: string[]) {
  const normalized = dedupeChannelIds(channelIds);
  return normalized.length > 0
    ? `https://mul.live/${normalized.join("/")}`
    : "https://mul.live/";
}
