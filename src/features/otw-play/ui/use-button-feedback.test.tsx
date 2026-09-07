// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useButtonFeedback } from "./use-button-feedback";

function Example({ onClick = () => undefined, disabled = false }) {
  const feedback = useButtonFeedback();
  return <div {...feedback}><button disabled={disabled} onClick={onClick}><svg aria-hidden="true"><path d="M0 0L1 1" /></svg>재생</button></div>;
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

it("respects disabled controls and reduced motion", () => {
  const view = render(<Example disabled />);
  fireEvent.pointerDown(screen.getByRole("button"), { button: 0 });
  expect(animate).not.toHaveBeenCalled();
  view.rerender(<Example />);
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  fireEvent.pointerDown(screen.getByRole("button"), { button: 0 });
  expect(animate).not.toHaveBeenCalled();
});
