// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  findChatHideButton,
  findExpandedSideNavigationToggle,
  findWideModeButton,
  isChatPanelVisible,
  isWideModeButtonActive,
  resetWideModeAutomationGuard,
  runChatHideAutomation,
  runLivePlayerAutomation,
  runSideNavigationCollapseAutomation,
  runWideModeAutomation,
} from "./wide-mode";

describe("wide mode automation", () => {
  beforeEach(() => {
    resetWideModeAutomationGuard();
    vi.restoreAllMocks();
  });

  it("finds and clicks a wide-screen button", async () => {
    document.body.innerHTML = `<button aria-label="넓은 화면">wide</button>`;
    const button = document.querySelector("button");
    const click = vi.spyOn(button!, "click");

    await expect(
      runWideModeAutomation({ delayMs: 0, maxAttempts: 1 }),
    ).resolves.toBe("applied");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("finds CHZZK's player viewmode button even without a readable label", async () => {
    document.body.innerHTML = `<button class="pzp-pc__viewmode-button"></button>`;
    const button = document.querySelector("button");
    const click = vi.spyOn(button!, "click");

    expect(findWideModeButton()).toBe(button);
    await expect(
      runWideModeAutomation({ delayMs: 0, maxAttempts: 1 }),
    ).resolves.toBe("applied");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("clicks CHZZK's viewmode button even while player controls are aria-hidden", async () => {
    document.body.innerHTML = `
      <div aria-hidden="true">
        <button class="pzp-pc__viewmode-button"></button>
      </div>
    `;
    const button = document.querySelector("button");
    const click = vi.spyOn(button!, "click");

    expect(findWideModeButton()).toBe(button);
    await expect(
      runWideModeAutomation({ delayMs: 0, maxAttempts: 1 }),
    ).resolves.toBe("applied");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("does not click hidden CHZZK viewmode buttons", async () => {
    document.body.innerHTML = `
      <button class="pzp-pc__viewmode-button" style="display: none"></button>
      <button aria-label="넓은 화면" style="visibility: hidden"></button>
    `;
    const buttons = document.querySelectorAll("button");
    const firstClick = vi.spyOn(buttons[0]!, "click");
    const secondClick = vi.spyOn(buttons[1]!, "click");

    expect(findWideModeButton()).toBeNull();
    await expect(
      runWideModeAutomation({ delayMs: 0, maxAttempts: 1 }),
    ).resolves.toBe("selector_missing");
    expect(firstClick).not.toHaveBeenCalled();
    expect(secondClick).not.toHaveBeenCalled();
  });

  it("does not click when the wide-screen button is already active", async () => {
    document.body.innerHTML = `<button aria-label="넓은 화면" aria-pressed="true">wide</button>`;
    const button = document.querySelector("button");
    const click = vi.spyOn(button!, "click");

    expect(isWideModeButtonActive(button!)).toBe(true);
    await expect(
      runWideModeAutomation({ delayMs: 0, maxAttempts: 1 }),
    ).resolves.toBe("already_applied");
    expect(click).not.toHaveBeenCalled();
  });

  it("still clicks CHZZK's viewmode button when the readable label is ambiguous", async () => {
    document.body.innerHTML = `<button class="pzp-pc__viewmode-button" aria-label="기본 화면"></button>`;
    const button = document.querySelector("button");
    const click = vi.spyOn(button!, "click");

    expect(isWideModeButtonActive(button!)).toBe(false);
    expect(findWideModeButton()).toBe(button);
    await expect(
      runWideModeAutomation({ delayMs: 0, maxAttempts: 1 }),
    ).resolves.toBe("applied");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("does not click the wide-screen toggle again immediately after applying", async () => {
    document.body.innerHTML = `<button class="pzp-pc__viewmode-button"></button>`;
    const button = document.querySelector("button");
    const click = vi.spyOn(button!, "click");

    await expect(
      runWideModeAutomation({ delayMs: 0, maxAttempts: 1 }),
    ).resolves.toBe("applied");
    await expect(
      runWideModeAutomation({ delayMs: 0, maxAttempts: 1 }),
    ).resolves.toBe("already_applied");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("reports selector_missing when no matching control exists", async () => {
    document.body.innerHTML = `<button aria-label="전체 방송">list</button>`;

    expect(findWideModeButton()).toBeNull();
    await expect(
      runWideModeAutomation({ delayMs: 0, maxAttempts: 1 }),
    ).resolves.toBe("selector_missing");
  });

  it("clicks CHZZK's live chat header button to hide the embedded chat", async () => {
    document.body.innerHTML = `
      <section class="live_chatting_area__abc"></section>
      <button class="live_chatting_header_button__abc"></button>
    `;
    const button = document.querySelector("button");
    const click = vi.spyOn(button!, "click");

    expect(isChatPanelVisible()).toBe(true);
    expect(findChatHideButton()).toBe(button);
    await expect(
      runChatHideAutomation({ delayMs: 0, maxAttempts: 1 }),
    ).resolves.toBe("applied");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("treats a missing chat panel and button as already hidden", async () => {
    document.body.innerHTML = `<button aria-label="전체 방송">list</button>`;

    expect(isChatPanelVisible()).toBe(false);
    expect(findChatHideButton()).toBeNull();
    await expect(
      runChatHideAutomation({ delayMs: 0, maxAttempts: 1 }),
    ).resolves.toBe("already_applied");
  });

  it("does not click a visible chat-open button when the panel is already hidden", async () => {
    document.body.innerHTML = `<button aria-label="채팅 열기">chat</button>`;
    const button = document.querySelector("button");
    const click = vi.spyOn(button!, "click");

    expect(isChatPanelVisible()).toBe(false);
    await expect(
      runChatHideAutomation({ delayMs: 0, maxAttempts: 1 }),
    ).resolves.toBe("already_applied");
    expect(click).not.toHaveBeenCalled();
  });

  it("clicks CHZZK's chat header button once when panel detection is incomplete", async () => {
    document.body.innerHTML = `<button class="live_chatting_header_button__abc"></button>`;
    const button = document.querySelector("button");
    const click = vi.spyOn(button!, "click");

    expect(isChatPanelVisible()).toBe(false);
    expect(findChatHideButton()).toBe(button);
    await expect(
      runChatHideAutomation({ delayMs: 0, maxAttempts: 1 }),
    ).resolves.toBe("applied");
    await expect(
      runChatHideAutomation({ delayMs: 0, maxAttempts: 1 }),
    ).resolves.toBe("already_applied");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("clicks CHZZK's expanded left navigation toggle before player cleanup", async () => {
    document.body.innerHTML = `
      <nav class="navigation_area__abc">
        <button aria-label="메뉴">menu</button>
        <a>전체 방송</a>
      </nav>
      <video class="webplayer-internal-video"></video>
      <button class="pzp-pc__viewmode-button"></button>
    `;
    const nav = document.querySelector("nav")!;
    const menuButton = document.querySelector("nav button") as HTMLButtonElement;
    const wideButton = document.querySelector(
      ".pzp-pc__viewmode-button",
    ) as HTMLButtonElement;
    Object.defineProperty(nav, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: 720,
        height: 720,
        left: 0,
        right: 240,
        top: 0,
        width: 240,
        x: 0,
        y: 0,
      }),
    });
    Object.defineProperty(menuButton, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: 48,
        height: 40,
        left: 16,
        right: 56,
        top: 8,
        width: 40,
        x: 16,
        y: 8,
      }),
    });
    Object.defineProperty(wideButton, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: 48,
        height: 40,
        left: 320,
        right: 360,
        top: 8,
        width: 40,
        x: 320,
        y: 8,
      }),
    });
    const video = document.querySelector("video")!;
    Object.defineProperty(video, "readyState", {
      configurable: true,
      value: 1,
    });
    const menuClick = vi.spyOn(menuButton, "click");
    const wideClick = vi.spyOn(wideButton, "click");

    expect(findExpandedSideNavigationToggle()).toBe(menuButton);
    await expect(
      runSideNavigationCollapseAutomation({ delayMs: 0, maxAttempts: 1 }),
    ).resolves.toBe("applied");
    await expect(
      runLivePlayerAutomation({ delayMs: 0, maxAttempts: 1 }),
    ).resolves.toBe("applied");
    expect(menuClick).toHaveBeenCalledTimes(2);
    expect(wideClick).toHaveBeenCalledTimes(1);
  });

  it("does not click side navigation controls when the left rail is already compact", async () => {
    document.body.innerHTML = `
      <nav class="navigation_area__abc">
        <button aria-label="메뉴">menu</button>
      </nav>
    `;
    const nav = document.querySelector("nav")!;
    const menuButton = document.querySelector("button")!;
    Object.defineProperty(nav, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: 720,
        height: 720,
        left: 0,
        right: 80,
        top: 0,
        width: 80,
        x: 0,
        y: 0,
      }),
    });
    const click = vi.spyOn(menuButton, "click");

    expect(findExpandedSideNavigationToggle()).toBeNull();
    await expect(
      runSideNavigationCollapseAutomation({ delayMs: 0, maxAttempts: 1 }),
    ).resolves.toBe("already_applied");
    expect(click).not.toHaveBeenCalled();
  });

  it("runs wide-screen activation before chat hiding as one player optimization", async () => {
    document.body.innerHTML = `
      <video class="webplayer-internal-video"></video>
      <button class="pzp-pc__viewmode-button"></button>
      <section class="live_chatting_area__abc"></section>
      <button class="live_chatting_header_button__abc"></button>
    `;
    const video = document.querySelector("video")!;
    Object.defineProperty(video, "readyState", {
      configurable: true,
      value: 1,
    });
    const buttons = document.querySelectorAll("button");
    const wideClick = vi.spyOn(buttons[0]!, "click");
    const chatClick = vi.spyOn(buttons[1]!, "click");

    await expect(
      runLivePlayerAutomation({ delayMs: 0, maxAttempts: 1 }),
    ).resolves.toBe("applied");
    expect(wideClick).toHaveBeenCalledTimes(1);
    expect(chatClick).toHaveBeenCalledTimes(1);
  });
});
