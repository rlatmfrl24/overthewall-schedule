import { describe, expect, it } from "vitest";
import {
  buildMulLiveUrl,
  buildMultiviewSearchParams,
  calculateMultiviewFrameScale,
  calculateMultiviewFrameViewport,
  calculateMultiviewGrid,
  extractMultiviewChzzkChannelId,
  getFrameSizePreset,
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
  it("de-dupes channels, preserves order, validates chat, and supports dense layout", () => {
    const params = new URLSearchParams();
    params.append("c", CHANNEL_A);
    params.append("c", CHANNEL_B);
    params.append("c", CHANNEL_A);
    params.set("chat", CHANNEL_B);
    params.set("layout", "dense");

    expect(parseMultiviewUrlState(params)).toEqual({
      channelIds: [CHANNEL_A, CHANNEL_B],
      chatChannelId: CHANNEL_B,
      layout: "dense",
    });
  });

  it("defaults removed focus layout URLs to auto", () => {
    const params = new URLSearchParams();
    params.append("c", CHANNEL_A);
    params.set("layout", "focus");

    expect(parseMultiviewUrlState(params)).toEqual({
      channelIds: [CHANNEL_A],
      chatChannelId: CHANNEL_A,
      layout: "auto",
    });
  });

  it("serializes selected channels, chat, and non-default layout", () => {
    const params = buildMultiviewSearchParams({
      channelIds: [CHANNEL_A, CHANNEL_B, CHANNEL_A],
      chatChannelId: CHANNEL_B,
      layout: "dense",
    });

    expect(params.getAll("c")).toEqual([CHANNEL_A, CHANNEL_B]);
    expect(params.get("chat")).toBe(CHANNEL_B);
    expect(params.get("layout")).toBe("dense");
  });
});

describe("multiview frame sizing", () => {
  it("keeps the default tile narrow enough for two columns while preserving iframe scroll room", () => {
    const preset = getFrameSizePreset("comfortable");

    expect(preset.tileMinWidth).toBeLessThanOrEqual(440);
    expect(preset.tileMinHeight).toBeGreaterThanOrEqual(360);
    expect(preset.frameMinWidth).toBeGreaterThan(preset.tileMinWidth);
    expect(preset.frameMinHeight).toBeGreaterThan(preset.tileMinHeight);
  });

  it("keeps iframe source mode larger than the visible tile minimum", () => {
    const preset = getFrameSizePreset("source");

    expect(preset.tileMinWidth).toBeGreaterThanOrEqual(640);
    expect(preset.tileMinHeight).toBeGreaterThanOrEqual(460);
    expect(preset.frameMinWidth).toBeGreaterThan(preset.tileMinWidth);
    expect(preset.frameMinHeight).toBeGreaterThan(preset.tileMinHeight);
  });
});

describe("calculateMultiviewGrid", () => {
  it("fits six streams into the visible canvas without requiring outer scroll", () => {
    expect(
      calculateMultiviewGrid({
        containerHeight: 591,
        containerWidth: 920,
        layout: "dense",
        preferredTileMinHeight: 360,
        preferredTileMinWidth: 440,
        sourceCount: 6,
      }),
    ).toEqual({ columns: 3, rows: 2 });
  });

  it("keeps common stream counts in stable balanced layouts", () => {
    const base = {
      containerHeight: 720,
      containerWidth: 1280,
      layout: "auto" as const,
      preferredTileMinHeight: 360,
      preferredTileMinWidth: 440,
    };

    expect(calculateMultiviewGrid({ ...base, sourceCount: 1 })).toEqual({
      columns: 1,
      rows: 1,
    });
    expect(calculateMultiviewGrid({ ...base, sourceCount: 2 })).toEqual({
      columns: 2,
      rows: 1,
    });
    expect(calculateMultiviewGrid({ ...base, sourceCount: 4 })).toEqual({
      columns: 2,
      rows: 2,
    });
  });
});

describe("calculateMultiviewFrameScale", () => {
  it("scales the virtual CHZZK viewport to fit inside each tile", () => {
    const scale = calculateMultiviewFrameScale({
      containerHeight: 591,
      containerWidth: 920,
      frameMinHeight: 560,
      frameMinWidth: 860,
      grid: { columns: 3, rows: 2 },
      layout: "dense",
      tileHeaderHeight: 36,
    });

    expect(scale).toBeGreaterThan(0.2);
    expect(scale).toBeLessThan(1);
  });

  it("does not upscale iframe content beyond its source viewport", () => {
    expect(
      calculateMultiviewFrameScale({
        containerHeight: 1200,
        containerWidth: 1920,
        frameMinHeight: 560,
        frameMinWidth: 860,
        grid: { columns: 1, rows: 1 },
        layout: "auto",
        tileHeaderHeight: 36,
      }),
    ).toBe(1);
  });
});

describe("calculateMultiviewFrameViewport", () => {
  it("expands the iframe viewport beyond its minimum when a tile has extra room", () => {
    const viewport = calculateMultiviewFrameViewport({
      containerHeight: 1080,
      containerWidth: 1920,
      frameMinHeight: 560,
      frameMinWidth: 860,
      grid: { columns: 1, rows: 1 },
      layout: "auto",
      tileHeaderHeight: 36,
    });

    expect(viewport.scale).toBe(1);
    expect(viewport.width).toBeGreaterThan(1800);
    expect(viewport.height).toBeGreaterThan(1000);
  });

  it("keeps the scaled iframe covering the visible tile area in dense layouts", () => {
    const viewport = calculateMultiviewFrameViewport({
      containerHeight: 591,
      containerWidth: 920,
      frameMinHeight: 560,
      frameMinWidth: 860,
      grid: { columns: 3, rows: 2 },
      layout: "dense",
      tileHeaderHeight: 36,
    });

    expect(viewport.scale).toBeLessThan(1);
    expect(viewport.width * viewport.scale).toBeGreaterThan(300);
    expect(viewport.height * viewport.scale).toBeGreaterThan(250);
  });
});

describe("buildMulLiveUrl", () => {
  it("builds slash-separated Mul.Live fallback URLs", () => {
    expect(buildMulLiveUrl([CHANNEL_A, CHANNEL_B, CHANNEL_A])).toBe(
      `https://mul.live/${CHANNEL_A}/${CHANNEL_B}`,
    );
  });
});
