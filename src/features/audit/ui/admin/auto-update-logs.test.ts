// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
import { AutoUpdateLogsManager } from "./auto-update-logs";
import type { UpdateLogPageResponse } from "../../model/types";

const fetchUpdateLogsMock = vi.hoisted(() => vi.fn());
const fetchAdminAuditLogsMock = vi.hoisted(() => vi.fn());

vi.mock("../../api/audit", () => ({
  fetchAdminAuditLogs: fetchAdminAuditLogsMock,
  fetchUpdateLogs: fetchUpdateLogsMock,
}));
vi.mock("@/features/members", () => ({ fetchAdminMembers: async () => [] }));

const empty = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 50,
  totalPages: 1,
  hasPrevPage: false,
  hasNextPage: false,
} satisfies UpdateLogPageResponse;

describe("AutoUpdateLogsManager", () => {
  beforeEach(() => fetchUpdateLogsMock.mockResolvedValue(empty));
  afterEach(() => { cleanup(); vi.resetAllMocks(); });

  it("shows schedule filters and ordering without reading admin audit records", async () => {
    render(createElement(AutoUpdateLogsManager), { wrapper: createQueryWrapper() });

    expect(await screen.findByText("아직 일정 변경 기록이 없습니다.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "일정 변경 기록" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "상태 새로고침" })).toBeTruthy();
    const additionalFilters = screen.getByText("멤버·기간·보기 설정");
    expect(additionalFilters.closest("details")?.open).toBe(false);
    fireEvent.click(additionalFilters);
    expect(screen.getByRole("combobox", { name: "정렬" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "표시 개수" })).toBeTruthy();
    expect(fetchUpdateLogsMock).toHaveBeenCalled();
    expect(fetchAdminAuditLogsMock).not.toHaveBeenCalled();
  });

  it("opens inline change details and re-queries the server when search changes", async () => {
    fetchUpdateLogsMock.mockResolvedValueOnce({
      ...empty,
      total: 1,
      items: [{
        id: 42, schedule_id: 3, member_uid: 2, member_name: "테스트 멤버",
        actor_id: null, actor_name: "일정 관리자", actor_ip: null,
        schedule_date: "2026-11-10", action: "reject", title: "공식 방송 일정",
        previous_status: "pending", vod_id: "video", reason_code: "duplicate",
        reason_note: "이미 등록된 방송", created_at: "2026-11-09 18:30:00",
      }],
    } satisfies UpdateLogPageResponse);
    render(createElement(AutoUpdateLogsManager), { wrapper: createQueryWrapper() });

    const open = await screen.findByRole("button", { name: "공식 방송 일정 상세 보기" });
    expect(screen.getByText("거부")).toBeTruthy();
    expect(open.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(open);
    expect(open.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("일정 관리자")).toBeTruthy();
    expect(screen.getByText("duplicate · 이미 등록된 방송")).toBeTruthy();

    fireEvent.change(screen.getByRole("textbox", { name: "내용·수정 주체" }), { target: { value: "다른 일정" } });
    await waitFor(() => expect(fetchUpdateLogsMock).toHaveBeenLastCalledWith(expect.objectContaining({ q: "다른 일정", page: 1 })));
    expect(await screen.findByText("선택한 조건에 맞는 일정 변경 기록이 없습니다.")).toBeTruthy();
    expect(screen.queryByText("변경 상세")).toBeNull();
  });
});
