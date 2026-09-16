import { createMemberFixture } from "@/test/member-fixtures";
// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { Member } from "@/features/members";
import type { ScheduleItem } from "@/features/schedules";
import { SnapshotCardMember } from "./snapshot-card-member";
import { SnapshotCardSchedule } from "./snapshot-card-schedule";
import { SnapshotTimeline } from "./snapshot-timeline";

const makeMember = (uid: number, name: string): Member =>
  (createMemberFixture({
    uid,
    code: `member-${uid}`,
    name,
    main_color: "#14b8a6"
  })) as Member;

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

  it("보조 그룹은 실제 제목을 보존하고 상태와 중복 문구만 생략한다", () => {
    render(createElement(SnapshotTimeline, {
      members: [makeMember(1, "하네"), makeMember(2, "유리리"), makeMember(3, "온하루")],
      schedules: [
        makeSchedule({ id: 1, member_uid: 1, status: "휴방", title: "병원 진료 후 하루 쉬어갑니다" }),
        makeSchedule({ id: 2, member_uid: 2, status: "게릴라", title: "게릴라", start_time: "20:00" }),
        makeSchedule({ id: 3, member_uid: 3, status: "미정", title: "일정 조율 중, 시간은 다시 공지할게요" }),
      ],
    }));
    expect(within(screen.getByRole("region", { name: "휴방" })).getByText("병원 진료 후 하루 쉬어갑니다")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "미정" })).getByText("일정 조율 중, 시간은 다시 공지할게요")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "게릴라 예정" })).getByText("유리리")).toBeTruthy();
    expect(screen.queryByText("게릴라 방송 예정")).toBeNull();
    expect(within(screen.getByRole("region", { name: "게릴라 예정" })).getByText("20:00")).toBeTruthy();
    expect(screen.getByText("시간이 확정된 방송이 없습니다.")).toBeTruthy();
  });

  it("그리드 카드에서 실제 스케쥴 카드와 동일한 휴방 상태를 표시한다", () => {
    render(
      createElement(SnapshotCardSchedule, {
        schedule: makeSchedule({
          status: "휴방",
          title: "정비일",
        }),
      }),
    );

    expect(screen.getByText("정비일")).toBeTruthy();
    expect(screen.getByText("휴방")).toBeTruthy();
    expect(screen.queryByText("미정")).toBeNull();
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
    expect(screen.getByText("휴방")).toBeTruthy();
    expect(screen.queryByText("미정")).toBeNull();
  });

  it("게릴라 카드에서는 시간을 표시하지 않는다", () => {
    render(
      createElement(SnapshotCardSchedule, {
        schedule: makeSchedule({
          status: "게릴라",
          start_time: "20:00",
          title: "즉흥 방송",
        }),
      }),
    );

    expect(screen.getByText("게릴라 방송")).toBeTruthy();
    expect(screen.getByText("즉흥 방송")).toBeTruthy();
    expect(screen.queryByText("20:00")).toBeNull();
    expect(screen.queryByText("미정")).toBeNull();
  });

  it("시간별 방송을 편성 순서로 표시하고 중복 상태 표시는 생략한다", () => {
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

    expect(screen.getByRole("region", { name: "방송 일정" })).toBeTruthy();
    expect(screen.getByText("20:00").tagName).toBe("TIME");
    expect(screen.getByText("정규 컨텐츠")).toBeTruthy();
    expect(screen.queryByText("상태")).toBeNull();
    expect(screen.queryByText("방송")).toBeNull();
  });

  it("타임라인 스냅샷에서 소속 그룹명을 이름과 분리하여 표시한다", () => {
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

  it("타임라인 스냅샷에서 일정 없는 멤버의 라이브 표시를 출력하지 않는다", () => {
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

    expect(screen.queryByText("미등록 LIVE")).toBeNull();
    expect(screen.queryByText(/방송 중/)).toBeNull();
    expect(screen.queryByText("현재 방송 중입니다")).toBeNull();
    expect(screen.getByText("오늘 등록된 일정이 없습니다")).toBeTruthy();
    expect(screen.queryByText("즉흥 노래 방송")).toBeNull();
  });

  it("그리드 스냅샷 카드에서도 라이브 배지를 출력하지 않는다", () => {
    render(
      createElement(SnapshotCardMember, {
        member: makeMember(2, "유리리"),
        schedules: [],
      }),
    );

    expect(screen.queryByText("미등록 LIVE")).toBeNull();
    expect(screen.queryByText("LIVE")).toBeNull();
    expect(screen.getByText("일정 없음")).toBeTruthy();
    expect(screen.queryByText("즉흥 노래 방송")).toBeNull();
    expect(screen.queryByText("42 시청중")).toBeNull();
  });
});
