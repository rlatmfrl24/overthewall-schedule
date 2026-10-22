import { afterEach, expect, it, vi } from "vitest";
import { fetchPersonalMultiviewChannels, addPersonalMultiviewChannel, deletePersonalMultiviewChannel, fetchPersonalMultiviewLiveStatus } from "./personal-channels";
afterEach(() => vi.unstubAllGlobals());
it("uses authenticated private routes and forwards cancellation without accepting a client owner", async () => {
  const requests: { path: string; init: RequestInit }[] = [];
  vi.stubGlobal("window", { Clerk: { session: { getToken: async () => "own-token" } } });
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => { requests.push({ path, init }); return Response.json({ items: [], limit: 30 }); });
  const controller = new AbortController();
  expect(await fetchPersonalMultiviewChannels(controller.signal)).toEqual({ items: [], limit: 30 });
  await addPersonalMultiviewChannel("a".repeat(32), controller.signal);
  await deletePersonalMultiviewChannel("a".repeat(32), controller.signal);
  await fetchPersonalMultiviewLiveStatus(controller.signal);
  expect(requests.map(x => x.path)).toEqual(["/api/multiview/me/channels", "/api/multiview/me/channels", `/api/multiview/me/channels/${"a".repeat(32)}`, "/api/multiview/me/live-status"]);
  expect(requests[1]!.init.body).toBe(JSON.stringify({ input: "a".repeat(32) }));
  for (const { init } of requests) { expect(new Headers(init.headers).get("Authorization")).toBe("Bearer own-token"); expect(init.cache).toBe("no-store"); expect(init.signal).toBe(controller.signal); }
});
it("does not send personal requests without a session token", async () => {
  vi.stubGlobal("window", {});
  await expect(fetchPersonalMultiviewChannels()).rejects.toMatchObject({ status: 401 });
});
