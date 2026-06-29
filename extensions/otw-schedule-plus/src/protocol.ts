export const EXTENSION_PROTOCOL = "OTW_SCHEDULE_PLUS_EXTENSION/V1";
export const EXTENSION_PROTOCOL_VERSION = 1;
export type ExtensionProtocol = typeof EXTENSION_PROTOCOL;

export type SchedulePlusExtensionCapability = "wideMode" | "chatLoginBridge";
export type WideModeResult =
  | "applied"
  | "already_applied"
  | "selector_missing"
  | "timeout"
  | "error";
export type ChatLoginBridgeStatus =
  | "disabled"
  | "enabled"
  | "needs_login"
  | "permission_missing"
  | "unsupported"
  | "error";

export type WebAppMessageType =
  | "PING"
  | "GET_CAPABILITIES"
  | "REQUEST_WIDE_MODE"
  | "SET_CHAT_LOGIN_BRIDGE";

export type ExtensionMessageType =
  | "READY"
  | "CAPABILITIES"
  | "TILE_STATUS"
  | "CHAT_LOGIN_STATUS"
  | "ERROR";

export interface WebAppRequestMessage {
  namespace: ExtensionProtocol;
  version: typeof EXTENSION_PROTOCOL_VERSION;
  direction: "web-to-extension";
  type: WebAppMessageType;
  requestId: string;
  payload?: unknown;
}

export interface ExtensionResponseMessage {
  namespace: ExtensionProtocol;
  version: typeof EXTENSION_PROTOCOL_VERSION;
  direction: "extension-to-web";
  type: ExtensionMessageType;
  requestId?: string;
  payload?: unknown;
}

export interface RegisteredChzzkFrame {
  channelId: string;
  frameId: number;
  kind: "live" | "chat";
  lastSeenAt: number;
  referrer?: string;
  tabId: number;
  url: string;
}

export interface ChzzkFrameInfo {
  channelId: string;
  kind: "live" | "chat";
}

const CHZZK_CHANNEL_ID_PATTERN = /^[a-f0-9]{32}$/i;
const OTW_PRODUCTION_HOST = "otw-schedule.info";
const OTW_DEV_HOSTS = new Set(["localhost", "127.0.0.1"]);
const WEB_MESSAGE_TYPES = new Set<WebAppMessageType>([
  "PING",
  "GET_CAPABILITIES",
  "REQUEST_WIDE_MODE",
  "SET_CHAT_LOGIN_BRIDGE",
]);
export const EXTENSION_CAPABILITIES: SchedulePlusExtensionCapability[] = [
  "wideMode",
  "chatLoginBridge",
];

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isValidChannelId = (value: unknown): value is string =>
  typeof value === "string" && CHZZK_CHANNEL_ID_PATTERN.test(value);

export const normalizeChannelIds = (value: unknown) => {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const channelIds: string[] = [];

  value.forEach((item) => {
    if (!isValidChannelId(item)) return;
    const channelId = item.toLowerCase();
    if (seen.has(channelId)) return;
    seen.add(channelId);
    channelIds.push(channelId);
  });

  return channelIds;
};

const isMultiviewPath = (pathname: string) =>
  pathname === "/multiview" || pathname.startsWith("/multiview/");

const isAllowedOtwSite = (url: URL) => {
  if (url.protocol === "https:" && url.hostname === OTW_PRODUCTION_HOST) {
    return true;
  }

  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    OTW_DEV_HOSTS.has(url.hostname)
  );
};

export const isAllowedOtwSiteUrl = (urlString?: string) => {
  if (!urlString) return false;

  try {
    return isAllowedOtwSite(new URL(urlString));
  } catch {
    return false;
  }
};

export const isAllowedOtwMultiviewUrl = (urlString?: string) => {
  if (!urlString) return false;

  try {
    const url = new URL(urlString);
    if (!isMultiviewPath(url.pathname)) return false;

    return isAllowedOtwSite(url);
  } catch {
    return false;
  }
};

export const getOtwTopLevelSite = (urlString?: string) => {
  if (!urlString || !isAllowedOtwMultiviewUrl(urlString)) return null;

  const url = new URL(urlString);
  return `${url.protocol}//${url.hostname}`;
};

export const isWebAppRequestMessage = (
  value: unknown,
): value is WebAppRequestMessage => {
  if (!isPlainObject(value)) return false;
  return (
    value.namespace === EXTENSION_PROTOCOL &&
    value.version === EXTENSION_PROTOCOL_VERSION &&
    value.direction === "web-to-extension" &&
    typeof value.requestId === "string" &&
    WEB_MESSAGE_TYPES.has(value.type as WebAppMessageType)
  );
};

export const createExtensionMessage = (
  type: ExtensionMessageType,
  payload?: unknown,
  requestId?: string,
  namespace: ExtensionProtocol = EXTENSION_PROTOCOL,
): ExtensionResponseMessage => ({
  namespace,
  version: EXTENSION_PROTOCOL_VERSION,
  direction: "extension-to-web",
  type,
  requestId,
  payload,
});

export const extractChzzkFrameInfo = (
  urlString: string,
): ChzzkFrameInfo | null => {
  try {
    const url = new URL(urlString);
    if (url.hostname !== "chzzk.naver.com") return null;

    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[0] !== "live" || !isValidChannelId(segments[1])) return null;

    return {
      channelId: segments[1].toLowerCase(),
      kind: segments[2] === "chat" ? "chat" : "live",
    };
  } catch {
    return null;
  }
};
