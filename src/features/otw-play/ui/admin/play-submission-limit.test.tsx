// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
import { PlaySubmissionLimit } from "./play-submission-limit";
const api = vi.hoisted(() => ({ fetchSettings: vi.fn(), updateSettings: vi.fn() }));
vi.mock("@/features/configuration", () => ({ ...api,
  isOtwPlaySubmissionDailyLimitValue: (value: string) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 100,
}));
afterEach(cleanup);
beforeEach(() => { vi.resetAllMocks(); api.fetchSettings.mockResolvedValue({ otw_play_submission_daily_limit: "5" }); api.updateSettings.mockResolvedValue(undefined); });
describe("Play submission limit", () => {
  it("confirms persistence before clearing the draft", async () => {
    render(createElement(PlaySubmissionLimit), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(screen.getByLabelText("일일 제안 한도")).toHaveProperty("value", "5"));
    fireEvent.change(screen.getByLabelText("일일 제안 한도"), { target: { value: "8" } });
    api.fetchSettings.mockResolvedValue({ otw_play_submission_daily_limit: "8" });
    fireEvent.click(screen.getByRole("button", { name: "한도 저장" }));
    await screen.findByRole("status");
    expect(api.updateSettings).toHaveBeenCalledWith({ otw_play_submission_daily_limit: "8" });
    expect(api.fetchSettings).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "한도 저장" })).toHaveProperty("disabled", true);
  });
  it("keeps input when the authoritative readback disagrees", async () => {
    render(createElement(PlaySubmissionLimit), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(screen.getByLabelText("일일 제안 한도")).toHaveProperty("value", "5"));
    fireEvent.change(screen.getByLabelText("일일 제안 한도"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "한도 저장" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("일일 제안 한도")).toHaveProperty("value", "8");
    expect(screen.getByRole("button", { name: "한도 저장" })).toHaveProperty("disabled", false);
  });
});
