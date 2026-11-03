import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import type { XCollectionStatusDto } from "@contracts/x-collection";
import { createXCollectionApplication } from "../application/x-collection-service";
const admin = vi.hoisted(() => vi.fn());
vi.mock("../../../platform/auth", () => ({ requireAdminUser: admin }));
import { createXCollectionHandler } from "./x-collection";
const read = vi.fn(), change = vi.fn(), audit = vi.fn();
const handler = createXCollectionHandler(() => createXCollectionApplication({ read, change, audit }));
const env = { SITE_ID: "otw" } as Env;
const status = { primarySource: "fxembed", hybridPolicy: null } as XCollectionStatusDto;
beforeEach(() => { vi.clearAllMocks(); admin.mockResolvedValue({ ok: true, user: { email: "admin@test" } }); read.mockResolvedValue(status); });
afterEach(() => vi.restoreAllMocks());
it("requires administrator and rejects the other site's denied identity before any status reads", async () => {
  for (const code of [401, 403]) {
    admin.mockResolvedValueOnce({ ok: false, response: new Response(null, { status: code }) });
    expect((await handler(new Request("https://app/api/x/collection"), env)).status).toBe(code);
  }
  expect(read).not.toHaveBeenCalled();
});
it("returns policy failure 503 without success audit for an older peer", async () => {
  const log = vi.spyOn(console,"error").mockImplementation(() => {});
  const response = await handler(new Request("https://app/api/x/collection", { method: "PATCH", body: JSON.stringify({ primarySource: "fxembed" }) }), env);
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ error: { code: "x_collection_policy_readback_failed" } });
  expect(audit).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledWith("x_collection_control_failed","x_collection_policy_readback_failed");
});
it("retains PATCH body and returns confirmed policy before audit", async () => {
  read.mockResolvedValueOnce(status).mockResolvedValueOnce({ ...status, hybridPolicy: "rss_v1" });
  const response = await handler(new Request("https://app/api/x/collection", { method: "PATCH", body: JSON.stringify({ primarySource: "fxembed" }) }), env);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ hybridPolicy: "rss_v1" });
  expect(change).toHaveBeenCalledWith("fxembed"); expect(audit).toHaveBeenCalledOnce();
});
