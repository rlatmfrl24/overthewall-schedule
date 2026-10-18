// @vitest-environment jsdom
import React, { type ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ isLoaded: false, isSignedIn: false, mine: { isPending: true, data: { data: [] } } }));
vi.mock("@clerk/clerk-react", () => ({ useUser: () => ({ isLoaded: mocks.isLoaded, isSignedIn: mocks.isSignedIn }) }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a> }));
vi.mock("../../queries/use-playlists", () => ({
  usePlaylistDefaults: () => ({ isPending: false, data: { data: { items: [] } } }),
  useMyPlaylists: () => mocks.mine,
}));
vi.mock("./playlist-components", () => ({ DefaultPlaylistCard: () => null }));
import { OtwPlayPlaylistsPage } from "./playlists-page";

beforeEach(() => { mocks.isLoaded = false; mocks.isSignedIn = false; mocks.mine = { isPending: true, data: { data: [] } }; });
afterEach(cleanup);

it("shows personal-list loading until authentication is known, then invites anonymous users", () => {
  const view = render(<OtwPlayPlaylistsPage />);
  expect(screen.getByRole("status", { name: "플레이리스트 불러오는 중" })).toBeTruthy();
  expect(screen.queryByText("로그인하고 나만의 목록을 만들어 보세요.")).toBeNull();
  expect(screen.queryByText("아직 저장한 플레이리스트가 없습니다.")).toBeNull();
  mocks.isLoaded = true;
  view.rerender(<OtwPlayPlaylistsPage />);
  expect(screen.getByText("로그인하고 나만의 목록을 만들어 보세요.")).toBeTruthy();
});

it("waits for a signed-in user's list before showing the saved-list empty state", () => {
  mocks.isLoaded = true; mocks.isSignedIn = true;
  const view = render(<OtwPlayPlaylistsPage />);
  expect(screen.getByRole("status", { name: "플레이리스트 불러오는 중" })).toBeTruthy();
  expect(screen.queryByText("아직 저장한 플레이리스트가 없습니다.")).toBeNull();
  mocks.mine.isPending = false;
  view.rerender(<OtwPlayPlaylistsPage />);
  expect(screen.getByText("아직 저장한 플레이리스트가 없습니다.")).toBeTruthy();
});
