import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import type { MemberSubmissionService } from "../application/member-submission-service";
import { MemberSubmissionRepositoryError } from "../application/ports/member-submission-repository";
import { createMemberSubmissionHandler } from "./member-submission-handler";

const authenticateRequestMock = vi.hoisted(() => vi.fn());
vi.mock("../../../platform/auth", () => ({
  authenticateRequest: authenticateRequestMock,
}));

const user = { id: "member-1", displayName: "Member", sessionId: null, claims: {} };
const validSubmission = {
  clientRequestId: "00000000-0000-4000-8000-000000000001",
  youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
  title: "Cover",
  originalArtists: [{ kind: "external", displayName: "Artist" }],
  participants: [{ kind: "member", memberUid: 1, participantRole: "vocal" }],
};

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
      () => ({ findReplay: vi.fn(async () => null) }) as unknown as MemberSubmissionService,
    )(
      new Request("https://example.com/api/play/submissions", {
        method: "POST",
        body: JSON.stringify(validSubmission),
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
    const findReplay = vi.fn(async () => null);
    const response = await createMemberSubmissionHandler(
      () => ({ create, findReplay }) as unknown as MemberSubmissionService,
    )(
      new Request("https://example.com/api/play/submissions", {
        method: "POST",
        body: JSON.stringify(validSubmission),
      }),
      {
        OTW_PLAY_SUBMISSION_RATE_LIMITER: {
          limit: vi.fn(async () => ({ success: false })),
        },
      } as unknown as Env,
    );
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "PLAY_SUBMISSION_RATE_LIMITED", fields: { scope: "burst" } },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("marks the authoritative D1 daily limit separately", async () => {
    const response = await createMemberSubmissionHandler(
      () => ({
        findReplay: vi.fn(async () => null),
        create: vi.fn(async () => {
          throw new MemberSubmissionRepositoryError("rate_limited", "Daily limit reached");
        }),
      }) as unknown as MemberSubmissionService,
    )(
      new Request("https://example.com/api/play/submissions", {
        method: "POST",
        body: JSON.stringify(validSubmission),
      }),
      {
        OTW_PLAY_SUBMISSION_RATE_LIMITER: {
          limit: vi.fn(async () => ({ success: true })),
        },
      } as unknown as Env,
    );
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: { fields: { scope: "daily" } },
    });
  });

  it("returns an idempotent replay without consuming the edge limiter", async () => {
    const replay = { data: { id: "proposal-1" }, idempotentReplay: true as const };
    const limit = vi.fn(async () => ({ success: false }));
    const response = await createMemberSubmissionHandler(
      () => ({ findReplay: vi.fn(async () => replay) }) as unknown as MemberSubmissionService,
    )(
      new Request("https://example.com/api/play/submissions", {
        method: "POST",
        body: JSON.stringify(validSubmission),
      }),
      { OTW_PLAY_SUBMISSION_RATE_LIMITER: { limit } } as unknown as Env,
    );
    expect(response.status).toBe(200);
    expect(limit).not.toHaveBeenCalled();
  });
});
