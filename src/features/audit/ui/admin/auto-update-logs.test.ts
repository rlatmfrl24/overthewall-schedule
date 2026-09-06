// @vitest-environment jsdom
import { createElement } from "react";
import {
  cleanup,
  fireEvent,
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

    expect(screen.getByText("일정 변경 기록")).toBeTruthy();
    expect(screen.getByText("로그 목록")).toBeTruthy();
    expect(screen.getByLabelText("정렬")).toBeTruthy();
    expect(screen.getByLabelText("표시 개수")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "업데이트 로그 새로고침" }),
    ).toBeTruthy();
    expect(screen.getByRole("region", { name: "관리자 감사 로그" })).toBeTruthy();
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
  it("감사 기록에서 원본 이벤트와 대상 ID, 미기록 건수를 보존하고 상세를 연다", async () => {
    fetchAdminAuditLogsMock.mockResolvedValue({items: [{id: 42, event_type: "future.operation", resource_type: "custom_resource", resource_id: "target-42", action: "run", status: "partial", actor_name: null, actor_id: null, actor_ip: null, target_count: null, success_count: null, failure_count: null, detail: null, error: "재시도 필요", created_at: 1756706400000}], total: 1, page: 1, pageSize: 50, totalPages: 1});
    render(createElement<{view: "audit"}>(AutoUpdateLogsManager, {view: "audit"}), {wrapper: createQueryWrapper()});
    const event = await screen.findByText("future.operation");
    expect(screen.getByText("target-42")).toBeTruthy();
    expect(screen.getByText("처리 건수 미기록")).toBeTruthy();
    expect(screen.getByText("이름 미기록")).toBeTruthy();
    expect(screen.getByText("재시도 필요")).toBeTruthy();
    fireEvent.click(event);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("기록 ID")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
  });

});
