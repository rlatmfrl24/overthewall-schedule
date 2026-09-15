// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ReviewSegmentPlayer } from "./review-segment-player";

const controller = vi.hoisted(() => ({ load: vi.fn(), pause: vi.fn(), play: vi.fn(), destroy: vi.fn(), getCurrentTime: vi.fn(() => 13) }));
vi.mock("../../player/youtube-iframe-api", () => ({ createOtwPlayYouTubePlayer: vi.fn(async () => controller) }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

it("loads the requested interval, checks its ending and destroys playback on close", async () => {
  vi.useFakeTimers();
  const view = render(<ReviewSegmentPlayer videoId="5jlnr_wLfIk" startSeconds={13} endSeconds={261} thumbnailUrl={null} valid />);
  expect(controller.load).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "지정 구간 재생" })); });
  expect(controller.load).toHaveBeenLastCalledWith({ videoId: "5jlnr_wLfIk", startSeconds: 13, endSeconds: 261 });
  fireEvent.click(screen.getByRole("button", { name: "종료 5초 전부터" }));
  expect(controller.load).toHaveBeenLastCalledWith({ videoId: "5jlnr_wLfIk", startSeconds: 256, endSeconds: 261 });
  controller.getCurrentTime.mockReturnValue(261.1);
  act(() => vi.advanceTimersByTime(250));
  expect(controller.pause).toHaveBeenCalled();
  expect(screen.getByRole("status").textContent).toContain("구간 재생 완료");
  fireEvent.click(screen.getByRole("button", { name: "재생 계속" }));
  expect(controller.load).toHaveBeenLastCalledWith({ videoId: "5jlnr_wLfIk", startSeconds: 13, endSeconds: 261 });
  view.unmount();
  expect(controller.destroy).toHaveBeenCalledOnce();
});

it("does not load a player for an invalid interval", () => {
  render(<ReviewSegmentPlayer videoId="5jlnr_wLfIk" startSeconds={261} endSeconds={13} thumbnailUrl={null} valid={false} />);
  expect((screen.getByRole("button", { name: "지정 구간 재생" }) as HTMLButtonElement).disabled).toBe(true);
  expect(controller.load).not.toHaveBeenCalled();
});
