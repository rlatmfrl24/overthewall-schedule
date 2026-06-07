import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveScheduleWithConflicts } from "./schedule-service";
import { saveSchedule } from "@/lib/api/schedules";

vi.mock("@/lib/api/schedules", () => ({
  saveSchedule: vi.fn(),
}));

const mockedSaveSchedule = vi.mocked(saveSchedule);

describe("saveScheduleWithConflicts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("스케줄 저장은 서버 command API에 정규화된 날짜로 위임한다", async () => {
    mockedSaveSchedule.mockResolvedValue({
      success: true,
      action: "create",
      scheduleId: 1,
      deletedIds: [],
    });

    const result = await saveScheduleWithConflicts({
      member_uid: 7,
      date: new Date("2026-02-13T00:00:00Z"),
      start_time: null,
      title: "미정 처리",
      status: "미정",
    });

    expect(result).toEqual({
      success: true,
      action: "create",
      scheduleId: 1,
      deletedIds: [],
    });
    expect(mockedSaveSchedule).toHaveBeenCalledTimes(1);
    expect(mockedSaveSchedule).toHaveBeenCalledWith({
      id: undefined,
      member_uid: 7,
      date: "2026-02-13",
      start_time: null,
      title: "미정 처리",
      status: "미정",
    });
  });

  it("수정 저장도 기존 id를 유지한 command payload로 전달한다", async () => {
    mockedSaveSchedule.mockResolvedValue({
      success: true,
      action: "update",
      scheduleId: 10,
      deletedIds: [11, 12],
    });

    await saveScheduleWithConflicts({
      id: 10,
      member_uid: 5,
      date: new Date("2026-02-13T00:00:00Z"),
      start_time: null,
      title: "게릴라 전환",
      status: "게릴라",
    });

    expect(mockedSaveSchedule).toHaveBeenCalledTimes(1);
    expect(mockedSaveSchedule).toHaveBeenCalledWith({
      id: 10,
      member_uid: 5,
      date: "2026-02-13",
      start_time: null,
      title: "게릴라 전환",
      status: "게릴라",
    });
  });
});
