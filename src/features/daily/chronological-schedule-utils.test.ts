import { describe, expect, it } from "vitest";
import type { ChzzkLiveStatusMap, Member, ScheduleItem } from "@/lib/types";
import {
  buildNoScheduleMemberEntries,
  buildScheduleBoardModel,
  filterScheduleBoardModel,
  getScheduleDisplayTitle,
} from "./chronological-schedule-utils";

const makeSchedule = (
  partial: Partial<ScheduleItem> & Pick<ScheduleItem, "status">,
): ScheduleItem =>
  ({
    id: 1,
    member_uid: 1,
    date: "2026-02-13",
    start_time: null,
    title: "테스트",
    created_at: null,
    ...partial,
  }) as ScheduleItem;

const liveStatuses = {
  7: {
    status: "OPEN",
    liveTitle: "라이브 테스트",
    concurrentUserCount: 1245,
  },
} as ChzzkLiveStatusMap;

const makeMember = (uid: number): Member =>
  ({
    uid,
    code: `member-${uid}`,
    name: `멤버 ${uid}`,
    main_color: null,
    sub_color: null,
    oshi_mark: null,
    url_twitter: null,
    url_youtube: null,
    url_chzzk: uid === 7 ? "https://chzzk.naver.com/live-channel" : null,
    youtube_channel_id: null,
    birth_date: null,
    debut_date: null,
    unit_name: null,
    fan_name: null,
    introduction: null,
    is_deprecated: 0,
  }) as Member;

describe("buildScheduleBoardModel", () => {
  it("방송/게릴라/미정/휴방을 분류하고 시간순으로 정렬한다", () => {
    const schedules: ScheduleItem[] = [
      makeSchedule({ id: 1, member_uid: 1, status: "휴방", start_time: "19:00" }),
      makeSchedule({ id: 2, member_uid: 7, status: "방송", start_time: "21:30" }),
      makeSchedule({ id: 3, member_uid: 3, status: "게릴라", start_time: "18:00" }),
      makeSchedule({ id: 4, member_uid: 4, status: "방송", start_time: "20:00" }),
      makeSchedule({ id: 5, member_uid: 5, status: "미정", start_time: null }),
      makeSchedule({ id: 6, member_uid: 6, status: "방송", start_time: null }),
    ];

    const model = buildScheduleBoardModel(schedules, liveStatuses);

    expect(model.mainItems.map((entry) => entry.schedule.id)).toEqual([4, 2]);
    expect(model.sideGroups.guerrilla.map((entry) => entry.schedule.id)).toEqual([3]);
    expect(model.sideGroups.undecided.map((entry) => entry.schedule.id)).toEqual([
      5, 6,
    ]);
    expect(model.sideGroups.off.map((entry) => entry.schedule.id)).toEqual([1]);
    expect(model.mainItems.find((entry) => entry.schedule.id === 2)?.isLive).toBe(
      true,
    );
    expect(model.counters).toEqual({
      all: 6,
      broadcast: 3,
      live: 1,
      guerrilla: 1,
      off: 1,
      undecided: 2,
    });
  });

  it("필터별로 메인 보드와 보조 레일을 함께 좁힌다", () => {
    const model = buildScheduleBoardModel(
      [
        makeSchedule({ id: 1, member_uid: 1, status: "휴방" }),
        makeSchedule({ id: 2, member_uid: 7, status: "방송", start_time: "21:00" }),
        makeSchedule({ id: 3, member_uid: 3, status: "게릴라" }),
        makeSchedule({ id: 4, member_uid: 4, status: "방송" }),
      ],
      liveStatuses,
    );

    const liveModel = filterScheduleBoardModel(model, "live");
    expect(liveModel.mainItems.map((entry) => entry.schedule.id)).toEqual([2]);
    expect(liveModel.sideGroups.guerrilla).toHaveLength(0);

    const broadcastModel = filterScheduleBoardModel(model, "broadcast");
    expect(broadcastModel.mainItems.map((entry) => entry.schedule.id)).toEqual([
      2,
    ]);
    expect(
      broadcastModel.sideGroups.undecided.map((entry) => entry.schedule.id),
    ).toEqual([4]);

    const offModel = filterScheduleBoardModel(model, "off");
    expect(offModel.mainItems).toHaveLength(0);
    expect(offModel.sideGroups.off.map((entry) => entry.schedule.id)).toEqual([
      1,
    ]);
  });

  it("상태명만 저장된 제목은 읽기 좋은 기본 문구로 치환한다", () => {
    expect(
      getScheduleDisplayTitle(
        makeSchedule({ id: 1, status: "게릴라", title: "게릴라" }),
      ),
    ).toBe("게릴라 방송 예정");
    expect(
      getScheduleDisplayTitle(
        makeSchedule({ id: 2, status: "방송", title: "" }),
      ),
    ).toBe("방송 예정");
  });

  it("일정이 없는 멤버를 추리고 방송 중인 멤버를 먼저 정렬한다", () => {
    const entries = buildNoScheduleMemberEntries(
      [makeMember(1), makeMember(7), makeMember(3)],
      [makeSchedule({ id: 1, member_uid: 1, status: "방송" })],
      liveStatuses,
    );

    expect(entries.map((entry) => entry.member.uid)).toEqual([7, 3]);
    expect(entries[0].isLive).toBe(true);
    expect(entries[1].isLive).toBe(false);
  });
});

