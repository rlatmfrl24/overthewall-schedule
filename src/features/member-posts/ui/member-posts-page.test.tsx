// @vitest-environment jsdom
import React, { type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemberPostsPage } from "./member-posts-page";

const mocks = vi.hoisted(() => ({ user: vi.fn(), x: vi.fn(), cafe: vi.fn() }));
vi.mock("@clerk/clerk-react", () => ({ useUser: mocks.user, SignInButton: ({ children }: { children: ReactNode }) => children }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a> }));
vi.mock("@/features/x-posts", () => ({ useXPostsConfig: mocks.x }));
vi.mock("@/features/naver-cafe", () => ({ useNaverCafePostsConfig: mocks.cafe }));
vi.mock("@/shared/seo", () => ({ useSiteSeo: vi.fn() }));
vi.mock("./member-posts-overview", () => ({ MemberPostsOverview: ({ footer }: { footer: ReactNode }) => <div>피드 목록{footer}</div> }));
const mount = () => render(<MemberPostsPage footer={<footer>팬 운영 안내</footer>} />);
beforeEach(() => {
  mocks.user.mockReturnValue({ isLoaded: true, isSignedIn: false });
  mocks.x.mockReturnValue({ visibility: "public", loading: false, error: null, reload: vi.fn() });
  mocks.cafe.mockReturnValue({ visibility: "public", enabled: true, loading: false, error: null, reload: vi.fn() });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it.each(["public", "members", "private", "loading"])("%s 화면에서 푸터를 한 번 유지한다", state => {
  mocks.x.mockReturnValue({ visibility: state === "loading" ? "public" : state, loading: state === "loading", error: null });
  mocks.cafe.mockReturnValue({ enabled: false, visibility: "private", loading: false, error: null });
  mount();
  expect(screen.getAllByText("팬 운영 안내")).toHaveLength(1);
  if (state === "public") expect(screen.getByText("피드 목록")).toBeTruthy();
  if (state === "members") expect(screen.getByText("로그인이 필요합니다")).toBeTruthy();
  if (state === "private") expect(screen.getByText("비공개 상태입니다")).toBeTruthy();
});
it("공개 설정 조회 실패를 로그인 요구로 오인하지 않고 다시 조회한다", () => {
  const reload = vi.fn().mockResolvedValue(undefined);
  mocks.x.mockReturnValue({ visibility: "members", loading: false, error: "설정 조회 실패", reload });
  mocks.cafe.mockReturnValue({ visibility: "members", enabled: true, loading: false, error: "설정 조회 실패", reload });
  mount();
  expect(screen.getByRole("alert").textContent).toContain("설정 조회 실패");
  expect(screen.queryByText("로그인이 필요합니다")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(reload).toHaveBeenCalledTimes(2);
});
