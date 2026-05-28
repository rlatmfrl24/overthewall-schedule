// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChzzkLiveStatusMap, Member, ScheduleItem } from "@/lib/types";
import { ChronologicalScheduleList } from "./chronological-schedule-list";

const makeMember = (uid: number, name: string): Member =>
  ({
    uid,
    code: `member-${uid}`,
    name,
    main_color: uid === 1 ? "#14b8a6" : "#f97316",
    sub_color: null,
    oshi_mark: null,
    url_twitter: null,
    url_youtube: null,
    url_chzzk: "https://chzzk.naver.com/live/test",
    youtube_channel_id: null,
    birth_date: null,
    debut_date: null,
    unit_name: uid === 1 ? "LUV DIA" : "HiBlueming",
    fan_name: null,
    introduction: null,
    is_deprecated: 0,
  }) as Member;

const makeSchedule = (
  partial: Partial<ScheduleItem> & Pick<ScheduleItem, "status">,
): ScheduleItem =>
  ({
    id: 1,
    member_uid: 1,
    date: "2026-05-28",
    start_time: null,
    title: "테스트",
    created_at: null,
    ...partial,
  }) as ScheduleItem;

const liveStatuses = {
  1: {
    status: "OPEN",
    liveTitle: "라이브 중",
    concurrentUserCount: 321,
  },
} as ChzzkLiveStatusMap;

describe("ChronologicalScheduleList", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("필터 없이 편성표와 보조 레일을 함께 표시한다", () => {
    render(
      createElement(ChronologicalScheduleList, {
        members: [makeMember(1, "온 하루"), makeMember(2, "하네")],
        schedules: [
          makeSchedule({
            id: 1,
            member_uid: 1,
            status: "방송",
            start_time: "20:00",
            title: "정규 방송",
          }),
          makeSchedule({
            id: 2,
            member_uid: 2,
            status: "게릴라",
            title: "게릴라 방송",
          }),
        ],
        liveStatuses,
        onScheduleClick: vi.fn(),
      }),
    );

    expect(screen.getByText("정규 방송")).toBeTruthy();
    expect(screen.getByText("게릴라 방송")).toBeTruthy();
    expect(screen.queryByText("시청자")).toBeNull();
    expect(screen.queryByText("321")).toBeNull();
    expect(screen.queryByRole("button", { name: /전체/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /LIVE/ })).toBeNull();
    expect(screen.getByText("정규 방송")).toBeTruthy();
    expect(screen.getByText("게릴라 방송")).toBeTruthy();
  });

  it("로딩과 빈 상태를 표시한다", () => {
    const { rerender } = render(
      createElement(ChronologicalScheduleList, {
        members: [],
        schedules: [],
        loading: true,
        onScheduleClick: vi.fn(),
      }),
    );

    expect(screen.getByLabelText("편성표 로딩 중")).toBeTruthy();

    rerender(
      createElement(ChronologicalScheduleList, {
        members: [],
        schedules: [],
        loading: false,
        onScheduleClick: vi.fn(),
      }),
    );

    expect(screen.getByText("표시할 편성표가 없습니다")).toBeTruthy();
  });
});
