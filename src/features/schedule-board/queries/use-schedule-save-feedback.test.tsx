// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useScheduleSaveFeedback } from "./use-schedule-save-feedback";

const saveMock = vi.hoisted(() => vi.fn());
vi.mock("@/features/schedules", () => ({ saveScheduleWithConflicts: saveMock }));

const input = {
  member_uid: 1, date: new Date(2026, 8, 15), title: "새 방송",
  status: "방송" as const, start_time: "19:30",
};

function setup() {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
  const hook = renderHook(() => useScheduleSaveFeedback(), {
    wrapper: ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children),
  });
  return { ...hook, invalidate };
}

describe("schedule save feedback", () => {
  afterEach(() => { cleanup(); vi.resetAllMocks(); });

  it("서버 저장 결과와 입력 날짜를 성공 안내에 보존한다", async () => {
    saveMock.mockResolvedValue({ success: true, scheduleId: 42, deletedIds: [3, 4] });
    const { result } = setup();
    await act(() => result.current.save(input));
    expect(result.current.feedback).toEqual({ ...input, scheduleId: 42, deletedCount: 2, refresh: "ready" });
  });

  it("저장 실패를 입력 폼에 전달하며 성공 안내를 만들지 않는다", async () => {
    const error = new Error("write failed");
    saveMock.mockRejectedValue(error);
    const { result, invalidate } = setup();
    await act(async () => { await expect(result.current.save(input)).rejects.toThrow(error); });
    expect(result.current.feedback).toBeNull();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("목록 갱신 실패를 저장 성공과 구분하고 읽기만 재시도한다", async () => {
    saveMock.mockResolvedValue({ success: true, scheduleId: 42, deletedIds: [] });
    const { result, invalidate } = setup();
    invalidate.mockRejectedValueOnce(new Error("read failed"));
    await act(() => result.current.save(input));
    expect(result.current.feedback?.refresh).toBe("failed");
    await act(() => result.current.retryRefresh());
    await waitFor(() => expect(result.current.feedback?.refresh).toBe("ready"));
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it("이전 저장의 늦은 조회 실패가 같은 일정의 최신 성공 안내를 덮지 않는다", async () => {
    saveMock.mockResolvedValue({ success: true, scheduleId: 42, deletedIds: [] });
    const { result, invalidate } = setup();
    let rejectOldRead!: (reason: Error) => void;
    invalidate.mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectOldRead = reject; }));
    await act(() => result.current.save(input));
    await act(() => result.current.save({ ...input, title: "최신 수정" }));
    await act(async () => { rejectOldRead(new Error("old read failed")); });
    expect(result.current.feedback?.title).toBe("최신 수정");
    expect(result.current.feedback?.refresh).toBe("ready");
  });
});
