import { describe, expect, it } from "vitest";
import {
  isNoticeVisibleOnDate,
  selectFeaturedNotice,
} from "./notice-visibility";
import type { Notice } from "@/db/schema";

const makeNotice = (
  overrides: Partial<Parameters<typeof isNoticeVisibleOnDate>[0]> = {},
) => ({
  is_active: true,
  started_at: null,
  ended_at: null,
  ...overrides,
});

describe("notice visibility", () => {
  it("활성 상태와 게시 기간을 함께 확인한다", () => {
    expect(isNoticeVisibleOnDate(makeNotice(), "2026-05-27")).toBe(true);
    expect(
      isNoticeVisibleOnDate(makeNotice({ is_active: false }), "2026-05-27"),
    ).toBe(false);
    expect(
      isNoticeVisibleOnDate(makeNotice({ started_at: "2026-05-28" }), "2026-05-27"),
    ).toBe(false);
    expect(
      isNoticeVisibleOnDate(makeNotice({ ended_at: "2026-05-26" }), "2026-05-27"),
    ).toBe(false);
    expect(
      isNoticeVisibleOnDate(
        makeNotice({ started_at: "2026-05-20", ended_at: "2026-05-27" }),
        "2026-05-27",
      ),
    ).toBe(true);
  });

  it("기간이 설정되지 않은 공지와 이벤트는 기준 날짜와 무관하게 표시한다", () => {
    expect(
      isNoticeVisibleOnDate(
        makeNotice({ started_at: null, ended_at: null }),
        "2026-01-01",
      ),
    ).toBe(true);
    expect(
      isNoticeVisibleOnDate(
        makeNotice({ started_at: "", ended_at: "" }),
        "2026-12-31",
      ),
    ).toBe(true);
    expect(
      isNoticeVisibleOnDate(
        makeNotice({
          is_active: "0",
          started_at: null,
          ended_at: null,
        }),
        "2026-12-31",
      ),
    ).toBe(false);
  });
});

describe("featured notice selection", () => {
  const notice = (id: number, isFeatured: boolean) =>
    ({ id, is_featured: isFeatured }) as Notice;

  it("관리자가 지정한 공지를 최상단 대표 공지로 선택한다", () => {
    expect(
      selectFeaturedNotice([
        notice(3, false),
        notice(2, true),
        notice(1, false),
      ])?.id,
    ).toBe(2);
  });

  it("지정된 공지가 없으면 최신 목록의 첫 공지를 사용한다", () => {
    expect(selectFeaturedNotice([notice(3, false), notice(2, false)])?.id).toBe(
      3,
    );
  });
});
