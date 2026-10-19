import { describe, expect, it } from "vitest";
import { PublicScheduleWritePolicy } from "./public-schedule-write-policy";

describe("PublicScheduleWritePolicy", () => {
  it("종료 이후 일정과 이동 전 원본의 일반 회원 변경을 거부한다", async () => {
    const db = { prepare: () => ({ bind: () => ({ first: async () => 1 }) }) } as unknown as D1Database;
    const policy = new PublicScheduleWritePolicy(db, "luvdia");
    expect(await policy.canWrite({
      operation: "update", actor: { actorId: "member", actorName: null, actorIp: null },
      input: { id: 7, memberUid: 2, date: "2026-11-15", startTime: null, title: null, status: "방송" },
    })).toBe(false);
  });
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
