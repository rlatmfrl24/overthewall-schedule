import {
  EXTENSION_CAPABILITIES,
  createExtensionMessage,
  getOtwTopLevelSite,
  isPlainObject,
  isAllowedOtwMultiviewUrl,
  isAllowedOtwSiteUrl,
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
  syncNaverLoginCookiesToPartitions,
} from "./cookie-bridge.js";

const INTERNAL_FRAME_READY = "OTW_EXTENSION_FRAME_READY";
const INTERNAL_REQUEST_FRAME_REGISTRATION =
  "OTW_EXTENSION_REQUEST_FRAME_REGISTRATION";
const INTERNAL_MULTIVIEW_PAGE_READY = "OTW_EXTENSION_MULTIVIEW_PAGE_READY";
const INTERNAL_RUN_WIDE_MODE = "OTW_EXTENSION_RUN_WIDE_MODE";
const INTERNAL_WEB_APP_MESSAGE = "OTW_EXTENSION_WEB_APP_MESSAGE";
const INTERNAL_INJECT_BRIDGE_ACTIVE_TAB =
  "OTW_EXTENSION_INJECT_BRIDGE_ACTIVE_TAB";
const INTERNAL_CHAT_LOGIN_SETTING_CHANGED =
  "OTW_EXTENSION_CHAT_LOGIN_SETTING_CHANGED";
const INTERNAL_CHAT_LOGIN_SYNCED = "OTW_EXTENSION_CHAT_LOGIN_SYNCED";
const OTW_BRIDGE_SCRIPT_FILE = "otw-bridge.js";
const CHAT_LOGIN_STORAGE_KEY = "otwSchedulePlusChatLoginBridgeEnabled";
const CHAT_LOGIN_STATUS_STORAGE_KEY =
  "otwSchedulePlusChatLoginBridgeStatus";
const PLAYER_OPTIMIZATION_STORAGE_KEY =
  "otw:schedule-plus:multiview:player-optimization-enabled";
const STALE_FRAME_TTL_MS = 60_000;
const OPTIMIZED_FRAME_SIGNATURE_TTL_MS = 45_000;
const FRAME_REGISTRATION_WAIT_MS = 5_000;
const FRAME_REGISTRATION_POLL_MS = 250;
const CHAT_LOGIN_SYNC_COOLDOWN_MS = 30_000;
const AUTO_FRAME_OPTIMIZATION_RETRY_DELAYS_MS = [
  600, 1_800, 4_000, 8_000, 12_000,
] as const;
const CHAT_LOGIN_TRANSIENT_FAILURE_STATUSES = new Set<ChatLoginBridgeStatus>([
  "unsupported",
]);
const CHAT_LOGIN_COOKIE_PERMISSION: ChromePermissionsRequest = {
  origins: ["https://nid.naver.com/*"],
  permissions: ["cookies"],
};
const FALLBACK_OTW_BRIDGE_TAB_QUERY_URLS = [
  "https://otw-schedule.info/*",
];

const frames = new Map<string, RegisteredChzzkFrame>();
const pendingFrameOptimizations = new Map<
  string,
  { promise: Promise<WideModeResult>; signature: string }
>();
const optimizedFrameSignatures = new Map<
  string,
  { expiresAt: number; signature: string }
>();
const scheduledFrameOptimizationSignatures = new Map<string, string>();
const chatLoginReloadedFrameSignatures = new Map<string, string>();
const chatLoginSyncInFlightByScope = new Map<
  string,
  Promise<ChatLoginBridgeStatus>
>();
const lastChatLoginSyncByScope = new Map<
  string,
  { lastSyncedAt: number; status: ChatLoginBridgeStatus }
>();
const trustedMultiviewTabs = new Map<number, { lastSeenAt: number; url: string }>();
let pendingUserRequestedChatLoginSync = false;

const CHAT_LOGIN_STATUSES = new Set<ChatLoginBridgeStatus>([
  "disabled",
  "enabled",
  "needs_login",
  "permission_missing",
  "unsupported",
  "error",
]);

