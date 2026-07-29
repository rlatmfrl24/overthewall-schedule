import { describe, expect, it } from "vitest";
import { findAutoFitFontSize } from "./use-auto-fit-text";

describe("findAutoFitFontSize", () => {
  it("기본 크기에서 이미 맞으면 폰트를 유지한다", () => {
    const fittedFontSize = findAutoFitFontSize({
      baseFontSizePx: 30,
      minFontSizePx: 18,
      maxLines: 2,
      lineHeightRatio: 1.2,
      overflowsAt: (fontSizePx, maxHeightPx) => fontSizePx * 2 > maxHeightPx,
    });

    expect(fittedFontSize).toBeNull();
  });

  it("넘치는 경우 맞을 때까지 폰트를 줄인다", () => {
    const fittedFontSize = findAutoFitFontSize({
      baseFontSizePx: 30,
      minFontSizePx: 18,
      maxLines: 2,
      lineHeightRatio: 1.2,
      stepPx: 2,
      overflowsAt: (fontSizePx, maxHeightPx) => {
        const requiredHeightPx =
          fontSizePx > 24 ? fontSizePx * 3.2 : fontSizePx * 2.2;
        return requiredHeightPx > maxHeightPx;
      },
    });

    expect(fittedFontSize).toBe(24);
  });

  it("최소 폰트 크기까지 줄여도 넘치면 최소 크기를 반환한다", () => {
    const fittedFontSize = findAutoFitFontSize({
      baseFontSizePx: 28,
      minFontSizePx: 16,
      maxLines: 2,
      lineHeightRatio: 1.2,
      overflowsAt: () => true,
    });

    expect(fittedFontSize).toBe(16);
  });
});
