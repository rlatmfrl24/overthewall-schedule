// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SnapshotFontContext } from "./snapshot-fonts";
import { useAutoFitText } from "./use-auto-fit-text";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function Title() {
  const { textRef, textStyle } = useAutoFitText<HTMLHeadingElement>({
    contentKey: "same-title", maxLines: 2, minFontSizePx: 14,
  });
  return createElement("h1", { ref: textRef, style: textStyle }, "긴 한글 제목 OTW");
}

it("remeasures an unchanged title after fonts settle and after system fallback", () => {
  let fittingSize = 20;
  vi.spyOn(window, "getComputedStyle").mockReturnValue({ fontSize: "30px", lineHeight: "36px" } as CSSStyleDeclaration);
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
    const size = Number.parseFloat(this.style.fontSize) || 30;
    return size <= fittingSize ? size * 2.4 : size * 3.6;
  });
  const view = render(createElement(SnapshotFontContext, { value: "loading" }, createElement(Title)));
  expect(screen.getByRole("heading").style.fontSize).toBe("20px");
  fittingSize = 16;
  view.rerender(createElement(SnapshotFontContext, { value: "web" }, createElement(Title)));
  expect(screen.getByRole("heading").style.fontSize).toBe("16px");
  fittingSize = 24;
  view.rerender(createElement(SnapshotFontContext, { value: "system" }, createElement(Title)));
  expect(screen.getByRole("heading").style.fontSize).toBe("24px");
});
