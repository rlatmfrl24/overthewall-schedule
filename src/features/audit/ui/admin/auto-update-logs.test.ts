// @vitest-environment jsdom
import { createElement } from "react";
import {
  cleanup,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
import { AutoUpdateLogsManager } from "./auto-update-logs";

const fetchUpdateLogsMock = vi.hoisted(() => vi.fn());
const fetchAdminAuditLogsMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());

vi.mock("../../api/audit", () => ({
  fetchAdminAuditLogs: fetchAdminAuditLogsMock,
  fetchUpdateLogs: fetchUpdateLogsMock,
}));

vi.mock("@/shared/ui/toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

describe("AutoUpdateLogsManager", () => {
  beforeEach(() => {
    fetchUpdateLogsMock.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 50,
      totalPages: 1,
      hasPrevPage: false,
      hasNextPage: false,
    });
    fetchAdminAuditLogsMock.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 50,
      totalPages: 1,
      hasPrevPage: false,
      hasNextPage: false,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("로그 목록과 보기 옵션을 표시한다", async () => {
    render(createElement(AutoUpdateLogsManager), {
      wrapper: createQueryWrapper(),
    });

    expect(screen.getByText("스케줄 업데이트 로그")).toBeTruthy();
    expect(screen.getByText("로그 목록")).toBeTruthy();
    expect(screen.getByLabelText("정렬")).toBeTruthy();
    expect(screen.getByLabelText("표시 개수")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "업데이트 로그 새로고침" }),
    ).toBeTruthy();
    expect(screen.getByText("관리자 감사 로그")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "감사 로그 새로고침" }),
    ).toBeTruthy();
    expect(screen.queryByText("로그 필터")).toBeNull();
    expect(screen.queryByLabelText("검색어")).toBeNull();
    expect(screen.queryByLabelText("작업")).toBeNull();
    expect(screen.queryByLabelText("멤버")).toBeNull();
    expect(screen.queryByLabelText("시작일")).toBeNull();
    expect(screen.queryByLabelText("종료일")).toBeNull();

    await waitFor(() => expect(fetchUpdateLogsMock).toHaveBeenCalled());
    await waitFor(() => expect(fetchAdminAuditLogsMock).toHaveBeenCalled());
  });
});
