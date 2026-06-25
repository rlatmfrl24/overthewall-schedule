import { describe, expect, it } from "vitest";
import {
  SCHEDULE_PLUS_EXTENSION_PROTOCOL,
  SCHEDULE_PLUS_EXTENSION_PROTOCOL_VERSION,
  createSchedulePlusExtensionRequest,
  getExtensionStatusFromChatStatus,
  isSchedulePlusExtensionResponseMessage,
  parseChatLoginBridgeStatus,
  parseExtensionCapabilities,
  parsePlayerOptimizationEnabled,
  parseTileStatuses,
} from "./schedule-plus-extension";

const CHANNEL_A = "29a1ed5c0829fa620fab900dba7e011b";

describe("schedule plus extension bridge helpers", () => {
  it("creates versioned requests for the page bridge", () => {
    expect(createSchedulePlusExtensionRequest("PING", "request-1")).toEqual({
      namespace: SCHEDULE_PLUS_EXTENSION_PROTOCOL,
      version: SCHEDULE_PLUS_EXTENSION_PROTOCOL_VERSION,
      direction: "web-to-extension",
      type: "PING",
      requestId: "request-1",
      payload: undefined,
    });
  });

  it("accepts extension-to-web messages only from the current protocol", () => {
    expect(
      isSchedulePlusExtensionResponseMessage({
        namespace: SCHEDULE_PLUS_EXTENSION_PROTOCOL,
        version: SCHEDULE_PLUS_EXTENSION_PROTOCOL_VERSION,
        direction: "extension-to-web",
        type: "CAPABILITIES",
      }),
    ).toBe(true);

    expect(
      isSchedulePlusExtensionResponseMessage({
        namespace: "UNRELATED_OLD_EXTENSION/V1",
        version: SCHEDULE_PLUS_EXTENSION_PROTOCOL_VERSION,
        direction: "extension-to-web",
        type: "CAPABILITIES",
      }),
    ).toBe(false);

    expect(
      isSchedulePlusExtensionResponseMessage({
        namespace: SCHEDULE_PLUS_EXTENSION_PROTOCOL,
        version: SCHEDULE_PLUS_EXTENSION_PROTOCOL_VERSION,
        direction: "web-to-extension",
        type: "CAPABILITIES",
      }),
    ).toBe(false);

    expect(
      isSchedulePlusExtensionResponseMessage({
        namespace: "UNRELATED_EXTENSION/V1",
        version: SCHEDULE_PLUS_EXTENSION_PROTOCOL_VERSION,
        direction: "extension-to-web",
        type: "CAPABILITIES",
      }),
    ).toBe(false);
  });

  it("parses capability and status payloads without accepting unknown values", () => {
    expect(
      parseExtensionCapabilities({
        capabilities: ["wideMode", "chatLoginBridge", "cookieValues"],
      }),
    ).toEqual(["wideMode", "chatLoginBridge"]);
    expect(parseChatLoginBridgeStatus({ status: "needs_login" })).toBe(
      "needs_login",
    );
    expect(parseChatLoginBridgeStatus({ status: "cookie_leaked" })).toBeNull();
    expect(
      parsePlayerOptimizationEnabled({ playerOptimizationEnabled: false }),
    ).toBe(false);
    expect(parsePlayerOptimizationEnabled({ playerOptimizationEnabled: "0" }))
      .toBeNull();
  });

  it("parses tile statuses with known result values only", () => {
    expect(
      parseTileStatuses({
        statuses: {
          [CHANNEL_A.toUpperCase()]: "selector_missing",
          ignored: "cookie_value",
        },
      }),
    ).toEqual({
      [CHANNEL_A]: "selector_missing",
    });
  });

  it("maps chat bridge failures to extension-level statuses", () => {
    expect(getExtensionStatusFromChatStatus("enabled")).toBe("ready");
    expect(getExtensionStatusFromChatStatus("permission_missing")).toBe(
      "permission_missing",
    );
    expect(getExtensionStatusFromChatStatus("unsupported")).toBe("unsupported");
    expect(getExtensionStatusFromChatStatus("error")).toBe("error");
  });
});
