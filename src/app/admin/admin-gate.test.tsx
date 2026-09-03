// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminGate } from "./admin-gate";

const useUserMock = vi.hoisted(() => vi.fn());
const useAdminStatusMock = vi.hoisted(() => vi.fn());
const refetchMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/clerk-react", () => ({
  useUser: useUserMock,
  SignInButton: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => createElement("a", null, children),
  Outlet: () => createElement("div", null, "관리자 콘텐츠"),
}));

vi.mock("@/features/auth", () => ({ useAdminStatus: useAdminStatusMock }));
vi.mock("./admin-layout", () => ({
  AdminLayout: ({ children }: { children: ReactNode }) =>
    createElement("div", null, children),
}));

describe("AdminGate", () => {
  beforeEach(() => {
    useUserMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: { id: "user_admin" },
    });
    useAdminStatusMock.mockReturnValue({
      data: { authenticated: true, isAdmin: true },
      isPending: false,
      isError: false,
      refetch: refetchMock,
    });
    refetchMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders admin content from the server-authoritative decision", () => {
    render(createElement(AdminGate));

    expect(useAdminStatusMock).toHaveBeenCalledWith("user_admin");
    expect(screen.getByText("관리자 콘텐츠")).toBeTruthy();
  });

  it("does not trust the signed-in client identity when the server denies admin", () => {
    useAdminStatusMock.mockReturnValue({
      data: { authenticated: true, isAdmin: false },
      isPending: false,
      isError: false,
      refetch: refetchMock,
    });

    render(createElement(AdminGate));

    expect(screen.getByText("접근 권한이 없습니다")).toBeTruthy();
    expect(screen.queryByText("user_admin")).toBeNull();
  });

  it("offers a retry when the authority endpoint is unavailable", () => {
    useAdminStatusMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch: refetchMock,
    });

    render(createElement(AdminGate));
    fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));

    expect(refetchMock).toHaveBeenCalledTimes(1);
  });
});
