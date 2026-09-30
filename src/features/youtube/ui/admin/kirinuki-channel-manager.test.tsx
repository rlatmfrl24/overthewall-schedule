// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
import { KirinukiChannelManager } from "./kirinuki-channel-manager";

const remove = vi.hoisted(() => vi.fn());
vi.mock("../../api/kirinuki", () => ({
  fetchKirinukiChannels: () => Promise.resolve([{id: 1, channel_name: "테스트 클립", youtube_channel_id: "UCtarget", channel_url: "https://www.youtube.com/channel/UCtarget"}]),
  deleteKirinukiChannel: remove, createKirinukiChannel: vi.fn(), updateKirinukiChannel: vi.fn(),
}));
vi.mock("@/shared/ui/toast", () => ({useToast: () => ({toast: () => {}})}));
afterEach(cleanup);

it("searches by channel ID and cancels a named deletion without mutating", async () => {
  render(<KirinukiChannelManager />, {wrapper: createQueryWrapper()});
  await screen.findByText("UCtarget");
  fireEvent.change(screen.getByRole("textbox", {name: "방송 클립 채널 검색"}), {target: {value: "uctarget"}});
  expect(screen.getByRole("row", {name: /테스트 클립/})).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox", {name: "방송 클립 채널 검색"}), {target: {value: "없는채널"}});
  expect(screen.queryByRole("row", {name: /테스트 클립/})).toBeNull();
  expect(screen.getByText("검색 조건에 맞는 채널이 없습니다.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", {name: "초기화"}));
  // Keyboard opens the same Radix row action as the pointer.
  fireEvent.keyDown(screen.getByRole("button", {name: "테스트 클립 삭제 메뉴"}), {key: "Enter"});
  fireEvent.click(await screen.findByRole("menuitem", {name: "테스트 클립 삭제"}));
  const dialog = await screen.findByRole("alertdialog");
  expect(dialog.textContent).toContain("테스트 클립 방송 클립 채널을 삭제");
  fireEvent.click(within(dialog).getByRole("button", {name: "취소"}));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(remove).not.toHaveBeenCalled();
  expect(screen.getByText("UCtarget")).toBeTruthy();
});
