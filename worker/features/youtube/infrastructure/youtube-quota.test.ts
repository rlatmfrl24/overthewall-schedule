import { describe, expect, it } from "vitest";
import { getYouTubeQuotaWindow } from "./youtube-quota";

describe("YouTube quota window", () => {
  it("PDT 자정에서 새 일일 quota window를 시작한다", () => {
    const beforeReset = getYouTubeQuotaWindow(
      Date.parse("2026-08-31T06:59:59.000Z"),
    );
    const afterReset = getYouTubeQuotaWindow(
      Date.parse("2026-08-31T07:00:00.000Z"),
    );

    expect(beforeReset).toEqual({
      day: "2026-08-30",
      since: Date.parse("2026-08-30T07:00:00.000Z"),
    });
    expect(afterReset).toEqual({
      day: "2026-08-31",
      since: Date.parse("2026-08-31T07:00:00.000Z"),
    });
  });

  it("PST 기간에는 UTC-8 자정을 사용한다", () => {
    expect(
      getYouTubeQuotaWindow(Date.parse("2026-01-15T08:00:00.000Z")),
    ).toEqual({
      day: "2026-01-15",
      since: Date.parse("2026-01-15T08:00:00.000Z"),
    });
  });
});
