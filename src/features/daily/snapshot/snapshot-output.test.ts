// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { Member, ScheduleItem } from "@/lib/types";
import { SnapshotCardMember } from "./snapshot-card-member";
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

  it("상태명만 저장된 스냅샷 제목은 실제 편성표 기본 문구로 치환한다", () => {
    render(
      createElement(SnapshotCardSchedule, {
        schedule: makeSchedule({
          status: "휴방",
          title: "휴방",
        }),
      }),
    );

    expect(screen.getByText("오늘은 휴방입니다")).toBeTruthy();
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
    expect(screen.getByText("멤버 / 일정")).toBeTruthy();
    expect(screen.getByText("정규 컨텐츠")).toBeTruthy();
    expect(screen.queryByText("상태")).toBeNull();
    expect(screen.queryByText("방송")).toBeNull();
  });

  it("타임라인 스냅샷에서 소속 그룹명을 이름과 분리된 칩으로 표시한다", () => {
    const member = {
      ...makeMember(1, "빙하유"),
      unit_name: "리브다이아",
    };

    render(
      createElement(SnapshotTimeline, {
        members: [member],
        schedules: [
          makeSchedule({
            status: "방송",
            start_time: "20:00",
            title: "정규 컨텐츠",
          }),
        ],
      }),
    );

    expect(screen.getByText("빙하유")).toBeTruthy();
    expect(screen.getByText("리브다이아")).toBeTruthy();
    expect(screen.queryByText("빙하유 · 리브다이아")).toBeNull();
  });

  it("타임라인 스냅샷에서 긴 제목을 말줄임 없이 줄바꿈할 수 있다", () => {
    const longTitle =
      "아무 의미도 없는 그냥 테스트용 일정 주구장창 길게 적기 아아아아아아아아아아아아아아";

    render(
      createElement(SnapshotTimeline, {
        members: [makeMember(1, "하네")],
        schedules: [
          makeSchedule({
            status: "방송",
            start_time: "21:00",
            title: longTitle,
          }),
        ],
      }),
    );

    const title = screen.getByText(longTitle);
    expect(title.className).toContain("whitespace-normal");
    expect(title.className).toContain("break-words");
    expect(title.className).not.toContain("truncate");
  });

  it("타임라인 스냅샷에서 일정 없는 멤버를 별도 섹션에 표시한다", () => {
    render(
      createElement(SnapshotTimeline, {
        members: [makeMember(1, "하네"), makeMember(2, "유리리")],
        schedules: [
          makeSchedule({
            id: 1,
            member_uid: 1,
            status: "방송",
            start_time: "21:00",
            title: "정규 컨텐츠",
          }),
        ],
      }),
    );

    expect(screen.getByText("일정 없음")).toBeTruthy();
    expect(screen.getByText("유리리")).toBeTruthy();
    expect(screen.getByText("오늘 등록된 일정이 없습니다")).toBeTruthy();
  });

  it("타임라인 스냅샷에서 일정 없는 라이브 멤버를 미등록 LIVE로 표시한다", () => {
    render(
      createElement(SnapshotTimeline, {
        members: [makeMember(1, "하네"), makeMember(2, "유리리")],
        schedules: [
          makeSchedule({
            id: 1,
            member_uid: 1,
            status: "방송",
            start_time: "21:00",
            title: "정규 컨텐츠",
          }),
        ],
        liveStatuses: {
          2: {
            status: "OPEN",
            liveTitle: "즉흥 노래 방송",
            concurrentUserCount: 42,
          },
        },
      }),
    );

    expect(screen.getByText("미등록 LIVE")).toBeTruthy();
    expect(screen.getByText("즉흥 노래 방송")).toBeTruthy();
  });

  it("그리드 스냅샷 카드에서도 일정 없는 라이브를 표시한다", () => {
    render(
      createElement(SnapshotCardMember, {
        member: makeMember(2, "유리리"),
        schedules: [],
        liveStatus: {
          status: "OPEN",
          liveTitle: "즉흥 노래 방송",
          concurrentUserCount: 42,
        },
      }),
    );

    expect(screen.getByText("미등록 LIVE")).toBeTruthy();
    expect(screen.getByText("즉흥 노래 방송")).toBeTruthy();
    expect(screen.getByText("42 시청중")).toBeTruthy();
  });
});
