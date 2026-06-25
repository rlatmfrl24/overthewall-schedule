import {
  EXTENSION_CAPABILITIES,
  createExtensionMessage,
  getOtwTopLevelSite,
  isPlainObject,
  isAllowedOtwMultiviewUrl,
  isWebAppRequestMessage,
  normalizeChannelIds,
  type ChatLoginBridgeStatus,
  type RegisteredChzzkFrame,
  type WideModeResult,
} from "./protocol.js";
import {
  getChromeApi,
  getChromeLastErrorMessage,
  type ChromeMessageSender,
  type ChromePermissionsRequest,
} from "./chrome-api.js";
import {
  getChatFramePartitionKeys,
  isNaverLoginCookieName,
  syncNaverLoginCookiesToPartitions,
} from "./cookie-bridge.js";
import { removeLegacyChatCookieBlockerForTab } from "./chat-cookie-blocker.js";

const INTERNAL_FRAME_READY = "OTW_EXTENSION_FRAME_READY";
const INTERNAL_RUN_WIDE_MODE = "OTW_EXTENSION_RUN_WIDE_MODE";
const INTERNAL_WEB_APP_MESSAGE = "OTW_EXTENSION_WEB_APP_MESSAGE";
const CHAT_LOGIN_STORAGE_KEY = "otwSchedulePlusChatLoginBridgeEnabled";
const PLAYER_OPTIMIZATION_STORAGE_KEY =
  "otw:schedule-plus:multiview:player-optimization-enabled";
const STALE_FRAME_TTL_MS = 60_000;
const FRAME_REGISTRATION_WAIT_MS = 5_000;
const FRAME_REGISTRATION_POLL_MS = 250;
const CHAT_LOGIN_COOKIE_PERMISSION: ChromePermissionsRequest = {
  origins: ["https://nid.naver.com/*"],
  permissions: ["cookies"],
};

const frames = new Map<string, RegisteredChzzkFrame>();
const pendingFrameOptimizations = new Map<string, string>();
const optimizedFrameSignatures = new Map<string, string>();
let hasRegisteredCookieChangeListener = false;

const getFrameKey = (tabId: number, frameId: number) => `${tabId}:${frameId}`;
const getFrameSignature = (frame: RegisteredChzzkFrame) =>
  `${frame.channelId}:${frame.url}`;

const isSuccessfulWideModeResult = (result: WideModeResult) =>
  result === "applied" || result === "already_applied";

const hasFrameOptimizationState = (frame: RegisteredChzzkFrame) => {
  const key = getFrameKey(frame.tabId, frame.frameId);
  const signature = getFrameSignature(frame);

  return (
    pendingFrameOptimizations.get(key) === signature ||
    optimizedFrameSignatures.get(key) === signature
  );
};

const optimizeFrameOnce = async (frame: RegisteredChzzkFrame) => {
  const key = getFrameKey(frame.tabId, frame.frameId);
  const signature = getFrameSignature(frame);

  if (hasFrameOptimizationState(frame)) {
    return "already_applied" satisfies WideModeResult;
  }

  pendingFrameOptimizations.set(key, signature);

  try {
    const result = await sendFrameMessage(
      frame.tabId,
      frame.frameId,
      frame.channelId,
    );

    if (isSuccessfulWideModeResult(result)) {
      optimizedFrameSignatures.set(key, signature);
    }

    return result;
  } finally {
    if (pendingFrameOptimizations.get(key) === signature) {
      pendingFrameOptimizations.delete(key);
    }
  }
};

const pruneStaleFrames = () => {
  const now = Date.now();
  frames.forEach((frame, key) => {
    if (now - frame.lastSeenAt > STALE_FRAME_TTL_MS) {
      frames.delete(key);
      pendingFrameOptimizations.delete(key);
      optimizedFrameSignatures.delete(key);
    }
  });
};

