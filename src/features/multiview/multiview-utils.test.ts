import { describe, expect, it } from "vitest";
import {
  buildMulLiveUrl,
  buildMultiviewSearchParams,
  dedupeMultiviewChannelIds,
  extractMultiviewChannelId,
  extractMultiviewChzzkChannelId,
  parseMultiviewUrlState,
} from "./multiview-utils";

const CHANNEL_A = "29a1ed5c0829fa620fab900dba7e011b";
const CHANNEL_B = "19a1ed5c0829fa620fab900dba7e011c";

describe("multiview utils", () => {
  it("accepts raw 32-hex IDs and supported CHZZK URL forms", () => {
    expect(extractMultiviewChannelId(CHANNEL_A.toUpperCase())).toBe(CHANNEL_A);
    expect(extractMultiviewChzzkChannelId(CHANNEL_A.toUpperCase())).toBe(
      CHANNEL_A,
    );
    expect(extractMultiviewChannelId(`https://chzzk.naver.com/${CHANNEL_A}`)).toBe(
      CHANNEL_A,
    );
    expect(
      extractMultiviewChannelId(`https://chzzk.naver.com/live/${CHANNEL_A}`),
    ).toBe(CHANNEL_A);
    expect(
      extractMultiviewChannelId(`https://chzzk.naver.com/channel/${CHANNEL_A}`),
    ).toBe(CHANNEL_A);
  });

  it("rejects non-CHZZK, malformed, and non-32-hex input", () => {
    expect(extractMultiviewChannelId("")).toBeNull();
    expect(extractMultiviewChannelId("abc")).toBeNull();
    expect(extractMultiviewChannelId("https://example.com/live/abc")).toBeNull();
    expect(
      extractMultiviewChannelId("https://chzzk.naver.com/live/nothex"),
    ).toBeNull();
  });

  it("dedupes channel IDs and builds Mul.Live URLs", () => {
    expect(
      dedupeMultiviewChannelIds([
        CHANNEL_A,
        CHANNEL_A.toUpperCase(),
        `https://chzzk.naver.com/live/${CHANNEL_B}`,
      ]),
    ).toEqual([CHANNEL_A, CHANNEL_B]);

    expect(buildMulLiveUrl([CHANNEL_A, CHANNEL_B, CHANNEL_A])).toBe(
      `https://mul.live/${CHANNEL_A}/${CHANNEL_B}`,
    );
    expect(buildMulLiveUrl([])).toBe("https://mul.live/");
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
