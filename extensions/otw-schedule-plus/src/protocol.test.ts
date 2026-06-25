import { describe, expect, it } from "vitest";
import {
  EXTENSION_PROTOCOL,
  EXTENSION_PROTOCOL_VERSION,
  extractChzzkFrameInfo,
  getOtwTopLevelSite,
  isAllowedOtwMultiviewUrl,
  isWebAppRequestMessage,
  normalizeChannelIds,
} from "./protocol";

const CHANNEL_A = "29a1ed5c0829fa620fab900dba7e011b";
const CHANNEL_B = "19a1ed5c0829fa620fab900dba7e011c";

describe("extension protocol", () => {
  it("validates only versioned OTW schedule plus web app messages", () => {
    expect(
      isWebAppRequestMessage({
        namespace: EXTENSION_PROTOCOL,
        version: EXTENSION_PROTOCOL_VERSION,
        direction: "web-to-extension",
        type: "PING",
        requestId: "request-1",
      }),
    ).toBe(true);

    expect(
      isWebAppRequestMessage({
        namespace: "UNRELATED_OLD_EXTENSION/V1",
        version: EXTENSION_PROTOCOL_VERSION,
        direction: "web-to-extension",
        type: "PING",
        requestId: "request-1",
      }),
    ).toBe(false);

    expect(
      isWebAppRequestMessage({
        namespace: EXTENSION_PROTOCOL,
        version: 2,
        direction: "web-to-extension",
        type: "PING",
        requestId: "request-1",
      }),
    ).toBe(false);

    expect(
      isWebAppRequestMessage({
        namespace: EXTENSION_PROTOCOL,
        version: EXTENSION_PROTOCOL_VERSION,
        direction: "extension-to-web",
        type: "PING",
        requestId: "request-1",
      }),
    ).toBe(false);

    expect(
      isWebAppRequestMessage({
        namespace: "UNRELATED_EXTENSION/V1",
        version: EXTENSION_PROTOCOL_VERSION,
        direction: "web-to-extension",
        type: "PING",
        requestId: "request-1",
      }),
    ).toBe(false);
  });

  it("normalizes channel IDs without duplicates", () => {
    expect(normalizeChannelIds([CHANNEL_A, CHANNEL_B, CHANNEL_A.toUpperCase()]))
      .toEqual([CHANNEL_A, CHANNEL_B]);
  });

  it("extracts CHZZK live and chat frame metadata", () => {
    expect(extractChzzkFrameInfo(`https://chzzk.naver.com/live/${CHANNEL_A}`))
      .toEqual({
        channelId: CHANNEL_A,
        kind: "live",
      });
    expect(
      extractChzzkFrameInfo(`https://chzzk.naver.com/live/${CHANNEL_A}/chat`),
    ).toEqual({
      channelId: CHANNEL_A,
      kind: "chat",
    });
    expect(extractChzzkFrameInfo("https://example.com/live/test")).toBeNull();
  });

  it("allows only the OTW multiview page and known development ports", () => {
    expect(
      isAllowedOtwMultiviewUrl("https://otw-schedule.info/multiview"),
    ).toBe(true);
    expect(
      isAllowedOtwMultiviewUrl(
        "https://otw-schedule.info/multiview?c=29a1",
      ),
    ).toBe(true);
    expect(
      isAllowedOtwMultiviewUrl("http://127.0.0.1:5278/multiview"),
    ).toBe(true);
    expect(
      isAllowedOtwMultiviewUrl("http://localhost:5173/multiview"),
    ).toBe(true);

    expect(isAllowedOtwMultiviewUrl("https://otw-schedule.info/")).toBe(false);
    expect(isAllowedOtwMultiviewUrl("http://127.0.0.1:3000/multiview"))
      .toBe(false);
    expect(isAllowedOtwMultiviewUrl("http://127.0.0.1:5278/")).toBe(false);
    expect(isAllowedOtwMultiviewUrl("https://example.com/multiview")).toBe(
      false,
    );
  });

  it("returns top-level site only for allowed OTW multiview URLs", () => {
    expect(getOtwTopLevelSite("https://otw-schedule.info/multiview")).toBe(
      "https://otw-schedule.info",
    );
    expect(getOtwTopLevelSite("http://localhost:5178/multiview")).toBe(
      "http://localhost",
    );
    expect(getOtwTopLevelSite("http://localhost:3000/multiview")).toBeNull();
  });
});
