// @vitest-environment jsdom
import React, { useContext } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MotionConfigContext } from "motion/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AnimationProvider, useAnimations } from "./animation-provider";

const storageKey = "otw-animations-enabled";
let reduced = false;
let listeners: Set<() => void>;

function Controls() {
  const { enabled, preferenceEnabled, setEnabled } = useAnimations();
  const motion = useContext(MotionConfigContext);
  return <>
    <input aria-label="Site animations" type="checkbox" checked={preferenceEnabled} onChange={(event) => setEnabled(event.target.checked)} />
    <output data-testid="effective">{String(enabled)}</output>
    <output data-testid="motion">{motion.reducedMotion}:{motion.transition?.duration}</output>
  </>;
}

function changeOsPreference(value: boolean) {
  act(() => {
    reduced = value;
    listeners.forEach((listener) => listener());
  });
}

beforeEach(() => {
  localStorage.clear();
  reduced = false;
  listeners = new Set();
  vi.stubGlobal("matchMedia", () => ({
    get matches() { return reduced; },
    addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  delete document.documentElement.dataset.animations;
});

it.each([
  [true, false, true],
  [true, true, false],
  [false, false, false],
  [false, true, false],
])("combines site=%s and OS reduce=%s into effective=%s", (site, os, effective) => {
  localStorage.setItem(storageKey, String(site));
  reduced = os;
  render(<AnimationProvider><Controls /></AnimationProvider>);
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(site);
  expect(screen.getByTestId("effective").textContent).toBe(String(effective));
  expect(document.documentElement.dataset.animations).toBe(effective ? "enabled" : "disabled");
  expect(screen.getByTestId("motion").textContent).toBe(effective ? "user:" : "always:0");
});

it("reacts to OS changes without overwriting the saved site switch", () => {
  const view = render(<AnimationProvider><Controls /></AnimationProvider>);
  changeOsPreference(true);
  expect(screen.getByTestId("effective").textContent).toBe("false");
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  expect(localStorage.getItem(storageKey)).toBeNull();
  changeOsPreference(false);
  expect(screen.getByTestId("effective").textContent).toBe("true");
  fireEvent.click(screen.getByRole("checkbox"));
  changeOsPreference(true);
  changeOsPreference(false);
  expect(screen.getByTestId("effective").textContent).toBe("false");
  expect(localStorage.getItem(storageKey)).toBe("false");
  view.unmount();
  expect(listeners.size).toBe(0);
});

it("keeps OS reduction when another tab enables site animations", () => {
  reduced = true;
  localStorage.setItem(storageKey, "false");
  render(<AnimationProvider><Controls /></AnimationProvider>);
  act(() => {
    localStorage.setItem(storageKey, "true");
    window.dispatchEvent(new StorageEvent("storage", { key: storageKey }));
  });
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  expect(screen.getByTestId("effective").textContent).toBe("false");
});
