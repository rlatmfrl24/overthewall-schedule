import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createSchedulePlusExtensionRequest,
  isPlainObject,
  isSchedulePlusExtensionResponseMessage,
  parseChatLoginBridgeStatus,
  parseExtensionCapabilities,
  parsePlayerOptimizationEnabled,
  parseTileStatuses,
  type SchedulePlusExtensionRequestType,
  type SchedulePlusExtensionResponseMessage,
  type SchedulePlusExtensionState,
} from "./schedule-plus-extension";

const INITIAL_EXTENSION_STATE: SchedulePlusExtensionState = {
  capabilities: [],
  chatLoginBridgeStatus: "disabled",
  lastError: null,
  playerOptimizationEnabled: true,
  status: "missing",
  tileStatuses: {},
};

interface PendingRequest {
  resolve: (message: SchedulePlusExtensionResponseMessage | null) => void;
  timeoutId: number;
}

const REQUEST_TIMEOUT_MS = 8000;
const CAPABILITY_POLL_INTERVAL_MS = 5000;
const INITIAL_HANDSHAKE_DELAYS_MS = [0, 250, 1000, 2500] as const;
const CHZZK_FRAME_ORIGIN = "https://chzzk.naver.com";
type SchedulePlusMessageSource = "otw-bridge" | "chzzk-frame" | "untrusted";

const areStringArraysEqual = (left: string[], right: string[]) =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const isTrustedChzzkFrameSource = (source: MessageEvent["source"]) => {
  if (!source || typeof document === "undefined") return false;

  const frames = document.querySelectorAll<HTMLIFrameElement>(
    "iframe[data-channel-id]",
  );

  for (const frame of frames) {
    if (frame.contentWindow !== source) continue;

    try {
      const frameUrl = new URL(frame.src);
      return (
        frameUrl.origin === CHZZK_FRAME_ORIGIN &&
        frameUrl.pathname.startsWith("/live/")
      );
    } catch {
      return false;
    }
  }

  return false;
};

const getSchedulePlusMessageSource = (
  event: MessageEvent<unknown>,
): SchedulePlusMessageSource => {
  if (event.source === window && event.origin === window.location.origin) {
    return "otw-bridge";
  }

  if (
    event.origin === CHZZK_FRAME_ORIGIN &&
    isTrustedChzzkFrameSource(event.source)
  ) {
    return "chzzk-frame";
  }

  return "untrusted";
};

const isChzzkFrameReadyMessage = (
  message: SchedulePlusExtensionResponseMessage,
) =>
  message.type === "READY" &&
  isPlainObject(message.payload) &&
  message.payload.source === "chzzk-frame";

