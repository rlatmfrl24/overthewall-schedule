import { afterEach, expect, it, vi } from "vitest";
import { createScheduleImageHandler } from "./schedule-image-handler";
import type { Env } from "../../../platform/types";
const auth = vi.hoisted(() => ({ loggedIn: false }));
vi.mock("../../../platform/auth", () => ({ authenticateRequest: vi.fn(async () => auth.loggedIn ? { ok: true, user: { id: "viewer" } } : { ok: false, response: new Response("Login required", { status: 401 }) }) }));
afterEach(() => { auth.loggedIn = false; });
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
function request(files = [new File([png], "schedule.png", { type: "image/png" })]) {
  const body = new FormData(); for (const file of files) body.append("image", file);
  return new Request("https://example.com/api/schedules/image-import/analyze", { method: "POST", body });
}
it.each(["otw", "luvdia"])("denies_unapproved_paid_request_before_provider_call on %s", async SITE_ID => {
  const resolve = vi.fn();
  const response = await createScheduleImageHandler(resolve)(request(), { SITE_ID } as Env);
  expect(response.status).toBe(401); expect(resolve).not.toHaveBeenCalled();
});
it("rejects_multiple_unsupported_or_oversized_images_before_inference", async () => {
  auth.loggedIn = true; const resolve = vi.fn(); const handler = createScheduleImageHandler(resolve);
  for (const files of [[new File([png], "a.png", { type: "image/png" }), new File([png], "b.png", { type: "image/png" })],
    [new File([png], "a.svg", { type: "image/svg+xml" })], [new File([new Uint8Array(10_000_001)], "a.png", { type: "image/png" })]]) {
    expect((await handler(request(files), {} as Env)).status).toBe(400);
  }
  expect(resolve).not.toHaveBeenCalled();
});
it("does_not_write_schedules_during_analysis", async () => {
  auth.loggedIn = true;
  const draft = { rows: [], warnings: [], model: "gpt-6-luna" as const, usage: { inputTokens: 1, outputTokens: 1 } };
  const db = { prepare: vi.fn() };
  const handler = createScheduleImageHandler(() => ({ reader: { count: async () => 1, read: async () => ({ draft, usage: draft.usage }) },
    budget: { reserve: async () => "id", start: async () => {}, settle: async () => {}, releaseUnstarted: async () => {}, finishUnknown: async () => {} }, members: async () => [] }));
  const response = await handler(request(), { otw_db: db } as unknown as Env);
  expect(response.status).toBe(200); expect(db.prepare).not.toHaveBeenCalled();
});
