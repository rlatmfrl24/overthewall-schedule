import type { WideModeResult } from "./protocol";

const WIDE_MODE_KEYWORDS = [
  "넓은",
  "극장",
  "확장",
  "wide",
  "theater",
  "theatre",
];
const CHZZK_VIEWMODE_BUTTON_SELECTOR = ".pzp-pc__viewmode-button";
const CHZZK_VIDEO_SELECTOR = "video.webplayer-internal-video";
const CHZZK_PLAYER_WAKE_TARGET_SELECTORS = [
  CHZZK_VIDEO_SELECTOR,
  "[class*='webplayer']",
  "[class*='pzp']",
  "body",
];
const CHZZK_SIDE_NAV_SELECTOR_HINTS = [
  "[class*='navigation']",
  "[class*='sidebar']",
  "[class*='side_bar']",
  "[class*='drawer']",
  "[class*='gnb']",
  "aside",
  "nav",
];
const CHZZK_SIDE_NAV_TOGGLE_SELECTOR = [
  "button[aria-label*='메뉴']",
  "button[aria-label*='menu' i]",
  "button[title*='메뉴']",
  "button[title*='menu' i]",
  "[role='button'][aria-label*='메뉴']",
  "[role='button'][aria-label*='menu' i]",
  "button",
].join(",");
const CHZZK_CHAT_HIDE_BUTTON_SELECTORS = [
  "[class*='live_chatting_header_button__']",
  "button[aria-label*='채팅']",
  "[role='button'][aria-label*='채팅']",
];
const CHZZK_CHAT_PANEL_SELECTORS = [
  "[class*='live_chatting__']",
  "[class*='live_chatting_area__']",
  "[class*='live_chatting_container__']",
  "[class*='live_chatting_wrap__']",
  "[class*='chatting_area__']",
  "[class*='chatting_container__']",
  "[class*='chatting_wrap__']",
  "[class*='chat_area__']",
  "[class*='chat_container__']",
  "[class*='chat_wrap__']",
];
const CHAT_HIDE_KEYWORDS = [
  "닫",
  "숨",
  "접",
  "close",
  "hide",
  "collapse",
  "fold",
];
const CHAT_SHOW_KEYWORDS = ["열", "보", "펼", "open", "show", "expand", "unfold"];
const WIDE_MODE_RECLICK_GUARD_MS = 4_000;
const CHAT_HIDE_RECLICK_GUARD_MS = 4_000;

let wideModeReclickGuardUntil = 0;
let chatHideReclickGuardUntil = 0;
let hasAppliedChatHide = false;

const sleep = (durationMs: number) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });

const normalizeText = (value?: string | null) =>
  value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";

const hasWideModeLabel = (element: Element) => {
  const label = normalizeText(
    [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("data-tooltip"),
      element.textContent,
    ]
      .filter(Boolean)
      .join(" "),
  );

  return WIDE_MODE_KEYWORDS.some((keyword) => label.includes(keyword));
};

const hasChatHideLabel = (element: Element) => {
  const label = normalizeText(
    [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("data-tooltip"),
      element.textContent,
    ]
      .filter(Boolean)
      .join(" "),
  );

  return (
    label.includes("채팅") &&
    CHAT_HIDE_KEYWORDS.some((keyword) => label.includes(keyword))
  );
};

const hasChatShowLabel = (element: Element) => {
  const label = normalizeText(
    [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("data-tooltip"),
      element.textContent,
    ]
      .filter(Boolean)
      .join(" "),
  );

  return (
    label.includes("채팅") &&
    CHAT_SHOW_KEYWORDS.some((keyword) => label.includes(keyword))
  );
};

const getElementRect = (element: Element) => {
  if (!(element instanceof HTMLElement)) return null;

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  return rect;
};

const isJsdomEnvironment = () =>
  typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent);

const isClickableElement = (element: Element): element is HTMLElement => {
  if (!(element instanceof HTMLElement)) return false;
  if (element.closest("[hidden], [aria-hidden='true']")) return false;
  if (element.getAttribute("aria-disabled") === "true") return false;
  if (
    "disabled" in element &&
    Boolean((element as HTMLButtonElement).disabled)
  ) {
    return false;
  }

  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
};

const isWideModeCandidateElement = (element: Element): element is HTMLElement => {
  if (!(element instanceof HTMLElement)) return false;
  if (element.closest("[hidden]")) return false;
  if (element.getAttribute("aria-disabled") === "true") return false;
  if (
    "disabled" in element &&
    Boolean((element as HTMLButtonElement).disabled)
  ) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;

  return Boolean(getElementRect(element) || isJsdomEnvironment());
};

