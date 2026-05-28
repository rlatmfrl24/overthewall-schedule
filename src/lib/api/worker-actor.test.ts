import { describe, expect, it } from "vitest";
import { getActorInfo } from "../../../worker/utils/helpers";

describe("worker actor info", () => {
  it("ignores client-supplied actor headers", () => {
    const actor = getActorInfo(
      new Request("https://example.com/api/schedules", {
        headers: {
          "CF-Connecting-IP": "203.0.113.10",
          "X-Actor-ID": "spoofed_actor",
          "X-Actor-Name": "Spoofed Actor",
          "x-otw-user-id": "spoofed_user",
          "x-otw-user-name": "Spoofed User",
        },
      }),
    );

    expect(actor).toEqual({
      actorId: null,
      actorName: null,
      actorIp: "203.0.113.10",
    });
  });

  it("uses a verified authenticated user for audit identity", () => {
    const actor = getActorInfo(
      new Request("https://example.com/api/schedules", {
        headers: {
          "CF-Connecting-IP": "203.0.113.10",
          "x-otw-user-id": "spoofed_user",
        },
      }),
      {
        id: "user_verified",
        displayName: "Verified User",
        sessionId: "session_1",
        claims: {},
      },
    );

    expect(actor).toEqual({
      actorId: "user_verified",
      actorName: "Verified User",
      actorIp: "203.0.113.10",
    });
  });
});
