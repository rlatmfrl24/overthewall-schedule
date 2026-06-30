import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChromeApi, ChromeMessageSender } from "./chrome-api";

const CHANNEL_ID = "00000000000000000000000000000001";
const FRAME_READY_KIND = "OTW_EXTENSION_FRAME_READY";
const FRAME_REGISTRATION_REQUEST_KIND =
  "OTW_EXTENSION_REQUEST_FRAME_REGISTRATION";
const RUN_WIDE_MODE_KIND = "OTW_EXTENSION_RUN_WIDE_MODE";
const PAGE_READY_KIND = "OTW_EXTENSION_MULTIVIEW_PAGE_READY";
const INJECT_BRIDGE_ACTIVE_TAB_KIND = "OTW_EXTENSION_INJECT_BRIDGE_ACTIVE_TAB";
const WEB_APP_MESSAGE_KIND = "OTW_EXTENSION_WEB_APP_MESSAGE";
const CHAT_LOGIN_SETTING_CHANGED_KIND =
  "OTW_EXTENSION_CHAT_LOGIN_SETTING_CHANGED";
const CHAT_LOGIN_SYNCED_KIND = "OTW_EXTENSION_CHAT_LOGIN_SYNCED";
const EXTENSION_PROTOCOL = "OTW_SCHEDULE_PLUS_EXTENSION/V1";
const CHAT_LOGIN_STORAGE_KEY = "otwSchedulePlusChatLoginBridgeEnabled";
const CHAT_LOGIN_STATUS_STORAGE_KEY = "otwSchedulePlusChatLoginBridgeStatus";
const PLAYER_OPTIMIZATION_STORAGE_KEY =
  "otw:schedule-plus:multiview:player-optimization-enabled";

type RuntimeMessageListener = (
  message: unknown,
  sender: ChromeMessageSender,
  sendResponse: (response?: unknown) => void,
) => boolean | void;
type TabsSendMessage = NonNullable<ChromeApi["tabs"]>["sendMessage"];
type TabsQuery = NonNullable<NonNullable<ChromeApi["tabs"]>["query"]>;
type TabsOnUpdatedListener = Parameters<
  NonNullable<NonNullable<ChromeApi["tabs"]>["onUpdated"]>["addListener"]
>[0];
type ScriptingExecuteScript = NonNullable<
  ChromeApi["scripting"]
>["executeScript"];
type ChromeApiOverrides = Partial<Omit<ChromeApi, "runtime" | "tabs">> & {
  runtime?: Partial<ChromeApi["runtime"]>;
  tabs?: Partial<NonNullable<ChromeApi["tabs"]>>;
};

const flushMicrotasks = async () => {
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
  }
};

const getRunWideModeCalls = (sendMessage: ReturnType<typeof vi.fn>) =>
  sendMessage.mock.calls.filter(([, message]) => {
    return (
      typeof message === "object" &&
      message !== null &&
      "kind" in message &&
      message.kind === RUN_WIDE_MODE_KIND
    );
  });

const getFrameRegistrationRequestCalls = (
  sendMessage: ReturnType<typeof vi.fn>,
) =>
  sendMessage.mock.calls.filter(([, message]) => {
    return (
      typeof message === "object" &&
      message !== null &&
      "kind" in message &&
      message.kind === FRAME_REGISTRATION_REQUEST_KIND
    );
  });

const makeNaverLoginCookie = (name: string) => ({
  domain: ".naver.com",
  expirationDate: 4_102_444_800,
  hostOnly: false,
  httpOnly: true,
  name,
  path: "/",
  secure: true,
  session: false,
  value: `${name}-value`,
});

const importBackgroundWithChrome = async (
  sendMessage: TabsSendMessage,
  overrides: ChromeApiOverrides = {},
) => {
  const runtimeMessageListeners: RuntimeMessageListener[] = [];
  const { runtime: runtimeOverrides, tabs: tabsOverrides, ...otherOverrides } =
    overrides;

  globalThis.chrome = {
    runtime: {
      id: "test-extension",
      getManifest: vi.fn(() => ({
        content_scripts: [
          {
            js: ["otw-bridge.js"],
            matches: [
              "https://otw-schedule.info/*",
              "http://localhost/*",
              "http://127.0.0.1/*",
            ],
          },
        ],
      })),
      onMessage: {
        addListener: vi.fn((listener: RuntimeMessageListener) => {
          runtimeMessageListeners.push(listener);
        }),
      },
      sendMessage: vi.fn(),
      ...runtimeOverrides,
    },
    storage: {
      local: {
        get: vi.fn((_key, callback) => callback({})),
        set: vi.fn((_items, callback) => callback?.()),
      },
    },
    tabs: {
      onRemoved: {
        addListener: vi.fn(),
      },
      sendMessage,
      ...tabsOverrides,
    },
    ...otherOverrides,
  };

  vi.resetModules();
  await import("./background");

  const runtimeMessageListener = runtimeMessageListeners[0];
  if (!runtimeMessageListener) {
    throw new Error("background listener was not registered");
  }

  return runtimeMessageListener;
};

