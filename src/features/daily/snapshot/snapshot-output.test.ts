// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { Member, ScheduleItem } from "@/lib/types";
import { SnapshotCardSchedule } from "./snapshot-card-schedule";
import { SnapshotTimeline } from "./snapshot-timeline";

const makeMember = (uid: number, name: string): Member =>
  ({
    uid,
    code: `member-${uid}`,
    name,
    main_color: "#14b8a6",
    sub_color: null,
    oshi_mark: null,
    url_twitter: null,
    url_youtube: null,
    url_chzzk: null,
    youtube_channel_id: null,
    birth_date: null,
    debut_date: null,
    unit_name: null,
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
    date: "2026-05-29",
    start_time: null,
    title: "정규 컨텐츠",
    created_at: null,
    ...partial,
  }) as ScheduleItem;

describe("snapshot output", () => {
  afterEach(() => {
    cleanup();
  });

  it("그리드 카드에서 상태 라벨을 별도로 출력하지 않는다", () => {
    render(
      createElement(SnapshotCardSchedule, {
        schedule: makeSchedule({
          status: "휴방",
          title: "정비일",
        }),
      }),
    );

    expect(screen.getByText("정비일")).toBeTruthy();
    expect(screen.queryByText("휴방")).toBeNull();
  });

  it("타임라인에서 상태 컬럼과 상태 pill을 출력하지 않는다", () => {
    render(
      createElement(SnapshotTimeline, {
        members: [makeMember(1, "하네")],
        schedules: [
          makeSchedule({
            status: "방송",
            start_time: "20:00",
            title: "정규 컨텐츠",
          }),
        ],
      }),
    );

    expect(screen.getByText("시간")).toBeTruthy();
    expect(screen.getByText("멤버 / 제목")).toBeTruthy();
    expect(screen.getByText("정규 컨텐츠")).toBeTruthy();
    expect(screen.queryByText("상태")).toBeNull();
    expect(screen.queryByText("방송")).toBeNull();
  });
});
