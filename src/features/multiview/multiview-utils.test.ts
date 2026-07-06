import { describe, expect, it } from "vitest";
import {
  buildMulLiveUrl,
  dedupeMultiviewChannelIds,
  extractMultiviewChannelId,
} from "./multiview-utils";

const CHANNEL_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CHANNEL_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("multiview utils", () => {
  it("extracts supported CHZZK channel IDs", () => {
    expect(extractMultiviewChannelId(CHANNEL_A.toUpperCase())).toBe(CHANNEL_A);
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

  it("rejects unsupported or malformed channel inputs", () => {
    expect(extractMultiviewChannelId("aaa")).toBeNull();
    expect(extractMultiviewChannelId("https://example.com/live/aaa")).toBeNull();
    expect(extractMultiviewChannelId("")).toBeNull();
  });

  it("dedupes channel IDs and builds Mul.Live URLs", () => {
    expect(
      dedupeMultiviewChannelIds([
        CHANNEL_A,
        CHANNEL_A.toUpperCase(),
        `https://chzzk.naver.com/live/${CHANNEL_B}`,
      ]),
    ).toEqual([CHANNEL_A, CHANNEL_B]);

    expect(buildMulLiveUrl([CHANNEL_A, CHANNEL_B])).toBe(
      `https://mul.live/${CHANNEL_A}/${CHANNEL_B}`,
    );
    expect(buildMulLiveUrl([])).toBe("https://mul.live/");
  });
});
