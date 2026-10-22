// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@clerk/clerk-react", () => ({ SignInButton: ({ children }: { children: React.ReactNode }) => children }));
import { PersonalChannelManager } from "./personal-channel-manager";
import type { usePersonalMultiview } from "../queries/use-personal-multiview";
afterEach(cleanup);
const state = (): ReturnType<typeof usePersonalMultiview> => ({ owner: "alice", isLoaded: true, isSignedIn: true, channels: [], statuses: [], loading: false, statusLoading: false, listError: null, statusError: null, addError: null, deleteError: null, addPending: false, deletingIds: [], add: async () => {}, remove: async () => {}, reload: async () => {} });
it("offers a quiet entry point and opens the save form only on request", () => {
  render(<PersonalChannelManager personal={state()} />);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.getByText("목록에 없는 치지직 방송도 추가하고, 다음 방문에 다시 선택할 수 있어요.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "신규 채널 추가하기" }));
  expect(screen.getByRole("dialog", { name: "신규 채널 추가하기" })).toBeTruthy();
  expect(screen.getByText(/이 사이트에 저장해 두면 다음 방문에도 다시 선택할 수 있습니다/)).toBeTruthy();
  expect(screen.getByRole("textbox", { name: "치지직 채널 주소 또는 ID" })).toBeTruthy();
});
it("invites anonymous visitors to log in from the requested popup without an add form", () => {
  render(<PersonalChannelManager personal={{ ...state(), owner: undefined, isSignedIn: false }} />);
  expect(screen.queryByRole("button", { name: "로그인" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "신규 채널 추가하기" }));
  expect(screen.queryByRole("textbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "로그인" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("closes after saving, announces how to select the channel, and returns focus", async () => {
  const add = vi.fn(async () => {});
  render(<PersonalChannelManager personal={{ ...state(), add }} />);
  const trigger = screen.getByRole("button", { name: "신규 채널 추가하기" });
  fireEvent.click(trigger);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "a".repeat(32) } });
  fireEvent.click(screen.getByRole("button", { name: "추가하고 저장" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(add).toHaveBeenCalledWith("a".repeat(32));
  expect(screen.getByText("채널을 저장했어요. 아래 목록에서 선택해 주세요.")).toBeTruthy();
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});
it("preserves unfinished input when the popup is closed and reopened", () => {
  render(<PersonalChannelManager personal={state()} />);
  const trigger = screen.getByRole("button", { name: "신규 채널 추가하기" });
  fireEvent.click(trigger);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "unfinished" } });
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  fireEvent.click(trigger);
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("unfinished");
});
it("retains failed input and exposes the error without claiming a save", async () => {
  render(<PersonalChannelManager personal={{ ...state(), add: async () => { throw new Error("failed"); }, addError: new Error("채널을 추가하지 못했어요.") }} />);
  fireEvent.click(screen.getByRole("button", { name: "신규 채널 추가하기" }));
  const input = screen.getByRole("textbox", { name: "치지직 채널 주소 또는 ID" });
  fireEvent.change(input, { target: { value: "a".repeat(32) } });
  fireEvent.click(screen.getByRole("button", { name: "추가하고 저장" }));
  await waitFor(() => expect((input as HTMLInputElement).value).toBe("a".repeat(32)));
  expect(screen.getByText("채널을 추가하지 못했어요.")).toBeTruthy();
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.queryByText("채널을 저장했어요. 아래 목록에서 선택해 주세요.")).toBeNull();
});
it("does not present a failed list load as an empty saved list", () => {
  render(<PersonalChannelManager personal={{ ...state(), listError: new Error("unavailable") }} />);
  expect(screen.getByRole("button", { name: "목록 다시 불러오기" })).toBeTruthy();
  expect(screen.queryByText("저장 0/30")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "신규 채널 추가하기" }));
  expect(screen.getByRole("button", { name: "목록 다시 불러오기" })).toBeTruthy();
  expect(screen.queryByRole("textbox")).toBeNull();
});
