import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import type { MemberSubmissionService } from "../application/member-submission-service";
import { createMemberSubmissionHandler } from "./member-submission-handler";

const authenticateRequestMock = vi.hoisted(() => vi.fn());
vi.mock("../../../platform/auth", () => ({
  authenticateRequest: authenticateRequestMock,
}));

const user = { id: "member-1", displayName: "Member", sessionId: null, claims: {} };

describe("member submission handler", () => {
  beforeEach(() => {
    authenticateRequestMock.mockReset();
    authenticateRequestMock.mockResolvedValue({ ok: true, user });
  });

  it("returns the standard auth error without resolving a service", async () => {
    authenticateRequestMock.mockResolvedValue({
      ok: false,
      response: new Response("Login required", { status: 401 }),
    });
    const resolve = vi.fn();
    const response = await createMemberSubmissionHandler(resolve)(
      new Request("https://example.com/api/play/submissions/mine"),
      {} as Env,
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "PLAY_SUBMISSION_AUTH_REQUIRED" },
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("fails closed when the edge limiter is missing", async () => {
    const response = await createMemberSubmissionHandler(
      () => ({}) as MemberSubmissionService,
    )(
      new Request("https://example.com/api/play/submissions", {
        method: "POST",
        body: "{}",
      }),
      {} as Env,
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "PLAY_SUBMISSION_UNAVAILABLE" },
    });
  });

  it("returns 429 before D1 when the edge limit is exhausted", async () => {
    const create = vi.fn();
    const response = await createMemberSubmissionHandler(
      () => ({ create }) as unknown as MemberSubmissionService,
    )(
      new Request("https://example.com/api/play/submissions", {
        method: "POST",
        body: "{}",
      }),
      {
        OTW_PLAY_SUBMISSION_RATE_LIMITER: {
          limit: vi.fn(async () => ({ success: false })),
        },
      } as unknown as Env,
    );
    expect(response.status).toBe(429);
    expect(create).not.toHaveBeenCalled();
  });
});
