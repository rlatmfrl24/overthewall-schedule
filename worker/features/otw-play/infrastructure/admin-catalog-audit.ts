import type { DbInstance } from "../../../platform/db";
import { insertAdminAuditLog } from "../../../platform/http-helpers";
import type { AdminCatalogGlobalAudit } from "../application/ports/admin-catalog-repository";

export class DrizzleAdminCatalogAudit implements AdminCatalogGlobalAudit {
  private readonly database: DbInstance;

  constructor(database: DbInstance) {
    this.database = database;
  }

  async record(input: Parameters<AdminCatalogGlobalAudit["record"]>[0]) {
    await insertAdminAuditLog(this.database, {
      eventType: input.eventType,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      action: input.eventType.split(".").at(-1) ?? "update",
      status: "success",
      actorId: input.actor.userId,
      actorName: input.actor.displayName,
      actorIp: input.actor.ipAddress,
      targetCount: 1,
      successCount: 1,
      failureCount: 0,
      detail: input.detail ?? {},
    });
  }
}
