import type { DbInstance } from "../../../platform/db";
import { insertAdminAuditLog } from "../../../platform/http-helpers";
import type {
  SettingsActor,
  SettingsAudit,
  SettingsChange,
} from "../application/ports/settings-audit";

export class DrizzleSettingsAudit implements SettingsAudit {
  private readonly database: DbInstance;

  constructor(database: DbInstance) {
    this.database = database;
  }

  recordUpdate(actor: SettingsActor, changes: readonly SettingsChange[]) {
    return insertAdminAuditLog(this.database, {
      eventType: "settings.update",
      resourceType: "settings",
      action: "update",
      status: "success",
      actorId: actor.actorId,
      actorName: actor.actorName,
      actorIp: actor.actorIp,
      targetCount: changes.length,
      successCount: changes.length,
      failureCount: 0,
      detail: { changes },
    });
  }
}
