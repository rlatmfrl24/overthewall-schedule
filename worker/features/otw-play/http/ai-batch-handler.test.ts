import { beforeEach, expect, it, vi } from "vitest";
import { createAiBatchHandler, parseAiBatchSelection } from "./ai-batch-handler";
import type { AiBatchService } from "../application/ai-batch-service";
import type { Env } from "../../../platform/types";
const auth = vi.hoisted(() => vi.fn());
vi.mock("../../../platform/auth", () => ({ requireAdminUser: auth }));
beforeEach(() => auth.mockResolvedValue({ ok: true, user: { id: "admin" } }));
it("requires administrator authorization for every batch and draft route", async () => {
  auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
  const resolve = vi.fn();
  for (const [method, path] of [["POST", "ai-review-batches"], ["GET", "ai-review-batches"], ["POST", "ai-review-batches/a/retry"], ["GET", "ai-review-drafts/youtube%3AAAAAAAAAAAA"]]) {
    expect((await createAiBatchHandler(resolve)(new Request(`https://example.com/api/play/admin/${path}`, { method }), {} as Env)).status).toBe(403);
  }
  expect(resolve).not.toHaveBeenCalled();
});
it("normalizes duplicate candidates and rejects scope expansion or conflicting versions", () => {
  const candidate = { id: "youtube:AAAAAAAAAAA", version: 2 };
  expect(parseAiBatchSelection({ candidates: [candidate, candidate] })).toEqual({ candidates: [candidate] });
  for (const input of [{ candidates: [] }, { candidates: [candidate, { ...candidate, version: 3 }] },
    { filters: { source: "user" } }, { filters: { source: "playlist", status: "ready" } },
    { filters: { source: "automatic", jobId: "job" } }, { candidates: [candidate], filters: { source: "playlist" } }]) {
    expect(() => parseAiBatchSelection(input)).toThrow();
  }
});
it("previews without starting work, accepts durable requests, and decodes candidate IDs", async () => {
  const preview = vi.fn().mockResolvedValue(75), start = vi.fn().mockResolvedValue({ id: "batch" }), draft = vi.fn().mockResolvedValue(null);
  const handler = createAiBatchHandler(() => ({ preview, start, draft }) as unknown as AiBatchService);
  const selection = { filters: { source: "playlist", jobId: "job" } };
  const post = (path: string, body: unknown) => handler(new Request(`https://example.com/api/play/admin/${path}`, { method: "POST", body: JSON.stringify(body) }), {} as Env);
  expect(await (await post("ai-review-batches/preview", { selection })).json()).toEqual({ data: { count: 75 } });
  expect(start).not.toHaveBeenCalled();
  expect((await post("ai-review-batches", { selection, idempotencyKey: "batch-key" })).status).toBe(202);
  expect(start).toHaveBeenCalledWith(selection, "batch-key", "admin");
  const response = await handler(new Request("https://example.com/api/play/admin/ai-review-drafts/youtube%3AAAAAAAAAAAA"), {} as Env);
  expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(draft).toHaveBeenCalledWith("youtube:AAAAAAAAAAA");
});
