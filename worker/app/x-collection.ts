import type { XActivityStatusDto } from "@contracts/x-activity";
import { createXCollectionApplication, readXCollectionStatus, XActivityError } from "../features/x-posts";
import { getDb } from "../platform/db";
import { insertAdminAuditLog, type getActorInfo } from "../platform/http-helpers";
import { getWorkerSiteDefinition } from "../platform/site";
import type { Env } from "../platform/types";
import { buildXActivityCoordinator, buildXActivityService } from "./x-activity";
import { withXGateway } from "./x-gateway";

export function buildXCollectionApplication(input: Env, actor: ReturnType<typeof getActorInfo>) {
  const env = withXGateway(input), site = getWorkerSiteDefinition(env).id;
  return createXCollectionApplication({
    read: async () => {
      let activity: XActivityStatusDto;
      try { activity = await buildXActivityService(env).status(); }
      catch (error) { return readXCollectionStatus(env, null, error instanceof Error ? error.message : "x_activity_unavailable"); }
      return readXCollectionStatus(env, activity);
    },
    change: async source => {
      if (site === "otw") { await buildXActivityCoordinator(env).setPrimarySource(site, source); return; }
      if (!env.X_ACTIVITY_COORDINATOR) throw new XActivityError("x_activity_connection_unavailable", 503);
      const result = await env.X_ACTIVITY_COORDINATOR.setCollectionForLuvdia(source);
      if (!result.ok) throw new XActivityError(result.error, result.status);
    },
    audit: async (previous, next) => {
      await insertAdminAuditLog(getDb(env), { eventType: "x.collection.update", resourceType: "settings", action: "update", status: "success", ...actor,
        targetCount: 1, successCount: 1, failureCount: 0, detail: { site, previousSource: previous, primarySource: next, ...(next === "fxembed" ? { hybridPolicy: "rss_v1" } : {}), sharedDailyTargetMicros: 1000000 } });
    },
  });
}