const getFrameKey = (tabId: number, frameId: number) => `${tabId}:${frameId}`;
const getFrameSignature = (frame: RegisteredChzzkFrame) =>
  `${frame.channelId}:${frame.url}`;

const removeFrameState = (key: string) => {
  frames.delete(key);
  pendingFrameOptimizations.delete(key);
  optimizedFrameSignatures.delete(key);
  scheduledFrameOptimizationSignatures.delete(key);
  chatLoginReloadedFrameSignatures.delete(key);
};

const isSuccessfulWideModeResult = (result: WideModeResult) =>
  result === "applied" || result === "already_applied";

const hasOptimizedFrameSignature = (frame: RegisteredChzzkFrame) => {
  const key = getFrameKey(frame.tabId, frame.frameId);
  const signature = getFrameSignature(frame);
  const optimized = optimizedFrameSignatures.get(key);

  if (!optimized) return false;
  if (optimized.signature !== signature) return false;
  if (optimized.expiresAt > Date.now()) return true;

  optimizedFrameSignatures.delete(key);
  return false;
};

const setOptimizedFrameSignature = (frame: RegisteredChzzkFrame) => {
  optimizedFrameSignatures.set(getFrameKey(frame.tabId, frame.frameId), {
    expiresAt: Date.now() + OPTIMIZED_FRAME_SIGNATURE_TTL_MS,
    signature: getFrameSignature(frame),
  });
};

const optimizeFrameOnce = async (frame: RegisteredChzzkFrame) => {
  const key = getFrameKey(frame.tabId, frame.frameId);
  const signature = getFrameSignature(frame);

  if (hasOptimizedFrameSignature(frame)) {
    return "already_applied" satisfies WideModeResult;
  }

  const pending = pendingFrameOptimizations.get(key);
  if (pending?.signature === signature) {
    return pending.promise;
  }

  const promise = (async () => {
    const result = await sendFrameMessage(
      frame.tabId,
      frame.frameId,
      frame.channelId,
    );

    if (isSuccessfulWideModeResult(result)) {
      setOptimizedFrameSignature(frame);
    }

    return result;
  })();

  pendingFrameOptimizations.set(key, { promise, signature });

  try {
    return await promise;
  } finally {
    if (pendingFrameOptimizations.get(key)?.signature === signature) {
      pendingFrameOptimizations.delete(key);
    }
  }
};

const pruneStaleFrames = () => {
  const now = Date.now();
  frames.forEach((frame, key) => {
    if (now - frame.lastSeenAt > STALE_FRAME_TTL_MS) {
      removeFrameState(key);
    }
  });
};

const removeChatLoginSyncStateForTab = (tabId: number) => {
  const keyPrefix = `${tabId}:`;
  for (const key of [
    ...chatLoginSyncInFlightByScope.keys(),
    ...lastChatLoginSyncByScope.keys(),
  ]) {
    if (!key.startsWith(keyPrefix)) continue;
    chatLoginSyncInFlightByScope.delete(key);
    lastChatLoginSyncByScope.delete(key);
  }
};

