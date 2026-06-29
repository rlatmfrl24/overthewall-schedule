(() => {
  const bridgeWindow = window as Window & {
    __otwSchedulePlusBridgeV1?: {
      cleanup?: () => void;
    };
    __otwSchedulePlusBridgeV1Installed?: boolean;
  };

  bridgeWindow.__otwSchedulePlusBridgeV1?.cleanup?.();
  bridgeWindow.__otwSchedulePlusBridgeV1Installed = true;

  const EXTENSION_PROTOCOL = "OTW_SCHEDULE_PLUS_EXTENSION/V1";
  const EXTENSION_PROTOCOL_VERSION = 1;
  const INTERNAL_MULTIVIEW_PAGE_READY = "OTW_EXTENSION_MULTIVIEW_PAGE_READY";
  const INTERNAL_WEB_APP_MESSAGE = "OTW_EXTENSION_WEB_APP_MESSAGE";
  const OTW_PRODUCTION_HOST = "otw-schedule.info";
  const OTW_DEV_HOSTS = new Set(["localhost", "127.0.0.1"]);
  const LOCATION_POLL_INTERVAL_MS = 500;
  const READY_BROADCAST_INTERVAL_MS = 2000;
  const WEB_MESSAGE_TYPES = new Set([
    "PING",
    "GET_CAPABILITIES",
    "REQUEST_WIDE_MODE",
    "SET_CHAT_LOGIN_BRIDGE",
  ]);

  interface WebAppBridgeRequest {
    namespace: string;
    requestId: string;
  }
  interface RuntimeLike {
    lastError?: { message?: string };
    sendMessage: (
      message: unknown,
      callback?: (response?: unknown) => void,
    ) => void;
  }

  let bridgeInvalidated = false;
  let lastObservedHref = window.location.href;
  const cleanupCallbacks: Array<() => void> = [];

  const registerCleanup = (cleanup: () => void) => {
    cleanupCallbacks.push(cleanup);
  };

  bridgeWindow.__otwSchedulePlusBridgeV1 = {
    cleanup: () => {
      bridgeInvalidated = true;
      cleanupCallbacks.splice(0).forEach((cleanup) => cleanup());
    },
  };

  const getRuntime = (): RuntimeLike | undefined => {
    if (bridgeInvalidated) return undefined;

    try {
      return typeof chrome === "undefined" ? undefined : chrome.runtime;
    } catch {
      bridgeInvalidated = true;
      return undefined;
    }
  };

  const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

  const isMultiviewPath = (pathname: string) =>
    pathname === "/multiview" || pathname.startsWith("/multiview/");

  const isAllowedOtwMultiviewPage = () => {
    if (!isMultiviewPath(window.location.pathname)) return false;

    if (
      window.location.protocol === "https:" &&
      window.location.hostname === OTW_PRODUCTION_HOST
    ) {
      return true;
    }

    return (
      (window.location.protocol === "http:" ||
        window.location.protocol === "https:") &&
      OTW_DEV_HOSTS.has(window.location.hostname)
    );
  };

  const isWebAppRequest = (value: unknown): value is WebAppBridgeRequest =>
    isPlainObject(value) &&
    value.namespace === EXTENSION_PROTOCOL &&
    value.version === EXTENSION_PROTOCOL_VERSION &&
    value.direction === "web-to-extension" &&
    typeof value.requestId === "string" &&
    WEB_MESSAGE_TYPES.has(String(value.type));

  const postToPage = (message: unknown) => {
    window.postMessage(message, window.location.origin);
  };

  const createMessage = (
    type: string,
    payload?: unknown,
    requestId?: string,
    namespace = EXTENSION_PROTOCOL,
  ) => ({
    namespace,
    version: EXTENSION_PROTOCOL_VERSION,
    direction: "extension-to-web",
    type,
    requestId,
    payload,
  });

  const withResponseNamespace = (response: unknown, namespace: string) => {
    if (
      !isPlainObject(response) ||
      response.version !== EXTENSION_PROTOCOL_VERSION ||
      response.direction !== "extension-to-web"
    ) {
      return response;
    }

    return {
      ...response,
      namespace,
    };
  };

  const postExtensionUnavailable = (
    request: WebAppBridgeRequest,
    message = "Extension context invalidated. Reload the page after reloading the extension.",
  ) => {
    postToPage(
      createMessage(
        "ERROR",
        { reason: "extension_unavailable", message },
        request.requestId,
        request.namespace,
      ),
    );
  };

  const sendRuntimeMessage = (
    request: WebAppBridgeRequest,
    message: unknown,
    callback: (response: unknown, runtime: RuntimeLike) => void,
  ) => {
    const runtime = getRuntime();
    if (!runtime) {
      postExtensionUnavailable(request);
      return;
    }

    try {
      runtime.sendMessage(message, (response) => callback(response, runtime));
    } catch (error) {
      bridgeInvalidated = true;
      postExtensionUnavailable(
        request,
        error instanceof Error ? error.message : "Extension context invalidated.",
      );
    }
  };

  if (!getRuntime()) return;

  const postReady = () => {
    if (!isAllowedOtwMultiviewPage()) return;

    const runtime = getRuntime();
    try {
      runtime?.sendMessage(
        {
          kind: INTERNAL_MULTIVIEW_PAGE_READY,
        },
        () => {
          void runtime.lastError;
        },
      );
    } catch {
      bridgeInvalidated = true;
    }

    postToPage(
      createMessage("READY", {
        capabilities: ["wideMode", "chatLoginBridge"],
      }),
    );
  };

  const scheduleReadyAnnouncement = () => {
    window.setTimeout(postReady, 0);
    window.setTimeout(postReady, 250);
  };

  const patchHistoryMethod = (method: "pushState" | "replaceState") => {
    const original = window.history[method].bind(window.history);

    window.history[method] = ((...args: Parameters<History["pushState"]>) => {
      const result = original(...args);
      scheduleReadyAnnouncement();
      return result;
    }) as History[typeof method];
  };

  try {
    patchHistoryMethod("pushState");
    patchHistoryMethod("replaceState");
  } catch {
    // Some browsers or test harnesses may prevent patching history methods.
  }

  window.addEventListener("popstate", scheduleReadyAnnouncement);
  registerCleanup(() =>
    window.removeEventListener("popstate", scheduleReadyAnnouncement),
  );
  window.addEventListener("pageshow", scheduleReadyAnnouncement);
  registerCleanup(() =>
    window.removeEventListener("pageshow", scheduleReadyAnnouncement),
  );
  const handleVisibilityChange = () => {
    if (!document.hidden) scheduleReadyAnnouncement();
  };
  document.addEventListener("visibilitychange", handleVisibilityChange);
  registerCleanup(() =>
    document.removeEventListener("visibilitychange", handleVisibilityChange),
  );
  const locationPollId = window.setInterval(() => {
    if (window.location.href === lastObservedHref) return;
    lastObservedHref = window.location.href;
    scheduleReadyAnnouncement();
  }, LOCATION_POLL_INTERVAL_MS);
  registerCleanup(() => window.clearInterval(locationPollId));
  const readyBroadcastId = window.setInterval(
    scheduleReadyAnnouncement,
    READY_BROADCAST_INTERVAL_MS,
  );
  registerCleanup(() => window.clearInterval(readyBroadcastId));

  scheduleReadyAnnouncement();

  const handlePageMessage = (event: MessageEvent<unknown>) => {
    if (!isAllowedOtwMultiviewPage()) return;
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;
    const request = event.data;
    if (!isWebAppRequest(request)) return;

    sendRuntimeMessage(
      request,
      {
        kind: INTERNAL_WEB_APP_MESSAGE,
        message: request,
      },
      (response, runtime) => {
        const error = runtime.lastError?.message;
        if (error) {
          postToPage(
            createMessage(
              "ERROR",
              { reason: "extension_unavailable", message: error },
              request.requestId,
              request.namespace,
            ),
          );
          return;
        }

        if (response) {
          postToPage(withResponseNamespace(response, request.namespace));
        }
      },
    );
  };
  window.addEventListener("message", handlePageMessage);
  registerCleanup(() => window.removeEventListener("message", handlePageMessage));
})();
