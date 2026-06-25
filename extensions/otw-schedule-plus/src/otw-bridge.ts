(() => {
  const EXTENSION_PROTOCOL = "OTW_SCHEDULE_PLUS_EXTENSION/V1";
  const LEGACY_MULTIVIEW_EXTENSION_PROTOCOL = "OTW_MULTIVIEW_EXTENSION/V1";
  const EXTENSION_PROTOCOL_VERSION = 1;
  const EXTENSION_PROTOCOLS = [
    EXTENSION_PROTOCOL,
    LEGACY_MULTIVIEW_EXTENSION_PROTOCOL,
  ];
  const INTERNAL_WEB_APP_MESSAGE = "OTW_EXTENSION_WEB_APP_MESSAGE";
  const OTW_PRODUCTION_HOST = "otw-schedule.info";
  const OTW_DEV_HOSTS = new Set(["localhost", "127.0.0.1"]);
  const OTW_DEV_PORTS = new Set(["5173", "5178", "5278"]);
  const WEB_MESSAGE_TYPES = new Set([
    "PING",
    "GET_CAPABILITIES",
    "REQUEST_WIDE_MODE",
    "SET_CHAT_LOGIN_BRIDGE",
  ]);
  const ACCEPTED_PROTOCOLS = new Set<string>(EXTENSION_PROTOCOLS);

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
      OTW_DEV_HOSTS.has(window.location.hostname) &&
      OTW_DEV_PORTS.has(window.location.port)
    );
  };

  const isWebAppRequest = (value: unknown): value is WebAppBridgeRequest =>
    isPlainObject(value) &&
    typeof value.namespace === "string" &&
    ACCEPTED_PROTOCOLS.has(value.namespace) &&
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

  if (isAllowedOtwMultiviewPage()) {
    EXTENSION_PROTOCOLS.forEach((namespace) => {
      postToPage(
        createMessage(
          "READY",
          {
            capabilities: ["wideMode", "chatLoginBridge"],
            chatLoginBridgeStatus: "disabled",
          },
          undefined,
          namespace,
        ),
      );
    });
  }

  window.addEventListener("message", (event) => {
    if (!isAllowedOtwMultiviewPage()) return;
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;
    if (!isWebAppRequest(event.data)) return;

    sendRuntimeMessage(
      event.data,
      {
        kind: INTERNAL_WEB_APP_MESSAGE,
        message: event.data,
      },
      (response, runtime) => {
        const error = runtime.lastError?.message;
        if (error) {
          postToPage(
            createMessage(
              "ERROR",
              { reason: "extension_unavailable", message: error },
              event.data.requestId,
              event.data.namespace,
            ),
          );
          return;
        }

        if (response) {
          postToPage(withResponseNamespace(response, event.data.namespace));
        }
      },
    );
  });
})();
