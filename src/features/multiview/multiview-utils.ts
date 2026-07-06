import type { MultiviewUrlState } from "./types";

const CHZZK_CHANNEL_ID_PATTERN = /^[a-f0-9]{32}$/i;
const MUL_LIVE_BASE_URL = "https://mul.live/";

export function isValidMultiviewChannelId(
  value?: string | null,
): value is string {
  return Boolean(value && CHZZK_CHANNEL_ID_PATTERN.test(value));
}

export function isValidChzzkChannelId(value?: string | null): value is string {
  return isValidMultiviewChannelId(value);
}

export function extractMultiviewChannelId(input?: string | null) {
  const trimmed = input?.trim();
  if (!trimmed) return null;

  if (isValidMultiviewChannelId(trimmed)) {
    return trimmed.toLowerCase();
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname !== "chzzk.naver.com") return null;

    const segments = parsed.pathname.split("/").filter(Boolean);
    const candidate =
      segments[0] === "live" || segments[0] === "channel"
        ? segments[1]
        : segments[0];

    return isValidMultiviewChannelId(candidate)
      ? candidate.toLowerCase()
      : null;
  } catch {
    return null;
  }
}

export function extractMultiviewChzzkChannelId(input?: string | null) {
  return extractMultiviewChannelId(input);
}

export function dedupeMultiviewChannelIds(channelIds: string[]) {
  const seen = new Set<string>();
  const nextIds: string[] = [];

  channelIds.forEach((channelId) => {
    const normalized = extractMultiviewChannelId(channelId);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    nextIds.push(normalized);
  });

  return nextIds;
}

export function dedupeChannelIds(channelIds: string[]) {
  return dedupeMultiviewChannelIds(channelIds);
}

export function parseMultiviewUrlState(
  params: URLSearchParams,
): MultiviewUrlState {
  return {
    channelIds: dedupeMultiviewChannelIds(params.getAll("c")),
  };
}

export function buildMultiviewSearchParams(state: MultiviewUrlState) {
  const params = new URLSearchParams();

  dedupeMultiviewChannelIds(state.channelIds).forEach((channelId) => {
    params.append("c", channelId);
  });

  return params;
}

export function buildMulLiveUrl(channelIds: string[]) {
  const normalized = dedupeMultiviewChannelIds(channelIds);
  return normalized.length > 0
    ? `${MUL_LIVE_BASE_URL}${normalized.join("/")}`
    : MUL_LIVE_BASE_URL;
}
