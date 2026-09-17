// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AnimationProvider, useAnimations } from "@/shared/ui/animation-provider";
import { usePlayTabIndicator } from "./use-play-tab-indicator";

const { animate } = vi.hoisted(() => ({ animate: vi.fn(() => ({ cancel: vi.fn() })) }));
vi.mock("animejs/waapi", () => ({ waapi: { animate } }));
let onResize: () => void;
const disconnect = vi.fn();

function Example({ selected = "discover", visible = true }: { selected?: string; visible?: boolean }) {
  const ref = usePlayTabIndicator(visible);
  const { setEnabled } = useAnimations();
  return <>
    <button onClick={() => setEnabled(false)}>효과 끄기</button>
    {visible && <nav aria-label="탐색">
      <span ref={ref} data-testid="indicator" hidden />
      {["discover", "clips", "playlists"].map((key) => <a key={key} href={`#${key}`} aria-current={selected === key ? "page" : undefined}>{key}</a>)}
    </nav>}
  </>;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { onResize = callback; }
    observe() {}
    disconnect = disconnect;
  });
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(100);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(44);
  vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (this: HTMLElement) {
    return ["discover", "clips", "playlists"].indexOf(this.textContent ?? "") * 104;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, "animate");
  localStorage.clear();
});

it("starts at the current link and interrupts navigation motion when selection changes again", async () => {
  const view = render(<Example />);
  const indicator = screen.getByTestId("indicator");
  expect(indicator.hidden).toBe(false);
  expect(animate).not.toHaveBeenCalled();
  await act(async () => view.rerender(<Example selected="clips" />));
  expect(indicator.style.transform).toBe("translate(104px, 0px)");
  expect(animate).toHaveBeenCalledOnce();
  const first = animate.mock.results[0].value;
  await act(async () => view.rerender(<Example selected="playlists" />));
  expect(first.cancel).toHaveBeenCalled();
  expect(indicator.style.transform).toBe("translate(208px, 0px)");
  expect(animate).toHaveBeenCalledTimes(2);
  view.unmount();
  expect(animate.mock.results[1].value.cancel).toHaveBeenCalled();
  expect(disconnect).toHaveBeenCalled();
});

it("snaps to responsive geometry without another navigation animation", async () => {
  const view = render(<Example />);
  await act(async () => view.rerender(<Example selected="clips" />));
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(44);
  act(() => onResize());
  expect(animate.mock.results[0].value.cancel).toHaveBeenCalled();
  expect(screen.getByTestId("indicator").style.width).toBe("44px");
  expect(animate).toHaveBeenCalledOnce();
});

it("removes the highlight outside catalog tabs and restores it on return", async () => {
  const view = render(<Example />);
  await act(async () => view.rerender(<Example selected="search" />));
  expect(screen.getByTestId("indicator").hidden).toBe(true);
  expect(screen.getByRole("navigation").hasAttribute("data-indicator")).toBe(false);
  await act(async () => view.rerender(<Example selected="playlists" />));
  expect(screen.getByTestId("indicator").hidden).toBe(false);
  expect(animate).not.toHaveBeenCalled();
});

it("cancels motion when the user disables it and still updates selection", async () => {
  const view = render(<AnimationProvider><Example /></AnimationProvider>);
  await act(async () => view.rerender(<AnimationProvider><Example selected="clips" /></AnimationProvider>));
  fireEvent.click(screen.getByRole("button", { name: "효과 끄기" }));
  expect(animate.mock.results[0].value.cancel).toHaveBeenCalled();
  await act(async () => view.rerender(<AnimationProvider><Example selected="playlists" /></AnimationProvider>));
  expect(screen.getByTestId("indicator").style.transform).toBe("translate(208px, 0px)");
  expect(animate).toHaveBeenCalledOnce();
});
