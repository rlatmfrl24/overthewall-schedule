// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@clerk/clerk-react", () => ({ SignInButton: ({ children }: { children: React.ReactNode }) => children }));
import { PersonalChannelManager } from "./personal-channel-manager";
import type { usePersonalMultiview } from "../queries/use-personal-multiview";
afterEach(cleanup);
const state = (): ReturnType<typeof usePersonalMultiview> => ({ owner: "alice", isLoaded: true, isSignedIn: true, channels: [], statuses: [], loading: false, statusLoading: false, listError: null, statusError: null, addError: null, deleteError: null, addPending: false, deletingIds: [], add: async () => {}, remove: async () => {}, reload: async () => {} });
it("invites anonymous visitors to log in without an add form", () => {
  render(<PersonalChannelManager personal={{ ...state(), owner: undefined, isSignedIn: false }} />);
  expect(screen.getByText("로그인하면 원하는 치지직 채널을 저장할 수 있어요.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "로그인" })).toBeTruthy();
  expect(screen.queryByRole("textbox")).toBeNull();
});
it("retains failed input and exposes the error without claiming a save", async () => {
  render(<PersonalChannelManager personal={{ ...state(), add: async () => { throw new Error("failed"); }, addError: new Error("채널을 추가하지 못했어요.") }} />);
  const input = screen.getByRole("textbox", { name: "치지직 채널 주소 또는 ID" });
  fireEvent.change(input, { target: { value: "a".repeat(32) } });
  fireEvent.click(screen.getByRole("button", { name: "추가" }));
  await waitFor(() => expect((input as HTMLInputElement).value).toBe("a".repeat(32)));
  expect(screen.getByText("채널을 추가하지 못했어요.")).toBeTruthy();
});
it("does not present a failed list load as an empty saved list", () => {
  render(<PersonalChannelManager personal={{ ...state(), listError: new Error("unavailable") }} />);
  expect(screen.getByRole("button", { name: "목록 다시 불러오기" })).toBeTruthy();
  expect(screen.queryByText("저장 0/30")).toBeNull();
});
