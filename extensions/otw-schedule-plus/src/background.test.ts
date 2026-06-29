import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChromeApi, ChromeMessageSender } from "./chrome-api";

const CHANNEL_ID = "00000000000000000000000000000001";
const FRAME_READY_KIND = "OTW_EXTENSION_FRAME_READY";
const PAGE_READY_KIND = "OTW_EXTENSION_MULTIVIEW_PAGE_READY";
const INJECT_BRIDGE_ACTIVE_TAB_KIND = "OTW_EXTENSION_INJECT_BRIDGE_ACTIVE_TAB";

type RuntimeMessageListener = (
  message: unknown,
  sender: ChromeMessageSender,
  sendResponse: (response?: unknown) => void,
) => boolean | void;
type TabsSendMessage = NonNullable<ChromeApi["tabs"]>["sendMessage"];
type TabsQuery = NonNullable<NonNullable<ChromeApi["tabs"]>["query"]>;
type ScriptingExecuteScript = NonNullable<
  ChromeApi["scripting"]
>["executeScript"];
type ChromeApiOverrides = Partial<Omit<ChromeApi, "runtime" | "tabs">> & {
  runtime?: Partial<ChromeApi["runtime"]>;
  tabs?: Partial<NonNullable<ChromeApi["tabs"]>>;
};

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

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
    expect(sendMessage).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_200);
    expect(sendMessage).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(12_000);
    expect(sendMessage).toHaveBeenCalledTimes(2);
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
    expect(sendMessage).toHaveBeenCalledTimes(1);
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
    expect(sendMessage).toHaveBeenCalledTimes(1);
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
});