const getStorageValue = (key: string) =>
  new Promise<unknown>((resolve) => {
    const chromeApi = getChromeApi();
    if (!chromeApi?.storage?.local) {
      resolve(undefined);
      return;
    }

    chromeApi.storage.local.get(key, (items) => {
      resolve(items[key]);
    });
  });

const setStorageValue = (key: string, value: unknown) =>
  new Promise<void>((resolve) => {
    const chromeApi = getChromeApi();
    if (!chromeApi?.storage?.local) {
      resolve();
      return;
    }

    chromeApi.storage.local.set({ [key]: value }, () => resolve());
  });

const sendFrameMessage = (
  tabId: number,
  frameId: number,
  channelId: string,
) =>
  new Promise<WideModeResult>((resolve) => {
    const chromeApi = getChromeApi();
    if (!chromeApi?.tabs?.sendMessage) {
      resolve("error");
      return;
    }

    chromeApi.tabs.sendMessage(
      tabId,
      {
        kind: INTERNAL_RUN_WIDE_MODE,
        channelId,
      },
      { frameId },
      (response) => {
        const error = getChromeApi()?.runtime.lastError?.message;
        if (error) {
          frames.delete(getFrameKey(tabId, frameId));
          resolve("error");
          return;
        }

        if (
          isPlainObject(response) &&
          typeof response.result === "string" &&
          [
            "applied",
            "already_applied",
            "selector_missing",
            "timeout",
            "error",
          ].includes(response.result)
        ) {
          resolve(response.result as WideModeResult);
          return;
        }

        resolve("error");
      },
    );
  });

const sleep = (durationMs: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });

const buildLiveFrameTargetMap = (tabId: number, channelIds: string[]) => {
  const channelSet = new Set(channelIds);
  const targetsByChannel = new Map<string, RegisteredChzzkFrame[]>();

  for (const frame of frames.values()) {
    if (
      frame.tabId !== tabId ||
      frame.kind !== "live" ||
      !channelSet.has(frame.channelId)
    ) {
      continue;
    }

    const targets = targetsByChannel.get(frame.channelId) ?? [];
    targets.push(frame);
    targetsByChannel.set(frame.channelId, targets);
  }

  return targetsByChannel;
};

const waitForLiveFrameTargetMap = async (
  tabId: number,
  channelIds: string[],
) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= FRAME_REGISTRATION_WAIT_MS) {
    pruneStaleFrames();

    const targetsByChannel = buildLiveFrameTargetMap(tabId, channelIds);
    if (channelIds.every((channelId) => targetsByChannel.has(channelId))) {
      return targetsByChannel;
    }

    await sleep(FRAME_REGISTRATION_POLL_MS);
  }

  return buildLiveFrameTargetMap(tabId, channelIds);
};

const runWideModeForChannels = async (
  tabId: number,
  channelIds: string[],
) => {
  pruneStaleFrames();

  const statuses: Record<string, WideModeResult> = {};
  const targetsByChannel = await waitForLiveFrameTargetMap(tabId, channelIds);

  for (const channelId of channelIds) {
    const targets = targetsByChannel.get(channelId) ?? [];

    if (targets.length === 0) {
      statuses[channelId] = "timeout";
      continue;
    }

    const results = await Promise.all(
      targets.map((frame) => optimizeFrameOnce(frame)),
    );

    statuses[channelId] =
      results.find((result) => result === "applied") ??
      results.find((result) => result === "already_applied") ??
      results.find((result) => result === "selector_missing") ??
      results[0] ??
      "error";
  }

  return statuses;
};

const runWideModeForRegisteredFrame = (
  frame: RegisteredChzzkFrame,
  topLevelUrl?: string,
) => {
  if (frame.kind !== "live") return;
  if (!isAllowedOtwMultiviewUrl(topLevelUrl)) return;

  void getPlayerOptimizationEnabled().then((enabled) => {
    if (!enabled) return;

    setTimeout(() => {
      void optimizeFrameOnce(frame);
    }, 600);
  });
};

