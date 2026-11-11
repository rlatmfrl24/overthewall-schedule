import { unavailableXApiGateway, type XApiGateway } from "@contracts/x-activity";
import { D1SharedXApiGateway, D1SharedXBudget, readSiteXBudget } from "../features/x-posts";
import { CloudflareD1ReadBudget } from "../platform/cloudflare-d1-read-budget";
import { getWorkerSiteDefinition } from "../platform/site";
import type { Env } from "../platform/types";

export const buildXGateway = (env: Env, site: "otw" | "luvdia"): XApiGateway => new D1SharedXApiGateway({
  db: env.otw_db, site, token: env.X_BEARER_TOKEN,
  admitD1: async () => (await new CloudflareD1ReadBudget(env.CLOUDFLARE_ACCOUNT_ID,env.CLOUDFLARE_D1_TOKEN,env.OTW_PLAY_D1_READ_DAILY_TARGET).read()).status === "available",
  bootstrapBudget: async () => {
    if (!env.X_ACTIVITY_LUVDIA) throw new Error("shared_budget_snapshot_unavailable");
    const protocol = await env.X_ACTIVITY_LUVDIA.protocol();
    if (protocol.version !== 1 || protocol.site !== "luvdia") throw new Error("shared_budget_snapshot_invalid");
    const [local, peer] = await Promise.all([readSiteXBudget(env.otw_db), env.X_ACTIVITY_LUVDIA.snapshot()]);
    if (peer.site !== "luvdia") throw new Error("shared_budget_snapshot_invalid");
    await new D1SharedXBudget(env.otw_db).initialize([local, peer.budget]);
  },
});

export function withXGateway(env: Env): Env {
  if (env.X_API_GATEWAY) return env;
  const site = getWorkerSiteDefinition(env).id;
  const gateway: XApiGateway = site === "otw" ? buildXGateway(env,"otw") : {
    readReceipts: async inputs => {
      if (!env.X_ACTIVITY_COORDINATOR?.receiptsForLuvdia) throw new Error("shared_receipt_unavailable");
      return env.X_ACTIVITY_COORDINATOR.receiptsForLuvdia(inputs);
    },
    readReceipt: async input => {
      if (!env.X_ACTIVITY_COORDINATOR?.receiptForLuvdia) throw new Error("shared_receipt_unavailable");
      try { return await env.X_ACTIVITY_COORDINATOR.receiptForLuvdia(input); }
      catch { throw new Error("shared_receipt_unavailable"); }
    },
    redactPost:async postId=>{if(!env.X_ACTIVITY_COORDINATOR)throw new Error("shared_cache_unavailable");await env.X_ACTIVITY_COORDINATOR.redactForLuvdia(postId);},
    readBudget:async()=>{
      if(!env.X_ACTIVITY_COORDINATOR)return unavailableXApiGateway.readBudget();
      try{return await env.X_ACTIVITY_COORDINATOR.budgetForLuvdia();}catch{return unavailableXApiGateway.readBudget();}
    },
    execute: async input => {
      if (!env.X_ACTIVITY_COORDINATOR) return unavailableXApiGateway.execute(input);
      try { return await env.X_ACTIVITY_COORDINATOR.gatewayForLuvdia(input); }
      catch { return unavailableXApiGateway.execute(input); }
    },
  };
  return { ...env, X_API_GATEWAY: gateway };
}
