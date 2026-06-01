// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
import type { DDayItem, Member, ScheduleItem } from "@/lib/types";
import { useWeeklySchedule } from "./use-weekly-schedule";

const deleteScheduleMock = vi.hoisted(() => vi.fn());
const saveScheduleWithConflictsMock = vi.hoisted(() => vi.fn());
const useScheduleBoardMock = vi.hoisted(() => vi.fn());

vi.mock("./use-schedule-board", () => ({
  useScheduleBoard: useScheduleBoardMock,
}));

vi.mock("@/lib/api/schedules", () => ({
  deleteSchedule: deleteScheduleMock,
}));

vi.mock("@/lib/schedule-service", () => ({
  saveScheduleWithConflicts: saveScheduleWithConflictsMock,
}));

const makeSchedule = (partial: Partial<ScheduleItem> = {}) =>
  ({
    id: 11,
    member_uid: 1,
    date: "2026-02-13",
    start_time: "20:00",
    title: "방송",
    status: "방송",
    created_at: null,
    ...partial,
  }) as ScheduleItem;

const makeBoardState = (schedules: ScheduleItem[] = [makeSchedule()]) => ({
  members: [
    {
      uid: 1,
      code: "m1",
      name: "멤버1",
    } as Member,
  ],
  ddays: [{ id: 1, title: "기념일" } as DDayItem],
  notices: [],
  schedules,
  loading: false,
  hasLoaded: true,
  error: null,
});

describe("useWeeklySchedule", () => {
  beforeEach(() => {
    deleteScheduleMock.mockReset();
    saveScheduleWithConflictsMock.mockReset();
    useScheduleBoardMock.mockReset();
    useScheduleBoardMock.mockReturnValue(makeBoardState());
  });

  it("주간 보드 aggregate 조회 결과와 다이얼로그 동작을 처리한다", async () => {
    saveScheduleWithConflictsMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useWeeklySchedule(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.schedules).toHaveLength(1);
    expect(useScheduleBoardMock).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.openAddDialog(new Date("2026-02-14T00:00:00Z"), 1);
    });
    expect(result.current.isEditDialogOpen).toBe(true);
    expect(result.current.initialMemberUid).toBe(1);

    await act(async () => {
      await result.current.handleSaveSchedule({
        id: 11,
        member_uid: 1,
        date: new Date("2026-02-14T00:00:00Z"),
        start_time: "21:00",
        title: "저장",
        status: "방송",
      });
    });

    expect(saveScheduleWithConflictsMock).toHaveBeenCalledTimes(1);
    expect(result.current.isEditDialogOpen).toBe(false);
    expect(result.current.editingSchedule).toBeNull();
  });

  it("삭제 실패 시 alert 상태를 노출한다", async () => {
    deleteScheduleMock.mockRejectedValueOnce(new Error("delete failed"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useWeeklySchedule(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handleDeleteSchedule(11);
    });

    expect(result.current.alertOpen).toBe(true);
    expect(result.current.alertMessage).toBe("스케쥴 삭제 실패");
    errorSpy.mockRestore();
  });
});
