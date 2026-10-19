import { describe, expect, it } from "vitest";
import { getScheduleBoard } from "../../schedule-board/infrastructure/d1-schedule-board";
import { buildLiveScheduleFillPlans } from "./live-schedule";
import type { DbInstance } from "../../../platform/db";

const member = { uid: 1, code: "bing_hayu", name: "빙하유", url_chzzk: "https://chzzk.naver.com/" + "a".repeat(32) };
const read = (date: string, schedules: unknown[] = [], siteId: "luvdia" | "otw" = "luvdia") => {
  const rows: unknown[][] = [[member], [], [], schedules, []];
  const db = { select: () => {
    const result = rows.shift();
    const query = { from: () => query, where: () => query, orderBy: () => query, limit: () => query,
      then: (resolve: (value: unknown) => unknown) => resolve(result) };
    return query;
  } } as unknown as DbInstance;
  return getScheduleBoard(db, date, date, false, siteId);
};

describe("빙하유 일정 운영 정책", () => {
  it("11월 15일까지 표시하고 이후 빈 일정에서는 제외한다", async () => {
    expect((await read("2026-11-15")).members).toHaveLength(1);
    expect((await read("2026-11-16")).members).toHaveLength(0);
    expect((await read("2026-11-16", [], "otw")).members).toHaveLength(1);
  });
  it("종료 이후에도 저장된 일정은 멤버와 함께 공개한다", async () => {
    const schedule = { id: 10, member_uid: 1, date: "2026-11-16", status: "방송" };
    const board = await read(schedule.date, [schedule]);
    expect(board.members).toHaveLength(1);
    expect(board.schedules).toEqual([schedule]);
  });
  it("종료 이후 라이브 자동 입력을 차단한다", () => {
    const plans = buildLiveScheduleFillPlans({
      members: [member], schedules: [], siteId: "luvdia",
      liveItems: [{ channelId: "a".repeat(32), content: {
        status: "OPEN", openDate: "2026-11-16T12:00:00+09:00", liveTitle: "예외 방송",
        concurrentUserCount: 1, liveImageUrl: "", defaultThumbnailImageUrl: "",
        channelId: "a".repeat(32), channelName: "빙하유", channelImageUrl: "",
      } }],
    });
    expect(plans).toEqual([]);
  });
});
