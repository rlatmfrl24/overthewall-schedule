// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://chzzk.naver.com/live/00000000000000000000000000000001?multichzzk"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChromeApi } from "./chrome-api";

const CHANNEL_ID = "00000000000000000000000000000001";
const FRAME_READY_KIND = "OTW_EXTENSION_FRAME_READY";
const FRAME_REGISTRATION_REQUEST_KIND =
  "OTW_EXTENSION_REQUEST_FRAME_REGISTRATION";
const RUN_WIDE_MODE_KIND = "OTW_EXTENSION_RUN_WIDE_MODE";

type RuntimeMessageListener = Parameters<
  ChromeApi["runtime"]["onMessage"]["addListener"]
>[0];

const flushMicrotasks = async () => {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
};

const setRect = (element: Element, rect: Partial<DOMRect>) => {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      bottom: rect.bottom ?? 0,
      height: rect.height ?? 0,
      left: rect.left ?? 0,
      right: rect.right ?? 0,
      top: rect.top ?? 0,
      width: rect.width ?? 0,
      x: rect.left ?? 0,
      y: rect.top ?? 0,
    }),
  });
};

const renderChzzkLiveDom = () => {
  document.body.innerHTML = `
    <nav class="navigation_area__abc">
      <button aria-label="메뉴">menu</button>
    </nav>
    <video class="webplayer-internal-video"></video>
    <button class="pzp-pc__viewmode-button"></button>
    <section class="live_chatting_area__abc"></section>
    <button class="live_chatting_header_button__abc"></button>
  `;

  const nav = document.querySelector("nav")!;
  const menuButton = document.querySelector("nav button") as HTMLButtonElement;
  const wideButton = document.querySelector(
    ".pzp-pc__viewmode-button",
  ) as HTMLButtonElement;
  const video = document.querySelector("video") as HTMLVideoElement;
  const chatButton = document.querySelector(
    ".live_chatting_header_button__abc",
  ) as HTMLButtonElement;

  setRect(nav, { height: 720, left: 0, top: 0, width: 240 });
  setRect(menuButton, { height: 40, left: 16, top: 8, width: 40 });
  setRect(wideButton, { height: 40, left: 320, top: 8, width: 40 });
  Object.defineProperty(video, "readyState", {
    configurable: true,
    value: 1,
  });

  return {
    chatButton,
    menuButton,
    wideButton,
  };
};

describe("CHZZK content script entry", () => {
  let runtimeMessageListeners: RuntimeMessageListener[];
  let runtimeSendMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.restoreAllMocks();
    runtimeMessageListeners = [];
    runtimeSendMessage = vi.fn((_message, callback) => callback?.({ ok: true }));
    globalThis.chrome = {
      runtime: {
        id: "test-extension",
        onMessage: {
          addListener: vi.fn((listener: RuntimeMessageListener) => {
            runtimeMessageListeners.push(listener);
          }),
        },
        sendMessage: runtimeSendMessage,
      },
    } as unknown as ChromeApi;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.resetModules();
    globalThis.chrome = undefined;
    document.body.innerHTML = "";
  });

  it("registers the live frame and runs the actual player automation listener", async () => {
    const { chatButton, menuButton, wideButton } = renderChzzkLiveDom();
    const menuClick = vi.spyOn(menuButton, "click");
    const wideClick = vi.spyOn(wideButton, "click");
    const chatClick = vi.spyOn(chatButton, "click");

    // @ts-expect-error chzzk-content is a classic content-script entrypoint.
    await import("./chzzk-content");

    expect(runtimeSendMessage).toHaveBeenCalledWith(
      {
        kind: FRAME_READY_KIND,
        frame: expect.objectContaining({
          channelId: CHANNEL_ID,
          kind: "live",
          url: expect.stringContaining(`/live/${CHANNEL_ID}`),
        }),
      },
      expect.any(Function),
    );

    const listener = runtimeMessageListeners[0];
    const sendResponse = vi.fn();
    const keepChannelOpen = listener?.(
      {
        channelId: CHANNEL_ID,
        kind: RUN_WIDE_MODE_KIND,
      },
      {},
      sendResponse,
    );

    expect(keepChannelOpen).toBe(true);
    await flushMicrotasks();

    expect(sendResponse).toHaveBeenCalledWith({ result: "applied" });
    expect(menuClick).toHaveBeenCalledTimes(1);
    expect(wideClick).toHaveBeenCalledTimes(1);
    expect(chatClick).toHaveBeenCalledTimes(1);
  });

  it("re-registers the frame when the background service worker asks", async () => {
    renderChzzkLiveDom();
    // @ts-expect-error chzzk-content is a classic content-script entrypoint.
    await import("./chzzk-content");
    runtimeSendMessage.mockClear();

    const listener = runtimeMessageListeners[0];
    const sendResponse = vi.fn();
    const keepChannelOpen = listener?.(
      {
        kind: FRAME_REGISTRATION_REQUEST_KIND,
      },
      {},
      sendResponse,
    );

    expect(keepChannelOpen).toBe(false);
    expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    expect(runtimeSendMessage).toHaveBeenCalledWith(
      {
        kind: FRAME_READY_KIND,
        frame: expect.objectContaining({
          channelId: CHANNEL_ID,
          kind: "live",
        }),
      },
      expect.any(Function),
    );
  });
});
