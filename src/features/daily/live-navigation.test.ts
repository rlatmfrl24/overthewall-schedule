import { describe, expect, it } from "vitest";
import type { ChzzkLiveStatusMap, Member, ScheduleItem } from "@/lib/types";
import { getLiveUrlForSchedule } from "./live-navigation";

const member = {
  uid: 1,
  code: "member-1",
  name: "온 하루",
  main_color: null,
  sub_color: null,
  oshi_mark: null,
  url_twitter: null,
  url_youtube: null,
  url_chzzk: "https://chzzk.naver.com/member-channel",
  youtube_channel_id: null,
  birth_date: null,
  debut_date: null,
  unit_name: null,
  fan_name: null,
  introduction: null,
  is_deprecated: 0,
} as Member;

const schedule = {
  id: 1,
  member_uid: 1,
  date: "2026-05-29",
  start_time: "20:00",
  title: "정규 방송",
  status: "방송",
  created_at: null,
} as ScheduleItem;

describe("getLiveUrlForSchedule", () => {
  it("returns the live channel URL when the schedule member is live", () => {
    const liveStatuses = {
      1: {
        status: "OPEN",
        channelId: "live-channel",
        liveTitle: "라이브 중",
      },
    } as ChzzkLiveStatusMap;

    expect(getLiveUrlForSchedule(schedule, [member], liveStatuses)).toBe(
      "https://chzzk.naver.com/live/live-channel",
    );
  });

  it("falls back to the member Chzzk live URL when status lacks a channel ID", () => {
    const liveStatuses = {
      1: {
        status: "OPEN",
        channelId: "",
        liveTitle: "라이브 중",
      },
    } as ChzzkLiveStatusMap;

    expect(getLiveUrlForSchedule(schedule, [member], liveStatuses)).toBe(
      "https://chzzk.naver.com/live/member-channel",
    );
  });

  it("returns null when the member is not currently live", () => {
    const liveStatuses = {
      1: {
        status: "CLOSE",
        channelId: "live-channel",
      },
    } as ChzzkLiveStatusMap;

    expect(getLiveUrlForSchedule(schedule, [member], liveStatuses)).toBeNull();
  });
});