const hasChatLoginCookiePermission = () =>
  new Promise<boolean>((resolve) => {
    const chromeApi = getChromeApi();
    const permissions = chromeApi?.permissions;

    if (!permissions?.contains) {
      resolve(Boolean(chromeApi?.cookies));
      return;
    }

    try {
      permissions.contains(CHAT_LOGIN_COOKIE_PERMISSION, (granted) => {
        const error = getChromeLastErrorMessage();
        resolve(!error && granted);
      });
    } catch {
      resolve(false);
    }
  });

const requestChatLoginCookiePermission = () =>
  new Promise<boolean>((resolve) => {
    const permissions = getChromeApi()?.permissions;

    if (!permissions?.request) {
      resolve(false);
      return;
    }

    try {
      permissions.request(CHAT_LOGIN_COOKIE_PERMISSION, (granted) => {
        const error = getChromeLastErrorMessage();
        resolve(!error && granted);
      });
    } catch {
      resolve(false);
    }
  });

const registerCookieChangeListener = () => {
  if (hasRegisteredCookieChangeListener) return;

  const onChanged = getChromeApi()?.cookies?.onChanged;
  if (!onChanged?.addListener) return;

  onChanged.addListener(({ cookie, removed }) => {
    if (removed || !isNaverLoginCookieName(cookie.name)) return;

    void getChatLoginBridgeEnabled().then((enabled) => {
      if (!enabled) return;
      void syncChatLoginCookies({ topLevelSite: null });
    });
  });

  hasRegisteredCookieChangeListener = true;
};

const ensureChatLoginCookiePermission = async (promptForPermission: boolean) => {
  if (await hasChatLoginCookiePermission()) {
    registerCookieChangeListener();
    return true;
  }

  if (!promptForPermission) return false;

  const granted = await requestChatLoginCookiePermission();
  if (granted) registerCookieChangeListener();
  return granted;
};

const syncChatLoginCookies = async (
  input: {
    promptForPermission?: boolean;
    tabId?: number;
    topLevelSite: string | null;
  },
): Promise<ChatLoginBridgeStatus> => {
  const hasPermission = await ensureChatLoginCookiePermission(
    input.promptForPermission === true,
  );
  if (!hasPermission) return "permission_missing";

  const chromeApi = getChromeApi();
  if (!chromeApi?.cookies) return "permission_missing";

  await removeLegacyChatCookieBlockerForTab(chromeApi, input.tabId);

  const partitionKeys = await getChatFramePartitionKeys({
    chromeApi,
    fallbackTopLevelSite: input.topLevelSite,
    frames: [...frames.values()],
    tabId: input.tabId,
  });

  return syncNaverLoginCookiesToPartitions({ chromeApi, partitionKeys });
};

const disableChatLoginCookies = async (tabId?: number) => {
  const chromeApi = getChromeApi();
  await removeLegacyChatCookieBlockerForTab(chromeApi, tabId);
  return "disabled" satisfies ChatLoginBridgeStatus;
};

const getChatLoginBridgeEnabled = async () => {
  const enabled = await getStorageValue(CHAT_LOGIN_STORAGE_KEY);
  return enabled === true;
};

const getPlayerOptimizationEnabled = async () => {
  const enabled = await getStorageValue(PLAYER_OPTIMIZATION_STORAGE_KEY);
  return enabled !== false;
};

const getChatLoginStatus = async (): Promise<ChatLoginBridgeStatus> => {
  return (await getChatLoginBridgeEnabled()) ? "enabled" : "disabled";
};

const buildCapabilitiesPayload = async () => ({
  capabilities: EXTENSION_CAPABILITIES,
  chatLoginBridgeStatus: await getChatLoginStatus(),
  playerOptimizationEnabled: await getPlayerOptimizationEnabled(),
});

