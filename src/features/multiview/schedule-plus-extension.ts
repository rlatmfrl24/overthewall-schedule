export const SCHEDULE_PLUS_EXTENSION_PROTOCOL = "OTW_SCHEDULE_PLUS_EXTENSION/V1";
export const SCHEDULE_PLUS_EXTENSION_PROTOCOL_VERSION = 1;
export const SCHEDULE_PLUS_EXTENSION_HELP_DOC_URL =
  "https://github.com/rlatmfrl24/overthewall-schedule/blob/main/docs/otw-schedule-plus-extension.md";
export const SCHEDULE_PLUS_EXTENSION_STORE_URL =
  import.meta.env.VITE_OTW_SCHEDULE_PLUS_STORE_URL?.trim() ?? "";
export const SCHEDULE_PLUS_EXTENSION_INSTALL_URL =
  SCHEDULE_PLUS_EXTENSION_STORE_URL || SCHEDULE_PLUS_EXTENSION_HELP_DOC_URL;
export const HAS_SCHEDULE_PLUS_EXTENSION_STORE_URL =
  SCHEDULE_PLUS_EXTENSION_STORE_URL.length > 0;

export type SchedulePlusExtensionCapability = "wideMode" | "chatLoginBridge";
export type SchedulePlusExtensionProtocol =
  typeof SCHEDULE_PLUS_EXTENSION_PROTOCOL;
export type SchedulePlusExtensionStatus =
  | "missing"
  | "ready"
  | "permission_missing"
  | "unsupported"
  | "error";
export type MultiviewWideModeResult =
  | "applied"
  | "already_applied"
  | "selector_missing"
  | "timeout"
  | "error";
export type MultiviewChatLoginBridgeStatus =
  | "disabled"
  | "enabled"
  | "needs_login"
  | "permission_missing"
  | "unsupported"
  | "error";

export type SchedulePlusExtensionRequestType =
  | "PING"
  | "GET_CAPABILITIES"
  | "REQUEST_WIDE_MODE"
  | "SET_CHAT_LOGIN_BRIDGE";

export type SchedulePlusExtensionResponseType =
  | "READY"
  | "CAPABILITIES"
  | "TILE_STATUS"
  | "CHAT_LOGIN_STATUS"
  | "ERROR";

export interface SchedulePlusExtensionRequestMessage {
  namespace: SchedulePlusExtensionProtocol;
  version: typeof SCHEDULE_PLUS_EXTENSION_PROTOCOL_VERSION;
  direction: "web-to-extension";
  type: SchedulePlusExtensionRequestType;
  requestId: string;
  payload?: unknown;
}

export interface SchedulePlusExtensionResponseMessage {
  namespace: SchedulePlusExtensionProtocol;
  version: typeof SCHEDULE_PLUS_EXTENSION_PROTOCOL_VERSION;
  direction: "extension-to-web";
  type: SchedulePlusExtensionResponseType;
  requestId?: string;
  payload?: unknown;
}

export interface SchedulePlusExtensionState {
  capabilities: SchedulePlusExtensionCapability[];
  chatLoginBridgeStatus: MultiviewChatLoginBridgeStatus;
  lastError: string | null;
  playerOptimizationEnabled: boolean;
  status: SchedulePlusExtensionStatus;
  tileStatuses: Record<string, MultiviewWideModeResult>;
}

const RESPONSE_TYPES = new Set<SchedulePlusExtensionResponseType>([
  "READY",
  "CAPABILITIES",
  "TILE_STATUS",
  "CHAT_LOGIN_STATUS",
  "ERROR",
]);
const CAPABILITIES = new Set<SchedulePlusExtensionCapability>([
  "wideMode",
  "chatLoginBridge",
]);

const CHAT_LOGIN_STATUSES = new Set<MultiviewChatLoginBridgeStatus>([
  "disabled",
  "enabled",
  "needs_login",
  "permission_missing",
  "unsupported",
  "error",
]);

const WIDE_MODE_RESULTS = new Set<MultiviewWideModeResult>([
  "applied",
  "already_applied",
  "selector_missing",
  "timeout",
  "error",
]);
const CHZZK_CHANNEL_ID_PATTERN = /^[a-f0-9]{32}$/i;

export const createSchedulePlusExtensionRequest = (
  type: SchedulePlusExtensionRequestType,
  requestId: string,
  payload?: unknown,
  namespace: SchedulePlusExtensionProtocol = SCHEDULE_PLUS_EXTENSION_PROTOCOL,
): SchedulePlusExtensionRequestMessage => ({
  namespace,
  version: SCHEDULE_PLUS_EXTENSION_PROTOCOL_VERSION,
  direction: "web-to-extension",
  type,
  requestId,
  payload,
});

export const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isSchedulePlusExtensionResponseMessage = (
  value: unknown,
): value is SchedulePlusExtensionResponseMessage => {
  if (!isPlainObject(value)) return false;

  return (
    value.namespace === SCHEDULE_PLUS_EXTENSION_PROTOCOL &&
    value.version === SCHEDULE_PLUS_EXTENSION_PROTOCOL_VERSION &&
    value.direction === "extension-to-web" &&
    RESPONSE_TYPES.has(value.type as SchedulePlusExtensionResponseType)
  );
};

export const parseExtensionCapabilities = (
  payload: unknown,
): SchedulePlusExtensionCapability[] => {
  if (!isPlainObject(payload) || !Array.isArray(payload.capabilities)) return [];

  return payload.capabilities.filter(
    (capability): capability is SchedulePlusExtensionCapability =>
      typeof capability === "string" &&
      CAPABILITIES.has(capability as SchedulePlusExtensionCapability),
  );
};

export const parseChatLoginBridgeStatus = (
  payload: unknown,
): MultiviewChatLoginBridgeStatus | null => {
  if (!isPlainObject(payload)) return null;
  if (payload.source === "chzzk-frame") return null;

  const status = payload.chatLoginBridgeStatus ?? payload.status;

  return typeof status === "string" &&
    CHAT_LOGIN_STATUSES.has(status as MultiviewChatLoginBridgeStatus)
    ? (status as MultiviewChatLoginBridgeStatus)
    : null;
};

export const parsePlayerOptimizationEnabled = (payload: unknown) => {
  if (!isPlainObject(payload)) return null;
  return typeof payload.playerOptimizationEnabled === "boolean"
    ? payload.playerOptimizationEnabled
    : null;
};

export const parseTileStatuses = (
  payload: unknown,
): Record<string, MultiviewWideModeResult> => {
  if (!isPlainObject(payload) || !isPlainObject(payload.statuses)) return {};

  const statuses: Record<string, MultiviewWideModeResult> = {};

  Object.entries(payload.statuses).forEach(([channelId, result]) => {
    if (!CHZZK_CHANNEL_ID_PATTERN.test(channelId)) return;
    if (
      typeof result !== "string" ||
      !WIDE_MODE_RESULTS.has(result as MultiviewWideModeResult)
    ) {
      return;
    }

    statuses[channelId.toLowerCase()] = result as MultiviewWideModeResult;
  });

  return statuses;
};

export const getExtensionStatusFromChatStatus = (
  status: MultiviewChatLoginBridgeStatus,
): SchedulePlusExtensionStatus => {
  if (status === "permission_missing") return "permission_missing";
  if (status === "unsupported") return "unsupported";
  if (status === "error") return "error";
  return "ready";
};
