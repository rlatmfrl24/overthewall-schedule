import { describe, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import { withPlayOperationsTelemetry } from "./play-telemetry-handler";

const env = {} as Env;

describe("OTW Play operations telemetry wrapper", () => {
  it("records a new proposal exactly once without logging the request body", async () => {
    const write = vi.fn();
    const handler = withPlayOperationsTelemetry(
      async () =>
        Response.json(
          { data: { id: "proposal-1" }, idempotentReplay: false },
          { status: 201 },
        ),
      () => ({ write }),
    );
    const response = await handler(
      new Request("https://example.com/api/play/submissions?note=secret", {
        method: "POST",
        headers: { "CF-Ray": "ray-1" },
        body: JSON.stringify({ note: "private note", youtubeUrl: "secret" }),
      }),
      env,
    );
    expect(response.status).toBe(201);
    expect(write).toHaveBeenCalledOnce();
    const written = write.mock.calls[0]?.[0];
    expect(written).toMatchObject({
      event: "play.proposal.submitted",
      requestId: "ray-1",
      routeId: "play.submissions",
    });
    expect(JSON.stringify(written)).not.toContain("private note");
    expect(JSON.stringify(written)).not.toContain("?note=");
  });

  it("does not duplicate a proposal event for an idempotent replay", async () => {
    const write = vi.fn();
    const handler = withPlayOperationsTelemetry(
      async () =>
        Response.json({ data: { id: "proposal-1" }, idempotentReplay: true }),
      () => ({ write }),
    );
    await handler(
      new Request("https://example.com/api/play/submissions", { method: "POST" }),
      env,
    );
    expect(write).not.toHaveBeenCalled();
  });

  it("classifies conflicts and successful retry scheduling as critical events", async () => {
    const write = vi.fn();
    const conflict = withPlayOperationsTelemetry(
      async () =>
        Response.json(
          { error: { code: "PLAY_ADMIN_STALE_WRITE" } },
          { status: 409 },
        ),
      () => ({ write }),
    );
    await conflict(
      new Request(
        "https://example.com/api/play/admin/performances/performance-1/publish",
        { method: "POST" },
      ),
      env,
    );
    expect(write).toHaveBeenLastCalledWith(
      expect.objectContaining({
        event: "play.concurrent_write_conflict",
        errorCode: "PLAY_ADMIN_STALE_WRITE",
      }),
    );

    const retry = withPlayOperationsTelemetry(
      async () =>
        Response.json({
          data: { id: "source-1" },
          catalogRevision: 1,
          check: {
            status: "retry_scheduled",
            currentAvailability: "playable",
            retryCode: "quota_exceeded",
            nextCheckAt: 1,
          },
        }),
      () => ({ write }),
    );
    await retry(
      new Request(
        "https://example.com/api/play/admin/sources/source-1/recheck",
        { method: "POST" },
      ),
      env,
    );
    expect(write).toHaveBeenLastCalledWith(
      expect.objectContaining({
        event: "play.youtube.verify_failed",
        errorCode: "quota_exceeded",
        resourceId: "source-1",
      }),
    );
  });

  it("keeps the application response when telemetry itself throws", async () => {
    const handler = withPlayOperationsTelemetry(
      async () =>
        Response.json(
          { data: { id: "proposal-1" }, idempotentReplay: false },
          { status: 201 },
        ),
      () => ({ write: () => { throw new Error("telemetry down"); } }),
    );
    const response = await handler(
      new Request("https://example.com/api/play/submissions", { method: "POST" }),
      env,
    );
    expect(response.status).toBe(201);
  });
});