describe("background player optimization", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    globalThis.chrome = undefined;
  });

  it("keeps retrying a registered live frame until player optimization succeeds", async () => {
    const sendMessage = vi
      .fn((...args: Parameters<TabsSendMessage>) => {
        const callback = args[3];
        callback({
          result:
            sendMessage.mock.calls.length === 1 ? "selector_missing" : "applied",
        });
      });
    const listener = await importBackgroundWithChrome(sendMessage);

    listener(
      {
        kind: FRAME_READY_KIND,
        frame: {
          channelId: CHANNEL_ID,
          kind: "live",
          url: `https://chzzk.naver.com/live/${CHANNEL_ID}`,
        },
      },
      {
        frameId: 7,
        tab: {
          id: 11,
          url: "http://localhost:5173/multiview",
        },
        url: `https://chzzk.naver.com/live/${CHANNEL_ID}`,
      },
      vi.fn(),
    );
    await flushMicrotasks();

    expect(sendMessage).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(600);
    expect(getRunWideModeCalls(sendMessage)).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1_200);
    expect(getRunWideModeCalls(sendMessage)).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(12_000);
    expect(getRunWideModeCalls(sendMessage)).toHaveLength(2);
  });

  it("allows player optimization to be scheduled again after all retries fail", async () => {
    const sendMessage = vi.fn((...args: Parameters<TabsSendMessage>) => {
      args[3]({ result: "selector_missing" });
    });
    const listener = await importBackgroundWithChrome(sendMessage);

    listener(
      {
        kind: FRAME_READY_KIND,
        frame: {
          channelId: CHANNEL_ID,
          kind: "live",
          url: `https://chzzk.naver.com/live/${CHANNEL_ID}`,
        },
      },
      {
        frameId: 7,
        tab: {
          id: 11,
          url: "http://localhost:5173/multiview",
        },
        url: `https://chzzk.naver.com/live/${CHANNEL_ID}`,
      },
      vi.fn(),
    );
    await flushMicrotasks();

    await vi.advanceTimersByTimeAsync(12_000);
    expect(getRunWideModeCalls(sendMessage)).toHaveLength(5);

    listener(
      {
        kind: PAGE_READY_KIND,
      },
      {
        tab: {
          id: 11,
        },
        url: "http://localhost:5173/multiview",
      },
      vi.fn(),
    );
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(600);

    expect(getRunWideModeCalls(sendMessage)).toHaveLength(6);
  });

  it("re-discovers existing CHZZK frames after the service worker loses frame state", async () => {
    const listenerRef: { current?: RuntimeMessageListener } = {};
    const sendMessage = vi.fn((...args: Parameters<TabsSendMessage>) => {
      const [tabId, message, , callback] = args;

      if (
        typeof message === "object" &&
        message !== null &&
        "kind" in message &&
        message.kind === FRAME_REGISTRATION_REQUEST_KIND
      ) {
        callback({ ok: true });
        listenerRef.current?.(
          {
            kind: FRAME_READY_KIND,
            frame: {
              channelId: CHANNEL_ID,
              kind: "live",
              referrer: "http://localhost:5173/multiview",
              url: `https://chzzk.naver.com/live/${CHANNEL_ID}`,
            },
          },
          {
            frameId: 7,
            tab: {
              id: tabId,
              url: "http://localhost:5173/multiview",
            },
            url: `https://chzzk.naver.com/live/${CHANNEL_ID}`,
          },
          vi.fn(),
        );
        return;
      }

      callback({ result: "applied" });
    });
    listenerRef.current = await importBackgroundWithChrome(sendMessage);
    const sendResponse = vi.fn();

    listenerRef.current(
      {
        kind: WEB_APP_MESSAGE_KIND,
        message: {
          namespace: EXTENSION_PROTOCOL,
          version: 1,
          direction: "web-to-extension",
          type: "REQUEST_WIDE_MODE",
          requestId: "wide-1",
          payload: {
            channelIds: [CHANNEL_ID],
          },
        },
      },
      {
        tab: {
          id: 11,
        },
        url: "http://localhost:5173/multiview",
      },
      sendResponse,
    );
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(250);
    await flushMicrotasks();

    expect(getFrameRegistrationRequestCalls(sendMessage)).toHaveLength(1);
    expect(getRunWideModeCalls(sendMessage)).toHaveLength(1);
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          statuses: {
            [CHANNEL_ID]: "applied",
          },
        }),
        requestId: "wide-1",
        type: "TILE_STATUS",
      }),
    );
  });

  it("rechecks a previously optimized frame after the optimization TTL expires", async () => {
    const sendMessage = vi.fn((...args: Parameters<TabsSendMessage>) => {
      args[3]({ result: "already_applied" });
    });
    const listener = await importBackgroundWithChrome(sendMessage);
    const frameMessage = {
      kind: FRAME_READY_KIND,
      frame: {
        channelId: CHANNEL_ID,
        kind: "live",
        url: `https://chzzk.naver.com/live/${CHANNEL_ID}`,
      },
    };
    const sender = {
      frameId: 7,
      tab: {
        id: 11,
        url: "http://localhost:5173/multiview",
      },
      url: `https://chzzk.naver.com/live/${CHANNEL_ID}`,
    };

    listener(frameMessage, sender, vi.fn());
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(600);
    expect(getRunWideModeCalls(sendMessage)).toHaveLength(1);

    listener(frameMessage, sender, vi.fn());
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(600);
    expect(getRunWideModeCalls(sendMessage)).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(45_000);
    listener(frameMessage, sender, vi.fn());
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(600);

    expect(getRunWideModeCalls(sendMessage)).toHaveLength(2);
  });

  it("uses the OTW bridge registration when frame messages omit the top-level tab URL", async () => {
    const sendMessage = vi
      .fn((...args: Parameters<TabsSendMessage>) => {
        args[3]({ result: "applied" });
      });
    const listener = await importBackgroundWithChrome(sendMessage);

    listener(
      {
        kind: FRAME_READY_KIND,
        frame: {
          channelId: CHANNEL_ID,
          kind: "live",
          url: `https://chzzk.naver.com/live/${CHANNEL_ID}`,
        },
      },
      {
        frameId: 7,
        tab: {
          id: 11,
        },
        url: `https://chzzk.naver.com/live/${CHANNEL_ID}`,
      },
      vi.fn(),
    );
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(600);
    expect(sendMessage).not.toHaveBeenCalled();

    listener(
      {
        kind: PAGE_READY_KIND,
      },
      {
        tab: {
          id: 11,
        },
        url: "http://localhost:5173/multiview",
      },
      vi.fn(),
    );
    await flushMicrotasks();

    await vi.advanceTimersByTimeAsync(600);
    expect(getRunWideModeCalls(sendMessage)).toHaveLength(1);
  });

  it("clears trusted multiview tab state when the tab navigates away", async () => {
    const updatedListeners: TabsOnUpdatedListener[] = [];
    const sendMessage = vi.fn((...args: Parameters<TabsSendMessage>) => {
      args[3]({ result: "applied" });
    });
    const listener = await importBackgroundWithChrome(sendMessage, {
      tabs: {
        onUpdated: {
          addListener: vi.fn((updatedListener: TabsOnUpdatedListener) => {
            updatedListeners.push(updatedListener);
          }),
        },
        sendMessage,
      },
    });

    listener(
      {
        kind: PAGE_READY_KIND,
      },
      {
        tab: {
          id: 11,
        },
        url: "http://localhost:5173/multiview",
      },
      vi.fn(),
    );
    await flushMicrotasks();

    updatedListeners[0]?.(
      11,
      { url: "https://example.com/" },
      { id: 11, url: "https://example.com/" },
    );

    listener(
      {
        kind: FRAME_READY_KIND,
        frame: {
          channelId: CHANNEL_ID,
          kind: "live",
          url: `https://chzzk.naver.com/live/${CHANNEL_ID}`,
        },
      },
      {
        frameId: 7,
        tab: {
          id: 11,
        },
        url: `https://chzzk.naver.com/live/${CHANNEL_ID}`,
      },
      vi.fn(),
    );
    await flushMicrotasks();

    await vi.advanceTimersByTimeAsync(600);
    expect(getRunWideModeCalls(sendMessage)).toHaveLength(0);
  });

  it("trusts an OTW site referrer when a CHZZK frame registers before the page bridge", async () => {
    const sendMessage = vi
      .fn((...args: Parameters<TabsSendMessage>) => {
        args[3]({ result: "applied" });
      });
    const listener = await importBackgroundWithChrome(sendMessage);

    listener(
      {
        kind: FRAME_READY_KIND,
        frame: {
          channelId: CHANNEL_ID,
          kind: "live",
          referrer: "http://localhost:5173/",
          url: `https://chzzk.naver.com/live/${CHANNEL_ID}`,
        },
      },
      {
        frameId: 7,
        tab: {
          id: 11,
        },
        url: `https://chzzk.naver.com/live/${CHANNEL_ID}`,
      },
      vi.fn(),
    );
    await flushMicrotasks();

    await vi.advanceTimersByTimeAsync(600);
    expect(getRunWideModeCalls(sendMessage)).toHaveLength(1);
  });

  it("does not trust localhost referrers in a store manifest without localhost matches", async () => {
    const sendMessage = vi.fn((...args: Parameters<TabsSendMessage>) => {
      args[3]({ result: "applied" });
    });
    const listener = await importBackgroundWithChrome(sendMessage, {
      runtime: {
        getManifest: vi.fn(() => ({
          content_scripts: [
            {
              js: ["otw-bridge.js"],
              matches: ["https://otw-schedule.info/*"],
            },
          ],
        })),
      },
    });

    listener(
      {
        kind: FRAME_READY_KIND,
        frame: {
          channelId: CHANNEL_ID,
          kind: "live",
          referrer: "http://localhost:5173/",
          url: `https://chzzk.naver.com/live/${CHANNEL_ID}`,
        },
      },
      {
        frameId: 7,
        tab: {
          id: 11,
        },
        url: `https://chzzk.naver.com/live/${CHANNEL_ID}`,
      },
      vi.fn(),
    );
    await flushMicrotasks();

    await vi.advanceTimersByTimeAsync(600);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("injects the OTW bridge into already open production multiview tabs on startup", async () => {
    const sendMessage = vi
      .fn((...args: Parameters<TabsSendMessage>) => {
        args[3]({ result: "applied" });
      });
    const query = vi.fn((...args: Parameters<TabsQuery>) => {
      const queryInfo = args[0];
      const callback = args[1];
      callback(
        queryInfo.url === "https://otw-schedule.info/*"
          ? [
              { id: 11, url: "https://otw-schedule.info/multiview" },
              { id: 12, url: "https://otw-schedule.info/" },
            ]
          : [],
      );
    });
    const executeScript = vi.fn(() => undefined);

    await importBackgroundWithChrome(sendMessage, {
      runtime: {
        getManifest: vi.fn(() => ({
          content_scripts: [
            {
              js: ["otw-bridge.js"],
              matches: ["https://otw-schedule.info/*"],
            },
          ],
        })),
      },
      scripting: {
        executeScript: executeScript as ScriptingExecuteScript,
      },
      tabs: {
        onRemoved: {
          addListener: vi.fn(),
        },
        query,
        sendMessage,
      },
    });

    expect(query).toHaveBeenCalledWith(
      { url: "https://otw-schedule.info/*" },
      expect.any(Function),
    );
    expect(query).toHaveBeenCalledTimes(1);
    expect(executeScript).toHaveBeenCalledTimes(1);
    expect(executeScript).toHaveBeenCalledWith({
      files: ["otw-bridge.js"],
      target: {
        allFrames: false,
        tabId: 11,
      },
    });
  });

  it("includes localhost bridge injection only when the development manifest declares it", async () => {
    const sendMessage = vi.fn((...args: Parameters<TabsSendMessage>) => {
      args[3]({ result: "applied" });
    });
    const query = vi.fn((...args: Parameters<TabsQuery>) => {
      const queryInfo = args[0];
      const callback = args[1];
      callback(
        queryInfo.url === "http://localhost/*"
          ? [{ id: 21, url: "http://localhost:5173/multiview" }]
          : [],
      );
    });
    const executeScript = vi.fn(() => undefined);

    await importBackgroundWithChrome(sendMessage, {
      runtime: {
        getManifest: vi.fn(() => ({
          content_scripts: [
            {
              js: ["otw-bridge.js"],
              matches: [
                "https://otw-schedule.info/*",
                "http://localhost/*",
                "http://127.0.0.1/*",
              ],
            },
          ],
        })),
      },
      scripting: {
        executeScript: executeScript as ScriptingExecuteScript,
      },
      tabs: {
        query,
      },
    });

    expect(query).toHaveBeenCalledWith(
      { url: "https://otw-schedule.info/*" },
      expect.any(Function),
    );
    expect(query).toHaveBeenCalledWith(
      { url: "http://localhost/*" },
      expect.any(Function),
    );
    expect(query).toHaveBeenCalledWith(
      { url: "http://127.0.0.1/*" },
      expect.any(Function),
    );
    expect(executeScript).toHaveBeenCalledWith({
      files: ["otw-bridge.js"],
      target: {
        allFrames: false,
        tabId: 21,
      },
    });
  });

  it("injects the OTW bridge into the active tab when the popup requests it", async () => {
    const sendMessage = vi
      .fn((...args: Parameters<TabsSendMessage>) => {
        args[3]({ result: "applied" });
      });
    const query = vi.fn((...args: Parameters<TabsQuery>) => {
      args[1]([{ id: 21, url: "https://otw-schedule.info/multiview" }]);
    });
    const executeScript = vi.fn(() => undefined);
    const listener = await importBackgroundWithChrome(sendMessage, {
      scripting: {
        executeScript: executeScript as ScriptingExecuteScript,
      },
      tabs: {
        onRemoved: {
          addListener: vi.fn(),
        },
        query,
        sendMessage,
      },
    });

    listener(
      {
        kind: INJECT_BRIDGE_ACTIVE_TAB_KIND,
      },
      {},
      vi.fn(),
    );

    expect(query).toHaveBeenLastCalledWith(
      { active: true, currentWindow: true },
      expect.any(Function),
    );
    expect(executeScript).toHaveBeenCalledWith({
      files: ["otw-bridge.js"],
      target: {
        allFrames: false,
        tabId: 21,
      },
    });
  });

  it("does not rewrite login cookies during capability polling", async () => {
    const sendMessage = vi.fn((...args: Parameters<TabsSendMessage>) => {
      args[3]({ result: "applied" });
    });
    const cookiesSet = vi.fn((_details, callback) => {
      callback(makeNaverLoginCookie("NID_AUT"));
    });
    const listener = await importBackgroundWithChrome(sendMessage, {
      cookies: {
        get: vi.fn((details, callback) => {
          callback(makeNaverLoginCookie(details.name));
        }),
        getAll: vi.fn((_details, callback) => callback([])),
        remove: vi.fn((_details, callback) => callback()),
        set: cookiesSet,
      },
      storage: {
        local: {
          get: vi.fn((_keys, callback) =>
            callback({
              [CHAT_LOGIN_STORAGE_KEY]: true,
              [PLAYER_OPTIMIZATION_STORAGE_KEY]: true,
            }),
          ),
          set: vi.fn((_items, callback) => callback?.()),
        },
      },
    });
    const sendResponse = vi.fn();

    listener(
      {
        kind: WEB_APP_MESSAGE_KIND,
        message: {
          namespace: EXTENSION_PROTOCOL,
          version: 1,
          direction: "web-to-extension",
          type: "GET_CAPABILITIES",
          requestId: "capabilities-1",
        },
      },
      {
        tab: { id: 11 },
        url: "http://localhost:5173/multiview",
      },
      sendResponse,
    );
    await flushMicrotasks();

    expect(cookiesSet).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "CAPABILITIES",
        payload: expect.objectContaining({
          chatLoginBridgeEnabled: true,
          chatLoginBridgeStatus: "enabled",
          chatLoginLastSyncStatus: null,
        }),
      }),
    );
  });

  it("does not report a stale transient chat login failure as current capability state", async () => {
    const sendMessage = vi.fn((...args: Parameters<TabsSendMessage>) => {
      args[3]({ result: "applied" });
    });
    const listener = await importBackgroundWithChrome(sendMessage, {
      cookies: {
        get: vi.fn((details, callback) => {
          callback(makeNaverLoginCookie(details.name));
        }),
        getAll: vi.fn((_details, callback) => callback([])),
        remove: vi.fn((_details, callback) => callback()),
        set: vi.fn((_details, callback) => callback?.()),
      },
      storage: {
        local: {
          get: vi.fn((_keys, callback) =>
            callback({
              [CHAT_LOGIN_STORAGE_KEY]: true,
              [CHAT_LOGIN_STATUS_STORAGE_KEY]: "unsupported",
              [PLAYER_OPTIMIZATION_STORAGE_KEY]: true,
            }),
          ),
          set: vi.fn((_items, callback) => callback?.()),
        },
      },
    });
    const sendResponse = vi.fn();

    listener(
      {
        kind: WEB_APP_MESSAGE_KIND,
        message: {
          namespace: EXTENSION_PROTOCOL,
          version: 1,
          direction: "web-to-extension",
          type: "GET_CAPABILITIES",
          requestId: "capabilities-1",
        },
      },
      {
        tab: { id: 11 },
        url: "http://localhost:5173/multiview",
      },
      sendResponse,
    );
    await flushMicrotasks();

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "CAPABILITIES",
        payload: expect.objectContaining({
          chatLoginBridgeEnabled: true,
          chatLoginBridgeStatus: "enabled",
          chatLoginLastSyncStatus: "unsupported",
        }),
      }),
    );
  });

  it("syncs login cookies once when an enabled chat frame registers", async () => {
    const sendMessage = vi.fn((...args: Parameters<TabsSendMessage>) => {
      args[3]({ result: "applied" });
    });
    const cookiesSet = vi.fn((details, callback) => {
      callback(makeNaverLoginCookie(details.name));
    });
    const listener = await importBackgroundWithChrome(sendMessage, {
      cookies: {
        get: vi.fn((details, callback) => {
          callback(makeNaverLoginCookie(details.name));
        }),
        getAll: vi.fn((_details, callback) => callback([])),
        getPartitionKey: vi.fn((_details, callback) => {
          callback?.({
            hasCrossSiteAncestor: true,
            topLevelSite: "http://localhost",
          });
        }),
        remove: vi.fn((_details, callback) => callback()),
        set: cookiesSet,
      },
      storage: {
        local: {
          get: vi.fn((_keys, callback) =>
            callback({
              [CHAT_LOGIN_STORAGE_KEY]: true,
              [PLAYER_OPTIMIZATION_STORAGE_KEY]: true,
            }),
          ),
          set: vi.fn((_items, callback) => callback?.()),
        },
      },
    });
    const frameMessage = {
      kind: FRAME_READY_KIND,
      frame: {
        channelId: CHANNEL_ID,
        kind: "chat",
        referrer: "http://localhost:5173/multiview",
        url: `https://chzzk.naver.com/live/${CHANNEL_ID}/chat`,
      },
    };
    const sender = {
      frameId: 8,
      tab: {
        id: 11,
        url: "http://localhost:5173/multiview",
      },
      url: `https://chzzk.naver.com/live/${CHANNEL_ID}/chat`,
    };

    listener(frameMessage, sender, vi.fn());
    await flushMicrotasks();
    await flushMicrotasks();
    expect(cookiesSet).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenCalledWith(
      11,
      {
        kind: CHAT_LOGIN_SYNCED_KIND,
        status: "enabled",
        syncId: expect.any(String),
      },
      { frameId: 8 },
      expect.any(Function),
    );

    listener(frameMessage, sender, vi.fn());
    await flushMicrotasks();
    expect(cookiesSet).toHaveBeenCalledTimes(2);
    expect(
      sendMessage.mock.calls.filter(
        ([, message]) =>
          typeof message === "object" &&
          message !== null &&
          "kind" in message &&
          message.kind === CHAT_LOGIN_SYNCED_KIND,
      ),
    ).toHaveLength(1);
  });

  it("forces one chat cookie sync when the popup enables chat login", async () => {
    let chatLoginEnabled = false;
    let chatLoginStatus = "disabled";
    const sendMessage = vi.fn((...args: Parameters<TabsSendMessage>) => {
      args[3]({ result: "applied" });
    });
    const cookiesSet = vi.fn((details, callback) => {
      callback(makeNaverLoginCookie(details.name));
    });
    const listener = await importBackgroundWithChrome(sendMessage, {
      cookies: {
        get: vi.fn((details, callback) => {
          callback(makeNaverLoginCookie(details.name));
        }),
        getAll: vi.fn((_details, callback) => callback([])),
        getPartitionKey: vi.fn((_details, callback) => {
          callback?.({
            hasCrossSiteAncestor: true,
            topLevelSite: "http://localhost",
          });
        }),
        remove: vi.fn((_details, callback) => callback()),
        set: cookiesSet,
      },
      storage: {
        local: {
          get: vi.fn((_keys, callback) =>
            callback({
              [CHAT_LOGIN_STORAGE_KEY]: chatLoginEnabled,
              [CHAT_LOGIN_STATUS_STORAGE_KEY]: chatLoginStatus,
              [PLAYER_OPTIMIZATION_STORAGE_KEY]: true,
            }),
          ),
          set: vi.fn((items, callback) => {
            if (typeof items[CHAT_LOGIN_STORAGE_KEY] === "boolean") {
              chatLoginEnabled = items[CHAT_LOGIN_STORAGE_KEY];
            }
            if (typeof items[CHAT_LOGIN_STATUS_STORAGE_KEY] === "string") {
              chatLoginStatus = items[CHAT_LOGIN_STATUS_STORAGE_KEY];
            }
            callback?.();
          }),
        },
      },
    });

    listener(
      {
        kind: FRAME_READY_KIND,
        frame: {
          channelId: CHANNEL_ID,
          kind: "chat",
          referrer: "http://localhost:5173/multiview",
          url: `https://chzzk.naver.com/live/${CHANNEL_ID}/chat`,
        },
      },
      {
        frameId: 8,
        tab: {
          id: 11,
          url: "http://localhost:5173/multiview",
        },
        url: `https://chzzk.naver.com/live/${CHANNEL_ID}/chat`,
      },
      vi.fn(),
    );
    await flushMicrotasks();
    expect(cookiesSet).not.toHaveBeenCalled();

    listener(
      {
        kind: CHAT_LOGIN_SETTING_CHANGED_KIND,
        enabled: true,
      },
      {
        tab: {
          id: 11,
          url: "http://localhost:5173/multiview",
        },
      },
      vi.fn(),
    );
    await flushMicrotasks();
    await flushMicrotasks();
    expect(cookiesSet).toHaveBeenCalledTimes(2);
    expect(chatLoginStatus).toBe("enabled");
    expect(sendMessage).toHaveBeenCalledWith(
      11,
      {
        kind: CHAT_LOGIN_SYNCED_KIND,
        status: "enabled",
        syncId: expect.any(String),
      },
      { frameId: 8 },
      expect.any(Function),
    );
  });

  it("does not reuse chat login sync cache across different multiview sites", async () => {
    const sendMessage = vi.fn((...args: Parameters<TabsSendMessage>) => {
      args[3]({ result: "applied" });
    });
    const cookiesSet = vi.fn((details, callback) => {
      callback(makeNaverLoginCookie(details.name));
    });
    const listener = await importBackgroundWithChrome(sendMessage, {
      cookies: {
        get: vi.fn((details, callback) => {
          callback(
            details.partitionKey ? undefined : makeNaverLoginCookie(details.name),
          );
        }),
        getAll: vi.fn((_details, callback) => callback([])),
        getPartitionKey: vi.fn((details, callback) => {
          callback?.({
            hasCrossSiteAncestor: true,
            topLevelSite:
              details.tabId === 12
                ? "https://otw-schedule.info"
                : "http://localhost",
          });
        }),
        remove: vi.fn((_details, callback) => callback()),
        set: cookiesSet,
      },
      storage: {
        local: {
          get: vi.fn((_keys, callback) =>
            callback({
              [CHAT_LOGIN_STORAGE_KEY]: true,
              [PLAYER_OPTIMIZATION_STORAGE_KEY]: true,
            }),
          ),
          set: vi.fn((_items, callback) => callback?.()),
        },
      },
    });

    listener(
      {
        kind: FRAME_READY_KIND,
        frame: {
          channelId: CHANNEL_ID,
          kind: "chat",
          referrer: "http://localhost:5173/multiview",
          url: `https://chzzk.naver.com/live/${CHANNEL_ID}/chat`,
        },
      },
      {
        frameId: 8,
        tab: {
          id: 11,
          url: "http://localhost:5173/multiview",
        },
        url: `https://chzzk.naver.com/live/${CHANNEL_ID}/chat`,
      },
      vi.fn(),
    );
    await flushMicrotasks();
    await flushMicrotasks();
    expect(cookiesSet).toHaveBeenCalledTimes(2);

    listener(
      {
        kind: FRAME_READY_KIND,
        frame: {
          channelId: CHANNEL_ID,
          kind: "chat",
          referrer: "https://otw-schedule.info/multiview",
          url: `https://chzzk.naver.com/live/${CHANNEL_ID}/chat`,
        },
      },
      {
        frameId: 8,
        tab: {
          id: 12,
          url: "https://otw-schedule.info/multiview",
        },
        url: `https://chzzk.naver.com/live/${CHANNEL_ID}/chat`,
      },
      vi.fn(),
    );
    await flushMicrotasks();
    await flushMicrotasks();
    expect(cookiesSet).toHaveBeenCalledTimes(4);
  });

  it("keeps chat login enabled when immediate cookie sync cannot run yet", async () => {
    const storageSet = vi.fn((_items, callback) => callback?.());
    const sendMessage = vi.fn((...args: Parameters<TabsSendMessage>) => {
      args[3]({ result: "applied" });
    });
    const listener = await importBackgroundWithChrome(sendMessage, {
      cookies: {
        get: vi.fn((details, callback) => {
          callback(
            !details.partitionKey
              ? makeNaverLoginCookie(details.name)
              : undefined,
          );
        }),
        getAll: vi.fn((_details, callback) => callback([])),
        getPartitionKey: vi.fn((_details, callback) => {
          callback?.({
            hasCrossSiteAncestor: true,
            topLevelSite: "http://localhost",
          });
        }),
        remove: vi.fn((_details, callback) => callback()),
        set: vi.fn((_details, callback) => callback(undefined)),
      },
      storage: {
        local: {
          get: vi.fn((_keys, callback) =>
            callback({
              [CHAT_LOGIN_STORAGE_KEY]: false,
              [PLAYER_OPTIMIZATION_STORAGE_KEY]: true,
            }),
          ),
          set: storageSet,
        },
      },
    });
    const sendResponse = vi.fn();

    listener(
      {
        kind: CHAT_LOGIN_SETTING_CHANGED_KIND,
        enabled: true,
      },
      {
        tab: {
          id: 11,
        },
      },
      sendResponse,
    );
    await flushMicrotasks();

    expect(storageSet).toHaveBeenCalledWith(
      { [CHAT_LOGIN_STORAGE_KEY]: true },
      expect.any(Function),
    );
    expect(storageSet).toHaveBeenCalledWith(
      { [CHAT_LOGIN_STATUS_STORAGE_KEY]: "unsupported" },
      expect.any(Function),
    );
    expect(sendResponse).toHaveBeenCalledWith({
      ok: true,
      status: "unsupported",
    });
  });

  it("runs one pending user-requested chat sync when a chat frame appears later", async () => {
    let chatLoginEnabled = false;
    const sendMessage = vi.fn((...args: Parameters<TabsSendMessage>) => {
      args[3]({ result: "applied" });
    });
    const cookiesSet = vi.fn((details, callback) => {
      callback(makeNaverLoginCookie(details.name));
    });
    const listener = await importBackgroundWithChrome(sendMessage, {
      cookies: {
        get: vi.fn((details, callback) => {
          callback(
            details.partitionKey ? undefined : makeNaverLoginCookie(details.name),
          );
        }),
        getAll: vi.fn((_details, callback) => callback([])),
        getPartitionKey: vi.fn((_details, callback) => {
          callback?.({
            hasCrossSiteAncestor: true,
            topLevelSite: "http://localhost",
          });
        }),
        remove: vi.fn((_details, callback) => callback()),
        set: cookiesSet,
      },
      storage: {
        local: {
          get: vi.fn((_keys, callback) =>
            callback({
              [CHAT_LOGIN_STORAGE_KEY]: chatLoginEnabled,
              [PLAYER_OPTIMIZATION_STORAGE_KEY]: true,
            }),
          ),
          set: vi.fn((items, callback) => {
            if (typeof items[CHAT_LOGIN_STORAGE_KEY] === "boolean") {
              chatLoginEnabled = items[CHAT_LOGIN_STORAGE_KEY];
            }
            callback?.();
          }),
        },
      },
    });

    listener(
      {
        kind: CHAT_LOGIN_SETTING_CHANGED_KIND,
        enabled: true,
      },
      {
        tab: {
          id: 11,
        },
      },
      vi.fn(),
    );
    await flushMicrotasks();
    expect(chatLoginEnabled).toBe(true);
    expect(cookiesSet).not.toHaveBeenCalled();

    listener(
      {
        kind: FRAME_READY_KIND,
        frame: {
          channelId: CHANNEL_ID,
          kind: "chat",
          referrer: "http://localhost:5173/multiview",
          url: `https://chzzk.naver.com/live/${CHANNEL_ID}/chat`,
        },
      },
      {
        frameId: 8,
        tab: {
          id: 11,
          url: "http://localhost:5173/multiview",
        },
        url: `https://chzzk.naver.com/live/${CHANNEL_ID}/chat`,
      },
      vi.fn(),
    );
    await flushMicrotasks();
    expect(cookiesSet).toHaveBeenCalledTimes(2);
  });
});
