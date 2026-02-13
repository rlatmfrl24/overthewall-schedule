import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveScheduleWithConflicts } from "./schedule-service";
import type { ScheduleItem } from "./types";
import {
  createSchedule,
  deleteSchedule,
  fetchSchedulesByDate,
  updateSchedule,
} from "@/lib/api/schedules";

vi.mock("@/lib/api/schedules", () => ({
  createSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
  fetchSchedulesByDate: vi.fn(),
  updateSchedule: vi.fn(),
}));

const mockedCreateSchedule = vi.mocked(createSchedule);
const mockedDeleteSchedule = vi.mocked(deleteSchedule);
const mockedFetchSchedulesByDate = vi.mocked(fetchSchedulesByDate);
const mockedUpdateSchedule = vi.mocked(updateSchedule);

const makeSchedule = (
  partial: Partial<ScheduleItem> & Pick<ScheduleItem, "member_uid" | "status">,
): ScheduleItem =>
  ({
    id: 1,
    date: "2026-02-13",
    start_time: null,
    title: "테스트",
    created_at: null,
    ...partial,
  }) as ScheduleItem;

describe("saveScheduleWithConflicts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("미정 저장 시 같은 멤버의 기존 스케줄을 삭제한다", async () => {
    mockedFetchSchedulesByDate.mockResolvedValue([
      makeSchedule({ id: 1, member_uid: 7, status: "방송" }),
      makeSchedule({ id: 2, member_uid: 7, status: "휴방" }),
      makeSchedule({ id: 3, member_uid: 9, status: "방송" }),
    ]);

    await saveScheduleWithConflicts({
      member_uid: 7,
      date: new Date("2026-02-13T00:00:00Z"),
      start_time: null,
      title: "미정 처리",
      status: "미정",
    });

    expect(mockedDeleteSchedule).toHaveBeenCalledTimes(2);
    expect(mockedDeleteSchedule).toHaveBeenCalledWith(1);
    expect(mockedDeleteSchedule).toHaveBeenCalledWith(2);
    expect(mockedCreateSchedule).not.toHaveBeenCalled();
    expect(mockedUpdateSchedule).not.toHaveBeenCalled();
  });

  it("독점 상태 저장 시 동일 멤버의 다른 스케줄을 삭제 후 업데이트한다", async () => {
    mockedFetchSchedulesByDate.mockResolvedValue([
      makeSchedule({ id: 10, member_uid: 5, status: "방송" }),
      makeSchedule({ id: 11, member_uid: 5, status: "방송" }),
      makeSchedule({ id: 12, member_uid: 5, status: "미정" }),
      makeSchedule({ id: 13, member_uid: 6, status: "방송" }),
    ]);

    await saveScheduleWithConflicts({
      id: 10,
      member_uid: 5,
      date: new Date("2026-02-13T00:00:00Z"),
      start_time: null,
      title: "게릴라 전환",
      status: "게릴라",
    });

    expect(mockedDeleteSchedule).toHaveBeenCalledTimes(2);
    expect(mockedDeleteSchedule).toHaveBeenCalledWith(11);
    expect(mockedDeleteSchedule).toHaveBeenCalledWith(12);
    expect(mockedUpdateSchedule).toHaveBeenCalledTimes(1);
    expect(mockedCreateSchedule).not.toHaveBeenCalled();
  });

  it("방송 저장 시 충돌 상태(휴방/게릴라/미정)만 제거한다", async () => {
    mockedFetchSchedulesByDate.mockResolvedValue([
      makeSchedule({ id: 20, member_uid: 3, status: "휴방" }),
      makeSchedule({ id: 21, member_uid: 3, status: "게릴라" }),
      makeSchedule({ id: 22, member_uid: 3, status: "방송" }),
      makeSchedule({ id: 23, member_uid: 3, status: "미정" }),
      makeSchedule({ id: 24, member_uid: 8, status: "휴방" }),
    ]);

    await saveScheduleWithConflicts({
      id: 22,
      member_uid: 3,
      date: new Date("2026-02-13T00:00:00Z"),
      start_time: "20:00",
      title: "정규 방송",
      status: "방송",
    });

    expect(mockedDeleteSchedule).toHaveBeenCalledTimes(3);
    expect(mockedDeleteSchedule).toHaveBeenCalledWith(20);
    expect(mockedDeleteSchedule).toHaveBeenCalledWith(21);
    expect(mockedDeleteSchedule).toHaveBeenCalledWith(23);
    expect(mockedUpdateSchedule).toHaveBeenCalledTimes(1);
  });
});