const isLikelyExpandedSideNavigation = (element: Element) => {
  const rect = getElementRect(element);
  if (!rect) return false;

  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const minHeight = Math.min(360, viewportHeight * 0.6);

  return rect.left <= 4 && rect.width >= 160 && rect.height >= minHeight;
};

const isLikelySideNavToggle = (element: Element): element is HTMLElement => {
  if (!isClickableElement(element)) return false;

  const label = normalizeText(
    [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.textContent,
    ]
      .filter(Boolean)
      .join(" "),
  );
  const rect = getElementRect(element);
  const hasMenuLabel = label.includes("메뉴") || label.includes("menu");
  const isTopLeftControl = rect ? rect.left <= 96 && rect.top <= 96 : false;

  return hasMenuLabel || isTopLeftControl;
};

export const findExpandedSideNavigationToggle = (
  root: ParentNode = document,
) => {
  for (const selector of CHZZK_SIDE_NAV_SELECTOR_HINTS) {
    const candidates = root.querySelectorAll(selector);

    for (const candidate of candidates) {
      if (!isLikelyExpandedSideNavigation(candidate)) continue;

      const toggle = [...candidate.querySelectorAll(CHZZK_SIDE_NAV_TOGGLE_SELECTOR)]
        .filter(isLikelySideNavToggle)
        .sort((a, b) => {
          const rectA = a.getBoundingClientRect();
          const rectB = b.getBoundingClientRect();
          return rectA.top - rectB.top || rectA.left - rectB.left;
        })[0];

      if (toggle) return toggle;
    }
  }

  return null;
};

export const isWideModeButtonActive = (element: HTMLElement) =>
  element.getAttribute("aria-pressed") === "true" ||
  element.getAttribute("aria-checked") === "true" ||
  element.getAttribute("data-active") === "true" ||
  element.getAttribute("data-state") === "on" ||
  element.classList.contains("active") ||
  element.classList.contains("selected");

export const findWideModeButton = (root: ParentNode = document) => {
  const chzzkViewmodeButtons = [
    ...root.querySelectorAll(CHZZK_VIEWMODE_BUTTON_SELECTOR),
  ].filter(isWideModeCandidateElement);

  if (chzzkViewmodeButtons.length === 1) return chzzkViewmodeButtons[0];

  const labelledChzzkButton = chzzkViewmodeButtons.find(hasWideModeLabel);
  if (labelledChzzkButton) return labelledChzzkButton;

  const candidates = root.querySelectorAll(
    [
      "button",
      "[role='button']",
      "a[aria-label]",
      "[aria-label]",
      "[title]",
      "[data-tooltip]",
    ].join(","),
  );

  for (const candidate of candidates) {
    if (!hasWideModeLabel(candidate)) continue;
    if (!isWideModeCandidateElement(candidate)) continue;
    return candidate;
  }

  return null;
};

export const wakePlayerControls = (root: ParentNode = document) => {
  const targets = new Set<EventTarget>();

  CHZZK_PLAYER_WAKE_TARGET_SELECTORS.forEach((selector) => {
    const element = root.querySelector(selector);
    if (element) targets.add(element);
  });
  targets.add(document);

  targets.forEach((target) => {
    const rect =
      target instanceof Element ? target.getBoundingClientRect() : null;
    const eventInit = {
      bubbles: true,
      cancelable: true,
      clientX: rect ? Math.max(1, rect.left + rect.width / 2) : 1,
      clientY: rect ? Math.max(1, rect.top + rect.height / 2) : 1,
      view: window,
    };

    ["pointerover", "pointermove", "mouseover", "mousemove"].forEach(
      (eventName) => {
        try {
          target.dispatchEvent(new MouseEvent(eventName, eventInit));
        } catch {
          target.dispatchEvent(new Event(eventName, { bubbles: true }));
        }
      },
    );
  });
};

export const findChatHideButton = (root: ParentNode = document) => {
  for (const selector of CHZZK_CHAT_HIDE_BUTTON_SELECTORS) {
    const candidates = root.querySelectorAll(selector);
    for (const candidate of candidates) {
      if (!isClickableElement(candidate)) continue;
      if (
        selector.includes("live_chatting_header_button__") ||
        hasChatHideLabel(candidate)
      ) {
        return candidate;
      }
    }
  }

  return null;
};

export const isChatPanelVisible = (root: ParentNode = document) => {
  for (const selector of CHZZK_CHAT_PANEL_SELECTORS) {
    const panel = root.querySelector(selector);
    if (panel && isClickableElement(panel)) return true;
  }

  return false;
};

