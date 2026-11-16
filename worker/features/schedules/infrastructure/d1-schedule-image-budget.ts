import { SCHEDULE_IMAGE_LIMITS as limits, SCHEDULE_IMAGE_PRICING as pricing } from "../../../../contracts/schedule-image-import";
import type { ImageReadUsage, ScheduleImageBudget } from "../application/ports/schedule-image-reader";

export class D1ScheduleImageBudget implements ScheduleImageBudget {
  private readonly db: D1Database;
  private readonly siteId: string;
  constructor(db: D1Database, siteId: string) { this.db=db; this.siteId=siteId; }
  async reserve(actorId: string, now: number) {
    const day = new Date(now + 9 * 60 * 60_000).toISOString().slice(0, 10);
    const month = day.slice(0, 7);
    const id = crypto.randomUUID();
    const result = await this.db.prepare(`INSERT INTO schedule_image_reads
      (id,site_id,actor_id,month,day,active_until,reserved_nano_usd)
      SELECT ?,?,?,?,?,?,?
      WHERE (SELECT COALESCE(SUM(COALESCE(cost_nano_usd,reserved_nano_usd)),0) FROM schedule_image_reads WHERE site_id=? AND month=?) + ? <= ?
      AND NOT EXISTS(SELECT 1 FROM schedule_image_reads WHERE site_id=? AND actor_id=? AND active_until>?)
      RETURNING id`).bind(id, this.siteId, actorId, month, day, now + limits.timeoutMs + 10_000, limits.reservedNanoUsd,
      this.siteId, month, limits.reservedNanoUsd, limits.monthlyNanoUsd, this.siteId, actorId, now).first<{ id: string }>();
    return result?.id ?? null;
  }
  async start(id: string) { await this.db.prepare("UPDATE schedule_image_reads SET started=1 WHERE id=? AND site_id=?").bind(id, this.siteId).run(); }
  async settle(id: string, usage: ImageReadUsage) {
    // Missing reported charges use uncached rates, including completion reasoning tokens.
    await this.db.prepare("UPDATE schedule_image_reads SET cost_nano_usd=?,input_tokens=?,output_tokens=?,active_until=0 WHERE id=? AND site_id=?")
      .bind(usage.costNanoUsd ?? usage.inputTokens * pricing.inputNanoUsd + usage.outputTokens * pricing.outputNanoUsd, usage.inputTokens, usage.outputTokens, id, this.siteId).run();
  }
  async releaseUnstarted(id: string) { await this.db.prepare("DELETE FROM schedule_image_reads WHERE id=? AND site_id=? AND started=0").bind(id, this.siteId).run(); }
  async finishUnknown(id: string) { await this.db.prepare("UPDATE schedule_image_reads SET active_until=0 WHERE id=? AND site_id=?").bind(id, this.siteId).run(); }
}
