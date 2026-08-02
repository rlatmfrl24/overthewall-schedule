import { describe, expect, it } from "vitest";
import {
  getScheduleBoard,
  isScheduleChangeAction,
  resolveScheduleBoardUpdatedAt,
} from "./d1-schedule-board";
import type { DbInstance } from "../../../platform/db";

describe("schedule-board updatedAt", () => {
  it("조회 시각이 아니라 실제 최신 변경 시각을 ISO 문자열로 반환한다", () => {
    expect(
      resolveScheduleBoardUpdatedAt("2026-07-13 01:10:00", [
        "2026-07-12 23:00:00",
        "2026-07-13 00:30:00",
      ]),
    ).toBe("2026-07-13T01:10:00.000Z");
  });

  it("변경 로그가 없는 기존 일정은 가장 최근 생성 시각을 사용한다", () => {
    expect(
      resolveScheduleBoardUpdatedAt(null, [
        "2026-07-10 08:00:00",
        "2026-07-11 09:15:00",
      ]),
    ).toBe("2026-07-11T09:15:00.000Z");
  });

  it("변경 이력이 없으면 업데이트 시각을 반환하지 않는다", () => {
    expect(resolveScheduleBoardUpdatedAt(null, [])).toBeNull();
  });

  it("실제로 공개 일정이 변경된 로그만 최종 편집으로 분류한다", () => {
    expect(isScheduleChangeAction("create")).toBe(true);
    expect(isScheduleChangeAction("update")).toBe(true);
    expect(isScheduleChangeAction("delete")).toBe(true);
    expect(isScheduleChangeAction("approve")).toBe(true);
    expect(isScheduleChangeAction("schedule_auto_created")).toBe(true);
    expect(isScheduleChangeAction("schedule_auto_updated")).toBe(true);
  });

  it("승인 대기 후보 수집 로그는 최종 편집으로 분류하지 않는다", () => {
    expect(isScheduleChangeAction("auto_collected")).toBe(false);
    expect(isScheduleChangeAction("auto_updated")).toBe(false);
    expect(isScheduleChangeAction("reject")).toBe(false);
  });

  it("일정 보드 응답에 공지 다중 콘텐츠 배열을 그대로 전달한다", async () => {
    const notice = {
      id: 7,
      content: "다중 공지",
      links: [
        { label: "A", url: "https://example.com/a" },
        { label: "B", url: "https://example.com/b" },
      ],
      image_urls: ["/one.webp", "/two.webp"],
      related_member_uids: [1, 2],
      url: "https://example.com/a",
      thumbnail_url: "/one.webp",
      type: "notice",
      publisher_type: "otw",
      publisher_member_uid: null,
      is_active: true,
      is_featured: true,
      started_at: null,
      ended_at: null,
      created_at: "2026-08-03 00:00:00",
    };
    const makeQuery = (rows: unknown[]) => {
      const query = {
        from: () => query,
        where: () => query,
        orderBy: () => query,
        limit: () => query,
        then: (resolve: (value: unknown[]) => unknown) => resolve(rows),
      };
      return query;
    };
    const rowSets = [[], [], [notice], [], []];
    const db = {
      select: () => makeQuery(rowSets.shift() ?? []),
    } as unknown as DbInstance;

    const board = await getScheduleBoard(db, "2026-08-03", "2026-08-09");

    expect(board.notices[0]).toMatchObject({
      links: notice.links,
      image_urls: notice.image_urls,
      related_member_uids: notice.related_member_uids,
    });
  });
});