export const waitForVideoReady = async ({
  delayMs = 100,
  root = document,
  timeoutMs = 5000,
}: {
  delayMs?: number;
  root?: ParentNode;
  timeoutMs?: number;
} = {}) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const video = root.querySelector(CHZZK_VIDEO_SELECTOR);

    if (video instanceof HTMLVideoElement && video.readyState >= 1) {
      return true;
    }

    if (!video) {
      await sleep(delayMs);
      continue;
    }

    await new Promise<boolean>((resolve) => {
      const timeoutId = window.setTimeout(() => resolve(false), delayMs);
      video.addEventListener(
        "loadedmetadata",
        () => {
          window.clearTimeout(timeoutId);
          resolve(true);
        },
        { once: true },
      );
    });
  }

  return false;
};

interface WideModeAutomationOptions {
  delayMs?: number;
  maxAttempts?: number;
  now?: () => number;
  reclickGuardMs?: number;
  root?: ParentNode;
  timeoutMs?: number;
}

export const resetWideModeAutomationGuard = () => {
  wideModeReclickGuardUntil = 0;
  chatHideReclickGuardUntil = 0;
  hasAppliedChatHide = false;
};

export const runWideModeAutomation = async ({
  delayMs = 250,
  maxAttempts = 12,
  now = Date.now,
  reclickGuardMs = WIDE_MODE_RECLICK_GUARD_MS,
  root = document,
  timeoutMs = 5000,
}: WideModeAutomationOptions = {}): Promise<WideModeResult> => {
  const startedAt = now();

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (now() - startedAt > timeoutMs) return "timeout";

    wakePlayerControls(root);
    const button = findWideModeButton(root);
    if (button) {
      if (isWideModeButtonActive(button) || now() < wideModeReclickGuardUntil) {
        return "already_applied";
      }

      try {
        button.click();
        wideModeReclickGuardUntil = now() + reclickGuardMs;
        return "applied";
      } catch {
        return "error";
      }
    }

    await sleep(delayMs);
  }

  return "selector_missing";
};

export const runChatHideAutomation = async ({
  delayMs = 250,
  maxAttempts = 12,
  now = Date.now,
  reclickGuardMs = CHAT_HIDE_RECLICK_GUARD_MS,
  root = document,
  timeoutMs = 5000,
}: WideModeAutomationOptions = {}): Promise<WideModeResult> => {
  const startedAt = now();

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (now() - startedAt > timeoutMs) return "timeout";

    const panelVisible = isChatPanelVisible(root);

    const button = findChatHideButton(root);
    if (button) {
      if (hasChatShowLabel(button)) return "already_applied";
      if (hasAppliedChatHide && !panelVisible) return "already_applied";
      if (now() < chatHideReclickGuardUntil) return "already_applied";

      try {
        button.click();
        hasAppliedChatHide = true;
        chatHideReclickGuardUntil = now() + reclickGuardMs;
        return "applied";
      } catch {
        return "error";
      }
    }

    if (!panelVisible) return "already_applied";

    await sleep(delayMs);
  }

  return "selector_missing";
};

export const runSideNavigationCollapseAutomation = async ({
  delayMs = 250,
  maxAttempts = 8,
  root = document,
  timeoutMs = 3000,
}: WideModeAutomationOptions = {}): Promise<WideModeResult> => {
  const startedAt = Date.now();

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (Date.now() - startedAt > timeoutMs) return "timeout";

    const button = findExpandedSideNavigationToggle(root);
    if (button) {
      try {
        button.click();
        return "applied";
      } catch {
        return "error";
      }
    }

    await sleep(delayMs);
  }

  return "already_applied";
};

export const runLivePlayerAutomation = async ({
  delayMs = 250,
  maxAttempts = 12,
  root = document,
  timeoutMs = 5000,
}: WideModeAutomationOptions = {}): Promise<WideModeResult> => {
  await waitForVideoReady({
    delayMs: 100,
    root,
    timeoutMs: Math.min(timeoutMs, 2000),
  });

  const sideNavigationResult = await runSideNavigationCollapseAutomation({
    delayMs,
    maxAttempts,
    root,
    timeoutMs,
  });
  const wideModeResult = await runWideModeAutomation({
    delayMs,
    maxAttempts,
    root,
    timeoutMs,
  });
  const chatHideResult = await runChatHideAutomation({
    delayMs,
    maxAttempts,
    root,
    timeoutMs,
  });

  if (
    wideModeResult === "selector_missing" ||
    wideModeResult === "timeout" ||
    wideModeResult === "error"
  ) {
    return wideModeResult;
  }

  if (chatHideResult === "error" || chatHideResult === "timeout") {
    return chatHideResult;
  }

  if (sideNavigationResult === "error" || sideNavigationResult === "timeout") {
    return sideNavigationResult;
  }

  if (
    sideNavigationResult === "applied" ||
    wideModeResult === "applied" ||
    chatHideResult === "applied"
  ) {
    return "applied";
  }

  return "already_applied";
};
