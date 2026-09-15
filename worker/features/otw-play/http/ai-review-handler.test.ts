import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  createAiReviewHandler,
  parseAiReviewRequest,
} from "./ai-review-handler";
import type { AiReviewService } from "../application/ai-review-service";
import type { Env } from "../../../platform/types";
const auth = vi.hoisted(() => vi.fn());
vi.mock("../../../platform/auth", () => ({ requireAdminUser: auth }));
beforeEach(() => auth.mockResolvedValue({ ok: true, user: { id: "admin" } }));
describe("AI review admin API", () => {
  it("requires admin authentication before resolving dependencies", async () => {
    auth.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    });
    const resolve = vi.fn();
    const r = await createAiReviewHandler(resolve)(
      new Request("https://example.com/api/play/admin/ai-reviews"),
      {} as Env,
    );
    expect(r.status).toBe(403);
    expect(resolve).not.toHaveBeenCalled();
  });
  it("rejects conflicting targets, arbitrary fields and invalid ranges", () => {
    const good = {
      target: { candidateId: "youtube:BBBBBBBBBBB" },
      range: null,
      idempotencyKey: "request-key",
    };
    expect(parseAiReviewRequest(good)).toMatchObject(good);
    for (const bad of [
      { ...good, target: { ...good.target, youtubeUrl: "https://evil.test" } },
      { ...good, range: { startSeconds: 10, endSeconds: 2 } },
      { ...good, range: { startSeconds: 0, endSeconds: 1.5 } },
      { ...good, publish: true },
    ])
      expect(() => parseAiReviewRequest(bad)).toThrow();
  });
  it("returns 202 for queued and 200 for cached completion without invoking save", async () => {
    const start = vi
      .fn()
      .mockResolvedValueOnce({ id: "job", status: "queued" })
      .mockResolvedValueOnce({ id: "job", status: "succeeded" });
    const handler = createAiReviewHandler(
      () => ({ start }) as unknown as AiReviewService,
    );
    const request = () =>
      new Request("https://example.com/api/play/admin/ai-reviews", {
        method: "POST",
        body: JSON.stringify({
          target: { candidateId: "youtube:BBBBBBBBBBB" },
          range: null,
          idempotencyKey: "request-key",
        }),
      });
    expect((await handler(request(), {} as Env)).status).toBe(202);
    const r = await handler(request(), {} as Env);
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(start).toHaveBeenCalledWith(expect.anything(), "admin");
  });
});
