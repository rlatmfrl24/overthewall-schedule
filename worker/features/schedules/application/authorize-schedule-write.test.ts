import { describe, expect, it, vi } from "vitest";
import { authorizeScheduleWrite } from "./authorize-schedule-write";
import type { ScheduleWriteAuthorizationPolicy } from "./ports/schedule-write-authorization-policy";

const anonymousActor = {
  actorId: null,
  actorName: null,
  actorIp: "203.0.113.10",
};

describe("schedule write authorization", () => {
  it("application 경계가 policy 판단을 그대로 적용한다", async () => {
    const canWrite = vi.fn(() => false);
    const policy: ScheduleWriteAuthorizationPolicy = { canWrite };

    await expect(
      authorizeScheduleWrite(policy, {
        operation: "delete",
        actor: anonymousActor,
      }),
    ).resolves.toBe(false);
    expect(canWrite).toHaveBeenCalledWith({
      operation: "delete",
      actor: anonymousActor,
    });
  });
});
