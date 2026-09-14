// @vitest-environment jsdom
import { createElement, useRef } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSnapshotFonts } from "./use-snapshot-fonts";
import { readSnapshotFonts, forceSystemSnapshotFonts, type SnapshotFonts } from "./snapshot-fonts";

const prepare = vi.hoisted(() => vi.fn());
vi.mock("./snapshot-fonts", async (original) => ({ ...await original<typeof import("./snapshot-fonts")>(), prepareSnapshotFonts: prepare }));

const add = vi.fn();
const remove = vi.fn();
afterEach(() => { cleanup(); vi.restoreAllMocks(); prepare.mockReset(); add.mockReset(); remove.mockReset(); });

function View() {
  const ref = useRef<HTMLDivElement>(null);
  const mode = useSnapshotFonts(ref);
  return createElement("div", { ref, "data-testid": "snapshot" }, mode);
}

function delayed() {
  Object.defineProperty(document, "fonts", { configurable: true, value: { add, delete: remove } });
  let resolve!: (fonts: SnapshotFonts) => void;
  prepare.mockImplementation(() => new Promise<SnapshotFonts>((done) => { resolve = done; }));
  return { resolve: (fonts: SnapshotFonts) => resolve(fonts) };
}

describe("snapshot font lifecycle", () => {
  it("publishes the font CSS only after preparation and removes faces on unmount", async () => {
    const job = delayed();
    const view = render(createElement(View));
    const root = screen.getByTestId("snapshot");
    expect(root.textContent).toBe("loading");
    const face = {} as FontFace;
    await act(async () => job.resolve({ mode: "web", css: "embedded", faces: [face] }));
    expect(add).toHaveBeenCalledWith(face);
    expect(readSnapshotFonts(root)).toEqual({ mode: "web", css: "embedded" });
    view.unmount();
    expect(remove).toHaveBeenCalledWith(face);
  });

  it("does not install fonts after unmount", async () => {
    const job = delayed();
    const view = render(createElement(View));
    const signal = prepare.mock.calls[0][0] as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => job.resolve({ mode: "web", css: "late", faces: [{} as FontFace] }));
    expect(add).not.toHaveBeenCalled();
  });

  it("locks system mode against late font completion", async () => {
    const job = delayed();
    render(createElement(View));
    const root = screen.getByTestId("snapshot");
    act(() => forceSystemSnapshotFonts(root));
    await act(async () => job.resolve({ mode: "web", css: "late", faces: [{} as FontFace] }));
    expect(root.textContent).toBe("system");
    expect(readSnapshotFonts(root)).toEqual({ mode: "system", css: "" });
    expect(add).not.toHaveBeenCalled();
  });
});
