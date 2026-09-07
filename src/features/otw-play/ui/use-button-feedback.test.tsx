// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useButtonFeedback } from "./use-button-feedback";

function Example({ onClick = () => undefined, disabled = false }) {
  const feedback = useButtonFeedback();
  return <div {...feedback}><button disabled={disabled} onClick={onClick}>재생</button></div>;
}

const cancel = vi.fn();
const animate = vi.fn(() => ({ finished: new Promise(() => undefined), cancel }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 20, y: 30, left: 20, top: 30, width: 100, height: 40, right: 120, bottom: 70, toJSON: () => ({}) });
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, "animate");
});

it("starts feedback at the pressed point without consuming the button action", () => {
  const onClick = vi.fn();
  const view = render(<Example onClick={onClick} />);
  const button = screen.getByRole("button", { name: "재생" });
  fireEvent.pointerDown(button, { clientX: 45, clientY: 40, button: 0 });
  expect(button.style.getPropertyValue("--play-ripple-x")).toBe("25px");
  expect(button.style.getPropertyValue("--play-ripple-y")).toBe("10px");
  expect(animate).toHaveBeenCalledTimes(1);
  fireEvent.click(button);
  expect(onClick).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(cancel).toHaveBeenCalledTimes(1);
});

it("centers keyboard feedback and ignores held-key repeat", () => {
  render(<Example />);
  const button = screen.getByRole("button");
  fireEvent.keyDown(button, { key: "Enter" });
  expect(button.style.getPropertyValue("--play-ripple-x")).toBe("50px");
  expect(button.style.getPropertyValue("--play-ripple-y")).toBe("20px");
  fireEvent.keyDown(button, { key: "Enter", repeat: true });
  expect(animate).toHaveBeenCalledTimes(1);
});

it("respects disabled controls and reduced motion", () => {
  const view = render(<Example disabled />);
  fireEvent.pointerDown(screen.getByRole("button"), { button: 0 });
  expect(animate).not.toHaveBeenCalled();
  view.rerender(<Example />);
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  fireEvent.pointerDown(screen.getByRole("button"), { button: 0 });
  expect(animate).not.toHaveBeenCalled();
});
