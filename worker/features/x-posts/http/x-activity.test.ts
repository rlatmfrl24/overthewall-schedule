import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import type { XActivityService } from "../application/x-activity-service";
import { signXActivity } from "../domain/x-activity";
const admin = vi.hoisted(() => vi.fn());
vi.mock("../../../platform/auth", () => ({ requireAdminUser: admin }));
import { createXActivityHandler } from "./x-activity";

const service = { status: vi.fn().mockResolvedValue({ configured: true }), start: vi.fn().mockResolvedValue({}), stop: vi.fn().mockResolvedValue({}), accept: vi.fn().mockResolvedValue(true) };
const handler = createXActivityHandler(() => service as unknown as XActivityService);
const env = { SITE_ID:"otw", X_CLIENT_SECRET: "secret" } as Env;
beforeEach(() => { vi.clearAllMocks(); admin.mockResolvedValue({ ok: true }); });
describe("X activity HTTP boundary", () => {
  it("requires admin for controls before reading input or calling the provider", async () => {
    admin.mockResolvedValueOnce({ ok: false, response: new Response("Unauthorized", { status: 401 }) });
    expect((await handler(new Request("https://app/api/x/activity", { method: "POST", body: '{}' }), env)).status).toBe(401);
    expect(service.start).not.toHaveBeenCalled();
  });
  it("rejects arbitrary handles and missing risk acknowledgement", async () => {
    for (const body of [{ handle: "../evil", acknowledgeUncappedDelivery: true }, { handle: "member" }]) {
      const response = await handler(new Request("https://app/api/x/activity", { method: "POST", body: JSON.stringify(body) }), env);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: "invalid_x_activity_request" } });
    }
  });
  it("answers a valid CRC and refuses to sign JSON", async () => {
    const response = await handler(new Request("https://app/api/x/activity/webhook?crc_token=abc123"), env);
    expect(await response.json()).toEqual({ response_token: await signXActivity("secret", "abc123") });
    expect((await handler(new Request("https://app/api/x/activity/webhook?crc_token=%7B%7D"), env)).status).toBe(400);
  });
  it("starts the server-selected full target set without accepting a handle or callback",async()=>{
    const response=await handler(new Request("https://app/api/x/activity",{method:"POST",body:JSON.stringify({action:"start",acknowledgeUncappedDelivery:true})}),env);
    expect(response.status).toBe(200);
    expect(service.start).toHaveBeenCalledWith();
    expect((await handler(new Request("https://app/api/x/activity/webhook?crc_token=abc"),{...env,SITE_ID:"luvdia"})).status).toBe(404);
  });
  it("verifies raw bytes before durable acceptance and returns an error when enqueueing fails", async () => {
    const body = '{"data":{}}';
    const request = async (raw: string) => new Request("https://app/api/x/activity/webhook", { method: "POST", body: raw,
      headers: { "X-Twitter-Webhooks-Signature-OAuth2": await signXActivity("secret", body) } });
    expect((await handler(await request(body + ' '), env)).status).toBe(401);
    expect(service.accept).not.toHaveBeenCalled();
    expect((await handler(await request(body), env)).status).toBe(200);
    service.accept.mockRejectedValueOnce(new Error("queue down"));
    expect((await handler(await request(body), env)).status).toBe(503);
  });
  it("bounds a chunked request even without Content-Length", async () => {
    const body = "x".repeat(262145);
    expect((await handler(new Request("https://app/api/x/activity/webhook", { method: "POST", body }), env)).status).toBe(413);
  });
});
