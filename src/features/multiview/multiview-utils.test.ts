import { describe, expect, it } from "vitest";
import {
  buildMulLiveUrl,
  buildMultiviewSearchParams,
  extractMultiviewChzzkChannelId,
  parseMultiviewUrlState,
} from "./multiview-utils";

const CHANNEL_A = "29a1ed5c0829fa620fab900dba7e011b";
const CHANNEL_B = "19a1ed5c0829fa620fab900dba7e011c";

describe("extractMultiviewChzzkChannelId", () => {
  it("accepts raw 32-hex IDs and supported CHZZK URL forms", () => {
    expect(extractMultiviewChzzkChannelId(CHANNEL_A.toUpperCase())).toBe(
      CHANNEL_A,
    );
    expect(
      extractMultiviewChzzkChannelId(`https://chzzk.naver.com/${CHANNEL_A}`),
    ).toBe(CHANNEL_A);
    expect(
      extractMultiviewChzzkChannelId(
        `https://chzzk.naver.com/live/${CHANNEL_A}`,
      ),
    ).toBe(CHANNEL_A);
    expect(
      extractMultiviewChzzkChannelId(
        `https://chzzk.naver.com/channel/${CHANNEL_A}`,
      ),
    ).toBe(CHANNEL_A);
  });

  it("rejects non-CHZZK, malformed, and non-32-hex input", () => {
    expect(extractMultiviewChzzkChannelId("")).toBeNull();
    expect(extractMultiviewChzzkChannelId("abc")).toBeNull();
    expect(extractMultiviewChzzkChannelId("https://example.com/live/abc")).toBeNull();
    expect(
      extractMultiviewChzzkChannelId("https://chzzk.naver.com/live/nothex"),
    ).toBeNull();
  });
});

describe("multiview URL state", () => {
  it("de-dupes selected channels and preserves order", () => {
    const params = new URLSearchParams();
    params.append("c", CHANNEL_A);
    params.append("c", CHANNEL_B);
    params.append("c", CHANNEL_A);
    params.set("chat", CHANNEL_B);
    params.set("layout", "dense");

    expect(parseMultiviewUrlState(params)).toEqual({
      channelIds: [CHANNEL_A, CHANNEL_B],
    });
  });

  it("serializes selected channels only", () => {
    const params = buildMultiviewSearchParams({
      channelIds: [CHANNEL_A, CHANNEL_B, CHANNEL_A],
    });

    expect(params.getAll("c")).toEqual([CHANNEL_A, CHANNEL_B]);
    expect(params.has("chat")).toBe(false);
    expect(params.has("layout")).toBe(false);
  });
});

describe("buildMulLiveUrl", () => {
  it("builds slash-separated Mul.Live URLs", () => {
    expect(buildMulLiveUrl([CHANNEL_A, CHANNEL_B, CHANNEL_A])).toBe(
      `https://mul.live/${CHANNEL_A}/${CHANNEL_B}`,
    );
  });

  it("returns the Mul.Live root when no channels are selected", () => {
    expect(buildMulLiveUrl([])).toBe("https://mul.live/");
  });
});
