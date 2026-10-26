import { describe, expect, it, vi } from "vitest";
import { withXGateway } from "./x-gateway";
import type { Env } from "../platform/types";
import { siteEnv } from "../test-support/site-env";

describe("LuvDia shared X gateway", () => {
  it("fails closed even with a local bearer when the coordinator is absent", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const gateway = withXGateway({ ...siteEnv("luvdia"), X_BEARER_TOKEN: "local-token" } as Env).X_API_GATEWAY!;
      const result = await gateway.execute({ id: "closed", operation: "tweet_lookup", path: "/tweets?ids=12345" });
      expect(result).toMatchObject({ ok: false, dispatched: false, costMicros: 0 });
      expect((await gateway.readBudget()).seeded).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { fetchSpy.mockRestore(); }
  });

  it("uses only the fixed peer RPC and fails closed on transport failure", async () => {
    const request = { id: "peer", operation: "tweet_lookup" as const, path: "/tweets?ids=12345" };
    const gatewayForLuvdia = vi.fn().mockRejectedValue(new Error("peer unavailable"));
    const gateway = withXGateway({ ...siteEnv("luvdia"), X_ACTIVITY_COORDINATOR: { gatewayForLuvdia } } as unknown as Env).X_API_GATEWAY!;
    expect(await gateway.execute(request)).toMatchObject({ ok: false, dispatched: false });
    expect(gatewayForLuvdia).toHaveBeenCalledWith(request);
  });
});
