import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import type { XPostsApplication } from "../application/x-posts-service";

const requireAdminUserMock = vi.hoisted(() => vi.fn());

vi.mock("../../../platform/auth", () => ({
  authenticateRequest: vi.fn(),
  requireAdminUser: requireAdminUserMock,
}));

import { createXPostsHandler } from "./x-posts";

const makeApplication = () => ({
  readHistoryPosts: vi.fn().mockResolvedValue({
    posts: [],
    hasMore: false,
    nextCursor: null,
  }),
  readHistoryHealth: vi.fn().mockResolvedValue({
    lastCollectionSuccessAt: 123,
    budgetUsedMicros: 5_000,
  }),
  redactPost: vi.fn().mockResolvedValue(true),
}) as unknown as XPostsApplication;

describe("X history admin routes", () => {
  beforeEach(() => {
    requireAdminUserMock.mockReset();
    requireAdminUserMock.mockResolvedValue({
      ok: true,
      user: { id: "admin", name: "Admin" },
    });
  });

  it("requires administrator authentication", async () => {
    requireAdminUserMock.mockResolvedValueOnce({
      ok: false,
      response: new Response("Unauthorized", { status: 401 }),
    });
    const application = makeApplication();
    const handler = createXPostsHandler(() => application);

    const response = await handler(
      new Request("https://example.com/api/x/history/posts"),
      {} as Env,
    );

    expect(response.status).toBe(401);
    expect(application.readHistoryPosts).not.toHaveBeenCalled();
  });

  it("passes stable cursor and filters and disables caching", async () => {
    const application = makeApplication();
    const handler = createXPostsHandler(() => application);
    const response = await handler(
      new Request(
        "https://example.com/api/x/history/posts?memberUid=7&status=redacted&from=2026-08-01&to=2026-09-02&cursor=1788300000000%3A12345678901&limit=100",
      ),
      {} as Env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(application.readHistoryPosts).toHaveBeenCalledWith({
      memberUid: 7,
      status: "redacted",
      from: Date.parse("2026-08-01"),
      to: Date.parse("2026-09-02"),
      cursor: { createdAt: 1_788_300_000_000, postId: "12345678901" },
      limit: 100,
    });
  });

  it("rejects unsupported status filters", async () => {
    const application = makeApplication();
    const handler = createXPostsHandler(() => application);

    const response = await handler(
      new Request("https://example.com/api/x/history/posts?status=deleted"),
      {} as Env,
    );

    expect(response.status).toBe(400);
    expect(application.readHistoryPosts).not.toHaveBeenCalled();
  });

  it("keeps administrator redaction idempotent", async () => {
    const application = makeApplication();
    const handler = createXPostsHandler(() => application);
    const request = () => new Request(
      "https://example.com/api/x/posts/12345678901",
      { method: "DELETE" },
    );

    const first = await handler(request(), {} as Env);
    const second = await handler(request(), {} as Env);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(application.redactPost).toHaveBeenCalledTimes(2);
  });
});
