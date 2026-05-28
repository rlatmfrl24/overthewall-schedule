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
import { AutoUpdateLogsManager } from "./auto-update-logs";

const fetchUpdateLogsMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/settings", () => ({
  fetchUpdateLogs: fetchUpdateLogsMock,
}));

vi.mock("@/components/ui/toast", () => ({
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
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("정렬된 필터 컨트롤과 상태 배지를 표시한다", async () => {
    render(createElement(AutoUpdateLogsManager));

    expect(screen.getByText("스케줄 업데이트 로그")).toBeTruthy();
    expect(screen.getByText("로그 필터")).toBeTruthy();
    expect(screen.getByLabelText("검색어")).toBeTruthy();
    expect(screen.getByLabelText("작업")).toBeTruthy();
    expect(screen.getByLabelText("멤버")).toBeTruthy();
    expect(screen.getByLabelText("시작일")).toBeTruthy();
    expect(screen.getByLabelText("종료일")).toBeTruthy();
    expect(screen.getByLabelText("정렬")).toBeTruthy();
    expect(screen.getByLabelText("표시 개수")).toBeTruthy();
    expect(screen.getByText("전체 로그")).toBeTruthy();

    await waitFor(() => expect(fetchUpdateLogsMock).toHaveBeenCalled());
  });

  it("검색어 입력 시 활성 필터 수와 초기화 버튼 상태를 갱신한다", () => {
    render(createElement(AutoUpdateLogsManager));

    const resetButton = screen.getByRole("button", { name: "초기화" });
    expect(resetButton).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByLabelText("검색어"), {
      target: { value: "테스트" },
    });

    expect(screen.getByText("필터 1개")).toBeTruthy();
    expect(resetButton).toHaveProperty("disabled", false);
  });
});
