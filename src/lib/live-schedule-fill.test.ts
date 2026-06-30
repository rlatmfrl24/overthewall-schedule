import { describe, expect, it } from "vitest";
import {
  buildLiveScheduleFillPlans,
  roundToNearestHalfHour,
  resolveLiveOpenedAt,
  type LiveStatusItem,
} from "../../worker/services/live-schedule";

const channelId = "0123456789abcdef0123456789abcdef";
const otherChannelId = "abcdef0123456789abcdef0123456789";

const members = [
  {
    uid: 1,
    name: "테스트 멤버",
    url_chzzk: `https://chzzk.naver.com/${channelId}`,
  },
  {
    uid: 2,
    name: "다른 멤버",
    url_chzzk: `https://chzzk.naver.com/${otherChannelId}`,
  },
];

const makeLiveItem = (
  overrides: Partial<NonNullable<LiveStatusItem["content"]>> = {},
): LiveStatusItem => ({
  channelId,
  content: {
    status: "OPEN",
    liveTitle: "라이브 방송 제목",
    concurrentUserCount: 100,
    liveImageUrl: "",
    defaultThumbnailImageUrl: "",
    openDate: "2026-06-30T20:15:00+09:00",
    channelId,
    channelName: "테스트 채널",
    channelImageUrl: "",
    ...overrides,
  },
});

describe("live schedule fill", () => {
  it("시간 미정 방송 스케쥴에 라이브 제목과 시작 시간을 채운다", () => {
    const plans = buildLiveScheduleFillPlans({
      members,
      schedules: [
        {
          id: 10,
          member_uid: 1,
          date: "2026-06-30",
          start_time: null,
          title: "",
          status: "방송",
        },
      ],
      liveItems: [makeLiveItem()],
    });

    expect(plans).toEqual([
      {
        action: "update",
        scheduleId: 10,
        memberUid: 1,
        memberName: "테스트 멤버",
        scheduleDate: "2026-06-30",
        startTime: "20:30",
        title: "라이브 방송 제목",
        previousStatus: "방송",
      },
    ]);
  });

  it("기존 미정 상태 스케쥴도 방송 스케쥴로 보정할 대상으로 잡는다", () => {
    const plans = buildLiveScheduleFillPlans({
      members,
      schedules: [
        {
          id: 11,
          member_uid: 1,
          date: "2026-06-30",
          start_time: null,
          title: "미정",
          status: "미정",
        },
      ],
      liveItems: [makeLiveItem()],
    });

    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      action: "update",
      scheduleId: 11,
      previousStatus: "미정",
      startTime: "20:30",
    });
  });

  it("멤버의 해당 날짜 스케쥴이 아예 없으면 방송 스케쥴 생성 대상으로 잡는다", () => {
    const plans = buildLiveScheduleFillPlans({
      members,
      schedules: [],
      liveItems: [makeLiveItem()],
    });

    expect(plans).toEqual([
      {
        action: "create",
        scheduleId: null,
        memberUid: 1,
        memberName: "테스트 멤버",
        scheduleDate: "2026-06-30",
        startTime: "20:30",
        title: "라이브 방송 제목",
        previousStatus: null,
      },
    ]);
  });

  it("이미 시작 시간이 있는 스케쥴이나 닫힌 라이브는 갱신하지 않는다", () => {
    const plans = buildLiveScheduleFillPlans({
      members,
      schedules: [
        {
          id: 12,
          member_uid: 1,
          date: "2026-06-30",
          start_time: "19:00",
          title: "기존 방송",
          status: "방송",
        },
        {
          id: 13,
          member_uid: 2,
          date: "2026-06-30",
          start_time: null,
          title: "",
          status: "방송",
        },
      ],
      liveItems: [
        makeLiveItem(),
        {
          channelId: otherChannelId,
          content: {
            status: "CLOSE",
            liveTitle: "",
            concurrentUserCount: 0,
            liveImageUrl: "",
            defaultThumbnailImageUrl: "",
            channelId: otherChannelId,
            channelName: "다른 채널",
            channelImageUrl: "",
          },
        },
      ],
    });

    expect(plans).toEqual([]);
  });

  it("타임존이 없는 CHZZK 시작 시각은 KST로 해석한다", () => {
    const openedAt = resolveLiveOpenedAt({
      status: "OPEN",
      liveTitle: "라이브",
      concurrentUserCount: 1,
      liveImageUrl: "",
      defaultThumbnailImageUrl: "",
      openDate: "2026-06-30 20:15:00",
      channelId,
      channelName: "테스트 채널",
      channelImageUrl: "",
    });

    expect(openedAt.toISOString()).toBe("2026-06-30T11:15:00.000Z");
  });

  it("자동 입력 시각은 가까운 30분 단위로 보정한다", () => {
    expect(
      roundToNearestHalfHour(
        new Date("2026-06-30T20:14:00+09:00"),
      ).toISOString(),
    ).toBe("2026-06-30T11:00:00.000Z");
    expect(
      roundToNearestHalfHour(
        new Date("2026-06-30T20:16:00+09:00"),
      ).toISOString(),
    ).toBe("2026-06-30T11:30:00.000Z");
  });

  it("자정 근처에서 30분 보정으로 날짜가 바뀌면 스케쥴 날짜도 함께 바꾼다", () => {
    const plans = buildLiveScheduleFillPlans({
      members,
      schedules: [],
      liveItems: [
        makeLiveItem({
          openDate: "2026-06-30T23:50:00+09:00",
        }),
      ],
    });

    expect(plans[0]).toMatchObject({
      action: "create",
      scheduleDate: "2026-07-01",
      startTime: "00:00",
    });
  });
});
