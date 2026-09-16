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
