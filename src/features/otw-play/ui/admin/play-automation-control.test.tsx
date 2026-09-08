// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeAdminSettings } from "@contracts/configuration";
import { createQueryWrapper } from "@/test/query-client";
import { PlayAutomationControl } from "./play-automation-control";

const mocks = vi.hoisted(() => ({ settings: vi.fn(), save: vi.fn(), monitors: vi.fn(), pause: vi.fn(), toast: vi.fn() }));
vi.mock("@/features/configuration", () => ({ fetchSettings: mocks.settings, updateSettings: mocks.save }));
vi.mock("../../api/admin", () => ({ fetchOtwPlayChannelMonitors: mocks.monitors, updateOtwPlayChannelMonitor: mocks.pause }));
vi.mock("@/shared/ui/toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.settings.mockResolvedValue(normalizeAdminSettings({}).settings);
  mocks.save.mockImplementation(async (update) => {
    mocks.settings.mockResolvedValue(normalizeAdminSettings(update).settings);
  });
  mocks.pause.mockResolvedValue({ id: "one", status: "paused", version: 4 });
});
afterEach(cleanup);
const show = () => render(createElement(PlayAutomationControl, { monitors: [] }), { wrapper: createQueryWrapper() });

describe("PlayAutomationControl", () => {
  it("pauses each current monitor with its version and confirms readback before enabling global pause", async () => {
    mocks.monitors.mockResolvedValueOnce([{ id: "one", status: "active", version: 3 }])
      .mockResolvedValueOnce([{ id: "one", status: "paused", version: 4 }]);
    show();
    const button = await screen.findByRole("button", { name: "Play 자동화 전체 일시 중지" });
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ otw_play_automation_paused: "true" }));
    expect(mocks.pause).toHaveBeenCalledWith("one", { expectedVersion: 3, status: "paused" });
    expect(mocks.pause.mock.invocationCallOrder[0]).toBeLessThan(mocks.save.mock.invocationCallOrder[0]!);
    expect(mocks.monitors).toHaveBeenCalledTimes(2);
  });

  it("does not claim a global pause when a monitor changes concurrently", async () => {
    mocks.monitors.mockResolvedValue([{ id: "one", status: "active", version: 3 }]);
    mocks.pause.mockRejectedValue(new Error("version conflict"));
    show();
    const button = await screen.findByRole("button", { name: "Play 자동화 전체 일시 중지" });
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" })));
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("resumes the global policy without reactivating channel monitors", async () => {
    mocks.settings.mockResolvedValue(normalizeAdminSettings({ otw_play_automation_paused: "true" }).settings);
    mocks.monitors.mockResolvedValueOnce([{ id: "one", status: "active", version: 3 }])
      .mockResolvedValueOnce([{ id: "one", status: "paused", version: 4 }]);
    show();
    fireEvent.click(await screen.findByRole("button", { name: "자동화 일시 중지 해제" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ otw_play_automation_paused: "false" }));
    expect(mocks.pause).toHaveBeenCalledWith("one", { expectedVersion: 3, status: "paused" });
    expect(mocks.pause.mock.invocationCallOrder[0]).toBeLessThan(mocks.save.mock.invocationCallOrder[0]!);
    expect(mocks.monitors).toHaveBeenCalledTimes(2);
  });
});
