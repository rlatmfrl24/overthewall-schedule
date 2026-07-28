import { useLayoutEffect, useRef, useState } from "react";

interface FindAutoFitFontSizeOptions {
  baseFontSizePx: number;
  minFontSizePx: number;
  maxLines: number;
  lineHeightRatio: number;
  stepPx?: number;
  overflowsAt: (fontSizePx: number, maxHeightPx: number) => boolean;
}

interface UseAutoFitTextOptions {
  contentKey: string;
  maxLines: number;
  minFontSizePx: number;
  stepPx?: number;
}

export const findAutoFitFontSize = ({
  baseFontSizePx,
  minFontSizePx,
  maxLines,
  lineHeightRatio,
  stepPx = 1,
  overflowsAt,
}: FindAutoFitFontSizeOptions) => {
  if (
    !Number.isFinite(baseFontSizePx) ||
    !Number.isFinite(minFontSizePx) ||
    !Number.isFinite(maxLines) ||
    !Number.isFinite(lineHeightRatio) ||
    baseFontSizePx <= 0 ||
    minFontSizePx <= 0 ||
    maxLines <= 0 ||
    lineHeightRatio <= 0
  ) {
    return null;
  }

  const safeStepPx = stepPx > 0 ? stepPx : 1;
  let fontSizePx = baseFontSizePx;

  while (fontSizePx >= minFontSizePx) {
    const maxHeightPx = fontSizePx * lineHeightRatio * maxLines;
    if (!overflowsAt(fontSizePx, maxHeightPx)) {
      return fontSizePx < baseFontSizePx ? fontSizePx : null;
    }

    if (fontSizePx === minFontSizePx) {
      break;
    }

    fontSizePx = Math.max(minFontSizePx, fontSizePx - safeStepPx);
  }

  return minFontSizePx < baseFontSizePx ? minFontSizePx : null;
};

export const useAutoFitText = <T extends HTMLElement>({
  contentKey,
  maxLines,
  minFontSizePx,
  stepPx = 1,
}: UseAutoFitTextOptions) => {
  const textRef = useRef<T | null>(null);
  const [fontSizePx, setFontSizePx] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    const element = textRef.current;
    if (!element) return;

    element.style.fontSize = "";

    const computedStyle = window.getComputedStyle(element);
    const baseFontSizePx = Number.parseFloat(computedStyle.fontSize);
    const computedLineHeightPx = Number.parseFloat(computedStyle.lineHeight);
    const lineHeightRatio =
      Number.isFinite(computedLineHeightPx) &&
      computedLineHeightPx > 0 &&
      Number.isFinite(baseFontSizePx) &&
      baseFontSizePx > 0
        ? computedLineHeightPx / baseFontSizePx
        : 1.2;

    const nextFontSizePx = findAutoFitFontSize({
      baseFontSizePx,
      minFontSizePx,
      maxLines,
      lineHeightRatio,
      stepPx,
      overflowsAt: (candidateFontSizePx, maxHeightPx) => {
        element.style.fontSize = `${candidateFontSizePx}px`;
        return element.scrollHeight > maxHeightPx + 1;
      },
    });

    element.style.fontSize = "";

    setFontSizePx((currentFontSizePx) =>
      currentFontSizePx === nextFontSizePx ? currentFontSizePx : nextFontSizePx,
    );
  }, [contentKey, maxLines, minFontSizePx, stepPx]);

  return {
    textRef,
    textStyle: fontSizePx ? { fontSize: `${fontSizePx}px` } : undefined,
  };
};
