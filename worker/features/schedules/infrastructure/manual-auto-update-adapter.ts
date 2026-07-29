import type { DbInstance } from "../../../platform/db";
import {
  insertAdminAuditLog,
  insertUpdateLog,
} from "../../../platform/http-helpers";
import type {
  ManualAutoUpdatePort,
  ManualAutoUpdateResult,
} from "../application/ports/manual-auto-update-port";
import type { ScheduleActor } from "../domain/schedule";
import { runAutoUpdateWithHistory } from "./auto-update-runs";
import { readAutoUpdateRangeDays } from "./auto-update-settings";

export class D1ManualAutoUpdateAdapter implements ManualAutoUpdatePort {
  private readonly database: DbInstance;
  private readonly cacheDatabase: D1Database;

  constructor(
    database: DbInstance,
    cacheDatabase: D1Database,
  ) {
    this.database = database;
    this.cacheDatabase = cacheDatabase;
  }

  readRangeDays() {
    return readAutoUpdateRangeDays(this.database);
  }

  run(rangeDays: number, actor: ScheduleActor) {
    return runAutoUpdateWithHistory(this.database, {
      source: "manual",
      rangeDays,
      actor,
      cacheDb: this.cacheDatabase,
    });
  }

  recordSuccess(
    rangeDays: number,
    result: ManualAutoUpdateResult,
    actor: ScheduleActor,
  ) {
    return insertAdminAuditLog(this.database, {
      eventType: "manual_collection.auto_update",
      resourceType: "auto_update",
      action: "run_now",
      status: "success",
      actorId: actor.actorId,
      actorName: actor.actorName,
      actorIp: actor.actorIp,
      targetCount: result.checked,
      successCount: result.updated,
      failureCount: 0,
      detail: {
        rangeDays,
        checked: result.checked,
        updated: result.updated,
        segmentCount: result.segmentCount,
        sessionCount: result.sessionCount,
        resumeMergedCount: result.resumeMergedCount,
        rejectedSuppressed: result.rejectedSuppressed,
        duplicatePending: result.duplicatePending,
        shortSuppressed: result.shortSuppressed,
        holidaySuppressed: result.holidaySuppressed,
        ambiguous: result.ambiguous,
        obsoletePending: result.obsoletePending,
        detailsCount: result.details.length,
      },
    });
  }

  async recordFailure(error: unknown, actor: ScheduleActor) {
    const today = new Date().toISOString().slice(0, 10);
    await insertUpdateLog(this.database, {
      scheduleId: null,
      memberUid: null,
      memberName: null,
      scheduleDate: today,
      action: "auto_failed",
      title: "manual auto update failed",
      previousStatus: null,
      actorId: actor.actorId,
      actorName: actor.actorName,
      actorIp: actor.actorIp,
    });
    await insertAdminAuditLog(this.database, {
      eventType: "manual_collection.auto_update",
      resourceType: "auto_update",
      action: "run_now",
      status: "failed",
      actorId: actor.actorId,
      actorName: actor.actorName,
      actorIp: actor.actorIp,
      targetCount: 0,
      successCount: 0,
      failureCount: 1,
      detail: null,
      error: error instanceof Error ? error.message : "unknown_error",
    });
  }
}
