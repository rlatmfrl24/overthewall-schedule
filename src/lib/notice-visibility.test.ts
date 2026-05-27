import { describe, expect, it } from "vitest";
import { isNoticeVisibleOnDate } from "./notice-visibility";

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
});
