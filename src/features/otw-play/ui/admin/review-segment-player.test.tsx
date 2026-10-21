// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ReviewSegmentPlayer } from "./review-segment-player";
import { createOtwPlayYouTubePlayer } from "../../player/youtube-iframe-api";

const controller = vi.hoisted(() => ({
  load: vi.fn(), pause: vi.fn(), play: vi.fn(), destroy: vi.fn(),
  getCurrentTime: vi.fn(() => 13), getDuration: vi.fn(() => 300),
  seekTo: vi.fn(), setVolume: vi.fn(), setMuted: vi.fn(), stop: vi.fn(),
}));
vi.mock("../../player/youtube-iframe-api", () => ({ createOtwPlayYouTubePlayer: vi.fn(async () => controller) }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(createOtwPlayYouTubePlayer).mockResolvedValue(controller);
  controller.getCurrentTime.mockReturnValue(13);
});
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

it("destroys a pending player without loading it when the preview closes", async () => {
  let resolve!: (value: typeof controller) => void;
  vi.mocked(createOtwPlayYouTubePlayer).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const view = render(<ReviewSegmentPlayer videoId="5jlnr_wLfIk" startSeconds={13} endSeconds={null} thumbnailUrl={null} valid />);
  fireEvent.click(screen.getByRole("button", { name: "지정 구간 재생" }));
  view.unmount();
  await act(async () => { resolve(controller); });
  expect(controller.destroy).toHaveBeenCalledOnce();
  expect(controller.load).not.toHaveBeenCalled();
});

it("replaces playback when the draft interval changes and leaves an open ending unbounded", async () => {
  const view = render(<ReviewSegmentPlayer videoId="5jlnr_wLfIk" startSeconds={13} endSeconds={20} thumbnailUrl={null} valid />);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "지정 구간 재생" })); });
  await act(async () => {
    view.rerender(<ReviewSegmentPlayer videoId="5jlnr_wLfIk" startSeconds={25} endSeconds={null} thumbnailUrl={null} valid />);
  });
  expect(controller.destroy).toHaveBeenCalledOnce();
  expect(controller.load).toHaveBeenLastCalledWith({ videoId: "5jlnr_wLfIk", startSeconds: 25 });
  expect(screen.queryByRole("button", { name: "종료 5초 전부터" })).toBeNull();
});

it("shows YouTube errors and autoplay blocking while keeping the explicit resume control", async () => {
  render(<ReviewSegmentPlayer videoId="5jlnr_wLfIk" startSeconds={13} endSeconds={261} thumbnailUrl={null} valid />);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "지정 구간 재생" })); });
  const events = vi.mocked(createOtwPlayYouTubePlayer).mock.calls[0][1]!;
  act(() => events.onError?.(150));
  expect(screen.getByRole("status").textContent).toContain("YouTube 재생 오류 (150)");
  act(() => events.onAutoplayBlocked?.());
  expect(screen.getByRole("status").textContent).toContain("재생 계속 버튼을 눌러 주세요.");
  fireEvent.click(screen.getByRole("button", { name: "재생 계속" }));
  expect(controller.play).toHaveBeenCalledOnce();
});
