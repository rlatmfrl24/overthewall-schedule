import { describe, expect, it } from "vitest";
import { PublicScheduleWritePolicy } from "./public-schedule-write-policy";

describe("PublicScheduleWritePolicy", () => {
  it("현재 제품 정책에 따라 익명 일정 쓰기를 명시적으로 허용한다", () => {
    const policy = new PublicScheduleWritePolicy();

    expect(
      policy.canWrite({
        operation: "create",
        actor: {
          actorId: null,
          actorName: null,
          actorIp: "203.0.113.10",
        },
      }),
    ).toBe(true);
  });
});
