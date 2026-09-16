// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SnapshotPreviewManager } from "./snapshot-preview-manager";

afterEach(cleanup);

it("preserves design in the preview and new-tab URL while grid ignores it", () => {
  const onDesignChange = vi.fn();
  const props = { date: "2026-09-16", mode: "timeline" as const, theme: "dark" as const, design: "legacy" as const,
    onDesignChange, onDateChange: vi.fn(), onThemeChange: vi.fn(), onModeChange: vi.fn() };
  const { rerender, container } = render(createElement(SnapshotPreviewManager, props));
  expect(screen.getByRole("link", { name: "새 탭" }).getAttribute("href")).toContain("design=legacy");
  expect(container.querySelector("iframe")?.getAttribute("src")).toContain("design=legacy");
  fireEvent.click(within(screen.getByRole("group", { name: "디자인" })).getByRole("button", { name: "포스터" }));
  expect(onDesignChange).toHaveBeenCalledWith("poster");
  rerender(createElement(SnapshotPreviewManager, { ...props, date: "2026-09-17", theme: "light" }));
  expect(screen.getByRole("link", { name: "새 탭" }).getAttribute("href")).toContain("theme=light&design=legacy");
  rerender(createElement(SnapshotPreviewManager, { ...props, mode: "grid" }));
  expect(screen.queryByRole("group", { name: "디자인" })).toBeNull();
  expect(screen.getByRole("link", { name: "새 탭" }).getAttribute("href")).toContain("design=poster");
});

it("shrinks the iframe to the new snapshot when switching from poster to legacy", () => {
  const props = { date: "2026-09-14", mode: "timeline" as const, theme: "dark" as const, design: "poster" as const,
    onDesignChange: vi.fn(), onDateChange: vi.fn(), onThemeChange: vi.fn(), onModeChange: vi.fn() };
  const { container, rerender } = render(createElement(SnapshotPreviewManager, props));
  const frame = container.querySelector("iframe")!;
  const measure = (height: number, viewportHeight: number) => {
    const doc = frame.contentDocument!;
    if (!doc.documentElement) doc.appendChild(doc.createElement("html"));
    if (!doc.body) doc.documentElement.appendChild(doc.createElement("body"));
    const root = doc.createElement("div");
    root.dataset.snapshotRoot = "true";
    root.dataset.snapshotReady = "true";
    Object.defineProperty(root, "scrollHeight", { value: height });
    doc.body.replaceChildren(root);
    // The route's h-screen main retains the previous iframe viewport height.
    Object.defineProperty(doc.body, "scrollHeight", { configurable: true, value: viewportHeight });
    Object.defineProperty(doc.documentElement, "scrollHeight", { configurable: true, value: viewportHeight });
    fireEvent.load(frame);
  };
  measure(1465, 640);
  expect(frame.style.height).toBe("1465px");
  rerender(createElement(SnapshotPreviewManager, { ...props, design: "legacy" }));
  measure(1105, 1465);
  expect(frame.style.height).toBe("1105px");
  measure(400, 1105);
  expect(frame.style.height).toBe("640px");
});
