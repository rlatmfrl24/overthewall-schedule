import { and, asc, eq, isNull } from "drizzle-orm";
import { naverCafePosts, naverCafeSources } from "@db/schema";
import { getDb } from "../../../platform/db";
import { getSetting, insertAdminAuditLog } from "../../../platform/http-helpers";
import type { Env } from "../../../platform/types";
import type {
  NaverCafeApplication,
  NaverCafeActor,
  NaverCafeSourcePayload,
  NaverCafeSourceRecord,
  NaverCafeVisibility,
} from "../application/naver-cafe-application";
import { readStoredNaverCafePostsForSources } from "./naver-cafe-collector";

const ENABLED_SETTING_KEY = "naver_cafe_posts_enabled";
const VISIBILITY_SETTING_KEY = "naver_cafe_posts_visibility";

const normalizeVisibility = (
  value: string | null | undefined,
): NaverCafeVisibility =>
  value === "public" || value === "private" ? value : "members";

export class D1NaverCafeApplication implements NaverCafeApplication {
  private readonly db: ReturnType<typeof getDb>;
  private readonly env: Env;

  constructor(env: Env) {
    this.env = env;
    this.db = getDb(env);
  }

  async getConfig() {
    try {
      const enabled =
        (await getSetting(this.db, ENABLED_SETTING_KEY)) !== "false";
      const visibility = normalizeVisibility(
        await getSetting(this.db, VISIBILITY_SETTING_KEY),
      );
      return { enabled, visibility };
    } catch (error) {
      console.warn("Failed to read Naver Cafe posts config", error);
      return { enabled: true, visibility: "members" as const };
    }
  }

  async listSources(): Promise<NaverCafeSourceRecord[]> {
    return this.db
      .select()
      .from(naverCafeSources)
      .where(isNull(naverCafeSources.archived_at))
      .orderBy(asc(naverCafeSources.sort_order), asc(naverCafeSources.name));
  }

  async createSource(payload: NaverCafeSourcePayload) {
    const timestamp = Date.now();
    const archived = await this.db.select().from(naverCafeSources).where(and(
      eq(naverCafeSources.cafe_id, payload.cafe_id),
      eq(naverCafeSources.menu_id, payload.menu_id),
    )).get();
    if (archived?.archived_at) {
      const restored = await this.db.update(naverCafeSources).set({
        ...payload,
        archived_at: null,
        deactivated_at: payload.enabled ? null : timestamp,
        collection_started_at: timestamp,
        initialization_completed_at: null,
        last_seen_article_id: null,
        sync_page: null,
        sync_base_article_id: null,
        sync_newest_article_id: null,
        last_attempt_at: null,
        last_success_at: null,
        next_check_at: timestamp,
        consecutive_failures: 0,
        last_error_code: null,
      }).where(eq(naverCafeSources.id, archived.id));
      return restored.success;
    }
    const result = await this.db.insert(naverCafeSources).values({
      ...payload,
      collection_started_at: timestamp,
      initialization_completed_at: null,
      last_seen_article_id: null,
      next_check_at: timestamp,
    });
    return result.success;
  }

  async updateSource(id: number, payload: NaverCafeSourcePayload) {
    const current = await this.db.select().from(naverCafeSources)
      .where(eq(naverCafeSources.id, id)).get();
    if (!current) return false;
    const resetCollection =
      (current.enabled === false && payload.enabled) ||
      current.cafe_id !== payload.cafe_id ||
      current.menu_id !== payload.menu_id;
    const timestamp = Date.now();
    const result = await this.db
      .update(naverCafeSources)
      .set({
        ...payload,
        deactivated_at: !payload.enabled ? timestamp : null,
        ...(resetCollection ? {
          collection_started_at: timestamp,
          initialization_completed_at: null,
          last_seen_article_id: null,
          sync_page: null,
          sync_base_article_id: null,
          sync_newest_article_id: null,
          last_attempt_at: null,
          last_success_at: null,
          next_check_at: timestamp,
          consecutive_failures: 0,
          last_error_code: null,
        } : {}),
      })
      .where(eq(naverCafeSources.id, id));
    return result.success;
  }

  async deleteSource(id: number) {
    const timestamp = Date.now();
    const result = await this.db
      .update(naverCafeSources)
      .set({
        enabled: false,
        archived_at: timestamp,
        deactivated_at: timestamp,
        next_check_at: null,
      })
      .where(eq(naverCafeSources.id, id));
    return result.success;
  }

  async redactPost(id: string, actor: NaverCafeActor) {
    const timestamp = Date.now();
    const current = await this.db.select({
      sourceId: naverCafePosts.source_id,
    }).from(naverCafePosts).where(eq(naverCafePosts.id, id)).get();
    if (!current) {
      await insertAdminAuditLog(this.db, {
        eventType: "naver_cafe.post_redacted",
        resourceType: "naver_cafe_post",
        resourceId: id,
        action: "redact",
        status: "skipped",
        actorId: actor.actorId,
        actorName: actor.actorName,
        actorIp: actor.actorIp,
        targetCount: 1,
        successCount: 0,
        failureCount: 0,
        detail: { reason: "admin", cause: "not_found" },
      });
      return false;
    }
    const result = await this.db.update(naverCafePosts).set({
      title: "",
      summary: "",
      url: "",
      thumbnail_url: null,
      hidden_at: timestamp,
      hidden_reason: "admin",
      content_removed_at: timestamp,
    }).where(eq(naverCafePosts.id, id));
    const changed = Number(result.meta?.changes ?? 0) > 0;
    if (changed) {
      await this.db.update(naverCafeSources).set({
        updated_at: String(timestamp),
      }).where(eq(naverCafeSources.id, current.sourceId));
    }
    await insertAdminAuditLog(this.db, {
      eventType: "naver_cafe.post_redacted",
      resourceType: "naver_cafe_post",
      resourceId: id,
      action: "redact",
      status: changed ? "success" : "skipped",
      actorId: actor.actorId,
      actorName: actor.actorName,
      actorIp: actor.actorIp,
      targetCount: 1,
      successCount: changed ? 1 : 0,
      failureCount: 0,
      detail: { reason: "admin" },
    });
    return changed;
  }

  readStoredPosts(sources: NaverCafeSourceRecord[], size: number) {
    return readStoredNaverCafePostsForSources(sources, {
      cacheDb: this.env.otw_db,
      size,
    });
  }
}

export const createD1NaverCafeApplication = (env: Env) =>
  new D1NaverCafeApplication(env);
