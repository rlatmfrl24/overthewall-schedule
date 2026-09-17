// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AnimationProvider, useAnimations } from "@/shared/ui/animation-provider";
import { useButtonFeedback } from "./use-button-feedback";

function Example({ onClick = () => undefined, disabled = false, localFeedback = false }) {
  const feedback = useButtonFeedback();
  return <div {...feedback}><section data-button-feedback={localFeedback ? "local" : undefined}><button disabled={disabled} onClick={onClick}><svg aria-hidden="true"><path d="M0 0L1 1" /></svg>재생</button></section></div>;
}

const cancel = vi.fn();
const animate = vi.fn(() => ({ finished: new Promise(() => undefined), cancel }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  Object.defineProperty(SVGElement.prototype, "animate", { configurable: true, value: animate });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(SVGElement.prototype, "animate");
});

it("animates the SVG without consuming the button action and cancels on unmount", () => {
  const onClick = vi.fn();
  const view = render(<Example onClick={onClick} />);
  const button = screen.getByRole("button", { name: "재생" });
  fireEvent.pointerDown(button, { clientX: 45, clientY: 40, button: 0 });
  expect(animate).toHaveBeenCalledTimes(1);
  expect(animate.mock.contexts[0]).toBe(button.querySelector("svg"));
  fireEvent.click(button);
  expect(onClick).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(cancel).toHaveBeenCalledTimes(1);
});

it("animates keyboard activation and ignores held-key repeat", () => {
  render(<Example />);
  const button = screen.getByRole("button");
  fireEvent.keyDown(button, { key: "Enter" });
  fireEvent.keyDown(button, { key: "Enter", repeat: true });
  expect(animate).toHaveBeenCalledTimes(1);
});

it("leaves locally controlled player feedback alone for pointer and keyboard input", () => {
  const onClick = vi.fn();
  const { container } = render(<Example localFeedback onClick={onClick} />);
  const button = screen.getByRole("button");
  fireEvent.pointerOver(button);
  fireEvent.pointerDown(button, { button: 0 });
  expect(container.firstElementChild?.getAttribute("data-play-input")).toBe("pointer");
  fireEvent.keyDown(button, { key: "Enter" });
  expect(container.firstElementChild?.getAttribute("data-play-input")).toBe("keyboard");
  fireEvent.click(button);
  expect(onClick).toHaveBeenCalledOnce();
  expect(animate).not.toHaveBeenCalled();
});

it("respects disabled controls and the user switch while ignoring OS motion preferences", () => {
  const view = render(<Example disabled />);
  fireEvent.pointerDown(screen.getByRole("button"), { button: 0 });
  expect(animate).not.toHaveBeenCalled();
  view.rerender(<Example />);
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  fireEvent.pointerDown(screen.getByRole("button"), { button: 0 });
  expect(animate).toHaveBeenCalledTimes(1);
  view.unmount();
  animate.mockClear();
  function Controls() {
    const { setEnabled } = useAnimations();
    return <><button onClick={() => setEnabled(false)}>효과 끄기</button><Example /></>;
  }
  render(<AnimationProvider><Controls /></AnimationProvider>);
  fireEvent.pointerDown(screen.getByRole("button", { name: "재생" }), { button: 0 });
  expect(animate).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "효과 끄기" }));
  expect(cancel).toHaveBeenCalled();
  fireEvent.pointerDown(screen.getByRole("button", { name: "재생" }), { button: 0 });
  expect(animate).toHaveBeenCalledTimes(1);
  localStorage.removeItem("otw-animations-enabled");
});