const handleWebAppMessage = async (
  message: unknown,
  sender: ChromeMessageSender,
) => {
  if (!isWebAppRequestMessage(message)) {
    return createExtensionMessage("ERROR", { reason: "invalid_sender" });
  }

  if (!isAllowedOtwMultiviewUrl(sender.url)) {
    return createExtensionMessage(
      "ERROR",
      { reason: "invalid_sender" },
      message.requestId,
      message.namespace,
    );
  }

  const tabId = sender.tab?.id;

  switch (message.type) {
    case "PING":
    case "GET_CAPABILITIES": {
      const chatLoginBridgeEnabled = await getChatLoginBridgeEnabled();
      const chatLoginBridgeStatus = chatLoginBridgeEnabled
        ? await syncChatLoginCookies({
            promptForPermission: false,
            tabId,
            topLevelSite: getOtwTopLevelSite(sender.url),
          })
        : await disableChatLoginCookies(tabId);

      return createExtensionMessage(
        "CAPABILITIES",
        {
          ...(await buildCapabilitiesPayload()),
          chatLoginBridgeStatus,
        },
        message.requestId,
        message.namespace,
      );
    }
    case "REQUEST_WIDE_MODE": {
      const payload = isPlainObject(message.payload) ? message.payload : {};
      const channelIds = normalizeChannelIds(payload.channelIds);
      const playerOptimizationEnabled = await getPlayerOptimizationEnabled();
      const statuses =
        playerOptimizationEnabled && typeof tabId === "number"
          ? await runWideModeForChannels(tabId, channelIds)
          : {};

      return createExtensionMessage(
        "TILE_STATUS",
        { playerOptimizationEnabled, statuses },
        message.requestId,
        message.namespace,
      );
    }
    case "SET_CHAT_LOGIN_BRIDGE": {
      const payload = isPlainObject(message.payload) ? message.payload : {};
      const enabled = payload.enabled === true;

      await setStorageValue(CHAT_LOGIN_STORAGE_KEY, enabled);

      const status = enabled
        ? await syncChatLoginCookies({
            promptForPermission: true,
            tabId,
            topLevelSite: getOtwTopLevelSite(sender.url),
          })
        : await disableChatLoginCookies(tabId);

      return createExtensionMessage(
        "CHAT_LOGIN_STATUS",
        { status },
        message.requestId,
        message.namespace,
      );
    }
    default:
      return createExtensionMessage(
        "ERROR",
        { reason: "unknown_message" },
        message.requestId,
        message.namespace,
      );
  }
};

getChromeApi()?.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isPlainObject(message) || typeof message.kind !== "string") return false;

  if (message.kind === INTERNAL_FRAME_READY) {
    const tabId = sender.tab?.id;
    const frameId = sender.frameId;
    const frame = isPlainObject(message.frame) ? message.frame : null;

    if (
      typeof tabId === "number" &&
      typeof frameId === "number" &&
      frame &&
      typeof frame.channelId === "string" &&
      (frame.kind === "live" || frame.kind === "chat") &&
      typeof frame.url === "string"
    ) {
      frames.set(getFrameKey(tabId, frameId), {
        channelId: frame.channelId,
        frameId,
        kind: frame.kind,
        lastSeenAt: Date.now(),
        tabId,
        url: frame.url,
      });

      runWideModeForRegisteredFrame(
        {
          channelId: frame.channelId,
          frameId,
          kind: frame.kind,
          lastSeenAt: Date.now(),
          tabId,
          url: frame.url,
        },
        sender.tab?.url,
      );

      if (frame.kind === "chat") {
        void getChatLoginBridgeEnabled().then((enabled) => {
          if (!enabled) return;
          void syncChatLoginCookies({
            promptForPermission: false,
            tabId,
            topLevelSite: null,
          });
        });
      }
    }

    sendResponse({ ok: true });
    return false;
  }

  if (message.kind === INTERNAL_WEB_APP_MESSAGE) {
    handleWebAppMessage(message.message, sender)
      .then(sendResponse)
      .catch(() => {
        sendResponse(createExtensionMessage("ERROR", { reason: "internal" }));
      });
    return true;
  }

  return false;
});

registerCookieChangeListener();
