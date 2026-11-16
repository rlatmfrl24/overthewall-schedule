import { afterEach, expect, it, vi } from "vitest";
import { createScheduleImageHandler } from "./schedule-image-handler";
import type { Env } from "../../../platform/types";
const auth = vi.hoisted(() => ({ loggedIn: false }));
vi.mock("../../../platform/auth", () => ({ authenticateRequest: vi.fn(async () => auth.loggedIn ? { ok: true, user: { id: "viewer" } } : { ok: false, response: new Response("Login required", { status: 401 }) }) }));
afterEach(() => { auth.loggedIn = false; vi.restoreAllMocks(); });
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
function request(files = [new File([png], "schedule.png", { type: "image/png" })], details: File[] = []) {
  const body = new FormData(); for (const file of files) body.append("image", file);
  for (const file of details) body.append("detail", file);
  return new Request("https://example.com/api/schedules/image-import/analyze", { method: "POST", body });
}
it.each(["otw", "luvdia"])("denies_unapproved_paid_request_before_provider_call on %s", async SITE_ID => {
  const resolve = vi.fn();
  const response = await createScheduleImageHandler(resolve)(request(), { SITE_ID } as Env);
  expect(response.status).toBe(401); expect(resolve).not.toHaveBeenCalled();
});
it("accepts one original with four bounded detail views in a single inference", async () => {
  auth.loggedIn = true;
  const reader = { count: vi.fn().mockResolvedValue(12000), read: vi.fn().mockResolvedValue({ draft: { rows: [], warnings: [], model: "gemini-3.5-flash-lite", usage: { inputTokens: 12000, outputTokens: 300 } }, usage: { inputTokens: 12000, outputTokens: 300 } }) };
  const handler = createScheduleImageHandler(() => ({ reader, budget: { reserve: async () => "id", start: async () => {}, settle: async () => {}, releaseUnstarted: async () => {}, finishUnknown: async () => {} }, members: async () => [] }));
  const details = ["top-left", "top-right", "bottom-left", "bottom-right"].map(region => new File([png], `${region}.png`, { type: "image/png" }));
  expect((await handler(request(undefined, details), {} as Env)).status).toBe(200);
  expect(reader.count.mock.calls[0][0].details.map((d: { region: string }) => d.region)).toEqual(["top-left", "top-right", "bottom-left", "bottom-right"]);
  expect(reader.read).toHaveBeenCalledTimes(1);
  expect(reader.read.mock.calls[0][0]).toEqual(reader.count.mock.calls[0][0]);
});
it("rejects incomplete, duplicate, forged and oversized detail bundles before provider access", async () => {
  auth.loggedIn = true; const resolve = vi.fn(); const handler = createScheduleImageHandler(resolve);
  const details = ["top-left", "top-right", "bottom-left", "bottom-right"].map(region => new File([png], `${region}.png`, { type: "image/png" }));
  for (const bundle of [details.slice(0, 3), [...details, details[0]], details.map(() => details[0]),
    [new File(["not png"], "top-left.png", { type: "image/png" }), ...details.slice(1)],
    [new File([new Uint8Array(500_001)], "top-left.png", { type: "image/png" }), ...details.slice(1)]]) {
    expect((await handler(request(undefined, bundle), {} as Env)).status).toBe(400);
  }
  expect(resolve).not.toHaveBeenCalled();
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
  const draft = { rows: [], warnings: [], model: "gemini-3.5-flash-lite" as const, usage: { inputTokens: 1, outputTokens: 1 } };
  const db = { prepare: vi.fn() };
  const handler = createScheduleImageHandler(() => ({ reader: { count: async () => 1, read: async () => ({ draft, usage: draft.usage }) },
    budget: { reserve: async () => "id", start: async () => {}, settle: async () => {}, releaseUnstarted: async () => {}, finishUnknown: async () => {} }, members: async () => [] }));
  const response = await handler(request(), { otw_db: db } as unknown as Env);
  expect(response.status).toBe(200); expect(db.prepare).not.toHaveBeenCalled();
});
it("enforces the 20 second deadline even while a non-cancellable database read is pending",async()=>{
  auth.loggedIn=true;const deadline=new AbortController();
  const timeout=vi.spyOn(AbortSignal,"timeout").mockReturnValueOnce(deadline.signal);
  let release:()=>void=()=>{};
  const members=vi.fn(()=>new Promise<[]>(done=>{release=()=>done([]);}));
  const reserve=vi.fn(),reader={count:vi.fn(),read:vi.fn()};
  const handler=createScheduleImageHandler(()=>({reader,budget:{reserve,start:vi.fn(),settle:vi.fn(),releaseUnstarted:vi.fn(),finishUnknown:vi.fn()},members}));
  const response=handler(request(),{} as Env);
  await vi.waitFor(()=>expect(members).toHaveBeenCalled());deadline.abort();
  const first=await Promise.race([response,new Promise<null>(done=>setTimeout(()=>done(null),100))]);
  release();
  expect(timeout.mock.calls[0][0]).toBeLessThanOrEqual(20000);
  expect(timeout.mock.calls[0][0]).toBeGreaterThan(19000);
  expect(first?.status).toBe(504);expect(reserve).not.toHaveBeenCalled();expect(reader.read).not.toHaveBeenCalled();
});
