import { describe, expect, it } from "vitest";
import type { PendingApprovalOptions } from "../../../../contracts/pending-schedules";
import {
  getPendingApprovalValues,
  isPendingApplyMode,
  isPendingTargetMode,
  isPendingTimeMode,
  roundTimeToNearestScheduleHalfHour,
  roundTimeToNearestScheduleHour,
  type PendingScheduleRow,
} from "./pending-schedule";

const pendingSchedule: PendingScheduleRow = {
  id: 1,
  member_uid: 100,
  member_name: "테스트 멤버",
  date: "2026-07-28",
  start_time: "12:30",
  title: "테스트 방송",
  status: "pending",
  action_type: "update",
  existing_schedule_id: 10,
  previous_status: "방송",
  previous_title: "기존 방송",
  vod_id: "chzzk:test",
  vod_started_at: null,
  vod_duration_seconds: null,
  vod_thumbnail_url: null,
};

const makeOptions = (
  overrides: Partial<PendingApprovalOptions> = {},
): PendingApprovalOptions => ({
  applyMode: "all",
  targetMode: "update",
  timeMode: "nearest_half_hour",
  ...overrides,
});

describe("pending schedule domain policy", () => {
  it.each(["all", "time", "title"])(
    "지원하는 적용 모드를 허용한다: %s",
    (value) => {
      expect(isPendingApplyMode(value)).toBe(true);
    },
  );

  it.each(["", "ALL", "status", null, undefined, 1])(
    "지원하지 않는 적용 모드를 거부한다: %s",
    (value) => {
      expect(isPendingApplyMode(value)).toBe(false);
    },
  );

  it.each(["update", "create"])(
    "지원하는 대상 모드를 허용한다: %s",
    (value) => {
      expect(isPendingTargetMode(value)).toBe(true);
    },
  );

  it.each(["", "replace", null, undefined, 1])(
    "지원하지 않는 대상 모드를 거부한다: %s",
    (value) => {
      expect(isPendingTargetMode(value)).toBe(false);
    },
  );

  it.each(["nearest_half_hour", "nearest_hour", "exact"])(
    "지원하는 시간 모드를 허용한다: %s",
    (value) => {
      expect(isPendingTimeMode(value)).toBe(true);
    },
  );

  it.each(["", "nearest", null, undefined, 1])(
    "지원하지 않는 시간 모드를 거부한다: %s",
    (value) => {
      expect(isPendingTimeMode(value)).toBe(false);
    },
  );

  it.each([
    [null, null],
    ["", null],
    ["0:00", "00:00"],
    ["12:29", "12:00"],
    ["12:30", "13:00"],
    ["09:59", "10:00"],
    ["23:29", "23:00"],
    ["23:30", "23:00"],
  ])("시간을 일정 시각 경계에 맞춰 반올림한다: %s", (value, expected) => {
    expect(roundTimeToNearestScheduleHour(value)).toBe(expected);
  });

  it.each([
    [null, null],
    ["", null],
    ["0:00", "00:00"],
    ["12:14", "12:00"],
    ["12:15", "12:30"],
    ["12:44", "12:30"],
    ["12:45", "13:00"],
    ["23:45", "23:30"],
  ])("시간을 가장 가까운 30분 경계에 맞춰 반올림한다: %s", (value, expected) => {
    expect(roundTimeToNearestScheduleHalfHour(value)).toBe(expected);
  });

  it.each(["9", "09:5", "-1:00", "24:00", "12:60", "not-a-time"])(
    "형식이나 범위를 벗어난 시간은 원본을 유지한다: %s",
    (value) => {
      expect(roundTimeToNearestScheduleHour(value)).toBe(value);
    },
  );

  it("전체 적용은 시간 모드에 따라 시작 시각을 선택하고 제목을 유지한다", () => {
    expect(
      getPendingApprovalValues(
        pendingSchedule,
        makeOptions({ timeMode: "exact" }),
      ),
    ).toEqual({
      startTime: "12:30",
      title: "테스트 방송",
    });

    expect(
      getPendingApprovalValues(
        pendingSchedule,
        makeOptions({ timeMode: "nearest_half_hour" }),
      ),
    ).toEqual({
      startTime: "12:30",
      title: "테스트 방송",
    });

    expect(
      getPendingApprovalValues(
        pendingSchedule,
        makeOptions({ timeMode: "nearest_hour" }),
      ),
    ).toEqual({
      startTime: "13:00",
      title: "테스트 방송",
    });
  });

  it("시간만 적용하면 제목을 제외하고 선택한 시간 정책을 사용한다", () => {
    expect(
      getPendingApprovalValues(
        pendingSchedule,
        makeOptions({ applyMode: "time", timeMode: "exact" }),
      ),
    ).toEqual({
      startTime: "12:30",
      title: null,
    });

    expect(
      getPendingApprovalValues(
        pendingSchedule,
        makeOptions({ applyMode: "time", timeMode: "nearest_hour" }),
      ),
    ).toEqual({
      startTime: "13:00",
      title: null,
    });
  });

  it("제목만 적용하면 시작 시각을 제외하고 null 제목도 그대로 유지한다", () => {
    expect(
      getPendingApprovalValues(
        { ...pendingSchedule, title: null },
        makeOptions({ applyMode: "title" }),
      ),
    ).toEqual({
      startTime: null,
      title: null,
    });
  });

  it("원본 시작 시각이 없으면 exact와 반올림 정책 모두 null을 유지한다", () => {
    const itemWithoutTime = { ...pendingSchedule, start_time: null };

    expect(
      getPendingApprovalValues(
        itemWithoutTime,
        makeOptions({ timeMode: "exact" }),
      ).startTime,
    ).toBeNull();
    expect(
      getPendingApprovalValues(
        itemWithoutTime,
        makeOptions({ timeMode: "nearest_hour" }),
      ).startTime,
    ).toBeNull();
  });
});