const removeFrameStateForTab = (tabId: number) => {
  const keyPrefix = `${tabId}:`;
  const keys = new Set([
    ...frames.keys(),
    ...pendingFrameOptimizations.keys(),
    ...optimizedFrameSignatures.keys(),
    ...scheduledFrameOptimizationSignatures.keys(),
    ...chatLoginReloadedFrameSignatures.keys(),
  ]);

  for (const key of keys) {
    if (key.startsWith(keyPrefix)) removeFrameState(key);
  }

  trustedMultiviewTabs.delete(tabId);
  removeChatLoginSyncStateForTab(tabId);
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

const isChatLoginBridgeStatus = (
  value: unknown,
): value is ChatLoginBridgeStatus =>
  typeof value === "string" &&
  CHAT_LOGIN_STATUSES.has(value as ChatLoginBridgeStatus);

const getStoredChatLoginStatus = async () => {
  const status = await getStorageValue(CHAT_LOGIN_STATUS_STORAGE_KEY);
  return isChatLoginBridgeStatus(status) ? status : null;
};

const setStoredChatLoginStatus = (status: ChatLoginBridgeStatus) =>
  setStorageValue(CHAT_LOGIN_STATUS_STORAGE_KEY, status);

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
          removeFrameState(getFrameKey(tabId, frameId));
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

const requestFrameRegistrationFromTab = (tabId: number) =>
  new Promise<void>((resolve) => {
    const chromeApi = getChromeApi();
    if (!chromeApi?.tabs?.sendMessage) {
      resolve();
      return;
    }

    try {
      chromeApi.tabs.sendMessage(
        tabId,
        {
          kind: INTERNAL_REQUEST_FRAME_REGISTRATION,
        },
        {},
        () => {
          void getChromeApi()?.runtime.lastError;
          resolve();
        },
      );
    } catch {
      resolve();
    }
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
  let requestedRegistration = false;

  while (Date.now() - startedAt <= FRAME_REGISTRATION_WAIT_MS) {
    pruneStaleFrames();

    const targetsByChannel = buildLiveFrameTargetMap(tabId, channelIds);
    if (channelIds.every((channelId) => targetsByChannel.has(channelId))) {
      return targetsByChannel;
    }

    if (!requestedRegistration) {
      requestedRegistration = true;
      await requestFrameRegistrationFromTab(tabId);
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

const isTrustedMultiviewTab = (tabId: number, topLevelUrl?: string) => {
  if (typeof topLevelUrl === "string") {
    if (isAllowedOtwBridgeMultiviewUrl(topLevelUrl)) return true;
    trustedMultiviewTabs.delete(tabId);
    removeChatLoginSyncStateForTab(tabId);
    return false;
  }

  const trustedTab = trustedMultiviewTabs.get(tabId);
  if (!trustedTab) return false;

  if (Date.now() - trustedTab.lastSeenAt > STALE_FRAME_TTL_MS) {
    trustedMultiviewTabs.delete(tabId);
    return false;
  }

  return isAllowedOtwBridgeMultiviewUrl(trustedTab.url);
};

const isTrustedFrameReferrer = (referrer?: string) =>
  isAllowedOtwBridgeMultiviewUrl(referrer) ||
  isAllowedOtwBridgeSiteUrl(referrer);

const scheduleFrameOptimizationRetries = (frame: RegisteredChzzkFrame) => {
  const key = getFrameKey(frame.tabId, frame.frameId);
  const signature = getFrameSignature(frame);

  if (scheduledFrameOptimizationSignatures.get(key) === signature) return;
  scheduledFrameOptimizationSignatures.set(key, signature);

  AUTO_FRAME_OPTIMIZATION_RETRY_DELAYS_MS.forEach((delayMs, index) => {
    setTimeout(() => {
      const currentFrame = frames.get(key);
      const isFinalAttempt =
        index === AUTO_FRAME_OPTIMIZATION_RETRY_DELAYS_MS.length - 1;

      if (!currentFrame || getFrameSignature(currentFrame) !== signature) {
        return;
      }

      if (hasOptimizedFrameSignature(currentFrame)) {
        scheduledFrameOptimizationSignatures.delete(key);
        return;
      }

      void getPlayerOptimizationEnabled().then((enabled) => {
        if (!enabled) {
          if (isFinalAttempt) {
            scheduledFrameOptimizationSignatures.delete(key);
          }
          return;
        }

        void optimizeFrameOnce(currentFrame).then((result) => {
          if (isSuccessfulWideModeResult(result)) {
            scheduledFrameOptimizationSignatures.delete(key);
            return;
          }
          if (isFinalAttempt) {
            scheduledFrameOptimizationSignatures.delete(key);
          }
        });
      });
    }, delayMs);
  });
};

const runWideModeForRegisteredFrame = (
  frame: RegisteredChzzkFrame,
  topLevelUrl?: string,
) => {
  if (frame.kind !== "live") return;
  if (
    !isTrustedMultiviewTab(frame.tabId, topLevelUrl) &&
    !isTrustedFrameReferrer(frame.referrer)
  ) {
    return;
  }

  void getPlayerOptimizationEnabled().then((enabled) => {
    if (!enabled) return;
    scheduleFrameOptimizationRetries(frame);
  });
};

const registerMultiviewTab = (sender: ChromeMessageSender) => {
  const tabId = sender.tab?.id;
  const url = sender.url ?? sender.tab?.url;

  if (
    typeof tabId !== "number" ||
    typeof url !== "string" ||
    !isAllowedOtwBridgeMultiviewUrl(url)
  ) {
    return;
  }

  trustedMultiviewTabs.set(tabId, {
    lastSeenAt: Date.now(),
    url,
  });

  void requestFrameRegistrationFromTab(tabId);

  for (const frame of frames.values()) {
    if (frame.tabId === tabId) {
      runWideModeForRegisteredFrame(frame, url);
    }
  }
};

const getOtwBridgeTabQueryUrls = () => {
  const matches = getChromeApi()
    ?.runtime.getManifest?.()
    ?.content_scripts?.filter((script) =>
      script.js?.some((file) => file === OTW_BRIDGE_SCRIPT_FILE),
    )
    .flatMap((script) => script.matches ?? [])
    .filter((match): match is string => typeof match === "string");

  return [
    ...new Set(matches?.length ? matches : FALLBACK_OTW_BRIDGE_TAB_QUERY_URLS),
  ];
};

const matchesChromeHostPattern = (url: URL, pattern: string) => {
  const patternMatch = /^(https?|\*):\/\/([^/]+)\/\*$/u.exec(pattern);
  if (!patternMatch) return false;

  const [, scheme, host] = patternMatch;
  if (scheme !== "*" && `${scheme}:` !== url.protocol) return false;

  if (host === "*") return true;
  if (host.startsWith("*.")) {
    const baseHost = host.slice(2);
    return url.hostname === baseHost || url.hostname.endsWith(`.${baseHost}`);
  }

  return url.hostname === host;
};

const isAllowedByOtwBridgeManifest = (urlString?: string) => {
  if (!urlString) return false;

  try {
    const url = new URL(urlString);
    return getOtwBridgeTabQueryUrls().some((pattern) =>
      matchesChromeHostPattern(url, pattern),
    );
  } catch {
    return false;
  }
};

const isAllowedOtwBridgeSiteUrl = (urlString?: string) =>
  isAllowedOtwSiteUrl(urlString) && isAllowedByOtwBridgeManifest(urlString);

const isAllowedOtwBridgeMultiviewUrl = (urlString?: string) =>
  isAllowedOtwMultiviewUrl(urlString) &&
  isAllowedByOtwBridgeManifest(urlString);

const injectOtwBridgeIntoOpenTabs = () => {
  const chromeApi = getChromeApi();
  const query = chromeApi?.tabs?.query;

  if (!query) return;

  const injectedTabIds = new Set<number>();

  getOtwBridgeTabQueryUrls().forEach((urlPattern) => {
    try {
      query({ url: urlPattern }, (tabs) => {
        tabs.forEach((tab) => {
          if (typeof tab.id !== "number" || injectedTabIds.has(tab.id)) {
            return;
          }

          injectedTabIds.add(tab.id);
          injectOtwBridgeIntoTab(tab.id, tab.url);
        });
      });
    } catch {
      // Query can fail for host patterns that are unavailable in this build.
    }
  });
};

const injectOtwBridgeIntoTab = (tabId?: number, url?: string) => {
  const executeScript = getChromeApi()?.scripting?.executeScript;

  if (typeof tabId !== "number" || !executeScript) return;
  if (typeof url !== "string" || !isAllowedOtwBridgeMultiviewUrl(url)) return;

  try {
    const result = executeScript({
      files: [OTW_BRIDGE_SCRIPT_FILE],
      target: {
        allFrames: false,
        tabId,
      },
    });

    if (result instanceof Promise) {
      result.catch(() => undefined);
    }
  } catch {
    // The tab may have navigated or the host may not be available.
  }
};

const injectOtwBridgeIntoActiveTab = () => {
  const query = getChromeApi()?.tabs?.query;
  if (!query) return;

  try {
    query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      injectOtwBridgeIntoTab(tab?.id, tab?.url);
    });
  } catch {
    // Active tab access can be unavailable if the popup was not user-opened.
  }
};

const injectOtwBridgeIntoTabAfterLookup = (tabId: number) => {
  const getTab = getChromeApi()?.tabs?.get;
  if (!getTab) return;

  try {
    getTab(tabId, (tab) => {
      injectOtwBridgeIntoTab(tab.id ?? tabId, tab.url);
    });
  } catch {
    // Tab lookup can fail while Chrome is switching tabs.
  }
};

const maybeInjectOtwBridgeIntoUpdatedTab = (
  tabId: number,
  changeInfo: { status?: string; url?: string },
  tab: { id?: number; url?: string },
) => {
  const url = changeInfo.url ?? tab.url;
  const resolvedTabId = tab.id ?? tabId;
  if (typeof url === "string" && !isAllowedOtwBridgeMultiviewUrl(url)) {
    removeFrameStateForTab(resolvedTabId);
    return;
  }

  if (changeInfo.status && changeInfo.status !== "complete") return;
  injectOtwBridgeIntoTab(resolvedTabId, url);
};

const getMostRecentTrustedMultiviewUrl = () =>
  [...trustedMultiviewTabs.values()]
    .filter((tab) => Date.now() - tab.lastSeenAt <= STALE_FRAME_TTL_MS)
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
    .find((tab) => isAllowedOtwBridgeMultiviewUrl(tab.url))?.url;

const getChatLoginFallbackTopLevelSite = ({
  referrer,
  tabId,
  url,
}: {
  referrer?: string;
  tabId?: number;
  url?: string;
}) => {
  const candidates = [
    url,
    typeof tabId === "number" ? trustedMultiviewTabs.get(tabId)?.url : undefined,
    referrer,
    getMostRecentTrustedMultiviewUrl(),
  ];

  for (const candidate of candidates) {
    if (!isAllowedOtwBridgeMultiviewUrl(candidate)) continue;
    const topLevelSite = getOtwTopLevelSite(candidate);
    if (topLevelSite) return topLevelSite;
  }

  return null;
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

const ensureChatLoginCookiePermission = async (promptForPermission: boolean) => {
  if (await hasChatLoginCookiePermission()) {
    return true;
  }

  if (!promptForPermission) return false;

  const granted = await requestChatLoginCookiePermission();
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

  const partitionKeys = await getChatFramePartitionKeys({
    chromeApi,
    fallbackTopLevelSite: input.topLevelSite,
    frames: [...frames.values()],
    tabId: input.tabId,
  });

  return syncNaverLoginCookiesToPartitions({ chromeApi, partitionKeys });
};

const syncChatLoginCookiesWithCooldown = async (
  input: Parameters<typeof syncChatLoginCookies>[0],
  options: { force?: boolean } = {},
) => {
  const now = Date.now();
  const scopeKey = `${input.tabId ?? "all"}:${input.topLevelSite ?? "unknown"}`;
  const cached = lastChatLoginSyncByScope.get(scopeKey);

  if (!options.force && cached) {
    if (now - cached.lastSyncedAt < CHAT_LOGIN_SYNC_COOLDOWN_MS) {
      return cached.status;
    }
  }

  const inFlight = chatLoginSyncInFlightByScope.get(scopeKey);
  if (inFlight) return inFlight;

  const promise = syncChatLoginCookies(input)
    .then((status) => {
      lastChatLoginSyncByScope.set(scopeKey, {
        lastSyncedAt: Date.now(),
        status,
      });
      return status;
    })
    .finally(() => {
      chatLoginSyncInFlightByScope.delete(scopeKey);
    });

  chatLoginSyncInFlightByScope.set(scopeKey, promise);
  return promise;
};

const notifyChatLoginSyncedFrame = (
  frame: RegisteredChzzkFrame,
  status: ChatLoginBridgeStatus,
) => {
  if (status !== "enabled") return;

  const key = getFrameKey(frame.tabId, frame.frameId);
  const signature = getFrameSignature(frame);
  if (chatLoginReloadedFrameSignatures.get(key) === signature) return;
  chatLoginReloadedFrameSignatures.set(key, signature);

  const chromeApi = getChromeApi();
  if (!chromeApi?.tabs?.sendMessage) return;

  chromeApi.tabs.sendMessage(
    frame.tabId,
    {
      kind: INTERNAL_CHAT_LOGIN_SYNCED,
      status,
      syncId: `${Date.now()}:${signature}`,
    },
    { frameId: frame.frameId },
    () => {
      const error = getChromeApi()?.runtime.lastError?.message;
      if (error && chatLoginReloadedFrameSignatures.get(key) === signature) {
        chatLoginReloadedFrameSignatures.delete(key);
      }
    },
  );
};

const notifyChatLoginSyncedFrames = (
  tabId: number | undefined,
  status: ChatLoginBridgeStatus,
) => {
  if (status !== "enabled") return;

  for (const frame of frames.values()) {
    if (frame.kind !== "chat") continue;
    if (typeof tabId === "number" && frame.tabId !== tabId) continue;
    if (
      !isTrustedMultiviewTab(frame.tabId) &&
      !isTrustedFrameReferrer(frame.referrer)
    ) {
      continue;
    }

    notifyChatLoginSyncedFrame(frame, status);
  }
};

const enableChatLoginBridge = async (
  input: Parameters<typeof syncChatLoginCookies>[0],
) => {
  await setStorageValue(CHAT_LOGIN_STORAGE_KEY, true);
  chatLoginReloadedFrameSignatures.clear();

  const status = await syncChatLoginCookiesWithCooldown(input, { force: true });
  await setStoredChatLoginStatus(status);
  pendingUserRequestedChatLoginSync = status !== "enabled";
  notifyChatLoginSyncedFrames(input.tabId, status);

  return status;
};

const disableChatLoginCookies = async () => {
  pendingUserRequestedChatLoginSync = false;
  chatLoginReloadedFrameSignatures.clear();
  lastChatLoginSyncByScope.clear();
  await setStoredChatLoginStatus("disabled");
  return "disabled" satisfies ChatLoginBridgeStatus;
};

const runChatLoginSyncForRegisteredFrame = (
  frame: RegisteredChzzkFrame,
  sender: ChromeMessageSender,
) => {
  if (frame.kind !== "chat") return;
  if (
    !isTrustedMultiviewTab(frame.tabId, sender.tab?.url) &&
    !isTrustedFrameReferrer(frame.referrer)
  ) {
    return;
  }

  const tabId = sender.tab?.id;
  void getChatLoginBridgeEnabled().then((enabled) => {
    if (!enabled) return;

    void syncChatLoginCookiesWithCooldown(
      {
        promptForPermission: false,
        tabId,
        topLevelSite: getChatLoginFallbackTopLevelSite({
          referrer:
            typeof frame.referrer === "string" ? frame.referrer : undefined,
          tabId,
          url: sender.tab?.url,
        }),
      },
      { force: pendingUserRequestedChatLoginSync },
    ).then((status) => {
      if (pendingUserRequestedChatLoginSync) {
        pendingUserRequestedChatLoginSync = status !== "enabled";
      }
      void setStoredChatLoginStatus(status);
      notifyChatLoginSyncedFrame(frame, status);
    });
  });
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
  if (!(await getChatLoginBridgeEnabled())) return "disabled";
  if (!(await hasChatLoginCookiePermission())) return "permission_missing";

  const storedStatus = await getStoredChatLoginStatus();
  if (
    storedStatus &&
    storedStatus !== "disabled" &&
    !CHAT_LOGIN_TRANSIENT_FAILURE_STATUSES.has(storedStatus)
  ) {
    return storedStatus;
  }

  return "enabled";
};

const buildChatLoginCapabilityPayload = async () => {
  const chatLoginBridgeEnabled = await getChatLoginBridgeEnabled();
  const chatLoginLastSyncStatus = await getStoredChatLoginStatus();

  return {
    chatLoginBridgeEnabled,
    chatLoginBridgeStatus: await getChatLoginStatus(),
    chatLoginLastSyncStatus,
  };
};

const buildCapabilitiesPayload = async () => ({
  capabilities: EXTENSION_CAPABILITIES,
  ...(await buildChatLoginCapabilityPayload()),
  playerOptimizationEnabled: await getPlayerOptimizationEnabled(),
});

const handleWebAppMessage = async (
  message: unknown,
  sender: ChromeMessageSender,
) => {
  if (!isWebAppRequestMessage(message)) {
    return createExtensionMessage("ERROR", { reason: "invalid_sender" });
  }

  if (!isAllowedOtwBridgeMultiviewUrl(sender.url)) {
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
      return createExtensionMessage(
        "CAPABILITIES",
        await buildCapabilitiesPayload(),
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

      const status = enabled
        ? await enableChatLoginBridge({
              promptForPermission: true,
              tabId,
              topLevelSite: getChatLoginFallbackTopLevelSite({
                tabId,
                url: sender.url ?? sender.tab?.url,
              }),
            })
        : await disableChatLoginCookies();

      if (!enabled) await setStorageValue(CHAT_LOGIN_STORAGE_KEY, false);

      return createExtensionMessage(
        "CHAT_LOGIN_STATUS",
        {
          chatLoginBridgeEnabled: enabled,
          chatLoginLastSyncStatus: status,
          status,
        },
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

const handleChatLoginSettingChanged = async (
  message: Record<string, unknown>,
  sender: ChromeMessageSender,
) => {
  const enabled = message.enabled === true;
  const tabId = sender.tab?.id;

  return enabled
    ? enableChatLoginBridge({
          promptForPermission: false,
          tabId,
          topLevelSite: getChatLoginFallbackTopLevelSite({
            tabId,
            url: sender.url ?? sender.tab?.url,
          }),
        })
    : disableChatLoginCookies().then(async (status) => {
        await setStorageValue(CHAT_LOGIN_STORAGE_KEY, false);
        return status;
      });
};

getChromeApi()?.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isPlainObject(message) || typeof message.kind !== "string") return false;

  if (message.kind === INTERNAL_INJECT_BRIDGE_ACTIVE_TAB) {
    injectOtwBridgeIntoActiveTab();
    sendResponse({ ok: true });
    return false;
  }

  if (message.kind === INTERNAL_MULTIVIEW_PAGE_READY) {
    registerMultiviewTab(sender);
    sendResponse({ ok: true });
    return false;
  }

  if (message.kind === INTERNAL_CHAT_LOGIN_SETTING_CHANGED) {
    handleChatLoginSettingChanged(message, sender)
      .then((status) => sendResponse({ ok: true, status }))
      .catch(() => sendResponse({ ok: false, status: "error" }));
    return true;
  }

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
        referrer:
          typeof frame.referrer === "string" ? frame.referrer : undefined,
        tabId,
        url: frame.url,
      });

      runWideModeForRegisteredFrame(
        {
          channelId: frame.channelId,
          frameId,
          kind: frame.kind,
          lastSeenAt: Date.now(),
          referrer:
            typeof frame.referrer === "string" ? frame.referrer : undefined,
          tabId,
          url: frame.url,
        },
        sender.tab?.url,
      );

      runChatLoginSyncForRegisteredFrame(
        {
          channelId: frame.channelId,
          frameId,
          kind: frame.kind,
          lastSeenAt: Date.now(),
          referrer:
            typeof frame.referrer === "string" ? frame.referrer : undefined,
          tabId,
          url: frame.url,
        },
        sender,
      );
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

injectOtwBridgeIntoOpenTabs();
getChromeApi()?.runtime.onInstalled?.addListener(injectOtwBridgeIntoOpenTabs);
getChromeApi()?.runtime.onStartup?.addListener(injectOtwBridgeIntoOpenTabs);
getChromeApi()?.tabs?.onActivated?.addListener(({ tabId }) => {
  injectOtwBridgeIntoTabAfterLookup(tabId);
});
getChromeApi()?.tabs?.onRemoved?.addListener(removeFrameStateForTab);
getChromeApi()?.tabs?.onUpdated?.addListener(maybeInjectOtwBridgeIntoUpdatedTab);