export function useSchedulePlusExtension(channelIds: string[]) {
  const [state, setState] = useState<SchedulePlusExtensionState>(
    INITIAL_EXTENSION_STATE,
  );
  const requestSeqRef = useRef(0);
  const pendingRequestsRef = useRef(new Map<string, PendingRequest>());
  const optimizedRequestChannelIdsRef = useRef<string[]>([]);
  const channelKey = useMemo(() => channelIds.join(","), [channelIds]);
  const stableChannelIds = useMemo(
    () => (channelKey.length > 0 ? channelKey.split(",") : []),
    [channelKey],
  );

  const sendRequest = useCallback(
    (
      type: SchedulePlusExtensionRequestType,
      payload?: unknown,
    ): Promise<SchedulePlusExtensionResponseMessage | null> => {
      if (typeof window === "undefined") return Promise.resolve(null);

      requestSeqRef.current += 1;
      const requestId = `otw-schedule-plus-${Date.now()}-${requestSeqRef.current}`;

      return new Promise((resolve) => {
        const timeoutId = window.setTimeout(() => {
          pendingRequestsRef.current.delete(requestId);
          resolve(null);
        }, REQUEST_TIMEOUT_MS);

        pendingRequestsRef.current.set(requestId, { resolve, timeoutId });
        window.postMessage(
          createSchedulePlusExtensionRequest(type, requestId, payload),
          window.location.origin,
        );
      });
    },
    [],
  );

  const requestWideMode = useCallback(
    (targetChannelIds = stableChannelIds) => {
      if (targetChannelIds.length === 0) return Promise.resolve(null);
      return sendRequest("REQUEST_WIDE_MODE", { channelIds: targetChannelIds });
    },
    [sendRequest, stableChannelIds],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const pendingRequests = pendingRequestsRef.current;

    const handleMessage = (event: MessageEvent<unknown>) => {
      const messageSource = getSchedulePlusMessageSource(event);
      if (messageSource === "untrusted") return;
      if (!isSchedulePlusExtensionResponseMessage(event.data)) return;

      const message = event.data;
      if (
        messageSource === "chzzk-frame" &&
        !isChzzkFrameReadyMessage(message)
      ) {
        return;
      }

      setState((current) => {
        switch (message.type) {
          case "READY": {
            const capabilities =
              messageSource === "otw-bridge"
                ? parseExtensionCapabilities(message.payload)
                : [];
            const nextCapabilities =
              capabilities.length > 0 ? capabilities : current.capabilities;
            const playerOptimizationEnabled =
              messageSource === "otw-bridge"
                ? parsePlayerOptimizationEnabled(message.payload) ??
                  current.playerOptimizationEnabled
                : current.playerOptimizationEnabled;

            if (
              current.status === "ready" &&
              current.lastError === null &&
              current.playerOptimizationEnabled ===
                playerOptimizationEnabled &&
              areStringArraysEqual(current.capabilities, nextCapabilities)
            ) {
              return current;
            }

            return {
              ...current,
              capabilities: nextCapabilities,
              lastError: null,
              playerOptimizationEnabled,
              status: "ready",
            };
          }
          case "CAPABILITIES": {
            const chatStatus =
              parseChatLoginBridgeStatus(message.payload) ??
              current.chatLoginBridgeStatus;
            const capabilities = parseExtensionCapabilities(message.payload);
            const nextCapabilities =
              capabilities.length > 0 ? capabilities : current.capabilities;
            const playerOptimizationEnabled =
              parsePlayerOptimizationEnabled(message.payload) ??
              current.playerOptimizationEnabled;

            if (
              current.status === "ready" &&
              current.lastError === null &&
              current.chatLoginBridgeStatus === chatStatus &&
              current.playerOptimizationEnabled ===
                playerOptimizationEnabled &&
              areStringArraysEqual(current.capabilities, nextCapabilities)
            ) {
              return current;
            }

            return {
              ...current,
              capabilities: nextCapabilities,
              chatLoginBridgeStatus: chatStatus,
              lastError: null,
              playerOptimizationEnabled,
              status: "ready",
            };
          }
          case "TILE_STATUS":
            return {
              ...current,
              lastError: null,
              playerOptimizationEnabled:
                parsePlayerOptimizationEnabled(message.payload) ??
                current.playerOptimizationEnabled,
              status: "ready",
              tileStatuses: {
                ...current.tileStatuses,
                ...parseTileStatuses(message.payload),
              },
            };
          case "CHAT_LOGIN_STATUS": {
            const chatStatus =
              parseChatLoginBridgeStatus(message.payload) ??
              current.chatLoginBridgeStatus;
            return {
              ...current,
              chatLoginBridgeStatus: chatStatus,
              lastError: null,
              status: "ready",
            };
          }
          case "ERROR":
            return {
              ...current,
              lastError: "확장 프로그램 응답을 처리하지 못했습니다.",
              status: current.status === "missing" ? "ready" : current.status,
            };
          default:
            return current;
        }
      });

      if (messageSource === "otw-bridge" && message.requestId) {
        const pending = pendingRequestsRef.current.get(message.requestId);
        if (pending) {
          window.clearTimeout(pending.timeoutId);
          pendingRequestsRef.current.delete(message.requestId);
          pending.resolve(message);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    const handshakeTimeoutIds = INITIAL_HANDSHAKE_DELAYS_MS.map((delayMs) =>
      window.setTimeout(() => {
        void sendRequest(delayMs === 0 ? "PING" : "GET_CAPABILITIES");
      }, delayMs),
    );
    const capabilityPollId = window.setInterval(() => {
      void sendRequest("GET_CAPABILITIES");
    }, CAPABILITY_POLL_INTERVAL_MS);

    return () => {
      handshakeTimeoutIds.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      window.clearInterval(capabilityPollId);
      window.removeEventListener("message", handleMessage);
      pendingRequests.forEach((pending) => {
        window.clearTimeout(pending.timeoutId);
        pending.resolve(null);
      });
      pendingRequests.clear();
    };
  }, [sendRequest]);

  useEffect(() => {
    if (state.status === "missing" || stableChannelIds.length === 0) return;
    if (!state.playerOptimizationEnabled) return;

    const previousChannelIds = new Set(optimizedRequestChannelIdsRef.current);
    const addedChannelIds = stableChannelIds.filter(
      (channelId) => !previousChannelIds.has(channelId),
    );
    optimizedRequestChannelIdsRef.current = stableChannelIds;

    if (addedChannelIds.length === 0) return;

    const firstAttempt = window.setTimeout(() => {
      void requestWideMode(addedChannelIds);
    }, 800);
    const secondAttempt = window.setTimeout(() => {
      void requestWideMode(addedChannelIds);
    }, 2500);

    return () => {
      window.clearTimeout(firstAttempt);
      window.clearTimeout(secondAttempt);
    };
  }, [
    channelKey,
    requestWideMode,
    stableChannelIds,
    stableChannelIds.length,
    state.playerOptimizationEnabled,
    state.status,
  ]);

  return {
    ...state,
    requestWideMode,
  };
}
