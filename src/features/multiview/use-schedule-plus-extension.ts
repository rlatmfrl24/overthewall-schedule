import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createSchedulePlusExtensionRequest,
  getExtensionStatusFromChatStatus,
  isSchedulePlusExtensionResponseMessage,
  parseChatLoginBridgeStatus,
  parseExtensionCapabilities,
  parsePlayerOptimizationEnabled,
  parseTileStatuses,
  SCHEDULE_PLUS_EXTENSION_PROTOCOLS,
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

export function useSchedulePlusExtension(channelIds: string[]) {
  const [state, setState] = useState<SchedulePlusExtensionState>(
    INITIAL_EXTENSION_STATE,
  );
  const requestSeqRef = useRef(0);
  const pendingRequestsRef = useRef(new Map<string, PendingRequest>());
  const optimizedRequestChannelIdsRef = useRef<string[]>([]);
  const channelKey = useMemo(() => channelIds.join(","), [channelIds]);

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
        SCHEDULE_PLUS_EXTENSION_PROTOCOLS.forEach((namespace) => {
          window.postMessage(
            createSchedulePlusExtensionRequest(
              type,
              requestId,
              payload,
              namespace,
            ),
            window.location.origin,
          );
        });
      });
    },
    [],
  );

  const requestWideMode = useCallback(
    (targetChannelIds = channelIds) => {
      if (targetChannelIds.length === 0) return Promise.resolve(null);
      return sendRequest("REQUEST_WIDE_MODE", { channelIds: targetChannelIds });
    },
    [channelIds, sendRequest],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const pendingRequests = pendingRequestsRef.current;

    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== window) return;
      if (event.origin !== window.location.origin) return;
      if (!isSchedulePlusExtensionResponseMessage(event.data)) return;

      const message = event.data;

      setState((current) => {
        switch (message.type) {
          case "READY":
          case "CAPABILITIES": {
            const chatStatus =
              parseChatLoginBridgeStatus(message.payload) ??
              current.chatLoginBridgeStatus;
            const capabilities = parseExtensionCapabilities(message.payload);
            const playerOptimizationEnabled =
              parsePlayerOptimizationEnabled(message.payload) ??
              current.playerOptimizationEnabled;

            return {
              ...current,
              capabilities:
                capabilities.length > 0 ? capabilities : current.capabilities,
              chatLoginBridgeStatus: chatStatus,
              lastError: null,
              playerOptimizationEnabled,
              status: getExtensionStatusFromChatStatus(chatStatus),
            };
          }
          case "TILE_STATUS":
            return {
              ...current,
              lastError: null,
              playerOptimizationEnabled:
                parsePlayerOptimizationEnabled(message.payload) ??
                current.playerOptimizationEnabled,
              status: current.status === "missing" ? "ready" : current.status,
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
              status: getExtensionStatusFromChatStatus(chatStatus),
            };
          }
          case "ERROR":
            return {
              ...current,
              lastError: "확장 프로그램 응답을 처리하지 못했습니다.",
              status: "error",
            };
          default:
            return current;
        }
      });

      if (message.requestId) {
        const pending = pendingRequestsRef.current.get(message.requestId);
        if (pending) {
          window.clearTimeout(pending.timeoutId);
          pendingRequestsRef.current.delete(message.requestId);
          pending.resolve(message);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    void sendRequest("PING");
    const capabilityPollId = window.setInterval(() => {
      void sendRequest("GET_CAPABILITIES");
    }, CAPABILITY_POLL_INTERVAL_MS);

    return () => {
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
    if (state.status === "missing" || channelIds.length === 0) return;
    if (!state.playerOptimizationEnabled) return;

    const previousChannelIds = new Set(optimizedRequestChannelIdsRef.current);
    const addedChannelIds = channelIds.filter(
      (channelId) => !previousChannelIds.has(channelId),
    );
    optimizedRequestChannelIdsRef.current = channelIds;

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
    channelIds,
    channelIds.length,
    channelKey,
    requestWideMode,
    state.playerOptimizationEnabled,
    state.status,
  ]);

  return {
    ...state,
    requestWideMode,
  };
}
