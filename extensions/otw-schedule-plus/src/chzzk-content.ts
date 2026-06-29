(() => {
  const EXTENSION_PROTOCOL = "OTW_SCHEDULE_PLUS_EXTENSION/V1";
  const EXTENSION_PROTOCOL_VERSION = 1;
  const INTERNAL_FRAME_READY = "OTW_EXTENSION_FRAME_READY";
  const INTERNAL_RUN_WIDE_MODE = "OTW_EXTENSION_RUN_WIDE_MODE";
  const INTERNAL_CHAT_LOGIN_SYNCED = "OTW_EXTENSION_CHAT_LOGIN_SYNCED";
  const CHANNEL_ID_PATTERN = /^[a-f0-9]{32}$/i;
  const WIDE_MODE_KEYWORDS = [
    "넓은",
    "극장",
    "확장",
    "wide",
    "theater",
    "theatre",
  ];
  const CHZZK_VIEWMODE_BUTTON_SELECTOR = [
    ".pzp-pc__viewmode-button",
    ".pzp-pc-viewmode-button",
    "button[class*='viewmode-button']",
    "[role='button'][class*='viewmode-button']",
  ].join(",");
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
  const CHAT_SHOW_KEYWORDS = [
    "열",
    "보",
    "펼",
    "open",
    "show",
    "expand",
    "unfold",
  ];
  const WIDE_MODE_RECLICK_GUARD_MS = 4_000;
  const CHAT_HIDE_RECLICK_GUARD_MS = 4_000;
  let wideModeReclickGuardUntil = 0;
  let chatHideReclickGuardUntil = 0;
  let hasAppliedChatHide = false;
  let extensionContextInvalidated = false;

  type WideModeResult =
    | "applied"
    | "already_applied"
    | "selector_missing"
    | "timeout"
    | "error";

  const getChromeRuntime = () => {
    if (extensionContextInvalidated) return undefined;

    try {
      return typeof chrome === "undefined" ? undefined : chrome.runtime;
    } catch {
      extensionContextInvalidated = true;
      return undefined;
    }
  };

  const getFrameInfo = () => {
    const segments = window.location.pathname.split("/").filter(Boolean);
    const channelId = segments[0] === "live" ? segments[1] : null;

    if (!channelId || !CHANNEL_ID_PATTERN.test(channelId)) return null;

    return {
      channelId: channelId.toLowerCase(),
      kind: segments[2] === "chat" ? "chat" : "live",
      referrer: document.referrer,
      url: window.location.href,
    };
  };

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

  const getElementRect = (element: Element) => {
    if (!(element instanceof HTMLElement)) return null;

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    return rect;
  };

  const isWideModeCandidateElement = (
    element: Element,
  ): element is HTMLElement => {
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

    return Boolean(getElementRect(element));
  };

  const isLikelyExpandedSideNavigation = (element: Element) => {
    const rect = getElementRect(element);
    if (!rect) return false;

    const viewportHeight =
      window.innerHeight || document.documentElement.clientHeight;
    const minHeight = Math.min(360, viewportHeight * 0.6);

    return rect.left <= 4 && rect.width >= 160 && rect.height >= minHeight;
  };

  const isLikelySideNavToggle = (
    element: Element,
  ): element is HTMLElement => {
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

  const isWideModeButtonActive = (element: HTMLElement) =>
    element.getAttribute("aria-pressed") === "true" ||
    element.getAttribute("aria-checked") === "true" ||
    element.getAttribute("data-active") === "true" ||
    element.getAttribute("data-state") === "on" ||
    element.classList.contains("active") ||
    element.classList.contains("selected");

  const findWideModeButton = () => {
    const chzzkViewmodeButtons = [
      ...document.querySelectorAll(CHZZK_VIEWMODE_BUTTON_SELECTOR),
    ].filter(isWideModeCandidateElement);

    if (chzzkViewmodeButtons.length === 1) return chzzkViewmodeButtons[0];

    const labelledChzzkButton = chzzkViewmodeButtons.find(hasWideModeLabel);
    if (labelledChzzkButton) return labelledChzzkButton;

    const candidates = document.querySelectorAll(
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

  const wakePlayerControls = () => {
    const targets = new Set<EventTarget>();

    CHZZK_PLAYER_WAKE_TARGET_SELECTORS.forEach((selector) => {
      const element = document.querySelector(selector);
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

  const findChatHideButton = () => {
    for (const selector of CHZZK_CHAT_HIDE_BUTTON_SELECTORS) {
      const candidates = document.querySelectorAll(selector);
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

  const findExpandedSideNavigationToggle = () => {
    for (const selector of CHZZK_SIDE_NAV_SELECTOR_HINTS) {
      const candidates = document.querySelectorAll(selector);

      for (const candidate of candidates) {
        if (!isLikelyExpandedSideNavigation(candidate)) continue;

        const toggle = [
          ...candidate.querySelectorAll(CHZZK_SIDE_NAV_TOGGLE_SELECTOR),
        ]
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

  const isChatPanelVisible = () => {
    for (const selector of CHZZK_CHAT_PANEL_SELECTORS) {
      const panel = document.querySelector(selector);
      if (panel && isClickableElement(panel)) return true;
    }

    return false;
  };

  const sleep = (durationMs: number) =>
    new Promise((resolve) => {
      window.setTimeout(resolve, durationMs);
    });

  const waitForVideoReady = async () => {
    const startedAt = Date.now();

    while (Date.now() - startedAt <= 2000) {
      const video = document.querySelector(CHZZK_VIDEO_SELECTOR);

      if (video instanceof HTMLVideoElement && video.readyState >= 1) {
        return true;
      }

      if (!video) {
        await sleep(100);
        continue;
      }

      await new Promise<boolean>((resolve) => {
        const timeoutId = window.setTimeout(() => resolve(false), 100);
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

  const runWideModeAutomation = async (): Promise<WideModeResult> => {
    const startedAt = Date.now();

    for (let attempt = 0; attempt < 12; attempt += 1) {
      if (Date.now() - startedAt > 5000) return "timeout";

      wakePlayerControls();
      const button = findWideModeButton();
      if (button) {
        if (
          isWideModeButtonActive(button) ||
          Date.now() < wideModeReclickGuardUntil
        ) {
          return "already_applied";
        }

        try {
          button.click();
          wideModeReclickGuardUntil = Date.now() + WIDE_MODE_RECLICK_GUARD_MS;
          return "applied";
        } catch {
          return "error";
        }
      }

      await sleep(250);
    }

    return "selector_missing";
  };

  const runChatHideAutomation = async (): Promise<WideModeResult> => {
    const startedAt = Date.now();

    for (let attempt = 0; attempt < 12; attempt += 1) {
      if (Date.now() - startedAt > 5000) return "timeout";

      const panelVisible = isChatPanelVisible();

      const button = findChatHideButton();
      if (button) {
        if (hasChatShowLabel(button)) return "already_applied";
        if (hasAppliedChatHide && !panelVisible) return "already_applied";
        if (Date.now() < chatHideReclickGuardUntil) {
          return "already_applied";
        }

        try {
          button.click();
          hasAppliedChatHide = true;
          chatHideReclickGuardUntil = Date.now() + CHAT_HIDE_RECLICK_GUARD_MS;
          return "applied";
        } catch {
          return "error";
        }
      }

      if (!panelVisible) return "already_applied";

      await sleep(250);
    }

    return "selector_missing";
  };

  const runSideNavigationCollapseAutomation =
    async (): Promise<WideModeResult> => {
      const startedAt = Date.now();

      for (let attempt = 0; attempt < 8; attempt += 1) {
        if (Date.now() - startedAt > 3000) return "timeout";

        const button = findExpandedSideNavigationToggle();
        if (button) {
          try {
            button.click();
            return "applied";
          } catch {
            return "error";
          }
        }

        await sleep(250);
      }

      return "already_applied";
    };

  const runLivePlayerAutomation = async (): Promise<WideModeResult> => {
    await waitForVideoReady();

    const sideNavigationResult = await runSideNavigationCollapseAutomation();
    const wideModeResult = await runWideModeAutomation();
    const chatHideResult = await runChatHideAutomation();

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

    if (
      sideNavigationResult === "error" ||
      sideNavigationResult === "timeout"
    ) {
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

  const frameInfo = getFrameInfo();
  const runtime = getChromeRuntime();

  if (!frameInfo || !runtime) return;

  const reloadChatFrameAfterLoginSync = (syncId?: unknown) => {
    if (frameInfo.kind !== "chat") return false;

    const key = `otwSchedulePlusChatLoginReloaded:${frameInfo.channelId}`;
    const marker =
      typeof syncId === "string" && syncId.trim() ? syncId : "legacy";

    try {
      if (window.sessionStorage.getItem(key) === marker) return false;
      window.sessionStorage.setItem(key, marker);
    } catch {
      // If sessionStorage is unavailable, still prefer one best-effort reload.
    }

    window.location.reload();
    return true;
  };

  const announceFrameBridgeToParent = () => {
    if (window.parent === window) return;

    try {
      window.parent.postMessage(
        {
          namespace: EXTENSION_PROTOCOL,
          version: EXTENSION_PROTOCOL_VERSION,
          direction: "extension-to-web",
          type: "READY",
          payload: {
            capabilities: ["wideMode", "chatLoginBridge"],
            channelId: frameInfo.channelId,
            frameKind: frameInfo.kind,
            source: "chzzk-frame",
          },
        },
        "*",
      );
    } catch {
      // Cross-origin parent messaging can be unavailable in unusual embeds.
    }
  };

  const registerFrame = () => {
    const currentRuntime = getChromeRuntime();
    if (!currentRuntime) return;

    announceFrameBridgeToParent();

    try {
      currentRuntime.sendMessage(
        {
          kind: INTERNAL_FRAME_READY,
          frame: frameInfo,
        },
        () => {
          void currentRuntime.lastError;
        },
      );
    } catch {
      extensionContextInvalidated = true;
    }
  };

  registerFrame();
  window.setTimeout(registerFrame, 1500);
  window.setTimeout(registerFrame, 4000);

  try {
    runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (
        typeof message !== "object" ||
        message === null ||
        !("kind" in message) ||
        (message.kind !== INTERNAL_RUN_WIDE_MODE &&
          message.kind !== INTERNAL_CHAT_LOGIN_SYNCED)
      ) {
        return false;
      }

      if (message.kind === INTERNAL_CHAT_LOGIN_SYNCED) {
        sendResponse({
          ok: true,
          reloaded: reloadChatFrameAfterLoginSync(
            "syncId" in message ? message.syncId : undefined,
          ),
        });
        return false;
      }

      if (
        !("channelId" in message) ||
        message.channelId !== frameInfo.channelId ||
        frameInfo.kind !== "live"
      ) {
        return false;
      }

      runLivePlayerAutomation()
        .then((result) => sendResponse({ result }))
        .catch(() => sendResponse({ result: "error" }));

      return true;
    });
  } catch {
    extensionContextInvalidated = true;
  }
})();
